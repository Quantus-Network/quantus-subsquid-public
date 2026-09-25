import { Runtime } from "@subsquid/substrate-runtime";

import { constants, storage } from "./generated_types";
import {
    circulatingSupply,
    computeProposalBurnedFee,
    getProposalFeeParams,
    getScheduledAt,
    getTargetBlockTimeMs,
    lockedAmount,
    readChainSupply,
    readVestingLaunch,
    readVestingSchedules,
    ScheduleDispatchTime as DispatchTime,
    vestedAmount,
    VestingTerms,
} from "./helper";

const CURRENT_HEIGHT = 1000;
const CURRENT_TIMESTAMP_MS = 1_770_000_000_000;
const TARGET_BLOCK_TIME_MS = 12_000;

const ctx = {
    currentBlockHeight: CURRENT_HEIGHT,
    currentBlockTimestamp: new Date(CURRENT_TIMESTAMP_MS),
    targetBlockTimeMs: TARGET_BLOCK_TIME_MS,
};

const at = (height: number): DispatchTime => ({ __kind: "At", value: height });

const afterBlockNumber = (blocks: number): DispatchTime => ({
    __kind: "After",
    value: { __kind: "BlockNumber", value: blocks },
});

const afterTimestamp = (unixMs: bigint): DispatchTime => ({
    __kind: "After",
    value: { __kind: "Timestamp", value: unixMs },
});

const mockBlock = { _runtime: {} as Runtime };

describe("getScheduledAt", () => {
    it("estimates At from (target height - current height) * target block time", () => {
        const targetHeight = 123456;
        const deltaBlocks = targetHeight - CURRENT_HEIGHT;

        expect(getScheduledAt(at(targetHeight), ctx)).toEqual(
            new Date(CURRENT_TIMESTAMP_MS + deltaBlocks * TARGET_BLOCK_TIME_MS),
        );
    });

    it("estimates At at the current height as the current timestamp", () => {
        expect(getScheduledAt(at(CURRENT_HEIGHT), ctx)).toEqual(ctx.currentBlockTimestamp);
    });

    it("converts After(Timestamp) as an absolute Unix millisecond timestamp", () => {
        const unixMs = 1_770_000_000_000n;

        expect(getScheduledAt(afterTimestamp(unixMs), ctx)).toEqual(new Date(Number(unixMs)));
    });

    it("estimates After(BlockNumber) from delay blocks * target block time", () => {
        expect(getScheduledAt(afterBlockNumber(42), ctx)).toEqual(
            new Date(CURRENT_TIMESTAMP_MS + 42 * TARGET_BLOCK_TIME_MS),
        );
    });

    it("throws when targetBlockTimeMs is not a positive number", () => {
        expect(() => getScheduledAt(at(CURRENT_HEIGHT + 1), { ...ctx, targetBlockTimeMs: 0 })).toThrow(
            /targetBlockTimeMs must be a positive number/,
        );
    });
});

describe("getTargetBlockTimeMs", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("reads QPoW.TargetBlockTime from runtime metadata", () => {
        jest.spyOn(constants.qPoW.targetBlockTime.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.qPoW.targetBlockTime.v126, "get").mockReturnValue(12_000n);

        expect(getTargetBlockTimeMs(mockBlock)).toBe(12_000);
    });

    it("throws when QPoW.TargetBlockTime is missing from runtime metadata", () => {
        jest.spyOn(constants.qPoW.targetBlockTime.v126, "is").mockReturnValue(false);

        expect(() => getTargetBlockTimeMs(mockBlock)).toThrow(/QPoW\.TargetBlockTime is missing/);
    });

    it("throws when QPoW.TargetBlockTime is not a positive duration", () => {
        jest.spyOn(constants.qPoW.targetBlockTime.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.qPoW.targetBlockTime.v126, "get").mockReturnValue(0n);

        expect(() => getTargetBlockTimeMs(mockBlock)).toThrow(
            /QPoW\.TargetBlockTime must be a positive millisecond duration/,
        );
    });
});

const MAX_SUPPLY = 21_000_000n * 10n ** 12n;
const TOTAL_ISSUANCE = 5_670_000n * 10n ** 12n;

const supplyBlock = {
    _runtime: {} as Runtime,
    hash: "0xabc",
    height: CURRENT_HEIGHT,
};

describe("readChainSupply", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("returns MiningRewards.MaxSupply and Balances.TotalIssuance unchanged", async () => {
        jest.spyOn(constants.miningRewards.maxSupply.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.miningRewards.maxSupply.v126, "get").mockReturnValue(MAX_SUPPLY);
        jest.spyOn(storage.balances.totalIssuance.v126, "is").mockReturnValue(true);
        jest.spyOn(storage.balances.totalIssuance.v126, "get").mockResolvedValue(TOTAL_ISSUANCE);

        await expect(readChainSupply(supplyBlock)).resolves.toEqual({
            maxSupply: MAX_SUPPLY,
            totalSupply: TOTAL_ISSUANCE,
        });
    });

    it("keeps a decoded total issuance of zero", async () => {
        jest.spyOn(constants.miningRewards.maxSupply.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.miningRewards.maxSupply.v126, "get").mockReturnValue(MAX_SUPPLY);
        jest.spyOn(storage.balances.totalIssuance.v126, "is").mockReturnValue(true);
        jest.spyOn(storage.balances.totalIssuance.v126, "get").mockResolvedValue(0n);

        await expect(readChainSupply(supplyBlock)).resolves.toEqual({
            maxSupply: MAX_SUPPLY,
            totalSupply: 0n,
        });
    });

    it("throws when MiningRewards.MaxSupply is missing from runtime metadata", async () => {
        jest.spyOn(constants.miningRewards.maxSupply.v126, "is").mockReturnValue(false);

        await expect(readChainSupply(supplyBlock)).rejects.toThrow(/MiningRewards\.MaxSupply is missing/);
    });

    it("throws when Balances.TotalIssuance is missing from runtime metadata", async () => {
        jest.spyOn(constants.miningRewards.maxSupply.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.miningRewards.maxSupply.v126, "get").mockReturnValue(MAX_SUPPLY);
        jest.spyOn(storage.balances.totalIssuance.v126, "is").mockReturnValue(false);

        await expect(readChainSupply(supplyBlock)).rejects.toThrow(/Balances\.TotalIssuance is missing/);
    });

    it("throws when Balances.TotalIssuance has no value at the block", async () => {
        jest.spyOn(constants.miningRewards.maxSupply.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.miningRewards.maxSupply.v126, "get").mockReturnValue(MAX_SUPPLY);
        jest.spyOn(storage.balances.totalIssuance.v126, "is").mockReturnValue(true);
        jest.spyOn(storage.balances.totalIssuance.v126, "get").mockResolvedValue(undefined);

        await expect(readChainSupply(supplyBlock)).rejects.toThrow(/Balances\.TotalIssuance is not set at block 1000/);
    });
});

const terms = (start: bigint, cliff: bigint, end: bigint, total: bigint): VestingTerms => ({
    start,
    cliff,
    end,
    total,
});

describe("vestedAmount", () => {
    const schedule = terms(1_000n, 1_500n, 2_000n, 1_000n);

    it("is zero before the cliff", () => {
        expect(vestedAmount(schedule, 1_499n)).toBe(0n);
    });

    it("at the cliff unlocks the linear amount accrued since start", () => {
        expect(vestedAmount(schedule, 1_500n)).toBe(500n);
    });

    it("floors the linear amount between the cliff and the end", () => {
        expect(vestedAmount(terms(0n, 0n, 3n, 10n), 1n)).toBe(3n);
    });

    it("is the full total at the end", () => {
        expect(vestedAmount(schedule, 2_000n)).toBe(1_000n);
    });

    it("throws when the linear window has no duration", () => {
        expect(() => vestedAmount(terms(10n, 5n, 8n, 10n), 6n)).toThrow(/duration must be positive/);
    });

    it("throws when a time is negative", () => {
        expect(() => vestedAmount(schedule, -1n)).toThrow(/now must be non-negative/);
        expect(() => vestedAmount(terms(-1n, 1_500n, 2_000n, 1_000n), 1_600n)).toThrow(/start must be non-negative/);
    });
});

describe("lockedAmount", () => {
    const schedule = terms(1_000n, 1_500n, 2_000n, 1_000n);

    it("sums the still-locked remainder and ignores claimed", () => {
        expect(lockedAmount([schedule], 1_500n, "absolute")).toBe(500n);
    });

    it("locks the full total while launch is pending", () => {
        expect(lockedAmount([schedule], 2_000n, "pending")).toBe(1_000n);
    });

    it("uses stored times when launch is anchored", () => {
        expect(lockedAmount([schedule], 2_000n, "anchored")).toBe(0n);
    });
});

describe("circulatingSupply", () => {
    it("subtracts only the still-locked remainder from total supply", () => {
        const schedule = terms(1_000n, 1_500n, 2_000n, 1_000n);

        expect(circulatingSupply(5_000n, [schedule], 1_500n, "absolute")).toBe(4_500n);
    });

    it("throws when locked vesting exceeds total supply", () => {
        const schedule = terms(0n, 100n, 200n, 50n);

        expect(() => circulatingSupply(10n, [schedule], 0n, "absolute")).toThrow(/exceeds total supply/);
    });
});

const BENEFICIARY = "0x" + "11".repeat(32);
const BENEFICIARY_SS58 = "qzjqcX6UoeVpFp2Gscqt477KwiR9A2ss6RDgMLaxqCf3fA7rK";

describe("readVestingSchedules", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("returns no schedules when Vesting.Schedules is absent", async () => {
        jest.spyOn(storage.vesting.schedules.v144, "is").mockReturnValue(false);

        await expect(readVestingSchedules(supplyBlock)).resolves.toEqual([]);
    });

    it("maps a storage pair to schedule fields", async () => {
        jest.spyOn(storage.vesting.schedules.v144, "is").mockReturnValue(true);
        jest.spyOn(storage.vesting.schedules.v144, "getPairs").mockResolvedValue([
            [
                7n,
                {
                    beneficiary: BENEFICIARY,
                    start: 1_000n,
                    cliff: 1_500n,
                    end: 2_000n,
                    total: 1_000n,
                    claimed: 100n,
                    lastClaimAt: 1_600n,
                },
            ],
        ]);

        await expect(readVestingSchedules(supplyBlock)).resolves.toEqual([
            {
                id: "7",
                beneficiary: BENEFICIARY_SS58,
                start: 1_000n,
                cliff: 1_500n,
                end: 2_000n,
                total: 1_000n,
                claimed: 100n,
                lastClaimAt: 1_600n,
            },
        ]);
    });

    it("throws when a schedule value is missing", async () => {
        jest.spyOn(storage.vesting.schedules.v144, "is").mockReturnValue(true);
        jest.spyOn(storage.vesting.schedules.v144, "getPairs").mockResolvedValue([[4n, undefined]]);

        await expect(readVestingSchedules(supplyBlock)).rejects.toThrow(/Vesting\.Schedules value is missing for id 4/);
    });
});

describe("readVestingLaunch", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("treats a runtime without Vesting.Launch as absolute times", async () => {
        jest.spyOn(storage.vesting.launch.v153, "is").mockReturnValue(false);

        await expect(readVestingLaunch(supplyBlock)).resolves.toBe("absolute");
    });

    it("treats an unset Launch value as absolute times", async () => {
        jest.spyOn(storage.vesting.launch.v153, "is").mockReturnValue(true);
        jest.spyOn(storage.vesting.launch.v153, "get").mockResolvedValue(undefined);

        await expect(readVestingLaunch(supplyBlock)).resolves.toBe("absolute");
    });

    it("returns pending while genesis offsets are awaiting the first timestamp", async () => {
        jest.spyOn(storage.vesting.launch.v153, "is").mockReturnValue(true);
        jest.spyOn(storage.vesting.launch.v153, "get").mockResolvedValue({ __kind: "Pending" });

        await expect(readVestingLaunch(supplyBlock)).resolves.toBe("pending");
    });

    it("returns anchored after schedules have been rebased", async () => {
        jest.spyOn(storage.vesting.launch.v153, "is").mockReturnValue(true);
        jest.spyOn(storage.vesting.launch.v153, "get").mockResolvedValue({
            __kind: "Anchored",
            value: 1_700_000_000_000n,
        });

        await expect(readVestingLaunch(supplyBlock)).resolves.toBe("anchored");
    });
});

describe("multisig proposal fee constants", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const mockConstants = (proposalFee: bigint, signerStepFactor: number) => {
        jest.spyOn(constants.multisig.proposalFee.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.multisig.proposalFee.v126, "get").mockReturnValue(proposalFee);
        jest.spyOn(constants.multisig.signerStepFactor.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.multisig.signerStepFactor.v126, "get").mockReturnValue(signerStepFactor);
    };

    it("reads Multisig.ProposalFee and SignerStepFactor from runtime metadata", () => {
        mockConstants(50_000_000_000n, 10_000);

        expect(getProposalFeeParams(mockBlock)).toEqual({
            base: 50_000_000_000n,
            signerStepFactorPermill: 10_000n,
        });
    });

    it("follows the runtime down a fee-scaling upgrade", () => {
        // v152 charged 0.05 QTC + 1% per signer; v153 scales every fee by 1/10.
        const v152 = { base: 50_000_000_000n, signerStepFactorPermill: 10_000n };
        const v153 = { base: 5_000_000_000n, signerStepFactorPermill: 10_000n };

        expect(computeProposalBurnedFee(v152, 10)).toEqual(55_000_000_000n);
        expect(computeProposalBurnedFee(v153, 10)).toEqual(5_500_000_000n);
    });

    it("floors the signer step like Permill::mul_floor", () => {
        // 3 signers at 1% of 1_000_000_000_007: 30_000_000_000.21 floors to 30_000_000_000.
        expect(computeProposalBurnedFee({ base: 1_000_000_000_007n, signerStepFactorPermill: 10_000n }, 3)).toEqual(
            1_030_000_000_007n,
        );
    });

    it("throws when Multisig.ProposalFee is missing from runtime metadata", () => {
        jest.spyOn(constants.multisig.proposalFee.v126, "is").mockReturnValue(false);

        expect(() => getProposalFeeParams(mockBlock)).toThrow(/Multisig\.ProposalFee is missing/);
    });

    it("throws when Multisig.SignerStepFactor is missing from runtime metadata", () => {
        jest.spyOn(constants.multisig.proposalFee.v126, "is").mockReturnValue(true);
        jest.spyOn(constants.multisig.signerStepFactor.v126, "is").mockReturnValue(false);

        expect(() => getProposalFeeParams(mockBlock)).toThrow(/Multisig\.SignerStepFactor is missing/);
    });
});
