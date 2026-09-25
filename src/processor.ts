import {
    BlockHeader,
    DataHandlerContext,
    SubstrateBatchProcessor,
    SubstrateBatchProcessorFields,
    Event as _Event,
    Call as _Call,
    Extrinsic as _Extrinsic,
} from "@subsquid/substrate-processor";

import { events } from "./generated_types";

export const RPC_SETTINGS = {
    rateLimit: 100,
    maxBatchCallSize: 1000,
    requestTimeout: 30000,
    capacity: 10,
};

export const processor = new SubstrateBatchProcessor()
    .setBlockRange({
        from: parseInt(process.env.START_BLOCK || "0") || 0,
    })
    .addEvent({
        name: [
            events.balances.transfer.name,
            events.balances.balanceSet.name,
            events.balances.deposit.name,
            events.balances.dustLost.name,
            events.balances.endowed.name,
            events.balances.reserveRepatriated.name,
            events.balances.reserved.name,
            events.balances.slashed.name,
            events.balances.unreserved.name,
            events.balances.withdraw.name,
            events.balances.minted.name,
            events.balances.burned.name,
            events.balances.suspended.name,
            events.balances.restored.name,
            events.balances.upgraded.name,
            events.balances.issued.name,
            events.balances.rescinded.name,
            events.balances.locked.name,
            events.balances.unlocked.name,
            events.balances.frozen.name,
            events.balances.thawed.name,
            events.reversibleTransfers.transactionScheduled.name,
            events.reversibleTransfers.transactionExecuted.name,
            events.reversibleTransfers.transactionCancelled.name,
            events.miningRewards.minerRewarded.name,
            events.miningRewards.feesCollected.name,
            events.miningRewards.treasuryRewarded.name,
            events.system.extrinsicFailed.name,
            events.reversibleTransfers.highSecuritySet.name,
            events.wormhole.nativeTransferred.name,
            events.wormhole.proofVerified.name,
            events.wormhole.minerVolumeFeePaid.name,
            events.multisig.multisigCreated.name,
            events.multisig.proposalCreated.name,
            events.multisig.signerApproved.name,
            events.multisig.proposalReadyToExecute.name,
            events.multisig.proposalExecuted.name,
            events.multisig.proposalCancelled.name,
            events.multisig.proposalRemoved.name,
            events.multisig.depositsClaimed.name,
            events.techReferenda.submitted.name,
            events.techReferenda.decisionStarted.name,
            events.techReferenda.confirmStarted.name,
            events.techReferenda.confirmAborted.name,
            events.techReferenda.confirmed.name,
            events.techReferenda.approved.name,
            events.techReferenda.rejected.name,
            events.techReferenda.timedOut.name,
            events.techReferenda.cancelled.name,
            events.techReferenda.killed.name,
            events.system.codeUpdated.name,
        ],
        extrinsic: true,
        call: true,
    })
    .setFields({
        event: {
            args: true,
        },
        extrinsic: {
            hash: true,
            fee: true,
            success: true,
            index: true,
        },
        call: {
            name: true,
            args: true,
            origin: true,
        },
        block: {
            timestamp: true,
        },
    });

export type Fields = SubstrateBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Event = _Event<Fields>;
export type Call = _Call<Fields>;
export type Extrinsic = _Extrinsic<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
