import { ProposalFeeParams } from "./helper";
import { Block } from "./model";
import { Bounded, Tally } from "./generated_types/v148";

export interface ExtrinsicData {
    id: string; // extrinsic hash
    block: string;
    indexInBlock: number;
    timestamp: Date;
    signer?: string; // undefined for unsigned extrinsics (e.g., Wormhole)
    pallet: string;
    call: string;
    args: Record<string, unknown>;
    success: boolean;
    fee: bigint;
}

export interface TransferEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    from: string;
    to: string;
    amount: bigint;
    fee?: bigint;
}

export interface ReversibleTransferEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    from: string;
    to: string;
    amount: bigint;
    txId: string;
    scheduledAt?: Date;
    fee?: bigint;
}
export interface ReversibleTransferCancelledEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    txId: string;
    who: string;
}
export interface ReversibleTransferExecutedEvent {
    id: string;
    block: string;
    timestamp: Date;
    txId: string;
    result: string;
}

export interface MinerRewardEvent {
    id: string;
    block: string;
    timestamp: Date;
    miner: string;
    reward: bigint;
}

export interface TreasuryRewardEvent {
    id: string;
    block: string;
    timestamp: Date;
    reward: bigint;
}

export interface FeesCollectedEvent {
    id: string;
    block: string;
    timestamp: Date;
    amount: bigint;
    total: bigint;
}

export interface BalanceEventData {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    amount: bigint;
}

export interface AccountBalanceEvent extends BalanceEventData {
    who: string;
}

export interface BalanceSetEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    who: string;
    free: bigint;
}

export interface ReserveRepatriatedEvent extends BalanceEventData {
    from: string;
    to: string;
    destinationStatus: string;
}

export interface ErrorEventData {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    errorType: string;
    errorModule?: string;
    errorName?: string;
    errorDocs?: string;
}

export interface HighSecuritySetEventData {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    who: string;
    guardian: string;
    delay: bigint;
}

export interface WormholeNativeTransferredEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    from: string;
    to: string;
    amount: bigint;
    transferCount: bigint;
    /** Index in the ZK trie for Merkle proof lookup */
    leafIndex: bigint;
}

export interface WormholeProofVerifiedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    exitAmount: bigint;
    nullifiers: Uint8Array[];
}

export interface WormholeMinerVolumeFeeEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    miner: string;
    amount: bigint;
}

export interface MultisigCreatedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    creator: string;
    multisigAddress: string;
    signers: string[];
    threshold: number;
    nonce: bigint;
}

export interface MultisigProposalCreatedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    multisigAddress: string;
    proposer: string;
    proposalId: number;
    /** Multisig fee constants of the runtime that created this proposal. */
    feeParams: ProposalFeeParams;
}

export interface MultisigSignerApprovedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    multisigAddress: string;
    approver: string;
    proposalId: number;
    approvalsCount: number;
}

export interface MultisigProposalReadyEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    multisigAddress: string;
    proposalId: number;
    approvalsCount: number;
}

export interface MultisigProposalExecutedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash: string;
    fee?: bigint;
    multisigAddress: string;
    proposalId: number;
    proposer: string;
    call: Uint8Array;
    approvers: string[];
    result: string;
}

export interface MultisigProposalCancelledEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    multisigAddress: string;
    proposer: string;
    proposalId: number;
}

export interface MultisigProposalRemovedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    multisigAddress: string;
    proposer: string;
    proposalId: number;
    removedBy: string;
}

export interface MultisigDepositsClaimedEvent {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    fee?: bigint;
    multisigAddress: string;
    claimer: string;
    totalReturned: bigint;
    proposalsRemoved: number;
}

/**
 * A single decoded TechReferenda lifecycle event. The same shape is reused for every
 * lifecycle stage; fields that a given stage does not carry are simply left undefined.
 */
export interface TechReferendumEventData {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    index: number;
    /** Track id (carried by Submitted/DecisionStarted) */
    track?: number;
    /** Encoded proposal (carried by Submitted/DecisionStarted) */
    proposal?: Bounded;
    /** Vote tally (carried by stages that report one) */
    tally?: Tally;
    /** Submitter address resolved from the extrinsic origin (Submitted only) */
    submittedBy?: string;
}

export interface RuntimeUpgradeEventData {
    id: string;
    block: string;
    timestamp: Date;
    extrinsicHash?: string;
    /** Runtime spec version in effect after the upgrade */
    specVersion?: number;
}

export interface ProcessedEvents {
    minerRewardEvents: MinerRewardEvent[];
    treasuryRewardEvents: TreasuryRewardEvent[];
    feesCollectedEvents: FeesCollectedEvent[];
    transferEvents: TransferEvent[];
    reversibleTransferEvents: ReversibleTransferEvent[];
    reversibleTransferCancelledEvents: ReversibleTransferCancelledEvent[];
    reversibleTransferExecutedEvents: ReversibleTransferExecutedEvent[];
    endowedEvents: AccountBalanceEvent[];
    dustLostEvents: AccountBalanceEvent[];
    balanceSetEvents: BalanceSetEvent[];
    reservedEvents: AccountBalanceEvent[];
    unreservedEvents: AccountBalanceEvent[];
    reserveRepatriatedEvents: ReserveRepatriatedEvent[];
    depositEvents: AccountBalanceEvent[];
    withdrawEvents: AccountBalanceEvent[];
    slashedEvents: AccountBalanceEvent[];
    mintedEvents: AccountBalanceEvent[];
    burnedEvents: AccountBalanceEvent[];
    suspendedEvents: AccountBalanceEvent[];
    restoredEvents: AccountBalanceEvent[];
    upgradedEvents: Omit<AccountBalanceEvent, "amount">[];
    issuedEvents: Omit<BalanceEventData, "extrinsicHash">[];
    rescindedEvents: Omit<BalanceEventData, "extrinsicHash">[];
    lockedEvents: AccountBalanceEvent[];
    unlockedEvents: AccountBalanceEvent[];
    frozenEvents: AccountBalanceEvent[];
    thawedEvents: AccountBalanceEvent[];
    errorEvents: ErrorEventData[];
    highSecuritySetEvents: HighSecuritySetEventData[];
    wormholeNativeTransferredEvents: WormholeNativeTransferredEvent[];
    wormholeProofVerifiedEvents: WormholeProofVerifiedEvent[];
    wormholeMinerVolumeFeeEvents: WormholeMinerVolumeFeeEvent[];
    multisigCreatedEvents: MultisigCreatedEvent[];
    multisigProposalCreatedEvents: MultisigProposalCreatedEvent[];
    multisigSignerApprovedEvents: MultisigSignerApprovedEvent[];
    multisigProposalReadyEvents: MultisigProposalReadyEvent[];
    multisigProposalExecutedEvents: MultisigProposalExecutedEvent[];
    multisigProposalCancelledEvents: MultisigProposalCancelledEvent[];
    multisigProposalRemovedEvents: MultisigProposalRemovedEvent[];
    multisigDepositsClaimedEvents: MultisigDepositsClaimedEvent[];
    techReferendumSubmittedEvents: TechReferendumEventData[];
    techReferendumDecisionStartedEvents: TechReferendumEventData[];
    techReferendumConfirmStartedEvents: TechReferendumEventData[];
    techReferendumConfirmAbortedEvents: TechReferendumEventData[];
    techReferendumConfirmedEvents: TechReferendumEventData[];
    techReferendumApprovedEvents: TechReferendumEventData[];
    techReferendumRejectedEvents: TechReferendumEventData[];
    techReferendumTimedOutEvents: TechReferendumEventData[];
    techReferendumCancelledEvents: TechReferendumEventData[];
    techReferendumKilledEvents: TechReferendumEventData[];
    runtimeUpgradeEvents: RuntimeUpgradeEventData[];
    blocks: Map<string, Block>;
    extrinsics: Map<string, ExtrinsicData>; // extrinsic hash -> extrinsic data
    executedTransferToReversibleExecutedMapping: Map<string, string>; // transfer id : reversible executed id
}
