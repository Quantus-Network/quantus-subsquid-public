import { constants, storage } from "./generated_types";
import { Type_101 } from "./generated_types/v126";
import { Type_102 } from "./generated_types/v131";
import { Block as ChainBlock, RuntimeCtx } from "./generated_types/support";
import { ss58Encode } from "./utils/ss58";

/**
 * `execute_at` of ReversibleTransfers.TransactionScheduled: `After(BlockNumberOrTimestamp) | At(BlockNumber)`.
 * Typegen names it per spec version (v126 `Type_101`, v131+ `Type_102`); the shape is identical.
 */
export type ScheduleDispatchTime = Type_101 | Type_102;

export type BlockTimeContext = {
    currentBlockHeight: number;
    currentBlockTimestamp: Date;
    targetBlockTimeMs: number;
};

/**
 * Read QPoW.TargetBlockTime from the block's runtime metadata.
 * The constant is the chain's target block interval in milliseconds.
 */
export const getTargetBlockTimeMs = (block: RuntimeCtx): number => {
    if (!constants.qPoW.targetBlockTime.v126.is(block)) {
        throw new Error("QPoW.TargetBlockTime is missing from runtime metadata");
    }
    const value = constants.qPoW.targetBlockTime.v126.get(block);
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms <= 0) {
        throw new Error(`QPoW.TargetBlockTime must be a positive millisecond duration, got ${value}`);
    }
    return ms;
};

export type ChainSupply = {
    maxSupply: bigint;
    totalSupply: bigint;
};

/**
 * Read supply at `block`.
 * `maxSupply` is the MiningRewards.MaxSupply constant.
 * `totalSupply` is Balances.TotalIssuance. Both are raw token amounts.
 */
export async function readChainSupply(block: ChainBlock): Promise<ChainSupply> {
    if (!constants.miningRewards.maxSupply.v126.is(block)) {
        throw new Error("MiningRewards.MaxSupply is missing from runtime metadata");
    }
    if (!storage.balances.totalIssuance.v126.is(block)) {
        throw new Error("Balances.TotalIssuance is missing from runtime metadata");
    }
    const maxSupply = constants.miningRewards.maxSupply.v126.get(block);
    const totalSupply = await storage.balances.totalIssuance.v126.get(block);
    if (totalSupply == null) {
        throw new Error(`Balances.TotalIssuance is not set at block ${block.height}`);
    }
    return { maxSupply, totalSupply };
}

export type VestingTerms = {
    start: bigint;
    cliff: bigint;
    end: bigint;
    total: bigint;
};

export type VestingLaunchState = "absolute" | "pending" | "anchored";

export type VestingScheduleRow = VestingTerms & {
    id: string;
    beneficiary: string;
    claimed: bigint;
    lastClaimAt?: bigint;
};

function assertNonNegative(name: string, value: bigint): void {
    if (value < 0n) {
        throw new Error(`${name} must be non-negative, got ${value}`);
    }
}

/**
 * Amount unlocked at `nowMs`, matching pallet_vesting::vested_amount.
 * Zero before the cliff, the full total at the end, linear in between.
 */
export function vestedAmount(schedule: VestingTerms, nowMs: bigint): bigint {
    assertNonNegative("now", nowMs);
    assertNonNegative("start", schedule.start);
    assertNonNegative("cliff", schedule.cliff);
    assertNonNegative("end", schedule.end);
    if (nowMs < schedule.cliff) {
        return 0n;
    }
    if (nowMs >= schedule.end) {
        return schedule.total;
    }
    const duration = schedule.end - schedule.start;
    if (duration <= 0n) {
        throw new Error(`vesting schedule duration must be positive, got ${duration}`);
    }
    const elapsed = nowMs - schedule.start;
    if (elapsed < 0n) {
        throw new Error(`vesting elapsed time must be non-negative, got ${elapsed}`);
    }
    const vested = (schedule.total * elapsed) / duration;
    if (vested > schedule.total) {
        throw new Error(`vested amount ${vested} exceeds schedule total ${schedule.total}`);
    }
    return vested;
}

/**
 * Sum of token still locked. Pending launch stores offsets, so the whole total is locked.
 */
export function lockedAmount(schedules: VestingTerms[], nowMs: bigint, launch: VestingLaunchState): bigint {
    if (launch === "pending") {
        return schedules.reduce((sum, schedule) => sum + schedule.total, 0n);
    }
    return schedules.reduce((sum, schedule) => sum + (schedule.total - vestedAmount(schedule, nowMs)), 0n);
}

/**
 * Total supply minus still-locked vesting at the same block.
 * Unlocked token counts whether or not it has been claimed.
 */
export function circulatingSupply(
    totalSupply: bigint,
    schedules: VestingTerms[],
    nowMs: bigint,
    launch: VestingLaunchState,
): bigint {
    const locked = lockedAmount(schedules, nowMs, launch);
    if (locked > totalSupply) {
        throw new Error(`locked vesting ${locked} exceeds total supply ${totalSupply}`);
    }
    return totalSupply - locked;
}

/**
 * Read Vesting.Schedules. An absent pallet means this runtime has no schedules.
 */
export async function readVestingSchedules(block: ChainBlock): Promise<VestingScheduleRow[]> {
    if (!storage.vesting.schedules.v144.is(block)) {
        return [];
    }
    const pairs = await storage.vesting.schedules.v144.getPairs(block);
    return pairs.map(([id, schedule]) => {
        if (schedule == null) {
            throw new Error(`Vesting.Schedules value is missing for id ${id} at block ${block.height}`);
        }
        return {
            id: id.toString(),
            beneficiary: ss58Encode(schedule.beneficiary),
            start: schedule.start,
            cliff: schedule.cliff,
            end: schedule.end,
            total: schedule.total,
            claimed: schedule.claimed,
            lastClaimAt: schedule.lastClaimAt,
        };
    });
}

/**
 * Read Vesting.Launch. Absent or unset means schedule times are absolute unix milliseconds.
 */
export async function readVestingLaunch(block: ChainBlock): Promise<VestingLaunchState> {
    if (!storage.vesting.launch.v153.is(block)) {
        return "absolute";
    }
    const launch = await storage.vesting.launch.v153.get(block);
    if (launch == null) {
        return "absolute";
    }
    switch (launch.__kind) {
        case "Pending":
            return "pending";
        case "Anchored":
            return "anchored";
        default:
            throw new Error(`Vesting.Launch has an unknown variant at block ${block.height}`);
    }
}

function estimateFromBlockDelta(deltaBlocks: number, ctx: BlockTimeContext): Date {
    if (!Number.isFinite(ctx.targetBlockTimeMs) || ctx.targetBlockTimeMs <= 0) {
        throw new Error(`targetBlockTimeMs must be a positive number, got ${ctx.targetBlockTimeMs}`);
    }
    return new Date(ctx.currentBlockTimestamp.getTime() + deltaBlocks * ctx.targetBlockTimeMs);
}

/**
 * Convert a schedule dispatch time to a Date.
 *
 * After(Timestamp) is an absolute Unix millisecond time.
 * At is an absolute block height; After(BlockNumber) is a relative block delay.
 * Block-based forms are estimated as currentTimestamp + heightDelta * targetBlockTimeMs.
 */
export const getScheduledAt = (executedAt: ScheduleDispatchTime, ctx: BlockTimeContext): Date => {
    switch (executedAt.__kind) {
        case "At":
            return estimateFromBlockDelta(executedAt.value - ctx.currentBlockHeight, ctx);
        case "After":
            if (executedAt.value.__kind === "Timestamp") {
                return new Date(Number(executedAt.value.value));
            }
            return estimateFromBlockDelta(executedAt.value.value, ctx);
    }
};

export const createTransferKey = ({
    from,
    to,
    amount,
    block,
}: {
    from: string;
    to: string;
    amount: bigint;
    block: string;
}): string => `${from}:${to}:${amount}:${block}`;

export const multisigProposalKey = (multisigAddress: string, proposalId: number): string =>
    `${multisigAddress}-${proposalId}`;

export const bytesToHex = (bytes: Uint8Array): string => {
    const hex = Buffer.from(bytes).toString("hex");
    return hex.length > 0 ? `0x${hex}` : "0x";
};

/** Multisig fee constants as a runtime reports them, for Pallet::proposal_fee. */
export type ProposalFeeParams = {
    base: bigint;
    signerStepFactorPermill: bigint;
};

/**
 * Read Multisig.ProposalFee and Multisig.SignerStepFactor from the block's runtime metadata.
 * ProposalFee is scaled by the runtime's FEE_SCALE, so it changes on a fee-scaling upgrade.
 */
export const getProposalFeeParams = (block: RuntimeCtx): ProposalFeeParams => {
    if (!constants.multisig.proposalFee.v126.is(block)) {
        throw new Error("Multisig.ProposalFee is missing from runtime metadata");
    }
    if (!constants.multisig.signerStepFactor.v126.is(block)) {
        throw new Error("Multisig.SignerStepFactor is missing from runtime metadata");
    }
    return {
        base: constants.multisig.proposalFee.v126.get(block),
        signerStepFactorPermill: BigInt(constants.multisig.signerStepFactor.v126.get(block)),
    };
};

/**
 * The ProposalFee burned by a successful propose(), mirroring Pallet::proposal_fee:
 * base + SignerStepFactor.mul_floor(base * signerCount). The signer set is fixed at
 * create_multisig, so this is exact for the runtime that emitted ProposalCreated.
 */
export const computeProposalBurnedFee = (params: ProposalFeeParams, signerCount: number): bigint => {
    const multiplier = params.base * BigInt(signerCount);
    return params.base + (params.signerStepFactorPermill * multiplier) / 1_000_000n;
};

export const getFee = (e: { fee?: bigint }) => e.fee || 0n;
