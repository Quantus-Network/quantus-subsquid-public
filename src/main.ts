import { TypeormDatabase, Store } from "@subsquid/typeorm-store";
import { In, IsNull, Not } from "typeorm";
import assert from "assert";
import {
    createPool as createPrivacyPool,
    DepositTracker,
    poolToJson,
    poolFromJson,
    privacyScore,
    scoreLabel,
    deserializeDeposits,
    serializeDeposits,
} from "./utils/privacyScore";
import { updateDailyChainStats } from "./utils/dailyChainStats";

import { processor, RPC_SETTINGS, ProcessorContext, Event as ProcessorEvent } from "./processor";
import {
    Account,
    Transfer,
    Block,
    ScheduledReversibleTransfer,
    ExecutedReversibleTransfer,
    CancelledReversibleTransfer,
    Event,
    EventType,
    MinerReward,
    ErrorEvent,
    HighSecuritySet,
    DepositPoolStats,
    WormholeExtrinsic,
    WormholeOutput,
    WormholeNullifier,
    Extrinsic,
    AccountEvent,
    AccountStats,
    ChainStats,
    Multisig,
    MultisigProposal,
    MultisigProposalCreated,
    MultisigSignerApproved,
    MultisigProposalReady,
    MultisigProposalStatus,
    ExecutedMultisigProposal,
    CancelledMultisigProposal,
    RemovedMultisigProposal,
    MultisigDepositsClaimed,
    TechReferendumEvent,
    TechReferendumEventType,
    RuntimeUpgrade,
    VestingSchedule,
    UnifiedTransaction,
    UnifiedTransactionType,
    UnifiedTransactionStatus,
} from "./model";
import { events, storage } from "./generated_types";
import { Block as ChainBlock } from "./generated_types/support";
import * as v126 from "./generated_types/v126";
import * as v131 from "./generated_types/v131";

import {
    ProcessedEvents,
    ReversibleTransferCancelledEvent,
    ReversibleTransferEvent,
    ReversibleTransferExecutedEvent,
    TransferEvent,
    AccountBalanceEvent,
    BalanceSetEvent,
    ReserveRepatriatedEvent,
    BalanceEventData,
    MinerRewardEvent,
    TreasuryRewardEvent,
    FeesCollectedEvent,
    ErrorEventData,
    HighSecuritySetEventData,
    WormholeNativeTransferredEvent,
    WormholeProofVerifiedEvent,
    WormholeMinerVolumeFeeEvent,
    ExtrinsicData,
    MultisigCreatedEvent,
    MultisigProposalCreatedEvent,
    MultisigSignerApprovedEvent,
    MultisigProposalReadyEvent,
    MultisigProposalExecutedEvent,
    MultisigProposalCancelledEvent,
    MultisigProposalRemovedEvent,
    MultisigDepositsClaimedEvent,
    TechReferendumEventData,
    RuntimeUpgradeEventData,
} from "./types";
import {
    buildReferendumDetails,
    mergeReferendumDetails,
    needsSnapshotForward,
    referendumDetailsFromStoredSnapshot,
    ReferendumDetails,
    serializeReferendumTally,
} from "./tech-referenda";
import {
    circulatingSupply,
    getScheduledAt,
    getTargetBlockTimeMs,
    readChainSupply,
    readVestingLaunch,
    readVestingSchedules,
    VestingScheduleRow,
    createTransferKey,
    multisigProposalKey,
    computeProposalBurnedFee,
    getProposalFeeParams,
    getFee,
} from "./helper";
import { computeAddressHash, computeAccountIdHash } from "./utils/addressHash";
import { decodeCallData } from "./utils/decodeCallData";
import { resolveDispatchError } from "./utils/resolveDispatchError";
import { ss58Decode, ss58Encode } from "./utils/ss58";

// Type alias for cleaner code
type ProcessorBlock = ProcessorContext<Store>["blocks"][0];

/**
 * Sentinel minting account used as the `from` address when native tokens are minted
 * This is required to make wormhole exit proofs. The balance in this account is irrelevant.
 */
export const MINTING_ACCOUNT_ADDRESS = "qzjUYyuN4L3HKmBPMxHvK2n8HYnaLZcQvLSQTgdwB2nQ1g2mc";

/**
 * Decode ReversibleTransfers.HighSecuritySet across runtime versions.
 * v126 called the guardian `interceptor`; v131+ calls it `guardian`.
 */
export function decodeHighSecuritySet(event: ProcessorEvent): {
    who: string;
    guardian: string;
    delay: v126.BlockNumberOrTimestamp;
} {
    if (events.reversibleTransfers.highSecuritySet.v131.is(event)) {
        return events.reversibleTransfers.highSecuritySet.v131.decode(event);
    }
    const { who, interceptor, delay } = events.reversibleTransfers.highSecuritySet.v126.decode(event);
    return { who, guardian: interceptor, delay };
}

if (process.env.NODE_ENV != "test") {
    const rpcUrl = process.env.RPC_ENDPOINT;
    if (!rpcUrl) throw new Error("RPC_ENDPOINT is not set");
    console.log(`***\n🔗 Processor Running on RPC endpoint: ${rpcUrl}\n***`);
    processor.setRpcEndpoint({ url: rpcUrl, ...RPC_SETTINGS });

    processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
        const processedEvents = await processBlockchainData(ctx);

        const { accounts, depositPoolStats, newAccountsCreated, depositAccountsDelta } = await updateAndCreateAccounts(
            ctx,
            processedEvents,
        );
        // Create Extrinsic entities first (other entities will link to them)
        const { extrinsics, newCreatedAccounts: newCreatedDepositOnlyAccountsExtrinsics } = await createExtrinsics(
            ctx,
            processedEvents,
            accounts,
            processedEvents.blocks,
        );

        const { scheduledReversibles, executedReversibles, cancelledReversibles } = await createReversibleTransfers(
            ctx,
            processedEvents.reversibleTransferEvents,
            processedEvents.reversibleTransferCancelledEvents,
            processedEvents.reversibleTransferExecutedEvents,
            accounts,
            processedEvents.blocks,
            extrinsics,
        );

        const multisigs = createMultisigs(
            processedEvents.multisigCreatedEvents,
            accounts,
            processedEvents.blocks,
            extrinsics,
        );

        const {
            proposals: multisigProposals,
            proposalsToUpsert: multisigProposalsToUpsert,
            proposalCreated: multisigProposalCreated,
            signerApproved: multisigSignerApproved,
            proposalReady: multisigProposalReady,
            executed: executedMultisigProposals,
            cancelled: cancelledMultisigProposals,
            removed: removedMultisigProposals,
            depositsClaimed: multisigDepositsClaimed,
        } = await createMultisigProposals(
            ctx,
            processedEvents,
            multisigs,
            accounts,
            processedEvents.blocks,
            extrinsics,
        );

        const { techReferendumEvents, runtimeUpgrades } = await createTechReferenda(
            ctx,
            processedEvents,
            accounts,
            processedEvents.blocks,
            extrinsics,
        );

        const { minerRewards, blocks, accountStatsMap, newMiners } = await createMinerRewards(
            ctx,
            processedEvents.minerRewardEvents,
            processedEvents.treasuryRewardEvents,
            accounts,
            processedEvents.blocks,
        );

        const { events, transfers, errorEvents, highSecuritySetEvents } = createEvents(
            processedEvents,
            accounts,
            scheduledReversibles,
            executedReversibles,
            cancelledReversibles,
            minerRewards,
            extrinsics,
            multisigs,
            multisigProposalCreated,
            multisigSignerApproved,
            multisigProposalReady,
            executedMultisigProposals,
            cancelledMultisigProposals,
            removedMultisigProposals,
            multisigDepositsClaimed,
            techReferendumEvents,
            runtimeUpgrades,
        );

        const { newCreatedAccounts: newCreatedMultisigAccounts } = await applyAccountFlags(
            ctx,
            accounts,
            highSecuritySetEvents,
            multisigs,
        );

        // Create wormhole extrinsic + output + nullifier entities with pre-computed privacy scores
        const {
            wormholeExtrinsics,
            outputs: wormholeOutputs,
            nullifiers: wormholeNullifiers,
            newCreatedAccounts: newCreatedDepositOnlyAccountsWormholeOutputs,
        } = await createWormholeOutputs(ctx, processedEvents, accounts, depositPoolStats, extrinsics);

        const accountEvents = createAccountEventEntries(
            transfers,
            scheduledReversibles,
            executedReversibles,
            cancelledReversibles,
            minerRewards,
            highSecuritySetEvents,
            multisigs,
            multisigProposalCreated,
            multisigSignerApproved,
            multisigProposalReady,
            executedMultisigProposals,
            cancelledMultisigProposals,
            removedMultisigProposals,
            multisigDepositsClaimed,
            techReferendumEvents,
        );

        const unifiedTransactions = buildUnifiedTransactions(
            transfers,
            scheduledReversibles,
            executedReversibles,
            cancelledReversibles,
            wormholeExtrinsics,
            wormholeOutputs,
        );

        await updateAccountTransferStats(
            ctx,
            accountStatsMap,
            transfers,
            scheduledReversibles,
            executedReversibles,
            cancelledReversibles,
        );

        const mintingAccount = accounts.get(MINTING_ACCOUNT_ADDRESS);
        if (mintingAccount) {
            mintingAccount.free = 0n;
            mintingAccount.reserved = 0n;
            mintingAccount.frozen = 0n;
        }
        await ctx.store.upsert([...accounts.values()]);

        const newCreatedDepositOnlyAccounts =
            newCreatedDepositOnlyAccountsExtrinsics +
            newCreatedDepositOnlyAccountsWormholeOutputs +
            newCreatedMultisigAccounts;
        if (ctx.blocks.length === 0) {
            throw new Error("Cannot read chain supply without a block");
        }
        const supplyBlock = ctx.blocks.reduce((latest, block) =>
            block.header.height > latest.header.height ? block : latest,
        ).header;
        const chainStats = await updateChainStats(
            ctx,
            newAccountsCreated + newCreatedDepositOnlyAccounts,
            depositAccountsDelta + newCreatedDepositOnlyAccounts,
            transfers,
            scheduledReversibles,
            executedReversibles,
            cancelledReversibles,
            highSecuritySetEvents,
            multisigs,
            multisigProposalCreated,
            multisigSignerApproved,
            multisigProposalReady,
            executedMultisigProposals,
            cancelledMultisigProposals,
            removedMultisigProposals,
            multisigDepositsClaimed,
            minerRewards,
            errorEvents,
            blocks,
            newMiners,
            techReferendumEvents,
            runtimeUpgrades,
            supplyBlock,
        );
        if (supplyBlock.timestamp == null) {
            throw new Error(`Block ${supplyBlock.height} has no timestamp`);
        }
        const vestingSchedules = await readVestingSchedules(supplyBlock);
        const vestingLaunch = await readVestingLaunch(supplyBlock);
        chainStats.circulatingSupply = circulatingSupply(
            chainStats.totalSupply,
            vestingSchedules,
            BigInt(supplyBlock.timestamp),
            vestingLaunch,
        );
        await syncVestingSchedules(ctx, supplyBlock.height, vestingSchedules);

        const { dailyStats, activeAccounts: dailyActiveAccounts } = await updateDailyChainStats(
            ctx.store,
            blocks,
            unifiedTransactions,
            [...extrinsics.values()],
            transfers,
        );

        await ctx.store.upsert(depositPoolStats);
        await ctx.store.upsert(blocks);
        await ctx.store.insert([...extrinsics.values()]);
        await ctx.store.insert(scheduledReversibles);
        await ctx.store.insert(transfers);
        await ctx.store.insert(minerRewards);
        await ctx.store.upsert([...accountStatsMap.values()]);
        await ctx.store.upsert([chainStats]);
        if (dailyStats.length > 0) {
            await ctx.store.upsert(dailyStats);
        }
        if (dailyActiveAccounts.length > 0) {
            await ctx.store.upsert(dailyActiveAccounts);
        }
        await ctx.store.insert(executedReversibles);
        await ctx.store.insert(cancelledReversibles);
        await ctx.store.insert(errorEvents);
        await ctx.store.insert(highSecuritySetEvents);
        await ctx.store.insert(multisigs);
        await ctx.store.insert(multisigProposals);
        await ctx.store.insert(multisigProposalCreated);
        await ctx.store.insert(multisigSignerApproved);
        await ctx.store.insert(multisigProposalReady);
        await ctx.store.upsert(multisigProposalsToUpsert);
        await ctx.store.insert(executedMultisigProposals);
        await ctx.store.insert(cancelledMultisigProposals);
        await ctx.store.insert(removedMultisigProposals);
        await ctx.store.insert(multisigDepositsClaimed);
        await ctx.store.insert(runtimeUpgrades);
        await ctx.store.insert(techReferendumEvents);
        await ctx.store.insert(wormholeExtrinsics);
        await ctx.store.insert(wormholeOutputs);
        await ctx.store.insert(wormholeNullifiers);
        await ctx.store.insert(unifiedTransactions);
        await ctx.store.insert(accountEvents);
        await ctx.store.insert(events);
    });
}

async function fetchGenesisAccountBalances(
    block: ProcessorBlock,
    ctx: ProcessorContext<Store>,
): Promise<Map<string, Account>> {
    const genesisAccounts = new Map<string, Account>();

    try {
        const accountKeys = await storage.system.account.v126.getKeys(block.header);

        for (const accountId of accountKeys) {
            const accountData = await storage.system.account.v126.get(block.header, accountId);
            if (accountData && accountData.data.free > 0n) {
                const address = ss58Encode(accountId);
                const balance = accountData.data.free;

                const account = emptyAccount(address);
                account.free = balance;
                account.lastUpdated = block.header.height;

                genesisAccounts.set(address, account);
            }
        }
    } catch (error) {
        ctx.log.error(`Error reading genesis balances: ${error}`);
    }

    return genesisAccounts;
}

/**
 * Filter out large fields from call args (signatures, proofs) to keep storage reasonable.
 * Converts account IDs to ss58 addresses for readability.
 */
function filterLargeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    const largeFields = ["signature", "proof", "signatures", "proofs", "multi_signature"];

    for (const [key, value] of Object.entries(args)) {
        // Skip signature and proof fields
        if (largeFields.includes(key.toLowerCase())) {
            continue;
        }

        // Convert account IDs (hex strings that look like account IDs) to ss58
        if (typeof value === "string" && value.startsWith("0x") && value.length === 66) {
            try {
                filtered[key] = ss58Encode(value);
            } catch {
                filtered[key] = value;
            }
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
            // Recursively filter nested objects
            filtered[key] = filterLargeArgs(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
            // Handle arrays - convert account IDs within
            filtered[key] = value.map((item) => {
                if (typeof item === "string" && item.startsWith("0x") && item.length === 66) {
                    try {
                        return ss58Encode(item);
                    } catch {
                        return item;
                    }
                }
                if (item && typeof item === "object") {
                    return filterLargeArgs(item as Record<string, unknown>);
                }
                return item;
            });
        } else {
            filtered[key] = value;
        }
    }

    return filtered;
}

async function processBlockchainData(ctx: ProcessorContext<Store>): Promise<ProcessedEvents> {
    const blocks: Map<string, Block> = new Map();
    const transferEvents: TransferEvent[] = [];
    const endowedEvents: AccountBalanceEvent[] = [];
    const dustLostEvents: AccountBalanceEvent[] = [];
    const balanceSetEvents: BalanceSetEvent[] = [];
    const reservedEvents: AccountBalanceEvent[] = [];
    const unreservedEvents: AccountBalanceEvent[] = [];
    const reserveRepatriatedEvents: ReserveRepatriatedEvent[] = [];
    const depositEvents: AccountBalanceEvent[] = [];
    const withdrawEvents: AccountBalanceEvent[] = [];
    const slashedEvents: AccountBalanceEvent[] = [];
    const mintedEvents: AccountBalanceEvent[] = [];
    const burnedEvents: AccountBalanceEvent[] = [];
    const suspendedEvents: AccountBalanceEvent[] = [];
    const restoredEvents: AccountBalanceEvent[] = [];
    const upgradedEvents: Omit<AccountBalanceEvent, "amount">[] = [];
    const issuedEvents: Omit<BalanceEventData, "extrinsicHash">[] = [];
    const rescindedEvents: Omit<BalanceEventData, "extrinsicHash">[] = [];
    const lockedEvents: AccountBalanceEvent[] = [];
    const unlockedEvents: AccountBalanceEvent[] = [];
    const frozenEvents: AccountBalanceEvent[] = [];
    const thawedEvents: AccountBalanceEvent[] = [];
    const reversibleTransferEvents: ReversibleTransferEvent[] = [];
    const reversibleTransferCancelledEvents: ReversibleTransferCancelledEvent[] = [];
    const reversibleTransferExecutedEvents: ReversibleTransferExecutedEvent[] = [];
    const minerRewardEvents: MinerRewardEvent[] = [];
    const treasuryRewardEvents: TreasuryRewardEvent[] = [];
    const feesCollectedEvents: FeesCollectedEvent[] = [];
    const errorEvents: ErrorEventData[] = [];
    const highSecuritySetEvents: HighSecuritySetEventData[] = [];
    const wormholeNativeTransferredEvents: WormholeNativeTransferredEvent[] = [];
    const wormholeProofVerifiedEvents: WormholeProofVerifiedEvent[] = [];
    const wormholeMinerVolumeFeeEvents: WormholeMinerVolumeFeeEvent[] = [];
    const multisigCreatedEvents: MultisigCreatedEvent[] = [];
    const multisigProposalCreatedEvents: MultisigProposalCreatedEvent[] = [];
    const multisigSignerApprovedEvents: MultisigSignerApprovedEvent[] = [];
    const multisigProposalReadyEvents: MultisigProposalReadyEvent[] = [];
    const multisigProposalExecutedEvents: MultisigProposalExecutedEvent[] = [];
    const multisigProposalCancelledEvents: MultisigProposalCancelledEvent[] = [];
    const multisigProposalRemovedEvents: MultisigProposalRemovedEvent[] = [];
    const multisigDepositsClaimedEvents: MultisigDepositsClaimedEvent[] = [];
    const techReferendumSubmittedEvents: TechReferendumEventData[] = [];
    const techReferendumDecisionStartedEvents: TechReferendumEventData[] = [];
    const techReferendumConfirmStartedEvents: TechReferendumEventData[] = [];
    const techReferendumConfirmAbortedEvents: TechReferendumEventData[] = [];
    const techReferendumConfirmedEvents: TechReferendumEventData[] = [];
    const techReferendumApprovedEvents: TechReferendumEventData[] = [];
    const techReferendumRejectedEvents: TechReferendumEventData[] = [];
    const techReferendumTimedOutEvents: TechReferendumEventData[] = [];
    const techReferendumCancelledEvents: TechReferendumEventData[] = [];
    const techReferendumKilledEvents: TechReferendumEventData[] = [];
    const runtimeUpgradeEvents: RuntimeUpgradeEventData[] = [];
    const executedTransferToReversibleExecutedMapping: Map<string, string> = new Map();
    const extrinsics: Map<string, ExtrinsicData> = new Map();

    // Parse events in blocks
    for (let block of ctx.blocks) {
        // Handle genesis block to capture initial balances
        if (block.header.height === 0) {
            const genesisAccounts = await fetchGenesisAccountBalances(block, ctx);
            ctx.log.info(`Upserting ${genesisAccounts.size} genesis accounts`);
            await ctx.store.upsert([...genesisAccounts.values()]);
        }
        // Handle undefined timestamp (common for genesis block)
        const timestamp = block.header.timestamp ? new Date(block.header.timestamp) : new Date(0); // Use epoch time for genesis block

        // We need to check if the block already exists in the store
        // because we will update the block reward later on mining events
        // otherwise it will be really painfull to do
        const [isBlockExistInStore] = await ctx.store.find(Block, { where: { id: block.header.id } });
        const newBlock = isBlockExistInStore
            ? isBlockExistInStore
            : new Block({
                  id: block.header.id,
                  height: block.header.height,
                  timestamp,
                  hash: block.header.hash,
                  reward: 0n,
              });

        if (!blocks.has(newBlock.id)) blocks.set(newBlock.id, newBlock);

        // If the block doesn't have a timestamp and is genesis block, skip processing the events.
        if (!block.header.timestamp && block.header.height === 0) continue;
        if (!block.header.timestamp) throw new Error("Block timestamp is missing");

        let currentEventIndex = 0;
        for (let event of block.events) {
            const extrinsicHash = event.extrinsic?.hash;
            const fee = event.extrinsic?.fee || 0n;

            // Collect extrinsic data (deduplicated by hash)
            if (event.extrinsic && extrinsicHash && !extrinsics.has(extrinsicHash)) {
                const call = event.call;
                if (call) {
                    // Parse pallet and call name from call.name (e.g., "Balances.transfer_keep_alive")
                    const [pallet, callName] = call.name.split(".");

                    // Extract signer from call origin (if signed)
                    let signer: string | undefined;
                    const origin = call.origin as any;

                    if (origin?.value?.value) {
                        // Origin is typically { __kind: 'system', value: { __kind: 'Signed', value: accountId } }
                        signer = ss58Encode(origin.value.value);
                    }

                    // Allow unsigned extrinsics for certain pallets (e.g., Wormhole proof verification)
                    const allowUnsigned = pallet === "Wormhole";

                    if (signer || allowUnsigned) {
                        // Filter out signatures and proofs from args (too big to store)
                        const filteredArgs = filterLargeArgs(call.args);

                        extrinsics.set(extrinsicHash, {
                            id: extrinsicHash,
                            block: block.header.id,
                            indexInBlock: event.extrinsic.index,
                            timestamp: new Date(block.header.timestamp!),
                            signer, // undefined for unsigned extrinsics
                            pallet,
                            call: callName,
                            args: filteredArgs,
                            success: event.extrinsic.success,
                            fee,
                        });
                    }
                }
            }

            switch (event.name) {
                case events.balances.endowed.name: {
                    // Intentionally ignored as it can lead to double-counting with transfers
                    break;
                }
                case events.balances.dustLost.name: {
                    const { account, amount } = events.balances.dustLost.v126.decode(event);
                    dustLostEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(account),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.transfer.name: {
                    const {
                        from: transferFrom,
                        to: transferTo,
                        amount: transferAmount,
                    } = events.balances.transfer.v126.decode(event);

                    transferEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        from: ss58Encode(transferFrom),
                        to: ss58Encode(transferTo),
                        amount: transferAmount,
                        fee,
                    });

                    break;
                }
                case events.balances.balanceSet.name: {
                    const { who, free } = events.balances.balanceSet.v126.decode(event);
                    balanceSetEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        free: free,
                    });
                    break;
                }
                case events.balances.reserved.name: {
                    const { who, amount } = events.balances.reserved.v126.decode(event);
                    reservedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.unreserved.name: {
                    const { who, amount } = events.balances.unreserved.v126.decode(event);
                    unreservedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.reserveRepatriated.name: {
                    const { from, to, amount, destinationStatus } =
                        events.balances.reserveRepatriated.v126.decode(event);
                    reserveRepatriatedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        from: ss58Encode(from),
                        to: ss58Encode(to),
                        amount: amount,
                        destinationStatus: destinationStatus.__kind,
                    });
                    break;
                }
                case events.balances.deposit.name: {
                    const { who, amount } = events.balances.deposit.v126.decode(event);
                    depositEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.withdraw.name: {
                    const { who, amount } = events.balances.withdraw.v126.decode(event);
                    withdrawEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.slashed.name: {
                    const { who, amount } = events.balances.slashed.v126.decode(event);
                    slashedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.minted.name: {
                    const { who, amount } = events.balances.minted.v126.decode(event);
                    mintedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.burned.name: {
                    const { who, amount } = events.balances.burned.v126.decode(event);
                    burnedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.suspended.name: {
                    const { who, amount } = events.balances.suspended.v126.decode(event);
                    suspendedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.restored.name: {
                    const { who, amount } = events.balances.restored.v126.decode(event);
                    restoredEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        amount: amount,
                    });
                    break;
                }
                case events.balances.upgraded.name: {
                    const { who } = events.balances.upgraded.v126.decode(event);
                    upgradedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                    });
                    break;
                }
                case events.reversibleTransfers.transactionScheduled.name: {
                    // v131 renamed `interceptor` to `guardian`; the fields used here are unchanged.
                    const { from, to, amount, txId, executeAt } =
                        events.reversibleTransfers.transactionScheduled.v131.is(event)
                            ? events.reversibleTransfers.transactionScheduled.v131.decode(event)
                            : events.reversibleTransfers.transactionScheduled.v126.decode(event);

                    reversibleTransferEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        txId: txId,
                        from: ss58Encode(from),
                        to: ss58Encode(to),
                        amount: amount,
                        scheduledAt: getScheduledAt(executeAt, {
                            currentBlockHeight: block.header.height,
                            currentBlockTimestamp: new Date(block.header.timestamp),
                            targetBlockTimeMs: getTargetBlockTimeMs(block.header),
                        }),
                        fee,
                    });

                    break;
                }
                case events.reversibleTransfers.transactionExecuted.name: {
                    const { txId, result } = events.reversibleTransfers.transactionExecuted.v126.decode(event);

                    reversibleTransferExecutedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        txId: txId,
                        result: result.__kind + "",
                    });

                    break;
                }
                case events.reversibleTransfers.transactionCancelled.name: {
                    const { txId, who } = events.reversibleTransfers.transactionCancelled.v126.decode(event);

                    reversibleTransferCancelledEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        txId: txId,
                        who: ss58Encode(who),
                    });

                    break;
                }
                case events.balances.frozen.name: {
                    const { who, amount } = events.balances.frozen.v126.decode(event);

                    frozenEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                        who: ss58Encode(who),
                    });

                    break;
                }
                case events.balances.thawed.name: {
                    const { who, amount } = events.balances.thawed.v126.decode(event);

                    thawedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                        who: ss58Encode(who),
                    });

                    break;
                }
                case events.balances.locked.name: {
                    const { who, amount } = events.balances.locked.v126.decode(event);

                    lockedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                        who: ss58Encode(who),
                    });

                    break;
                }
                case events.balances.unlocked.name: {
                    const { who, amount } = events.balances.unlocked.v126.decode(event);

                    unlockedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                        who: ss58Encode(who),
                    });

                    break;
                }
                case events.balances.issued.name: {
                    const { amount } = events.balances.issued.v126.decode(event);

                    issuedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                    });

                    break;
                }
                case events.balances.rescinded.name: {
                    const { amount } = events.balances.rescinded.v126.decode(event);

                    rescindedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                    });

                    break;
                }
                case events.miningRewards.minerRewarded.name: {
                    const { miner, reward } = events.miningRewards.minerRewarded.v126.decode(event);

                    minerRewardEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        miner: ss58Encode(miner),
                        reward: reward,
                    });
                    break;
                }
                // Emitted by the v126 genesis chain only; removed from the runtime before v148.
                case events.miningRewards.treasuryRewarded.name: {
                    const { reward } = events.miningRewards.treasuryRewarded.v126.decode(event);

                    treasuryRewardEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        reward: reward,
                    });
                    break;
                }
                case events.miningRewards.feesCollected.name: {
                    const { amount, total } = events.miningRewards.feesCollected.v126.decode(event);

                    feesCollectedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        amount: amount,
                        total: total,
                    });
                    break;
                }
                case events.system.extrinsicFailed.name: {
                    const { dispatchError } = events.system.extrinsicFailed.v126.decode(event);
                    const specVersion = (block.header as { _runtime?: { specVersion?: number } })._runtime?.specVersion;
                    if (specVersion == null) {
                        throw new Error(`Block ${block.header.height} is missing spec version`);
                    }
                    const resolved = resolveDispatchError(dispatchError, specVersion, ctx.log);

                    errorEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        errorType: resolved.errorType,
                        errorModule: resolved.errorModule,
                        errorName: resolved.errorName,
                        errorDocs: resolved.errorDocs,
                    });
                    break;
                }
                case events.reversibleTransfers.highSecuritySet.name: {
                    const { who, guardian, delay } = decodeHighSecuritySet(event);
                    const delayValue = delay.__kind === "Timestamp" ? delay.value : BigInt(delay.value);

                    highSecuritySetEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        who: ss58Encode(who),
                        guardian: ss58Encode(guardian),
                        delay: delayValue,
                    });
                    break;
                }
                case events.wormhole.nativeTransferred.name: {
                    const { from, to, amount, transferCount, leafIndex } =
                        events.wormhole.nativeTransferred.v126.decode(event);

                    // Reversible transfer execution emits: Balances.Transfer -> NativeTransferred -> TransactionExecuted
                    // When there's no extrinsic, check if the next event is TransactionExecuted
                    if (!extrinsicHash) {
                        const nextEvent = block.events[currentEventIndex + 1];
                        if (nextEvent?.name === events.reversibleTransfers.transactionExecuted.name) {
                            const { txId } = events.reversibleTransfers.transactionExecuted.v126.decode(nextEvent);
                            executedTransferToReversibleExecutedMapping.set(event.id, txId);
                        }
                    }

                    wormholeNativeTransferredEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        from: ss58Encode(from),
                        to: ss58Encode(to),
                        amount: amount,
                        transferCount: transferCount,
                        leafIndex: leafIndex,
                    });
                    break;
                }
                case events.wormhole.proofVerified.name: {
                    const { exitAmount, nullifiers: nullifierBytes } = events.wormhole.proofVerified.v126.decode(event);

                    // Nullifiers come as hex strings from the decoder, convert to Uint8Array
                    const parsedNullifiers = (nullifierBytes || []).map((b: any) => {
                        if (b instanceof Uint8Array) return b;
                        const hex = typeof b === "string" ? b.replace(/^0x/, "") : Buffer.from(b).toString("hex");
                        return new Uint8Array(Buffer.from(hex, "hex"));
                    });

                    wormholeProofVerifiedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        exitAmount: exitAmount,
                        nullifiers: parsedNullifiers,
                    });
                    break;
                }
                case events.wormhole.minerVolumeFeePaid.name: {
                    const { miner, amount } = events.wormhole.minerVolumeFeePaid.v136.decode(event);
                    wormholeMinerVolumeFeeEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        miner: ss58Encode(miner),
                        amount: amount,
                    });
                    break;
                }
                case events.multisig.multisigCreated.name: {
                    const { creator, multisigAddress, signers, threshold, nonce } =
                        events.multisig.multisigCreated.v126.decode(event);
                    multisigCreatedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        creator: ss58Encode(creator),
                        multisigAddress: ss58Encode(multisigAddress),
                        signers: signers.map(ss58Encode),
                        threshold,
                        nonce,
                    });
                    break;
                }
                case events.multisig.proposalCreated.name: {
                    const { multisigAddress, proposer, proposalId } =
                        events.multisig.proposalCreated.v126.decode(event);
                    multisigProposalCreatedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        proposer: ss58Encode(proposer),
                        proposalId,
                        feeParams: getProposalFeeParams(block.header),
                    });
                    break;
                }
                case events.multisig.signerApproved.name: {
                    const { multisigAddress, approver, proposalId, approvalsCount } =
                        events.multisig.signerApproved.v131.decode(event);
                    multisigSignerApprovedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        approver: ss58Encode(approver),
                        proposalId,
                        approvalsCount,
                    });
                    break;
                }
                case events.multisig.proposalReadyToExecute.name: {
                    const { multisigAddress, proposalId, approvalsCount } =
                        events.multisig.proposalReadyToExecute.v126.decode(event);
                    multisigProposalReadyEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        proposalId,
                        approvalsCount,
                    });
                    break;
                }
                case events.multisig.proposalExecuted.name: {
                    assert(extrinsicHash, `Extrinsic hash not found for proposal executed event ${event.id}`);
                    assert(
                        extrinsics.get(extrinsicHash)?.signer,
                        `Extrinsic signer not collected for proposal executed event ${event.id}`,
                    );
                    const { multisigAddress, proposalId, proposer, call, approvers, result } =
                        events.multisig.proposalExecuted.v126.decode(event);
                    multisigProposalExecutedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        proposalId,
                        proposer: ss58Encode(proposer),
                        call: toUint8Array(call),
                        approvers: approvers.map(ss58Encode),
                        result: formatDispatchResult(result),
                    });
                    break;
                }
                case events.multisig.proposalCancelled.name: {
                    const { multisigAddress, proposer, proposalId } =
                        events.multisig.proposalCancelled.v126.decode(event);
                    multisigProposalCancelledEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        proposer: ss58Encode(proposer),
                        proposalId,
                    });
                    break;
                }
                case events.multisig.proposalRemoved.name: {
                    const { multisigAddress, proposalId, proposer, removedBy } =
                        events.multisig.proposalRemoved.v126.decode(event);
                    multisigProposalRemovedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        proposer: ss58Encode(proposer),
                        proposalId,
                        removedBy: ss58Encode(removedBy),
                    });
                    break;
                }
                case events.multisig.depositsClaimed.name: {
                    const { multisigAddress, claimer, totalReturned, proposalsRemoved } =
                        events.multisig.depositsClaimed.v131.is(event)
                            ? events.multisig.depositsClaimed.v131.decode(event)
                            : events.multisig.depositsClaimed.v126.decode(event);
                    multisigDepositsClaimedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash: extrinsicHash,
                        fee,
                        multisigAddress: ss58Encode(multisigAddress),
                        claimer: ss58Encode(claimer),
                        totalReturned,
                        proposalsRemoved,
                    });
                    break;
                }
                case events.techReferenda.submitted.name: {
                    const { index, track, proposal } = events.techReferenda.submitted.v126.decode(event);
                    techReferendumSubmittedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        track,
                        proposal,
                        submittedBy: extrinsicHash ? extrinsics.get(extrinsicHash)?.signer : undefined,
                    });
                    break;
                }
                case events.techReferenda.decisionStarted.name: {
                    const { index, track, proposal, tally } = events.techReferenda.decisionStarted.v126.decode(event);
                    techReferendumDecisionStartedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        track,
                        proposal,
                        tally,
                    });
                    break;
                }
                case events.techReferenda.confirmStarted.name: {
                    const { index } = events.techReferenda.confirmStarted.v126.decode(event);
                    techReferendumConfirmStartedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                    });
                    break;
                }
                case events.techReferenda.confirmAborted.name: {
                    const { index } = events.techReferenda.confirmAborted.v126.decode(event);
                    techReferendumConfirmAbortedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                    });
                    break;
                }
                case events.techReferenda.confirmed.name: {
                    const { index, tally } = events.techReferenda.confirmed.v126.decode(event);
                    techReferendumConfirmedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        tally,
                    });
                    break;
                }
                case events.techReferenda.approved.name: {
                    const { index } = events.techReferenda.approved.v126.decode(event);
                    techReferendumApprovedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                    });
                    break;
                }
                case events.techReferenda.rejected.name: {
                    const { index, tally } = events.techReferenda.rejected.v126.decode(event);
                    techReferendumRejectedEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        tally,
                    });
                    break;
                }
                case events.techReferenda.timedOut.name: {
                    const { index, tally } = events.techReferenda.timedOut.v126.decode(event);
                    techReferendumTimedOutEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        tally,
                    });
                    break;
                }
                case events.techReferenda.cancelled.name: {
                    const { index, tally } = events.techReferenda.cancelled.v126.decode(event);
                    techReferendumCancelledEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        tally,
                    });
                    break;
                }
                case events.techReferenda.killed.name: {
                    const { index, tally } = events.techReferenda.killed.v126.decode(event);
                    techReferendumKilledEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        index,
                        tally,
                    });
                    break;
                }
                case events.system.codeUpdated.name: {
                    runtimeUpgradeEvents.push({
                        id: event.id,
                        block: block.header.id,
                        timestamp: new Date(block.header.timestamp),
                        extrinsicHash,
                        specVersion: await resolvePostUpgradeSpecVersion(ctx, block.header.height),
                    });
                    break;
                }
            }

            currentEventIndex++;
        }
    }

    return {
        minerRewardEvents,
        treasuryRewardEvents,
        feesCollectedEvents,
        transferEvents,
        reversibleTransferEvents,
        reversibleTransferCancelledEvents,
        reversibleTransferExecutedEvents,
        endowedEvents,
        dustLostEvents,
        balanceSetEvents,
        reservedEvents,
        unreservedEvents,
        reserveRepatriatedEvents,
        depositEvents,
        withdrawEvents,
        slashedEvents,
        mintedEvents,
        burnedEvents,
        suspendedEvents,
        restoredEvents,
        upgradedEvents,
        issuedEvents,
        rescindedEvents,
        lockedEvents,
        unlockedEvents,
        frozenEvents,
        thawedEvents,
        errorEvents,
        highSecuritySetEvents,
        wormholeNativeTransferredEvents,
        wormholeProofVerifiedEvents,
        wormholeMinerVolumeFeeEvents,
        multisigCreatedEvents,
        multisigProposalCreatedEvents,
        multisigSignerApprovedEvents,
        multisigProposalReadyEvents,
        multisigProposalExecutedEvents,
        multisigProposalCancelledEvents,
        multisigProposalRemovedEvents,
        multisigDepositsClaimedEvents,
        techReferendumSubmittedEvents,
        techReferendumDecisionStartedEvents,
        techReferendumConfirmStartedEvents,
        techReferendumConfirmAbortedEvents,
        techReferendumConfirmedEvents,
        techReferendumApprovedEvents,
        techReferendumRejectedEvents,
        techReferendumTimedOutEvents,
        techReferendumCancelledEvents,
        techReferendumKilledEvents,
        runtimeUpgradeEvents,
        blocks,
        extrinsics,
        executedTransferToReversibleExecutedMapping,
    };
}

function toUint8Array(bytes: Uint8Array | string): Uint8Array {
    if (bytes instanceof Uint8Array) return bytes;
    const hex = bytes.replace(/^0x/, "");
    return new Uint8Array(Buffer.from(hex, "hex"));
}

function formatDispatchResult(result: { __kind: string; value?: unknown }): string {
    if (result.__kind === "Ok") return "Ok";
    return JSON.stringify(result.value);
}

async function setProposalCall(
    ctx: ProcessorContext<Store>,
    proposal: MultisigProposal,
    callBytes: Uint8Array,
    accounts: Map<string, Account>,
    block: { height: number; specVersion: number },
): Promise<void> {
    const decoded = decodeCallData(callBytes, block.specVersion);

    const created = await ensureAccountsInMap(ctx, accounts, [
        decoded.transferTo,
        decoded.scheduleTo,
        decoded.recoverAccount,
        decoded.guardian,
    ]);
    for (const id of created) {
        const account = accounts.get(id);
        if (account) account.lastUpdated = block.height;
    }

    const resolveAccount = (address?: string): Account | undefined => {
        if (!address) return undefined;
        return accounts.get(address);
    };

    proposal.callRaw = decoded.callRaw;
    proposal.pallet = decoded.pallet;
    proposal.call = decoded.call;
    proposal.decodeError = decoded.decodeError;
    proposal.transferTo = resolveAccount(decoded.transferTo);
    proposal.transferAmount = decoded.transferAmount;
    proposal.scheduleTo = resolveAccount(decoded.scheduleTo);
    proposal.scheduleAmount = decoded.scheduleAmount;
    proposal.scheduleAssetId = decoded.scheduleAssetId;
    proposal.delayKind = decoded.delayKind;
    proposal.delayValue = decoded.delayValue;
    proposal.txId = decoded.txId;
    proposal.recoverAccount = resolveAccount(decoded.recoverAccount);
    proposal.guardian = resolveAccount(decoded.guardian);
}

const STORAGE_CLEARED_DECODE_ERROR = "storage cleared at creation block";

export async function updateAndCreateAccounts(
    ctx: ProcessorContext<Store>,
    processedEvents: ProcessedEvents,
): Promise<{
    accounts: Map<string, Account>;
    depositPoolStats: DepositPoolStats;
    newAccountsCreated: number;
    depositAccountsDelta: number;
}> {
    const accountIds = new Set<string>();

    for (const t of processedEvents.wormholeNativeTransferredEvents) {
        accountIds.add(t.from);
        accountIds.add(t.to);
    }
    for (const t of processedEvents.wormholeMinerVolumeFeeEvents) accountIds.add(t.miner);
    for (const t of processedEvents.dustLostEvents) accountIds.add(t.who);
    for (const t of processedEvents.balanceSetEvents) accountIds.add(t.who);
    for (const t of processedEvents.reservedEvents) accountIds.add(t.who);
    for (const t of processedEvents.unreservedEvents) accountIds.add(t.who);
    for (const t of processedEvents.reserveRepatriatedEvents) {
        accountIds.add(t.from);
        accountIds.add(t.to);
    }
    for (const t of processedEvents.depositEvents) accountIds.add(t.who);
    for (const t of processedEvents.withdrawEvents) accountIds.add(t.who);
    for (const t of processedEvents.slashedEvents) accountIds.add(t.who);
    for (const t of processedEvents.mintedEvents) accountIds.add(t.who);
    for (const t of processedEvents.burnedEvents) accountIds.add(t.who);
    for (const t of processedEvents.suspendedEvents) accountIds.add(t.who);
    for (const t of processedEvents.restoredEvents) accountIds.add(t.who);
    for (const t of processedEvents.upgradedEvents) accountIds.add(t.who);
    for (const t of processedEvents.lockedEvents) accountIds.add(t.who);
    for (const t of processedEvents.unlockedEvents) accountIds.add(t.who);
    for (const t of processedEvents.frozenEvents) accountIds.add(t.who);
    for (const t of processedEvents.thawedEvents) accountIds.add(t.who);
    for (const t of processedEvents.reversibleTransferEvents) {
        accountIds.add(t.from);
        accountIds.add(t.to);
    }
    for (const t of processedEvents.reversibleTransferCancelledEvents) {
        accountIds.add(t.who);
    }
    for (const t of processedEvents.minerRewardEvents) {
        accountIds.add(t.miner);
    }
    for (const t of processedEvents.highSecuritySetEvents) {
        accountIds.add(t.who);
        accountIds.add(t.guardian);
    }
    for (const t of processedEvents.multisigCreatedEvents) {
        accountIds.add(t.creator);
        accountIds.add(t.multisigAddress);
        for (const s of t.signers) accountIds.add(s);
    }
    for (const t of processedEvents.multisigProposalCreatedEvents) {
        accountIds.add(t.multisigAddress);
        accountIds.add(t.proposer);
    }
    for (const t of processedEvents.multisigSignerApprovedEvents) {
        accountIds.add(t.multisigAddress);
        accountIds.add(t.approver);
    }
    for (const t of processedEvents.multisigProposalReadyEvents) {
        accountIds.add(t.multisigAddress);
    }
    for (const t of processedEvents.multisigProposalExecutedEvents) {
        accountIds.add(t.multisigAddress);
        for (const a of t.approvers) accountIds.add(a);
    }
    for (const t of processedEvents.multisigProposalCancelledEvents) {
        accountIds.add(t.multisigAddress);
        accountIds.add(t.proposer);
    }
    for (const t of processedEvents.multisigProposalRemovedEvents) {
        accountIds.add(t.multisigAddress);
        accountIds.add(t.proposer);
        accountIds.add(t.removedBy);
    }
    for (const t of processedEvents.multisigDepositsClaimedEvents) {
        accountIds.add(t.multisigAddress);
        accountIds.add(t.claimer);
    }
    for (const t of processedEvents.techReferendumSubmittedEvents) {
        if (t.submittedBy) accountIds.add(t.submittedBy);
    }

    // find any existing accounts with these ids
    const accounts = await ctx.store.findBy(Account, { id: In([...accountIds]) }).then((accounts) => {
        return new Map(accounts.map((a) => [a.id, a]));
    });

    // Snapshot the IDs that already existed in DB before this batch
    const loadedIds = new Set(accounts.keys());
    // Count how many accounts switch from deposit-only → non-deposit in this batch
    let depositFlips = 0;

    const lastBlockHeight = ctx.blocks[ctx.blocks.length - 1].header.height;

    // Helper function to get existing or create new account
    function getOrCreateAccount(id: string, blockHeight: number): Account {
        let acc = accounts.get(id);
        if (!acc) {
            acc = emptyAccount(id);
            accounts.set(id, acc);
        }
        acc.lastUpdated = blockHeight;
        return acc;
    }

    let poolStats = await ctx.store.findOneBy(DepositPoolStats, { id: "global" });
    let privacyPool = poolStats?.buckets ? poolFromJson(poolStats.buckets) : createPrivacyPool();
    if (!poolStats) {
        poolStats = new DepositPoolStats({
            id: "global",
            lastUpdatedBlock: 0,
            buckets: poolToJson(privacyPool),
        });
    }

    const depositTracker = new DepositTracker(privacyPool);
    for (const acc of accounts.values()) {
        if (acc.isDepositOnly) {
            depositTracker.hydrateAccount(acc.id, deserializeDeposits(acc.privacyDeposits));
        }
    }

    // pallet_wormhole::on_initialize(1) re-records every genesis balance as a leaf from the
    // minting sentinel so genesis holders can exit. Those balances are already in the
    // block-0 snapshot, so only the leaf's transfer row is kept, not a second credit.
    const genesisLeafBlock = ctx.blocks.find((b) => b.header.height === 1)?.header.id;
    const isGenesisLeaf = (t: WormholeNativeTransferredEvent) =>
        t.block === genesisLeafBlock && t.from === MINTING_ACCOUNT_ADDRESS && !t.extrinsicHash && loadedIds.has(t.to);

    for (const t of processedEvents.wormholeNativeTransferredEvents) {
        if (isGenesisLeaf(t)) continue;
        const from = getOrCreateAccount(t.from, lastBlockHeight);
        from.free -= t.amount;
        const to = getOrCreateAccount(t.to, lastBlockHeight);
        to.free += t.amount;

        if (from.isDepositOnly) {
            from.isDepositOnly = false;
            depositTracker.removeAccountDeposits(from.id);
            depositFlips++;
        }

        if (to.isDepositOnly) {
            depositTracker.trackDeposit(to.id, t.amount);
        }
    }
    // Track miner rewards as deposits in the privacy pool.
    // The chain forces miners to use wormhole addresses, so miner reward accounts
    // are deposit-only and their rewards are potential inputs for any wormhole output.
    for (const t of processedEvents.minerRewardEvents) {
        const miner = getOrCreateAccount(t.miner, lastBlockHeight);
        if (miner.isDepositOnly) {
            depositTracker.trackDeposit(miner.id, t.reward);
        }
    }

    for (const acc of accounts.values()) {
        acc.privacyDeposits = serializeDeposits(depositTracker.getDeposits(acc.id));
    }

    poolStats.lastUpdatedBlock = lastBlockHeight;
    poolStats.buckets = poolToJson(privacyPool);

    for (const t of processedEvents.dustLostEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free -= t.amount;
    }

    for (const t of processedEvents.balanceSetEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free = t.free;
    }

    for (const t of processedEvents.reservedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free -= t.amount;
        who.reserved += t.amount;
    }

    for (const t of processedEvents.unreservedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free += t.amount;
        who.reserved -= t.amount;
    }

    for (const t of processedEvents.reserveRepatriatedEvents) {
        const from = getOrCreateAccount(t.from, lastBlockHeight);
        from.reserved -= t.amount;
        const to = getOrCreateAccount(t.to, lastBlockHeight);
        to.free += t.amount;
        // NOTE: The destination_status is ignored for now, always repatriating to free.
    }

    for (const t of processedEvents.depositEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free += t.amount;
    }

    for (const t of processedEvents.withdrawEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free -= t.amount;
    }

    for (const t of processedEvents.slashedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free -= t.amount;
    }

    // Wormhole volume fees paid to the block author. Upgraded runtimes emit an
    // explicit Wormhole.MinerVolumeFeePaid event — credit it directly.
    const extrinsicsWithFeeEvent = new Set(
        processedEvents.wormholeMinerVolumeFeeEvents
            .map((e) => e.extrinsicHash)
            .filter((hash): hash is string => Boolean(hash)),
    );
    for (const t of processedEvents.wormholeMinerVolumeFeeEvents) {
        const miner = getOrCreateAccount(t.miner, lastBlockHeight);
        miner.free += t.amount;
    }

    // Pre-upgrade runtimes have no MinerVolumeFeePaid event: verify_aggregated_proof
    // mints the block author's share of the exit volume fee via `increase_balance`,
    // which emits only Balances.Minted. Unlike exit payouts (one NativeTransferred
    // per exit) and mining rewards (NativeTransferred from the minting account), that
    // miner fee has no matching NativeTransferred, so credit any Minted inside a
    // ProofVerified extrinsic that is not matched by a NativeTransferred — except in
    // extrinsics where MinerVolumeFeePaid already covered it. All other Minted events
    // are intentionally ignored to avoid double-counting.
    const proofVerifiedExtrinsics = new Set(
        processedEvents.wormholeProofVerifiedEvents
            .map((e) => e.extrinsicHash)
            .filter((hash): hash is string => Boolean(hash)),
    );
    const unmatchedExitsByExtrinsic = new Map<string, WormholeNativeTransferredEvent[]>();
    for (const t of processedEvents.wormholeNativeTransferredEvents) {
        if (!t.extrinsicHash || !proofVerifiedExtrinsics.has(t.extrinsicHash)) continue;
        const exits = unmatchedExitsByExtrinsic.get(t.extrinsicHash) ?? [];
        exits.push(t);
        unmatchedExitsByExtrinsic.set(t.extrinsicHash, exits);
    }

    for (const t of processedEvents.mintedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        if (!t.extrinsicHash || !proofVerifiedExtrinsics.has(t.extrinsicHash)) continue;
        // Already credited via the explicit MinerVolumeFeePaid event above.
        if (extrinsicsWithFeeEvent.has(t.extrinsicHash)) continue;
        const exits = unmatchedExitsByExtrinsic.get(t.extrinsicHash) ?? [];
        const exitIndex = exits.findIndex((e) => e.to === t.who && e.amount === t.amount);
        if (exitIndex >= 0) {
            // Exit payout — already credited via its NativeTransferred event.
            exits.splice(exitIndex, 1);
            continue;
        }
        // Miner's share of the wormhole exit volume fee.
        who.free += t.amount;
    }

    for (const t of processedEvents.burnedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free -= t.amount;
    }

    for (const t of processedEvents.suspendedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free = 0n;
    }

    for (const t of processedEvents.restoredEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.free += t.amount;
    }

    for (const t of processedEvents.frozenEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.frozen += t.amount;
    }

    for (const t of processedEvents.thawedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.frozen -= t.amount;
    }

    // NOTE: The logic for Locked and Unlocked is often application-specific.
    // For now, we'll treat them like Frozen/Thawed.
    for (const t of processedEvents.lockedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.frozen += t.amount;
    }

    for (const t of processedEvents.unlockedEvents) {
        const who = getOrCreateAccount(t.who, lastBlockHeight);
        who.frozen -= t.amount;
    }

    // Events that create/destroy accounts but don't have a balance impact in this model
    for (const t of processedEvents.reversibleTransferEvents) {
        getOrCreateAccount(t.from, lastBlockHeight);
        getOrCreateAccount(t.to, lastBlockHeight);
    }
    for (const t of processedEvents.multisigCreatedEvents) {
        getOrCreateAccount(t.creator, lastBlockHeight);

        for (const s of t.signers) {
            getOrCreateAccount(s, lastBlockHeight);
        }
    }

    // All new accounts start as deposit-only; subtract those that flipped in this batch
    const newAccountsCreated = accounts.size - loadedIds.size;
    const depositAccountsDelta = newAccountsCreated - depositFlips;

    return { accounts, depositPoolStats: poolStats, newAccountsCreated, depositAccountsDelta };
}

/**
 * Create Extrinsic entities from processed extrinsic data.
 * Returns a Map of extrinsic hash -> Extrinsic entity for linking to other entities.
 */
async function createExtrinsics(
    ctx: ProcessorContext<Store>,
    processedEvents: ProcessedEvents,
    accounts: Map<string, Account>,
    blocks: Map<string, Block>,
): Promise<{ extrinsics: Map<string, Extrinsic>; newCreatedAccounts: number }> {
    const extrinsicEntities = new Map<string, Extrinsic>();

    const createdSigners = await ensureAccountsInMap(
        ctx,
        accounts,
        [...processedEvents.extrinsics.values()].map((data) => data.signer),
    );

    for (const [hash, data] of processedEvents.extrinsics) {
        const block = blocks.get(data.block);
        if (!block) continue;

        // Signer is optional (undefined for unsigned extrinsics like Wormhole)
        let signer: Account | undefined;
        if (data.signer) {
            signer = accounts.get(data.signer);
            assert(signer, `Signer account ${data.signer} not found after ensure`);
            if (createdSigners.has(data.signer)) {
                signer.lastUpdated = block.height;
            }
        }

        const extrinsic = new Extrinsic({
            id: hash,
            block,
            indexInBlock: data.indexInBlock,
            timestamp: data.timestamp,
            signer, // undefined for unsigned extrinsics
            pallet: data.pallet,
            call: data.call,
            args: JSON.stringify(data.args),
            success: data.success,
            fee: data.fee,
        });

        extrinsicEntities.set(hash, extrinsic);
    }

    return { extrinsics: extrinsicEntities, newCreatedAccounts: createdSigners.size };
}

export async function createReversibleTransfers(
    ctx: ProcessorContext<Store>,
    reversibleTransferEvents: ReversibleTransferEvent[],
    reversibleTransferCancelledEvents: ReversibleTransferCancelledEvent[],
    reversibleTransferExecutedEvents: ReversibleTransferExecutedEvent[],
    accounts: Map<string, Account>,
    blocks: Map<string, Block>,
    extrinsics: Map<string, Extrinsic>,
): Promise<{
    scheduledReversibles: ScheduledReversibleTransfer[];
    executedReversibles: ExecutedReversibleTransfer[];
    cancelledReversibles: CancelledReversibleTransfer[];
}> {
    const scheduledReversibles: ScheduledReversibleTransfer[] = [];
    const newScheduledByTxId = new Map<string, ScheduledReversibleTransfer>();

    for (const t of reversibleTransferEvents) {
        const from = accounts.get(t.from);
        assert(from, `From account ${t.from} not found`);
        const toAccount = accounts.get(t.to);
        assert(toAccount, `Account ${t.to} not found`);
        const block = blocks.get(t.block);
        assert(block, `Block ${t.block} not found`);

        // Link to Extrinsic entity if available
        const extrinsic = t.extrinsicHash ? extrinsics.get(t.extrinsicHash) : undefined;

        const scheduled = new ScheduledReversibleTransfer({
            id: t.id,
            from,
            to: toAccount,
            amount: t.amount,
            fee: t.fee || 0n,
            txId: t.txId,
            timestamp: t.timestamp,
            extrinsic,
            scheduledAt: t.scheduledAt,
            block,
        });
        scheduledReversibles.push(scheduled);
        newScheduledByTxId.set(t.txId, scheduled);
    }

    const cancelledTxIds = new Set(reversibleTransferCancelledEvents.map((e) => e.txId));
    const executedTxIds = new Set(reversibleTransferExecutedEvents.map((e) => e.txId));
    const allTxIds = new Set([...cancelledTxIds, ...executedTxIds]);

    // Find scheduled transfers from previous batches that are now executed/cancelled
    let existingScheduledByTxId = new Map<string, ScheduledReversibleTransfer>();
    if (allTxIds.size > 0) {
        const txIdsNotInBatch = [...allTxIds].filter((txId) => !newScheduledByTxId.has(txId));
        if (txIdsNotInBatch.length > 0) {
            const existing = await ctx.store.find(ScheduledReversibleTransfer, {
                where: { txId: In(txIdsNotInBatch) },
                relations: { from: true, to: true },
            });
            for (const s of existing) {
                existingScheduledByTxId.set(s.txId, s);
            }
        }
    }

    const findScheduled = (txId: string) => newScheduledByTxId.get(txId) || existingScheduledByTxId.get(txId);

    const executedReversibles: ExecutedReversibleTransfer[] = [];
    for (const e of reversibleTransferExecutedEvents) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);
        const scheduledTransfer = findScheduled(e.txId);
        assert(scheduledTransfer, `ScheduledReversibleTransfer for txId ${e.txId} not found`);

        executedReversibles.push(
            new ExecutedReversibleTransfer({
                id: e.id,
                block,
                timestamp: e.timestamp,
                txId: e.txId,
                scheduledTransfer,
            }),
        );
    }

    const cancelledReversibles: CancelledReversibleTransfer[] = [];
    for (const e of reversibleTransferCancelledEvents) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);
        const scheduledTransfer = findScheduled(e.txId);
        assert(scheduledTransfer, `ScheduledReversibleTransfer for txId ${e.txId} not found`);
        const cancelledBy = accounts.get(e.who);
        assert(cancelledBy, `CancelledBy account ${e.who} not found`);

        // Link to Extrinsic entity if available
        const extrinsic = e.extrinsicHash ? extrinsics.get(e.extrinsicHash) : undefined;

        cancelledReversibles.push(
            new CancelledReversibleTransfer({
                id: e.id,
                block,
                timestamp: e.timestamp,
                extrinsic,
                txId: e.txId,
                cancelledBy,
                scheduledTransfer,
            }),
        );
    }

    return { scheduledReversibles, executedReversibles, cancelledReversibles };
}

export function createMultisigs(
    multisigCreatedEvents: MultisigCreatedEvent[],
    accounts: Map<string, Account>,
    blocks: Map<string, Block>,
    extrinsics: Map<string, Extrinsic>,
): Multisig[] {
    const multisigsByAddress = new Map<string, Multisig>();

    for (const e of multisigCreatedEvents) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);
        const creator = accounts.get(e.creator);
        assert(creator, `Creator account ${e.creator} not found`);
        const extrinsic = e.extrinsicHash ? extrinsics.get(e.extrinsicHash) : undefined;

        multisigsByAddress.set(
            e.multisigAddress,
            new Multisig({
                id: e.multisigAddress,
                block,
                timestamp: e.timestamp,
                extrinsic,
                creator,
                threshold: e.threshold,
                nonce: e.nonce,
                signers: e.signers,
                fee: getFee(e),
            }),
        );
    }

    return [...multisigsByAddress.values()];
}

type MultisigProposalSeed = {
    multisigAddress: string;
    proposalId: number;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    proposer?: string;
};

export async function createMultisigProposals(
    ctx: ProcessorContext<Store>,
    processedEvents: ProcessedEvents,
    multisigs: Multisig[],
    accounts: Map<string, Account>,
    blocks: Map<string, Block>,
    extrinsics: Map<string, Extrinsic>,
): Promise<{
    proposals: MultisigProposal[];
    proposalsToUpsert: MultisigProposal[];
    proposalCreated: MultisigProposalCreated[];
    signerApproved: MultisigSignerApproved[];
    proposalReady: MultisigProposalReady[];
    executed: ExecutedMultisigProposal[];
    cancelled: CancelledMultisigProposal[];
    removed: RemovedMultisigProposal[];
    depositsClaimed: MultisigDepositsClaimed[];
}> {
    const blockHeadersById = new Map(ctx.blocks.map((b) => [b.header.id, b.header]));
    const multisigsByAddress = new Map(multisigs.map((m) => [m.id, m]));

    const proposalByKey = new Map<string, MultisigProposal>();
    const proposalsToUpsert = new Map<string, MultisigProposal>();
    const insertProposalKeys = new Set<string>();
    const proposalCreated: MultisigProposalCreated[] = [];
    const signerApproved: MultisigSignerApproved[] = [];
    const proposalReady: MultisigProposalReady[] = [];

    const findProposal = (key: string) => proposalByKey.get(key) ?? proposalsToUpsert.get(key);

    const getBlock = (blockId: string): Block => {
        const block = blocks.get(blockId);
        assert(block, `Block ${blockId} not found`);
        return block;
    };

    const getExtrinsic = (hash?: string) => (hash ? extrinsics.get(hash) : undefined);

    const getMultisig = async (address: string): Promise<Multisig> => {
        let multisig = multisigsByAddress.get(address);
        if (multisig) return multisig;

        const existing = await ctx.store.findOne(Multisig, { where: { id: address } });
        assert(existing, `Multisig ${address} not found`);
        multisigsByAddress.set(address, existing);
        return existing;
    };

    const readProposalFromStorage = async (
        blockId: string,
        multisigAddress: string,
        proposalId: number,
    ): Promise<v131.ProposalData | v126.ProposalData | undefined> => {
        const header = blockHeadersById.get(blockId);
        if (!header) return undefined;
        const key = ss58Decode(multisigAddress);
        if (storage.multisig.proposals.v131.is(header)) {
            return storage.multisig.proposals.v131.get(header, key, proposalId);
        }
        if (storage.multisig.proposals.v126.is(header)) {
            return storage.multisig.proposals.v126.get(header, key, proposalId);
        }
        return undefined;
    };

    const applyStorageToProposal = async (
        proposal: MultisigProposal,
        data: v131.ProposalData | v126.ProposalData,
        proposerAddress: string,
        header: { height: number; specVersion: number },
    ) => {
        await setProposalCall(ctx, proposal, toUint8Array(data.call), accounts, header);
        proposal.expiryBlock = data.expiry;
        proposal.deposit = data.deposit;
        proposal.approvals = data.approvals.map(ss58Encode);
        const proposer = accounts.get(proposerAddress);
        if (proposer) proposal.proposer = proposer;
    };

    const preloadProposals = async (keys: Iterable<string>) => {
        const missing = [...keys].filter((k) => !findProposal(k));
        if (missing.length === 0) return;

        const existing = await ctx.store.find(MultisigProposal, {
            where: { id: In(missing) },
            relations: { proposer: true },
        });
        for (const p of existing) proposalByKey.set(p.id, p);
    };

    const upsert = (proposal: MultisigProposal, updatedAt: Date) => {
        proposal.updatedAt = updatedAt;
        proposalsToUpsert.set(proposal.id, proposal);
    };

    const sameBatchExecutedCallByKey = new Map<string, Uint8Array>();
    for (const e of processedEvents.multisigProposalExecutedEvents) {
        sameBatchExecutedCallByKey.set(multisigProposalKey(e.multisigAddress, e.proposalId), e.call);
    }

    const getOrCreateProposal = async (
        e: MultisigProposalSeed,
        opts?: { fallbackCall?: Uint8Array },
    ): Promise<MultisigProposal> => {
        const key = multisigProposalKey(e.multisigAddress, e.proposalId);
        const inMemory = findProposal(key);
        if (inMemory) return inMemory;

        const fromDb = await ctx.store.findOne(MultisigProposal, { where: { id: key }, relations: { proposer: true } });
        if (fromDb) {
            proposalByKey.set(key, fromDb);
            return fromDb;
        }

        const multisig = await getMultisig(e.multisigAddress);
        const block = getBlock(e.block);
        const header = blockHeadersById.get(e.block);
        assert(header, `Block header ${e.block} for proposal ${key} not in batch`);

        const storageData = await readProposalFromStorage(e.block, e.multisigAddress, e.proposalId);

        const proposerAddress = e.proposer ?? (storageData ? ss58Encode(storageData.proposer) : undefined);
        assert(proposerAddress, `Proposer for proposal ${key} not found`);
        const proposer = accounts.get(proposerAddress);
        assert(proposer, `Proposer account ${proposerAddress} not found`);

        const proposal = new MultisigProposal({
            id: key,
            createdAtBlock: block,
            createdAt: e.timestamp,
            updatedAt: e.timestamp,
            createdExtrinsic: getExtrinsic(e.extrinsicHash),
            multisig,
            proposalId: e.proposalId,
            proposer,
            expiryBlock: 0,
            deposit: 0n,
            burnedPalletFee: 0n,
            creationNetworkFee: 0n,
            approvals: [],
            status: MultisigProposalStatus.ACTIVE,
        });

        if (storageData) {
            await applyStorageToProposal(proposal, storageData, proposerAddress, header);
        } else {
            const fallbackCall = opts?.fallbackCall;
            const callBytes = fallbackCall?.length ? fallbackCall : new Uint8Array();
            await setProposalCall(ctx, proposal, callBytes, accounts, header);
            if (!callBytes.length) {
                proposal.decodeError = STORAGE_CLEARED_DECODE_ERROR;
            }
        }

        proposalByKey.set(key, proposal);
        insertProposalKeys.add(key);
        return proposal;
    };

    for (const e of processedEvents.multisigProposalCreatedEvents) {
        const key = multisigProposalKey(e.multisigAddress, e.proposalId);
        const proposal = await getOrCreateProposal(e, {
            fallbackCall: sameBatchExecutedCallByKey.get(key),
        });
        // propose() prepays MaxInnerCallWeight and refunds the rest, and a batch shares one
        // extrinsic across proposals, so price the burn from the runtime, not balance events.
        const burnedPalletFee = computeProposalBurnedFee(e.feeParams, proposal.multisig.signers.length);
        proposal.burnedPalletFee = burnedPalletFee;
        proposal.creationNetworkFee = getFee(e);
        upsert(proposal, e.timestamp);

        proposalCreated.push(
            new MultisigProposalCreated({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                proposal,
                deposit: proposal.deposit,
                burnedPalletFee,
                fee: getFee(e),
            }),
        );
    }

    for (const e of processedEvents.multisigSignerApprovedEvents) {
        const proposal = await getOrCreateProposal(e);

        const approver = accounts.get(e.approver);
        assert(approver, `Approver account ${e.approver} not found`);

        if (!proposal.approvals.includes(e.approver)) {
            proposal.approvals = [...proposal.approvals, e.approver];
        }
        upsert(proposal, e.timestamp);

        signerApproved.push(
            new MultisigSignerApproved({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                proposal,
                approver,
                approvalsCount: e.approvalsCount,
                fee: getFee(e),
            }),
        );
    }

    for (const e of processedEvents.multisigProposalReadyEvents) {
        const proposal = await getOrCreateProposal(e);

        proposal.status = MultisigProposalStatus.APPROVED;
        upsert(proposal, e.timestamp);

        proposalReady.push(
            new MultisigProposalReady({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                proposal,
                approvalsCount: e.approvalsCount,
                fee: getFee(e),
            }),
        );
    }

    await preloadProposals(
        [
            ...processedEvents.multisigProposalExecutedEvents,
            ...processedEvents.multisigProposalCancelledEvents,
            ...processedEvents.multisigProposalRemovedEvents,
        ].map((e) => multisigProposalKey(e.multisigAddress, e.proposalId)),
    );

    const executed: ExecutedMultisigProposal[] = [];
    for (const e of processedEvents.multisigProposalExecutedEvents) {
        const extrinsic = getExtrinsic(e.extrinsicHash);
        assert(extrinsic?.signer, `Extrinsic signer not found for proposal executed event ${e.id}`);

        const block = getBlock(e.block);
        const proposal = await getOrCreateProposal(e, { fallbackCall: e.call });
        proposal.status = MultisigProposalStatus.EXECUTED;
        upsert(proposal, e.timestamp);

        executed.push(
            new ExecutedMultisigProposal({
                id: e.id,
                block,
                timestamp: e.timestamp,
                extrinsic,
                proposal,
                approvers: e.approvers,
                result: e.result,
                fee: getFee(e),
            }),
        );
    }

    const cancelled: CancelledMultisigProposal[] = [];
    for (const e of processedEvents.multisigProposalCancelledEvents) {
        const cancelledBy = accounts.get(e.proposer);
        assert(cancelledBy, `CancelledBy account ${e.proposer} not found`);

        const proposal = await getOrCreateProposal(e);
        proposal.status = MultisigProposalStatus.CANCELLED;
        upsert(proposal, e.timestamp);

        cancelled.push(
            new CancelledMultisigProposal({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                proposal,
                cancelledBy,
                fee: getFee(e),
            }),
        );
    }

    const removed: RemovedMultisigProposal[] = [];
    for (const e of processedEvents.multisigProposalRemovedEvents) {
        const removedBy = accounts.get(e.removedBy);
        assert(removedBy, `RemovedBy account ${e.removedBy} not found`);

        const proposal = await getOrCreateProposal(e);
        proposal.status = MultisigProposalStatus.REMOVED;
        upsert(proposal, e.timestamp);

        removed.push(
            new RemovedMultisigProposal({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                proposal,
                removedBy,
                fee: getFee(e),
            }),
        );
    }

    const depositsClaimed: MultisigDepositsClaimed[] = [];
    for (const e of processedEvents.multisigDepositsClaimedEvents) {
        const claimer = accounts.get(e.claimer);
        assert(claimer, `Claimer account ${e.claimer} not found`);

        depositsClaimed.push(
            new MultisigDepositsClaimed({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                multisig: await getMultisig(e.multisigAddress),
                claimer,
                totalReturned: e.totalReturned,
                proposalsRemoved: e.proposalsRemoved,
                fee: getFee(e),
            }),
        );
    }

    return {
        proposals: [...proposalByKey.values()].filter((p) => insertProposalKeys.has(p.id)),
        proposalsToUpsert: [...proposalsToUpsert.values()],
        proposalCreated,
        signerApproved,
        proposalReady,
        executed,
        cancelled,
        removed,
        depositsClaimed,
    };
}

export async function createTechReferenda(
    ctx: ProcessorContext<Store>,
    processedEvents: ProcessedEvents,
    accounts: Map<string, Account>,
    blocks: Map<string, Block>,
    extrinsics: Map<string, Extrinsic>,
): Promise<{
    techReferendumEvents: TechReferendumEvent[];
    runtimeUpgrades: RuntimeUpgrade[];
}> {
    const blockHeadersById = new Map(ctx.blocks.map((b) => [b.header.id, b.header]));
    const techReferendumEvents: TechReferendumEvent[] = [];
    const snapshotByIndex = new Map<number, ReferendumDetails>();
    const storedSnapshotPromises = new Map<number, Promise<ReferendumDetails | undefined>>();

    const getBlock = (blockId: string): Block => {
        const block = blocks.get(blockId);
        assert(block, `Block ${blockId} not found`);
        return block;
    };

    const getExtrinsic = (hash?: string) => (hash ? extrinsics.get(hash) : undefined);

    const createdActors = await ensureAccountsInMap(
        ctx,
        accounts,
        processedEvents.techReferendumSubmittedEvents.map((e) => e.submittedBy),
    );

    const resolveAccount = (address: string | undefined, blockHeight: number): Account | undefined => {
        if (!address) return undefined;
        const account = accounts.get(address);
        assert(account, `Account ${address} not found after ensure`);
        if (createdActors.has(address)) {
            account.lastUpdated = blockHeight;
        }
        return account;
    };

    const rememberSnapshot = (index: number, details: ReferendumDetails | undefined): void => {
        if (details && !needsSnapshotForward(details, index)) {
            snapshotByIndex.set(index, details);
        }
    };

    const loadStoredSnapshot = (index: number): Promise<ReferendumDetails | undefined> => {
        const cached = storedSnapshotPromises.get(index);
        if (cached) return cached;

        const promise = (async () => {
            const [stored] = await ctx.store.find(TechReferendumEvent, {
                where: [
                    { referendumIndex: index, track: Not(IsNull()) },
                    { referendumIndex: index, isRuntimeUpgrade: true },
                    { referendumIndex: index, proposalCalls: Not(IsNull()) },
                ],
                order: { timestamp: "DESC" },
                take: 1,
            });
            if (!stored) return undefined;

            const details = referendumDetailsFromStoredSnapshot(stored);
            return needsSnapshotForward(details, index) ? undefined : details;
        })();

        storedSnapshotPromises.set(index, promise);
        return promise;
    };

    const resolveReferendumDetails = async (e: TechReferendumEventData): Promise<ReferendumDetails | undefined> => {
        const header = blockHeadersById.get(e.block);
        let details = header
            ? await buildReferendumDetails(e.index, header, {
                  track: e.track,
                  proposalFromEvent: e.proposal,
                  log: ctx.log,
              })
            : undefined;

        if (needsSnapshotForward(details, e.index)) {
            const snapshot = snapshotByIndex.get(e.index) ?? (await loadStoredSnapshot(e.index));
            if (snapshot) {
                details = details ? mergeReferendumDetails(snapshot, details, e.index) : snapshot;
            }
        }

        rememberSnapshot(e.index, details);
        return details;
    };

    // Builds a single, self-contained referendum event: a snapshot of what the proposal is
    // about (track, origin, metadata, decoded calls) plus the tally captured with this event.
    const addEvent = async (
        e: TechReferendumEventData,
        type: TechReferendumEventType,
        actor?: Account,
    ): Promise<void> => {
        const details = await resolveReferendumDetails(e);
        const tally = e.tally ? serializeReferendumTally(e.tally) : undefined;

        techReferendumEvents.push(
            new TechReferendumEvent({
                id: e.id,
                referendumIndex: e.index,
                type,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                actor,
                track: details?.track,
                trackName: details?.trackName,
                origin: details?.origin,
                title: details?.title,
                description: details?.description,
                proposalSummary: details?.proposal.summary,
                proposalStorage: details?.proposal.storage,
                proposalPreimageHash: details?.proposal.preimageHash,
                proposalSizeBytes: details?.proposal.sizeBytes,
                proposalCalls: details ? JSON.stringify(details.proposal.calls) : undefined,
                isRuntimeUpgrade: details?.proposal.isRuntimeUpgrade ?? false,
                tallyAyes: tally?.ayes,
                tallyNays: tally?.nays,
                tallyBareAyes: tally?.bareAyes,
            }),
        );
    };

    for (const e of processedEvents.techReferendumSubmittedEvents) {
        const actor = resolveAccount(e.submittedBy, getBlock(e.block).height);
        await addEvent(e, TechReferendumEventType.SUBMITTED, actor);
    }
    for (const e of processedEvents.techReferendumDecisionStartedEvents) {
        await addEvent(e, TechReferendumEventType.DECISION_STARTED);
    }
    for (const e of processedEvents.techReferendumConfirmStartedEvents) {
        await addEvent(e, TechReferendumEventType.CONFIRM_STARTED);
    }
    for (const e of processedEvents.techReferendumConfirmAbortedEvents) {
        await addEvent(e, TechReferendumEventType.CONFIRM_ABORTED);
    }
    for (const e of processedEvents.techReferendumConfirmedEvents) {
        await addEvent(e, TechReferendumEventType.CONFIRMED);
    }
    for (const e of processedEvents.techReferendumApprovedEvents) {
        await addEvent(e, TechReferendumEventType.APPROVED);
    }
    for (const e of processedEvents.techReferendumRejectedEvents) {
        await addEvent(e, TechReferendumEventType.REJECTED);
    }
    for (const e of processedEvents.techReferendumTimedOutEvents) {
        await addEvent(e, TechReferendumEventType.TIMED_OUT);
    }
    for (const e of processedEvents.techReferendumCancelledEvents) {
        await addEvent(e, TechReferendumEventType.CANCELLED);
    }
    for (const e of processedEvents.techReferendumKilledEvents) {
        await addEvent(e, TechReferendumEventType.KILLED);
    }

    const runtimeUpgrades: RuntimeUpgrade[] = [];
    for (const e of processedEvents.runtimeUpgradeEvents) {
        runtimeUpgrades.push(
            new RuntimeUpgrade({
                id: e.id,
                block: getBlock(e.block),
                timestamp: e.timestamp,
                extrinsic: getExtrinsic(e.extrinsicHash),
                specVersion: e.specVersion,
            }),
        );
    }

    return { techReferendumEvents, runtimeUpgrades };
}

export async function createMinerRewards(
    ctx: ProcessorContext<Store>,
    minerRewardEvents: MinerRewardEvent[],
    treasuryRewardEvents: TreasuryRewardEvent[],
    accounts: Map<string, Account>,
    blockMap: Map<string, Block>,
): Promise<{
    minerRewards: MinerReward[];
    blocks: Block[];
    accountStatsMap: Map<string, AccountStats>;
    newMiners: number;
}> {
    const minerRewardMinerAddresses = new Set<string>();
    const minerRewardBlockIds = new Set<string>();
    minerRewardEvents.forEach((e) => {
        minerRewardMinerAddresses.add(e.miner);
        minerRewardBlockIds.add(e.block);
    });

    const treasuryRewardBlockIds = new Set(treasuryRewardEvents.map((e) => e.block));
    const mapBlocksIds = new Set(blockMap.keys());
    const allBlockIds = new Set([...minerRewardBlockIds, ...treasuryRewardBlockIds, ...mapBlocksIds]);

    const existingBlocks: Record<string, Block> = {};
    blockMap.forEach((block) => {
        existingBlocks[block.id] = block;
    });
    const storeBlocks = await ctx.store.findBy(Block, { id: In([...allBlockIds]) });
    storeBlocks.forEach((block) => {
        existingBlocks[block.id] = block;
    });

    const accountStatsMap = new Map<string, AccountStats>();
    if (minerRewardMinerAddresses.size > 0) {
        const storeAccountStats = await ctx.store.findBy(AccountStats, {
            id: In([...minerRewardMinerAddresses]),
        });
        storeAccountStats.forEach((stat) => {
            accountStatsMap.set(stat.id, stat);
        });
    }

    // Processing miner rewards
    let newMiners = 0;
    const minerRewards: MinerReward[] = [];
    for (let mr of minerRewardEvents) {
        let { id, timestamp, block: blockId, miner: minerAddress, reward } = mr;

        const block = existingBlocks[blockId];
        assert(block, `Block ${blockId} not found`);
        const miner = accounts.get(minerAddress);
        assert(miner, `Account ${minerAddress} not found`);

        minerRewards.push(
            new MinerReward({
                id,
                block,
                timestamp,
                miner,
                reward,
            }),
        );

        // MinerRewarded already includes this block's transaction fees.
        block.reward += reward;
        block.minedBy = miner;

        // Updating by reference or creating AccountStats for miner
        const accountStats = accountStatsMap.get(minerAddress);
        if (accountStats) {
            accountStats.totalMinedBlocks += 1;
            accountStats.totalRewards += reward;
        } else {
            newMiners++;

            const accountStats = emptyAccountStats(minerAddress);
            accountStats.totalMinedBlocks = 1;
            accountStats.totalRewards = reward;

            accountStatsMap.set(minerAddress, accountStats);
        }
    }

    // Updating block rewards from treasury events
    for (let tr of treasuryRewardEvents) {
        let { block: blockId, reward } = tr;

        const block = existingBlocks[blockId];
        assert(block, `Block ${blockId} not found`);

        block.reward += reward;
    }

    return { minerRewards, blocks: Object.values(existingBlocks), accountStatsMap, newMiners };
}

/**
 * Create WormholeExtrinsic and WormholeOutput entities with pre-computed privacy scores.
 *
 * Groups NativeTransferred events by extrinsic hash. Each extrinsic represents one
 * proof verification containing one or more exit outputs.
 */
async function createWormholeOutputs(
    ctx: ProcessorContext<Store>,
    processedEvents: ProcessedEvents,
    accounts: Map<string, Account>,
    poolStats: DepositPoolStats,
    extrinsicEntities: Map<string, Extrinsic>,
): Promise<{
    wormholeExtrinsics: WormholeExtrinsic[];
    outputs: WormholeOutput[];
    nullifiers: WormholeNullifier[];
    newCreatedAccounts: number;
}> {
    const wormholeEvents = processedEvents.wormholeNativeTransferredEvents;
    const proofVerifiedEvents = processedEvents.wormholeProofVerifiedEvents;
    if (wormholeEvents.length === 0 || proofVerifiedEvents.length === 0) {
        return { wormholeExtrinsics: [], outputs: [], nullifiers: [], newCreatedAccounts: 0 };
    }

    const pool = poolFromJson(poolStats.buckets);

    const FEE_BPS = 10;
    const K_MAX = 16;

    // Only include NativeTransferred events from extrinsics that also have ProofVerified.
    // This filters out deposit transfers (batch transfers to wormhole addresses) which
    // also emit NativeTransferred via the proof recorder extension.
    const verifiedExtrinsicHashes = new Set<string>();
    for (const pv of proofVerifiedEvents) {
        if (pv.extrinsicHash) verifiedExtrinsicHashes.add(pv.extrinsicHash);
    }

    // Group only verified events by extrinsic hash
    const grouped = new Map<string, typeof wormholeEvents>();
    for (const e of wormholeEvents) {
        if (!e.extrinsicHash || !verifiedExtrinsicHashes.has(e.extrinsicHash)) continue;
        const group = grouped.get(e.extrinsicHash) ?? [];
        group.push(e);
        grouped.set(e.extrinsicHash, group);
    }

    const exitAccountIds = [...grouped.values()].flatMap((events) => events.map((e) => e.to));
    const createdExitAccounts = await ensureAccountsInMap(ctx, accounts, exitAccountIds);

    const wormholeExtrinsics: WormholeExtrinsic[] = [];
    const outputs: WormholeOutput[] = [];
    const nullifiers: WormholeNullifier[] = [];

    for (const [extHash, events] of grouped) {
        const first = events[0];
        const block = processedEvents.blocks.get(first.block);
        const outputCount = events.length;
        const kMin = Math.max(1, Math.ceil(outputCount / 2));

        let totalAmount = 0n;
        for (const e of events) totalAmount += e.amount;

        // Privacy score is computed on the total exit amount for the whole extrinsic.
        // An observer sees the total and tries to link it to deposit subsets.
        // Base dist is 0.01 DEV (10^10 token units) -- the quantization granularity.
        const ONE_HUNDREDTH_DEV = 10_000_000_000n;
        const scoreBase = privacyScore(totalAmount, ONE_HUNDREDTH_DEV, pool, FEE_BPS, kMin, K_MAX);
        const score01 = privacyScore(totalAmount, totalAmount / 1000n, pool, FEE_BPS, kMin, K_MAX);
        const score1 = privacyScore(totalAmount, totalAmount / 100n, pool, FEE_BPS, kMin, K_MAX);
        const score5 = privacyScore(totalAmount, totalAmount / 20n, pool, FEE_BPS, kMin, K_MAX);

        // Link to the generic Extrinsic entity
        const linkedExtrinsic = extHash ? extrinsicEntities.get(extHash) : undefined;

        const wormholeExtrinsic = new WormholeExtrinsic({
            id: extHash,
            block: block,
            timestamp: first.timestamp,
            extrinsic: linkedExtrinsic,
            totalAmount: totalAmount,
            outputCount: outputCount,
            privacyScore: Math.round(scoreBase * 10) / 10,
            privacyScore01Pct: Math.round(score01 * 10) / 10,
            privacyScore1Pct: Math.round(score1 * 10) / 10,
            privacyScore5Pct: Math.round(score5 * 10) / 10,
            privacyLabel: scoreLabel(scoreBase),
            poolSnapshot: poolStats.buckets,
        });
        wormholeExtrinsics.push(wormholeExtrinsic);

        for (const e of events) {
            const exitAccount = accounts.get(e.to);
            assert(exitAccount, `Exit account ${e.to} not found after ensure`);
            if (createdExitAccounts.has(e.to) && block) {
                exitAccount.lastUpdated = block.height;
            }

            outputs.push(
                new WormholeOutput({
                    id: e.id,
                    wormholeExtrinsic: wormholeExtrinsic,
                    exitAccount: exitAccount,
                    amount: e.amount,
                }),
            );
        }

        // Create nullifier entities from the ProofVerified event for this extrinsic
        const proofEvent = proofVerifiedEvents.find((pv) => pv.extrinsicHash === extHash);
        if (proofEvent && proofEvent.nullifiers) {
            for (let i = 0; i < proofEvent.nullifiers.length; i++) {
                const nullifierBytes = proofEvent.nullifiers[i];
                const nullifierHex = Buffer.from(nullifierBytes).toString("hex");
                const nullifierHash = computeAccountIdHash(nullifierBytes);
                nullifiers.push(
                    new WormholeNullifier({
                        id: `${extHash}-nullifier-${i}`,
                        nullifier: nullifierHex,
                        nullifierHash: nullifierHash,
                        wormholeExtrinsic: wormholeExtrinsic,
                        block: block,
                        timestamp: first.timestamp,
                    }),
                );
            }
        }
    }

    return {
        wormholeExtrinsics,
        outputs,
        nullifiers,
        newCreatedAccounts: createdExitAccounts.size,
    };
}

export function createEvents(
    processedEvents: ProcessedEvents,
    accounts: Map<string, Account>,
    scheduledReversibles: ScheduledReversibleTransfer[],
    executedReversibles: ExecutedReversibleTransfer[],
    cancelledReversibles: CancelledReversibleTransfer[],
    minerRewards: MinerReward[],
    extrinsics: Map<string, Extrinsic>,
    multisigs: Multisig[],
    multisigProposalCreated: MultisigProposalCreated[],
    multisigSignerApproved: MultisigSignerApproved[],
    multisigProposalReady: MultisigProposalReady[],
    executedMultisigProposals: ExecutedMultisigProposal[],
    cancelledMultisigProposals: CancelledMultisigProposal[],
    removedMultisigProposals: RemovedMultisigProposal[],
    multisigDepositsClaimed: MultisigDepositsClaimed[],
    techReferendumEvents: TechReferendumEvent[],
    runtimeUpgrades: RuntimeUpgrade[],
): {
    events: Event[];
    transfers: Transfer[];
    errorEvents: ErrorEvent[];
    highSecuritySetEvents: HighSecuritySet[];
} {
    const {
        transferEvents,
        errorEvents: errorEventData,
        highSecuritySetEvents: highSecuritySetEventData,
        wormholeNativeTransferredEvents,
        multisigCreatedEvents,
        multisigDepositsClaimedEvents,
        blocks,
        executedTransferToReversibleExecutedMapping,
    } = processedEvents;
    const allEvents: Event[] = [];
    const transfers: Transfer[] = [];
    const errorEvents: ErrorEvent[] = [];
    const highSecuritySetEvents: HighSecuritySet[] = [];

    const executedReversiblesByTxId = new Map<string, ExecutedReversibleTransfer>();
    for (const er of executedReversibles) {
        executedReversiblesByTxId.set(er.txId, er);
    }

    // Build lookup for fee and extrinsic hash from Transfer events.
    // Uses array to support duplicate (from,to,amount,block) transfers.
    //
    // Example with 3 identical transfers (alice→bob, 5 quan)
    //
    // wormholeNativeTransferredEvents:
    //   {from:"alice", to:"bob", amount:5n, fee:1n, ...}
    //   {from:"alice", to:"bob", amount:5n, fee:5n, ...}
    //   {from:"alice", to:"bob", amount:5n, fee:30n, ...}
    //
    // After building map:
    //   feeLookup = Map {
    //     "alice:bob:5:block123" => [1n, 5n, 30n]
    //   }
    //
    // When processing transferEvents (same key):
    //   1st transfer → .shift() → 1n, array becomes [5n, 30n]
    //   2nd transfer → .shift() → 5n, array becomes [30n]
    //   3rd transfer → .shift() → 30n, array becomes []

    const feeLookup = new Map<string, bigint[]>();
    const extrinsicHashLookup = new Map<string, string[]>();
    for (const evt of transferEvents) {
        const key = createTransferKey(evt);
        if (!feeLookup.has(key)) feeLookup.set(key, []);
        feeLookup.get(key)!.push(evt.fee ?? 0n);
        if (evt.extrinsicHash) {
            if (!extrinsicHashLookup.has(key)) extrinsicHashLookup.set(key, []);
            extrinsicHashLookup.get(key)!.push(evt.extrinsicHash);
        }
    }

    // Create Transfer events
    for (const t of wormholeNativeTransferredEvents) {
        const block = blocks.get(t.block);
        assert(block, `Block ${t.block} not found`);
        const from = accounts.get(t.from);
        assert(from, `From account ${t.from} not found`);
        const to = accounts.get(t.to);
        assert(to, `To account ${t.to} not found`);
        const fromHash = computeAddressHash(t.from);
        const toHash = computeAddressHash(t.to);

        const transferKey = createTransferKey(t);
        const availableFee = feeLookup.get(transferKey);
        const fee = availableFee?.shift();

        const extHash = t.extrinsicHash ?? extrinsicHashLookup.get(transferKey)?.shift();
        const extrinsic = extHash ? extrinsics.get(extHash) : undefined;
        const transferCount = t.transferCount;
        const leafIndex = t.leafIndex;

        const transfer = new Transfer({
            id: t.id,
            block,
            blockHeight: block.height,
            timestamp: t.timestamp,
            extrinsic,
            from,
            to,
            amount: t.amount,
            fee: fee ?? 0n,
            fromHash,
            toHash,
            transferCount,
            leafIndex,
        });

        // Extrinsic will be null when we found executed transfer from reversible transfers pallet
        if (!extrinsic) {
            const reversibleExecutedTxId = executedTransferToReversibleExecutedMapping.get(transfer.id);
            if (reversibleExecutedTxId) {
                const executedReversible = executedReversiblesByTxId.get(reversibleExecutedTxId);
                if (executedReversible) {
                    executedReversible.executedTransfer = transfer;
                }
            }
        }

        transfers.push(transfer);

        const event = new Event({
            id: `transfer-${t.id}`,
            type: EventType.TRANSFER,
            block,
            timestamp: t.timestamp,
            extrinsic,
            transfer,
        });
        allEvents.push(event);
    }
    // Create ScheduledReversibleTransfer events
    for (const srt of scheduledReversibles) {
        const event = new Event({
            id: `scheduled-reversible-${srt.id}`,
            type: EventType.SCHEDULED_REVERSIBLE_TRANSFER,
            block: srt.block,
            timestamp: srt.timestamp,
            extrinsic: srt.extrinsic,
            scheduledReversibleTransfer: srt,
        });
        allEvents.push(event);
    }

    // Create ExecutedReversibleTransfer events
    for (const ert of executedReversibles) {
        const event = new Event({
            id: `executed-reversible-${ert.id}`,
            type: EventType.EXECUTED_REVERSIBLE_TRANSFER,
            block: ert.block,
            timestamp: ert.timestamp,
            extrinsic: undefined, // Executed reversibles are inherent, no extrinsic
            executedReversibleTransfer: ert,
        });
        allEvents.push(event);
    }

    // Create CancelledReversibleTransfer events
    for (const crt of cancelledReversibles) {
        const event = new Event({
            id: `cancelled-reversible-${crt.id}`,
            type: EventType.CANCELLED_REVERSIBLE_TRANSFER,
            block: crt.block,
            timestamp: crt.timestamp,
            cancelledReversibleTransfer: crt,
        });
        allEvents.push(event);
    }

    // Create MinerReward events (inherent - no extrinsic)
    const minerRewardMap = new Map(minerRewards.map((mr) => [mr.id, mr]));
    for (const mr of processedEvents.minerRewardEvents) {
        const block = blocks.get(mr.block);
        assert(block, `Block ${mr.block} not found`);

        const minerReward = minerRewardMap.get(mr.id);
        assert(minerReward, `MinerReward ${mr.id} not found`);

        const event = new Event({
            id: `miner-reward-${mr.id}`,
            type: EventType.MINER_REWARD,
            block,
            timestamp: mr.timestamp,
            extrinsic: undefined, // Miner rewards are inherent, no extrinsic
            transfer: null,
            minerReward,
        });
        allEvents.push(event);
    }

    for (const e of errorEventData) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);

        // Link to Extrinsic entity if available
        const extrinsic = e.extrinsicHash ? extrinsics.get(e.extrinsicHash) : undefined;

        const errorEvent = new ErrorEvent({
            id: e.id,
            block,
            timestamp: e.timestamp,
            extrinsic,
            errorType: e.errorType,
            errorModule: e.errorModule,
            errorName: e.errorName,
            errorDocs: e.errorDocs,
        });
        errorEvents.push(errorEvent);

        const event = new Event({
            id: `error-${e.id}`,
            type: EventType.ERROR,
            block,
            timestamp: e.timestamp,
            extrinsic,
            transfer: null,
            minerReward: null,
            errorEvent,
        });
        allEvents.push(event);
    }

    for (const e of highSecuritySetEventData) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);
        const who = accounts.get(e.who);
        assert(who, `Account ${e.who} not found`);
        const guardian = accounts.get(e.guardian);
        assert(guardian, `Guardian account ${e.guardian} not found`);

        // Link to Extrinsic entity if available
        const extrinsic = e.extrinsicHash ? extrinsics.get(e.extrinsicHash) : undefined;

        const highSecuritySet = new HighSecuritySet({
            id: e.id,
            block,
            timestamp: e.timestamp,
            extrinsic,
            who,
            guardian,
            delay: e.delay,
        });
        highSecuritySetEvents.push(highSecuritySet);

        const event = new Event({
            id: `high-security-${e.id}`,
            type: EventType.HIGH_SECURITY_SET,
            block,
            timestamp: e.timestamp,
            extrinsic,
            transfer: null,
            minerReward: null,
            errorEvent: null,
            highSecuritySet,
        });
        allEvents.push(event);
    }

    const multisigByAddress = new Map(multisigs.map((m) => [m.id, m]));
    const depositsClaimedByEventId = new Map(multisigDepositsClaimed.map((d) => [d.id, d]));

    for (const e of multisigCreatedEvents) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);
        const multisig = multisigByAddress.get(e.multisigAddress);
        assert(multisig, `Multisig ${e.multisigAddress} not found`);
        const extrinsic = e.extrinsicHash ? extrinsics.get(e.extrinsicHash) : undefined;

        allEvents.push(
            new Event({
                id: `multisig-created-${e.id}`,
                type: EventType.MULTISIG_CREATED,
                block,
                timestamp: e.timestamp,
                extrinsic,
                multisig,
            }),
        );
    }

    for (const created of multisigProposalCreated) {
        allEvents.push(
            new Event({
                id: `multisig-proposal-created-${created.id}`,
                type: EventType.MULTISIG_PROPOSAL_CREATED,
                block: created.block,
                timestamp: created.timestamp,
                extrinsic: created.extrinsic,
                multisigProposalCreated: created,
            }),
        );
    }

    for (const a of multisigSignerApproved) {
        allEvents.push(
            new Event({
                id: `multisig-signer-approved-${a.id}`,
                type: EventType.MULTISIG_SIGNER_APPROVED,
                block: a.block,
                timestamp: a.timestamp,
                extrinsic: a.extrinsic,
                multisigSignerApproved: a,
            }),
        );
    }

    for (const r of multisigProposalReady) {
        allEvents.push(
            new Event({
                id: `multisig-proposal-ready-${r.id}`,
                type: EventType.MULTISIG_PROPOSAL_READY,
                block: r.block,
                timestamp: r.timestamp,
                extrinsic: r.extrinsic,
                multisigProposalReady: r,
            }),
        );
    }

    for (const e of executedMultisigProposals) {
        const extrinsic = e.extrinsic;
        allEvents.push(
            new Event({
                id: `multisig-proposal-executed-${e.id}`,
                type: EventType.MULTISIG_PROPOSAL_EXECUTED,
                block: e.block,
                timestamp: e.timestamp,
                extrinsic,
                executedMultisigProposal: e,
            }),
        );
    }

    for (const c of cancelledMultisigProposals) {
        allEvents.push(
            new Event({
                id: `multisig-proposal-cancelled-${c.id}`,
                type: EventType.MULTISIG_PROPOSAL_CANCELLED,
                block: c.block,
                timestamp: c.timestamp,
                extrinsic: c.extrinsic,
                cancelledMultisigProposal: c,
            }),
        );
    }

    for (const r of removedMultisigProposals) {
        allEvents.push(
            new Event({
                id: `multisig-proposal-removed-${r.id}`,
                type: EventType.MULTISIG_PROPOSAL_REMOVED,
                block: r.block,
                timestamp: r.timestamp,
                extrinsic: r.extrinsic,
                removedMultisigProposal: r,
            }),
        );
    }

    for (const e of multisigDepositsClaimedEvents) {
        const block = blocks.get(e.block);
        assert(block, `Block ${e.block} not found`);
        const depositClaimed = depositsClaimedByEventId.get(e.id);
        assert(depositClaimed, `MultisigDepositsClaimed ${e.id} not found`);
        const extrinsic = e.extrinsicHash ? extrinsics.get(e.extrinsicHash) : undefined;

        allEvents.push(
            new Event({
                id: `multisig-deposits-claimed-${e.id}`,
                type: EventType.MULTISIG_DEPOSITS_CLAIMED,
                block,
                timestamp: e.timestamp,
                extrinsic,
                multisigDepositsClaimed: depositClaimed,
            }),
        );
    }

    for (const t of techReferendumEvents) {
        allEvents.push(
            new Event({
                id: `tech-referendum-${t.id}`,
                type: EventType.TECH_REFERENDUM,
                block: t.block,
                timestamp: t.timestamp,
                extrinsic: t.extrinsic,
                techReferendumEvent: t,
            }),
        );
    }

    for (const u of runtimeUpgrades) {
        allEvents.push(
            new Event({
                id: `runtime-upgrade-${u.id}`,
                type: EventType.RUNTIME_UPGRADE,
                block: u.block,
                timestamp: u.timestamp,
                extrinsic: u.extrinsic,
                runtimeUpgrade: u,
            }),
        );
    }

    return {
        events: allEvents,
        transfers,
        errorEvents,
        highSecuritySetEvents,
    };
}

/** How the row's account participated in the event; drives the `outgoing` / `incoming` columns. */
type AccountEventDirection = "outgoing" | "incoming" | "none";

/**
 * Builds the per-account history rows for one batch.
 *
 * Every row carries `outgoing` / `incoming` flags so wallets can filter
 * send / receive history with plain indexed column predicates instead of
 * joining the polymorphic payload relations. Transfers without an extrinsic
 * (mint leaves, reversible-transfer settlements) get no row: wallets never
 * display them from this table.
 */
export function createAccountEventEntries(
    transfers: Transfer[],
    scheduledReversibles: ScheduledReversibleTransfer[],
    executedReversibles: ExecutedReversibleTransfer[],
    cancelledReversibles: CancelledReversibleTransfer[],
    minerRewards: MinerReward[],
    highSecuritySetEvents: HighSecuritySet[],
    multisigs: Multisig[],
    multisigProposalCreated: MultisigProposalCreated[],
    multisigSignerApproved: MultisigSignerApproved[],
    multisigProposalReady: MultisigProposalReady[],
    executedMultisigProposals: ExecutedMultisigProposal[],
    cancelledMultisigProposals: CancelledMultisigProposal[],
    removedMultisigProposals: RemovedMultisigProposal[],
    multisigDepositsClaimed: MultisigDepositsClaimed[],
    techReferendumEvents: TechReferendumEvent[],
): AccountEvent[] {
    const accountEvents: AccountEvent[] = [];

    const addForAccount = (
        prefix: string,
        id: string,
        timestamp: Date,
        fields: Partial<AccountEvent>,
        account: Account,
        direction: AccountEventDirection,
    ) => {
        accountEvents.push(
            new AccountEvent({
                id: `${prefix}-${id}-${account.id}`,
                account,
                timestamp,
                outgoing: direction === "outgoing",
                incoming: direction === "incoming",
                ...fields,
            }),
        );
    };

    const addForParties = (
        prefix: string,
        id: string,
        timestamp: Date,
        fields: Partial<AccountEvent>,
        { from, to }: { from: Account; to: Account },
    ) => {
        if (from.id === to.id) {
            accountEvents.push(
                new AccountEvent({
                    id: `${prefix}-${id}-${from.id}`,
                    account: from,
                    timestamp,
                    outgoing: true,
                    incoming: true,
                    ...fields,
                }),
            );
            return;
        }
        addForAccount(prefix, id, timestamp, fields, from, "outgoing");
        addForAccount(prefix, id, timestamp, fields, to, "incoming");
    };

    for (const t of transfers) {
        if (!t.extrinsic) continue;
        addForParties("ae-transfer", t.id, t.timestamp, { transfer: t }, { from: t.from, to: t.to });
    }
    for (const s of scheduledReversibles)
        addForParties(
            "ae-scheduled",
            s.id,
            s.timestamp,
            { scheduledReversibleTransfer: s },
            { from: s.from, to: s.to },
        );
    for (const e of executedReversibles)
        addForParties(
            "ae-executed",
            e.id,
            e.timestamp,
            {
                executedReversibleTransfer: e,
            },
            { from: e.scheduledTransfer.from, to: e.scheduledTransfer.to },
        );
    for (const c of cancelledReversibles) {
        addForParties(
            "ae-cancelled",
            c.id,
            c.timestamp,
            {
                cancelledReversibleTransfer: c,
            },
            { from: c.scheduledTransfer.from, to: c.scheduledTransfer.to },
        );
        if (c.scheduledTransfer.from.id !== c.cancelledBy.id && c.scheduledTransfer.to.id !== c.cancelledBy.id) {
            addForAccount(
                "ae-cancelled",
                c.id,
                c.timestamp,
                {
                    cancelledReversibleTransfer: c,
                },
                c.cancelledBy,
                "none",
            );
        }
    }
    for (const m of minerRewards)
        addForAccount(
            "ae-miner",
            m.id,
            m.timestamp,
            {
                minerReward: m,
            },
            m.miner,
            "incoming",
        );
    for (const h of highSecuritySetEvents) {
        addForAccount(
            "ae-highsec",
            h.id,
            h.timestamp,
            {
                highSecuritySet: h,
            },
            h.who,
            "none",
        );
        if (h.who.id !== h.guardian.id) {
            addForAccount(
                "ae-highsec",
                h.id,
                h.timestamp,
                {
                    highSecuritySet: h,
                },
                h.guardian,
                "none",
            );
        }
    }

    for (const m of multisigs) {
        addForAccount("ae-multisig", m.id, m.timestamp, { multisig: m }, m.creator, "outgoing");
    }

    for (const c of multisigProposalCreated) {
        addForAccount(
            "ae-ms-proposal-created",
            c.id,
            c.timestamp,
            { multisigProposalCreated: c },
            c.proposal.proposer,
            "outgoing",
        );
    }

    for (const a of multisigSignerApproved) {
        addForAccount(
            "ae-ms-signer-approved",
            a.id,
            a.timestamp,
            { multisigSignerApproved: a },
            a.approver,
            "outgoing",
        );
    }

    for (const r of multisigProposalReady) {
        addForAccount(
            "ae-ms-proposal-ready",
            r.id,
            r.timestamp,
            { multisigProposalReady: r },
            r.proposal.proposer,
            "none",
        );
    }

    for (const e of executedMultisigProposals) {
        addForAccount(
            "ae-ms-exec",
            e.id,
            e.timestamp,
            { executedMultisigProposal: e },
            e.extrinsic!.signer!,
            "outgoing",
        );
    }

    for (const c of cancelledMultisigProposals) {
        addForAccount("ae-ms-cancel", c.id, c.timestamp, { cancelledMultisigProposal: c }, c.cancelledBy, "outgoing");
    }

    for (const r of removedMultisigProposals) {
        addForAccount("ae-ms-remove", r.id, r.timestamp, { removedMultisigProposal: r }, r.removedBy, "none");
    }

    for (const d of multisigDepositsClaimed) {
        addForAccount("ae-ms-deposit", d.id, d.timestamp, { multisigDepositsClaimed: d }, d.claimer, "none");
    }

    for (const t of techReferendumEvents) {
        if (t.actor) {
            addForAccount("ae-tech-referendum", t.id, t.timestamp, { techReferendumEvent: t }, t.actor, "none");
        }
    }

    return accountEvents;
}

async function updateAccountTransferStats(
    ctx: ProcessorContext<Store>,
    accountStatsMap: Map<string, AccountStats>,
    transfers: Transfer[],
    scheduledReversibles: ScheduledReversibleTransfer[],
    executedReversibles: ExecutedReversibleTransfer[],
    cancelledReversibles: CancelledReversibleTransfer[],
): Promise<void> {
    const involvedIds = new Set<string>();
    for (const t of transfers) {
        involvedIds.add(t.from.id);
        involvedIds.add(t.to.id);
    }
    for (const s of scheduledReversibles) {
        involvedIds.add(s.from.id);
        involvedIds.add(s.to.id);
    }
    for (const e of executedReversibles) {
        involvedIds.add(e.scheduledTransfer.from.id);
        involvedIds.add(e.scheduledTransfer.to.id);
    }
    for (const c of cancelledReversibles) {
        involvedIds.add(c.scheduledTransfer.from.id);
        involvedIds.add(c.scheduledTransfer.to.id);
        involvedIds.add(c.cancelledBy.id);
    }

    const missingIds = [...involvedIds].filter((id) => !accountStatsMap.has(id));
    if (missingIds.length > 0) {
        const existing = await ctx.store.findBy(AccountStats, { id: In(missingIds) });
        for (const stat of existing) {
            accountStatsMap.set(stat.id, stat);
        }
    }

    function getOrCreate(id: string): AccountStats {
        let stat = accountStatsMap.get(id);
        if (!stat) {
            stat = emptyAccountStats(id);
            accountStatsMap.set(id, stat);
        }
        return stat;
    }

    for (const t of transfers) {
        // Skip hashless transfers (miner/treasury rewards and reversible settlements)
        if (t.extrinsic == null) continue;
        getOrCreate(t.from.id).totalImmediateTransfers += 1;
        if (t.from.id !== t.to.id) {
            getOrCreate(t.to.id).totalImmediateTransfers += 1;
        }
    }
    for (const s of scheduledReversibles) {
        getOrCreate(s.from.id).totalScheduledTransfers += 1;
        if (s.from.id !== s.to.id) {
            getOrCreate(s.to.id).totalScheduledTransfers += 1;
        }
    }
    for (const e of executedReversibles) {
        const fromId = e.scheduledTransfer.from.id;
        const toId = e.scheduledTransfer.to.id;
        getOrCreate(fromId).totalExecutedTransfers += 1;
        if (fromId !== toId) {
            getOrCreate(toId).totalExecutedTransfers += 1;
        }
    }
    for (const c of cancelledReversibles) {
        const fromId = c.scheduledTransfer.from.id;
        const toId = c.scheduledTransfer.to.id;
        getOrCreate(fromId).totalCancelledTransfers += 1;
        if (fromId !== toId) {
            getOrCreate(toId).totalCancelledTransfers += 1;
        }
        if (c.cancelledBy.id !== fromId && c.cancelledBy.id !== toId) {
            getOrCreate(c.cancelledBy.id).totalCancelledTransfers += 1;
        }
    }
}

/**
 * Returns the finalized block height from the chain.
 * During historical sync all archive blocks are already finalized, so we use
 * the last processed block height. At the chain head we query the RPC for the
 * actual finalized head so the two values can diverge correctly.
 */
/**
 * Resolves the spec version that a runtime upgrade actually upgrades *to*.
 *
 * `System.CodeUpdated` is emitted while the block that runs `set_code` is still
 * executing under the OLD runtime, so that block's own spec version is the
 * pre-upgrade one. The new runtime only becomes active in the next block, so we
 * read the spec version from block N+1 — from this batch when available, falling
 * back to an RPC lookup when the upgrade lands on a batch boundary.
 */
async function resolvePostUpgradeSpecVersion(
    ctx: ProcessorContext<Store>,
    upgradeHeight: number,
): Promise<number | undefined> {
    const nextHeight = upgradeHeight + 1;

    const nextInBatch = ctx.blocks.find((b) => b.header.height === nextHeight);
    if (nextInBatch) {
        return (nextInBatch.header as { _runtime?: { specVersion?: number } })._runtime?.specVersion;
    }

    try {
        const nextHash = await ctx._chain.rpc.call<string | null>("chain_getBlockHash", [nextHeight]);
        if (!nextHash) return undefined;
        const version = await ctx._chain.rpc.call<{ specVersion?: number }>("state_getRuntimeVersion", [nextHash]);
        return version?.specVersion;
    } catch (e) {
        ctx.log.warn(`Failed to resolve post-upgrade spec version at block ${nextHeight}: ${e}`);
        return undefined;
    }
}

async function getFinalizedBlockHeight(ctx: ProcessorContext<Store>): Promise<number> {
    if (!ctx.isHead) {
        return ctx.blocks[ctx.blocks.length - 1].header.height;
    }
    try {
        const finalizedHash = await ctx._chain.rpc.call<string>("chain_getFinalizedHead", []);
        const finalizedHeader = await ctx._chain.rpc.call<{ number: string }>("chain_getHeader", [finalizedHash]);
        return parseInt(finalizedHeader.number, 16);
    } catch (e) {
        throw new Error(`Failed to query finalized head: ${e}.`);
    }
}

async function syncVestingSchedules(
    ctx: ProcessorContext<Store>,
    blockHeight: number,
    schedules: VestingScheduleRow[],
): Promise<void> {
    if (schedules.length > 0) {
        await ctx.store.upsert(
            schedules.map(
                (schedule) =>
                    new VestingSchedule({
                        id: schedule.id,
                        beneficiary: schedule.beneficiary,
                        start: schedule.start,
                        cliff: schedule.cliff,
                        end: schedule.end,
                        total: schedule.total,
                        claimed: schedule.claimed,
                        lastClaimAt: schedule.lastClaimAt ?? null,
                        blockHeight,
                    }),
            ),
        );
    }
    const existing = await ctx.store.find(VestingSchedule);
    const liveIds = new Set(schedules.map((schedule) => schedule.id));
    const removedIds = existing.filter((row) => !liveIds.has(row.id)).map((row) => row.id);
    if (removedIds.length > 0) {
        await ctx.store.remove(VestingSchedule, removedIds);
    }
}

async function updateChainStats(
    ctx: ProcessorContext<Store>,
    newAccountsCreated: number,
    depositAccountsDelta: number,
    transfers: Transfer[],
    scheduledReversibles: ScheduledReversibleTransfer[],
    executedReversibles: ExecutedReversibleTransfer[],
    cancelledReversibles: CancelledReversibleTransfer[],
    highSecuritySetEvents: HighSecuritySet[],
    multisigs: Multisig[],
    multisigProposalCreated: MultisigProposalCreated[],
    multisigSignerApproved: MultisigSignerApproved[],
    multisigProposalReady: MultisigProposalReady[],
    executedMultisigProposals: ExecutedMultisigProposal[],
    cancelledMultisigProposals: CancelledMultisigProposal[],
    removedMultisigProposals: RemovedMultisigProposal[],
    multisigDepositsClaimed: MultisigDepositsClaimed[],
    minerRewards: MinerReward[],
    errorEvents: ErrorEvent[],
    blocks: Block[],
    newMiners: number,
    techReferendumEvents: TechReferendumEvent[],
    runtimeUpgrades: RuntimeUpgrade[],
    supplyBlock: ChainBlock,
): Promise<ChainStats> {
    let chainStats = await ctx.store.findOneBy(ChainStats, { id: "global" });

    if (!chainStats) {
        // First-time initialization: query exact counts from DB to capture genesis accounts
        // and any accounts created before ChainStats existed. COUNT called only once ever.
        const totalAccounts = await ctx.store.count(Account, {});
        const totalDepositAccounts = await ctx.store.countBy(Account, { isDepositOnly: true });
        chainStats = new ChainStats({
            id: "global",
            blockHeight: 0,
            finalizedBlockHeight: 0,
            totalAccounts,
            totalDepositAccounts,
            totalImmediateTransfers: 0,
            totalScheduledTransfers: 0,
            totalExecutedTransfers: 0,
            totalCancelledTransfers: 0,
            totalHighSecuritySets: 0,
            totalMultisigsCreated: 0,
            totalMultisigProposals: 0,
            totalMultisigSignerApproved: 0,
            totalMultisigProposalReady: 0,
            totalMultisigProposalsExecuted: 0,
            totalMultisigProposalsCancelled: 0,
            totalMultisigProposalsRemoved: 0,
            totalMultisigDepositsClaimed: 0,
            totalMinerRewards: 0,
            totalErrorEvents: 0,
            totalMiners: 0,
            totalTechReferenda: 0,
            totalRuntimeUpgrades: 0,
        });
    } else {
        // Subsequent batches: O(1) delta updates — no DB scan needed
        chainStats.totalAccounts += newAccountsCreated;
        chainStats.totalDepositAccounts = chainStats.totalDepositAccounts + depositAccountsDelta;

        if (chainStats.totalDepositAccounts < 0) {
            throw new Error(`Total deposit accounts cannot be negative: ${chainStats.totalDepositAccounts}`);
        }
    }

    const supply = await readChainSupply(supplyBlock);
    chainStats.maxSupply = supply.maxSupply;
    chainStats.totalSupply = supply.totalSupply;

    const maxBlockHeight = blocks.reduce((max, b) => Math.max(max, b.height), 0);
    chainStats.blockHeight = Math.max(chainStats.blockHeight, maxBlockHeight);
    chainStats.finalizedBlockHeight = await getFinalizedBlockHeight(ctx);

    // Exclude hashless transfers (miner/treasury rewards and reversible settlements)
    chainStats.totalImmediateTransfers += transfers.reduce((n, t) => n + (t.extrinsic != null ? 1 : 0), 0);
    chainStats.totalScheduledTransfers += scheduledReversibles.length;
    chainStats.totalExecutedTransfers += executedReversibles.length;
    chainStats.totalCancelledTransfers += cancelledReversibles.length;
    chainStats.totalHighSecuritySets += highSecuritySetEvents.length;
    chainStats.totalMultisigsCreated += multisigs.length;
    chainStats.totalMultisigProposals += multisigProposalCreated.length;
    chainStats.totalMultisigSignerApproved += multisigSignerApproved.length;
    chainStats.totalMultisigProposalReady += multisigProposalReady.length;
    chainStats.totalMultisigProposalsExecuted += executedMultisigProposals.length;
    chainStats.totalMultisigProposalsCancelled += cancelledMultisigProposals.length;
    chainStats.totalMultisigProposalsRemoved += removedMultisigProposals.length;
    chainStats.totalMultisigDepositsClaimed += multisigDepositsClaimed.length;
    chainStats.totalMinerRewards += minerRewards.length;
    chainStats.totalErrorEvents += errorEvents.length;
    chainStats.totalMiners += newMiners;
    chainStats.totalTechReferenda += techReferendumEvents.filter(
        (e) => e.type === TechReferendumEventType.SUBMITTED,
    ).length;
    chainStats.totalRuntimeUpgrades += runtimeUpgrades.length;

    return chainStats;
}

function emptyAccountStats(id: string): AccountStats {
    return new AccountStats({
        id,
        totalImmediateTransfers: 0,
        totalScheduledTransfers: 0,
        totalExecutedTransfers: 0,
        totalCancelledTransfers: 0,
        totalMinedBlocks: 0,
        totalRewards: 0n,
    });
}

function emptyAccount(id: string): Account {
    return new Account({
        id,
        free: 0n,
        reserved: 0n,
        frozen: 0n,
        lastUpdated: 0,
        isDepositOnly: true,
        privacyDeposits: "[]",
        isHighSecurity: false,
        isGuardian: false,
        isMultisig: false,
    });
}

/**
 * Denormalize the explorer account-listing flags onto Account rows.
 *
 * HighSecuritySet parties are already in `accounts` (createEvents asserts that). A multisig address
 * may never hold funds, so its Account row is loaded or created here; the number of rows created is
 * returned so chain-stats account totals stay in sync. Flags only ever turn on (there is no unset event).
 */
export async function applyAccountFlags(
    ctx: ProcessorContext<Store>,
    accounts: Map<string, Account>,
    highSecuritySetEvents: HighSecuritySet[],
    multisigs: Multisig[],
): Promise<{ newCreatedAccounts: number }> {
    for (const highSecuritySet of highSecuritySetEvents) {
        highSecuritySet.who.isHighSecurity = true;
        highSecuritySet.guardian.isGuardian = true;
    }

    const createdMultisigAccounts = await ensureAccountsInMap(
        ctx,
        accounts,
        multisigs.map((m) => m.id),
    );
    for (const multisig of multisigs) {
        const account = accounts.get(multisig.id);
        assert(account, `Multisig account ${multisig.id} not found after ensure`);
        account.isMultisig = true;
        if (createdMultisigAccounts.has(multisig.id)) {
            account.lastUpdated = multisig.block.height;
        }
    }

    return { newCreatedAccounts: createdMultisigAccounts.size };
}

/**
 * Load any missing account IDs from the DB into `accounts` before creating empty ones.
 * Prevents upserting a fresh emptyAccount over an existing balance row.
 * Returns the set of IDs that were newly created (did not exist in DB).
 */
async function ensureAccountsInMap(
    ctx: ProcessorContext<Store>,
    accounts: Map<string, Account>,
    ids: Iterable<string | undefined | null>,
): Promise<Set<string>> {
    const missing = [
        ...new Set([...ids].filter((id): id is string => typeof id === "string" && id.length > 0 && !accounts.has(id))),
    ];
    if (missing.length === 0) {
        return new Set();
    }

    const existing = await ctx.store.findBy(Account, { id: In(missing) });
    for (const acc of existing) {
        accounts.set(acc.id, acc);
    }

    const created = new Set<string>();
    for (const id of missing) {
        if (!accounts.has(id)) {
            accounts.set(id, emptyAccount(id));
            created.add(id);
        }
    }
    return created;
}

function statusFromExtrinsic(extrinsic: Extrinsic | undefined | null): UnifiedTransactionStatus {
    if (!extrinsic) {
        return UnifiedTransactionStatus.SUCCESS;
    }
    return extrinsic.success ? UnifiedTransactionStatus.SUCCESS : UnifiedTransactionStatus.ERROR;
}

/**
 * Fee for a Transfer-backed WORMHOLE row.
 * Transfer.fee comes only from matching Balances.Transfer events; wormhole exits are
 * mint paths so t.fee is usually 0n. Prefer non-zero t.fee, otherwise attribute
 * extrinsic fee once (to the first output of the exit) so multi-output exits do not
 * multiply the fee.
 */
function wormholeUnifiedFee(t: Transfer, isExtrinsicFeeCarrier: boolean, wormholeExt: WormholeExtrinsic): bigint {
    if (t.fee && t.fee !== 0n) return t.fee;
    if (isExtrinsicFeeCarrier) return t.extrinsic?.fee ?? wormholeExt.extrinsic?.fee ?? 0n;
    return 0n;
}

/**
 * Denormalized explorer list rows dual-written alongside typed transfer entities.
 *
 * Classification order for Transfer-backed rows:
 * 1. Settlement Transfers linked from ExecutedReversibleTransfer → omit (EXECUTED_REVERSIBLE only)
 * 2. Transfers matching a WormholeOutput id (NativeTransferred id) or whose Extrinsic id
 *    equals a WormholeExtrinsic id → WORMHOLE (from/to from NativeTransferred)
 * 3. Else → IMMEDIATE (includes miner/treasury mints with null hash)
 *
 * Matching prefers WormholeOutput.id === Transfer.id so exits stay WORMHOLE even when the
 * Extrinsic entity is missing (Transfer.extrinsic undefined). Extrinsic-id match remains as
 * a secondary path.
 *
 * Aggregate WormholeExtrinsic rows are emitted only when no Transfer in this batch matched
 * that exit (defensive; not for Extrinsic-linkage gaps).
 * Wormhole exit fee: keep Transfer.fee when non-zero; otherwise extrinsic fee on the
 * first output (by leafIndex, then id) of each exit, 0n on the rest.
 */
export function buildUnifiedTransactions(
    transfers: Transfer[],
    scheduledReversibles: ScheduledReversibleTransfer[],
    executedReversibles: ExecutedReversibleTransfer[],
    cancelledReversibles: CancelledReversibleTransfer[],
    wormholeExtrinsics: WormholeExtrinsic[],
    wormholeOutputs: WormholeOutput[] = [],
): UnifiedTransaction[] {
    const settlementTransferIds = new Set<string>();
    for (const ert of executedReversibles) {
        if (ert.executedTransfer?.id) {
            settlementTransferIds.add(ert.executedTransfer.id);
        }
    }

    const wormholeExtrinsicById = new Map(wormholeExtrinsics.map((w) => [w.id, w]));
    // WormholeOutput.id === NativeTransferred/Transfer.id
    const wormholeExtByTransferId = new Map<string, WormholeExtrinsic>();
    for (const o of wormholeOutputs) {
        if (o.wormholeExtrinsic) {
            wormholeExtByTransferId.set(o.id, o.wormholeExtrinsic);
        }
    }

    const resolveWormholeExt = (t: Transfer): WormholeExtrinsic | undefined => {
        const fromOutput = wormholeExtByTransferId.get(t.id);
        if (fromOutput) return fromOutput;
        const extId = t.extrinsic?.id;
        if (extId) return wormholeExtrinsicById.get(extId);
        return undefined;
    };

    const wormholeExtsCoveredByTransfers = new Set<string>();

    // One extrinsic-fee carrier per wormhole exit (first output by leafIndex / id).
    const wormholeExtrinsicFeeCarriers = new Set<string>();
    const wormholeTransfersByExt = new Map<string, Transfer[]>();
    for (const t of transfers) {
        if (settlementTransferIds.has(t.id)) continue;
        const wormholeExt = resolveWormholeExt(t);
        if (!wormholeExt) continue;
        const group = wormholeTransfersByExt.get(wormholeExt.id) ?? [];
        group.push(t);
        wormholeTransfersByExt.set(wormholeExt.id, group);
    }
    for (const outs of wormholeTransfersByExt.values()) {
        outs.sort((a, b) => {
            const la = a.leafIndex ?? 0n;
            const lb = b.leafIndex ?? 0n;
            if (la < lb) return -1;
            if (la > lb) return 1;
            return a.id.localeCompare(b.id);
        });
        wormholeExtrinsicFeeCarriers.add(outs[0].id);
    }

    const rows: UnifiedTransaction[] = [];

    for (const t of transfers) {
        if (settlementTransferIds.has(t.id)) continue;

        const wormholeExt = resolveWormholeExt(t);
        if (wormholeExt) {
            wormholeExtsCoveredByTransfers.add(wormholeExt.id);
            const linkedExtrinsic = t.extrinsic ?? wormholeExt.extrinsic;
            rows.push(
                new UnifiedTransaction({
                    id: `wormhole:${t.id}`,
                    type: UnifiedTransactionType.WORMHOLE,
                    hash: wormholeExt.id,
                    block: t.block,
                    blockHeight: t.block.height,
                    timestamp: t.timestamp,
                    from: t.from,
                    to: t.to,
                    amount: t.amount,
                    fee: wormholeUnifiedFee(t, wormholeExtrinsicFeeCarriers.has(t.id), wormholeExt),
                    status: statusFromExtrinsic(linkedExtrinsic),
                    detailId: wormholeExt.id,
                }),
            );
            continue;
        }

        rows.push(
            new UnifiedTransaction({
                id: `immediate:${t.id}`,
                type: UnifiedTransactionType.IMMEDIATE,
                hash: t.extrinsic?.id,
                block: t.block,
                blockHeight: t.block.height,
                timestamp: t.timestamp,
                from: t.from,
                to: t.to,
                amount: t.amount,
                fee: t.fee,
                status: statusFromExtrinsic(t.extrinsic),
                detailId: t.id,
            }),
        );
    }

    for (const s of scheduledReversibles) {
        rows.push(
            new UnifiedTransaction({
                id: `scheduled-reversible:${s.id}`,
                type: UnifiedTransactionType.SCHEDULED_REVERSIBLE,
                hash: s.extrinsic?.id,
                block: s.block,
                blockHeight: s.block.height,
                timestamp: s.timestamp,
                from: s.from,
                to: s.to,
                amount: s.amount,
                fee: s.fee,
                status: UnifiedTransactionStatus.SCHEDULED,
                detailId: s.txId,
            }),
        );
    }

    for (const e of executedReversibles) {
        const scheduled = e.scheduledTransfer;
        rows.push(
            new UnifiedTransaction({
                id: `executed-reversible:${e.id}`,
                type: UnifiedTransactionType.EXECUTED_REVERSIBLE,
                hash: undefined,
                block: e.block,
                blockHeight: e.block.height,
                timestamp: e.timestamp,
                from: scheduled.from,
                to: scheduled.to,
                amount: scheduled.amount,
                fee: undefined,
                status: UnifiedTransactionStatus.EXECUTED,
                detailId: e.txId,
            }),
        );
    }

    for (const c of cancelledReversibles) {
        const scheduled = c.scheduledTransfer;
        rows.push(
            new UnifiedTransaction({
                id: `cancelled-reversible:${c.id}`,
                type: UnifiedTransactionType.CANCELLED_REVERSIBLE,
                hash: c.extrinsic?.id,
                block: c.block,
                blockHeight: c.block.height,
                timestamp: c.timestamp,
                from: scheduled.from,
                to: scheduled.to,
                amount: scheduled.amount,
                fee: c.extrinsic?.fee,
                status: UnifiedTransactionStatus.CANCELLED,
                detailId: c.txId,
            }),
        );
    }

    // Fallback: WormholeExtrinsic with no Transfer matched in this batch (not Extrinsic-linkage gaps)
    for (const w of wormholeExtrinsics) {
        if (wormholeExtsCoveredByTransfers.has(w.id)) continue;
        rows.push(
            new UnifiedTransaction({
                id: `wormhole:${w.id}`,
                type: UnifiedTransactionType.WORMHOLE,
                hash: w.extrinsic?.id ?? w.id,
                block: w.block,
                blockHeight: w.block.height,
                timestamp: w.timestamp,
                from: undefined,
                to: undefined,
                amount: w.totalAmount,
                fee: w.extrinsic?.fee,
                status: statusFromExtrinsic(w.extrinsic),
                detailId: w.id,
            }),
        );
    }

    return rows;
}
