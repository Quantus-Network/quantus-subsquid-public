jest.mock("./processor", () => ({
    processor: { run: jest.fn() },
}));

import {
    ReversibleTransferEvent,
    ReversibleTransferCancelledEvent,
    ReversibleTransferExecutedEvent,
    MultisigProposalExecutedEvent,
    ProcessedEvents,
    WormholeNativeTransferredEvent,
} from "./types";
import {
    createReversibleTransfers,
    createMultisigs,
    createMultisigProposals,
    buildUnifiedTransactions,
    updateAndCreateAccounts,
    MINTING_ACCOUNT_ADDRESS,
    decodeHighSecuritySet,
    createAccountEventEntries,
    createEvents,
    applyAccountFlags,
    createMinerRewards,
} from "./main";
import { events, storage } from "./generated_types";
import {
    Extrinsic,
    MultisigProposalStatus,
    Transfer,
    Block,
    Account,
    ScheduledReversibleTransfer,
    ExecutedReversibleTransfer,
    CancelledReversibleTransfer,
    WormholeExtrinsic,
    WormholeOutput,
    UnifiedTransactionType,
    UnifiedTransactionStatus,
    MinerReward,
    Multisig,
    HighSecuritySet,
} from "./model";
import { multisigProposalKey, bytesToHex, computeProposalBurnedFee, ProposalFeeParams } from "./helper";

const mockStore = {
    findBy: async (): Promise<any[]> => [],
    find: async (): Promise<any[]> => [],
};

describe("createReversibleTransfers", () => {
    let mockCtx: any;
    let mockAccounts: Map<string, any>;
    let mockBlocks: Map<string, any>;
    let mockExtrinsics: Map<string, any>;

    beforeEach(() => {
        mockCtx = {
            store: mockStore,
        };

        mockAccounts = new Map<string, any>([
            ["from-address", { id: "from-address", balance: 1000n, lastUpdated: 1 }],
            ["to-address", { id: "to-address", balance: 500n, lastUpdated: 1 }],
            ["canceller-address", { id: "canceller-address", balance: 200n, lastUpdated: 1 }],
        ]);

        mockBlocks = new Map<string, any>([
            ["block-1", { id: "block-1", height: 1, timestamp: new Date(), hash: "0x123" }],
        ]);

        mockExtrinsics = new Map<string, any>();
        // Reset mock store to default (empty results)
        (mockStore as any).find = async (): Promise<any[]> => [];
    });

    it("should create a new scheduled reversible transfer", async () => {
        const reversibleTransferEvents: ReversibleTransferEvent[] = [
            {
                id: "evt-1",
                txId: "tx-1",
                from: "from-address",
                to: "to-address",
                amount: 100n,
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: "0xabc",
                scheduledAt: new Date(Date.now() + 10000),
            },
        ];

        const result = await createReversibleTransfers(
            mockCtx,
            reversibleTransferEvents,
            [],
            [],
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.scheduledReversibles).toHaveLength(1);
        expect(result.scheduledReversibles[0].txId).toEqual("tx-1");
        expect(result.scheduledReversibles[0].from.id).toEqual("from-address");
        expect(result.scheduledReversibles[0].to.id).toEqual("to-address");
        expect(result.scheduledReversibles[0].amount).toEqual(100n);
        expect(result.executedReversibles).toHaveLength(0);
        expect(result.cancelledReversibles).toHaveLength(0);
    });

    it("should create scheduled and cancelled in the same batch", async () => {
        const reversibleTransferEvents: ReversibleTransferEvent[] = [
            {
                id: "evt-1",
                txId: "tx-1",
                from: "from-address",
                to: "to-address",
                amount: 100n,
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: "0xabc",
                scheduledAt: new Date(Date.now() + 10000),
            },
        ];
        const cancelTimestamp = new Date();
        const reversibleTransferCancelledEvents: ReversibleTransferCancelledEvent[] = [
            {
                id: "evt-cancel",
                txId: "tx-1",
                who: "from-address",
                block: "block-1",
                timestamp: cancelTimestamp,
                extrinsicHash: "0xabc",
            },
        ];

        const result = await createReversibleTransfers(
            mockCtx,
            reversibleTransferEvents,
            reversibleTransferCancelledEvents,
            [],
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.scheduledReversibles).toHaveLength(1);
        expect(result.cancelledReversibles).toHaveLength(1);
        expect(result.cancelledReversibles[0].txId).toEqual("tx-1");
        expect(result.cancelledReversibles[0].cancelledBy.id).toEqual("from-address");
        expect(result.cancelledReversibles[0].scheduledTransfer).toBe(result.scheduledReversibles[0]);
        expect(result.cancelledReversibles[0].timestamp).toEqual(cancelTimestamp);
        expect(result.executedReversibles).toHaveLength(0);
    });

    it("should create scheduled and executed in the same batch", async () => {
        const reversibleTransferEvents: ReversibleTransferEvent[] = [
            {
                id: "evt-1",
                txId: "tx-1",
                from: "from-address",
                to: "to-address",
                amount: 100n,
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: "0xabc",
                scheduledAt: new Date(Date.now() + 10000),
            },
        ];
        const execTimestamp = new Date();
        const reversibleTransferExecutedEvents: ReversibleTransferExecutedEvent[] = [
            { id: "evt-exec", txId: "tx-1", result: "Ok", block: "block-1", timestamp: execTimestamp },
        ];

        const result = await createReversibleTransfers(
            mockCtx,
            reversibleTransferEvents,
            [],
            reversibleTransferExecutedEvents,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.scheduledReversibles).toHaveLength(1);
        expect(result.executedReversibles).toHaveLength(1);
        expect(result.executedReversibles[0].txId).toEqual("tx-1");
        expect(result.executedReversibles[0].scheduledTransfer).toBe(result.scheduledReversibles[0]);
        expect(result.executedReversibles[0].timestamp).toEqual(execTimestamp);
        expect(result.cancelledReversibles).toHaveLength(0);
    });

    it("should create cancelled for existing scheduled from previous batch", async () => {
        const existingScheduled = {
            id: "existing-1",
            txId: "tx-2",
            from: mockAccounts.get("from-address"),
            to: mockAccounts.get("to-address"),
            amount: 200n,
            block: mockBlocks.get("block-1"),
            timestamp: new Date(),
            extrinsicHash: "0xdef",
            scheduledAt: new Date(Date.now() + 20000),
        };
        (mockStore as any).find = async () => [existingScheduled];

        const cancelTimestamp = new Date();
        const reversibleTransferCancelledEvents: ReversibleTransferCancelledEvent[] = [
            {
                id: "evt-cancel-2",
                txId: "tx-2",
                who: "canceller-address",
                block: "block-1",
                timestamp: cancelTimestamp,
                extrinsicHash: "0xdef",
            },
        ];

        const result = await createReversibleTransfers(
            mockCtx,
            [],
            reversibleTransferCancelledEvents,
            [],
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.scheduledReversibles).toHaveLength(0);
        expect(result.cancelledReversibles).toHaveLength(1);
        expect(result.cancelledReversibles[0].txId).toEqual("tx-2");
        expect(result.cancelledReversibles[0].cancelledBy.id).toEqual("canceller-address");
        expect(result.cancelledReversibles[0].scheduledTransfer).toBe(existingScheduled);
        expect(result.executedReversibles).toHaveLength(0);
    });

    it("should create executed for existing scheduled from previous batch", async () => {
        const existingScheduled = {
            id: "existing-1",
            txId: "tx-3",
            from: mockAccounts.get("from-address"),
            to: mockAccounts.get("to-address"),
            amount: 300n,
            block: mockBlocks.get("block-1"),
            timestamp: new Date(),
            extrinsicHash: "0xghi",
            scheduledAt: new Date(Date.now() + 30000),
        };
        (mockStore as any).find = async () => [existingScheduled];

        const execTimestamp = new Date();
        const reversibleTransferExecutedEvents: ReversibleTransferExecutedEvent[] = [
            { id: "evt-exec-3", txId: "tx-3", result: "Ok", block: "block-1", timestamp: execTimestamp },
        ];

        const result = await createReversibleTransfers(
            mockCtx,
            [],
            [],
            reversibleTransferExecutedEvents,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.scheduledReversibles).toHaveLength(0);
        expect(result.executedReversibles).toHaveLength(1);
        expect(result.executedReversibles[0].txId).toEqual("tx-3");
        expect(result.executedReversibles[0].scheduledTransfer).toBe(existingScheduled);
        expect(result.cancelledReversibles).toHaveLength(0);
    });
});

const MULTISIG_ADDR = "qzjUYyuN4L3HKmBPMxHvK2n8HYnaLZcQvLSQTgdwB2nQ1g2mc";
const ALICE_ADDR = "qzRAV9t8eEqpo77AA6YJepTm1Vmr1wT7V3n8a9WfLX9o8o9i";
/** Runtime v153: ProposalFee = scale_fee(50 mQTC) at FEE_SCALE 1/10, SignerStepFactor = 1%. */
const PROPOSAL_FEE_PARAMS: ProposalFeeParams = { base: 5_000_000_000n, signerStepFactorPermill: 10_000n };

describe("decodeHighSecuritySet", () => {
    const WHO = "0x" + "01".repeat(32);
    const GUARDIAN = "0x" + "02".repeat(32);
    const DELAY = { __kind: "BlockNumber" as const, value: 10 };
    const highSecuritySet = events.reversibleTransfers.highSecuritySet;
    const mockEvent = { name: highSecuritySet.name, args: {}, block: { _runtime: {} } } as any;

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("decodes the v131+ shape with `guardian`", () => {
        jest.spyOn(highSecuritySet.v131, "is").mockReturnValue(true);
        jest.spyOn(highSecuritySet.v131, "decode").mockReturnValue({ who: WHO, guardian: GUARDIAN, delay: DELAY });
        const v126Decode = jest.spyOn(highSecuritySet.v126, "decode");

        expect(decodeHighSecuritySet(mockEvent)).toEqual({ who: WHO, guardian: GUARDIAN, delay: DELAY });
        expect(v126Decode).not.toHaveBeenCalled();
    });

    it("maps the v126 `interceptor` field to `guardian` on the old-genesis runtime", () => {
        jest.spyOn(highSecuritySet.v131, "is").mockReturnValue(false);
        jest.spyOn(highSecuritySet.v126, "decode").mockReturnValue({ who: WHO, interceptor: GUARDIAN, delay: DELAY });

        expect(decodeHighSecuritySet(mockEvent)).toEqual({ who: WHO, guardian: GUARDIAN, delay: DELAY });
    });
});

describe("createMultisigs", () => {
    it("should create a multisig entity", () => {
        const multisigs = createMultisigs(
            [
                {
                    id: "evt-ms",
                    block: "block-1",
                    timestamp: new Date(),
                    creator: ALICE_ADDR,
                    multisigAddress: MULTISIG_ADDR,
                    signers: [ALICE_ADDR, MULTISIG_ADDR],
                    threshold: 2,
                    nonce: 0n,
                },
            ],
            new Map([[ALICE_ADDR, { id: ALICE_ADDR }]]) as Map<string, any>,
            new Map([["block-1", { id: "block-1" }]]) as Map<string, any>,
            new Map() as Map<string, any>,
        );

        expect(multisigs).toHaveLength(1);
        expect(multisigs[0].id).toEqual(MULTISIG_ADDR);
        expect(multisigs[0].threshold).toEqual(2);
        expect(multisigs[0].signers).toEqual([ALICE_ADDR, MULTISIG_ADDR]);
    });
});

describe("createMultisigProposals", () => {
    let mockStorageGet: jest.SpiedFunction<typeof storage.multisig.proposals.v131.get>;

    let mockCtx: any;
    let mockAccounts: Map<string, any>;
    let mockBlocks: Map<string, any>;
    let mockExtrinsics: Map<string, any>;
    let multisigs: ReturnType<typeof createMultisigs>;

    beforeEach(() => {
        mockCtx = {
            blocks: [
                {
                    header: {
                        id: "block-1",
                        hash: "0xabc",
                        height: 1,
                        specVersion: 148,
                        _runtime: { checkStorageType: () => true },
                    },
                },
            ],
            store: mockStore,
        };
        mockAccounts = new Map<string, any>([
            [ALICE_ADDR, { id: ALICE_ADDR }],
            [MULTISIG_ADDR, { id: MULTISIG_ADDR }],
        ]);
        mockBlocks = new Map<string, any>([
            ["block-1", { id: "block-1", height: 1, timestamp: new Date(), hash: "0xabc" }],
        ]);
        mockExtrinsics = new Map<string, any>();
        multisigs = createMultisigs(
            [
                {
                    id: "evt-ms",
                    block: "block-1",
                    timestamp: new Date(),
                    creator: ALICE_ADDR,
                    multisigAddress: MULTISIG_ADDR,
                    signers: [ALICE_ADDR, MULTISIG_ADDR],
                    threshold: 2,
                    nonce: 0n,
                },
            ],
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );
        (mockStore as any).find = async () => [];
        (mockStore as any).findOne = async () => null;
        mockStorageGet = jest.spyOn(storage.multisig.proposals.v131, "get").mockResolvedValue({
            proposer: "0x" + "00".repeat(32),
            call: "0x010203",
            expiry: 100,
            approvals: [],
            deposit: 1000n,
            status: { __kind: "Active" },
        });
    });

    afterEach(() => {
        mockStorageGet?.mockRestore();
    });

    const registerMockExtrinsic = (hash: string, signer = mockAccounts.get(ALICE_ADDR)): Extrinsic => {
        const extrinsic = new Extrinsic({
            id: hash,
            block: mockBlocks.get("block-1")!,
            indexInBlock: 0,
            timestamp: new Date(),
            signer,
            pallet: "Multisig",
            call: "as_multi",
            args: "{}",
            success: true,
            fee: 0n,
        });
        mockExtrinsics.set(hash, extrinsic);
        return extrinsic;
    };

    const emptyProcessedEvents = (): ProcessedEvents => ({
        minerRewardEvents: [],
        treasuryRewardEvents: [],
        feesCollectedEvents: [],
        transferEvents: [],
        reversibleTransferEvents: [],
        reversibleTransferCancelledEvents: [],
        reversibleTransferExecutedEvents: [],
        endowedEvents: [],
        dustLostEvents: [],
        balanceSetEvents: [],
        reservedEvents: [],
        unreservedEvents: [],
        reserveRepatriatedEvents: [],
        depositEvents: [],
        withdrawEvents: [],
        slashedEvents: [],
        mintedEvents: [],
        burnedEvents: [],
        suspendedEvents: [],
        restoredEvents: [],
        upgradedEvents: [],
        issuedEvents: [],
        rescindedEvents: [],
        lockedEvents: [],
        unlockedEvents: [],
        frozenEvents: [],
        thawedEvents: [],
        errorEvents: [],
        highSecuritySetEvents: [],
        wormholeNativeTransferredEvents: [],
        wormholeProofVerifiedEvents: [],
        wormholeMinerVolumeFeeEvents: [],
        multisigCreatedEvents: [],
        multisigProposalCreatedEvents: [],
        multisigSignerApprovedEvents: [],
        multisigProposalReadyEvents: [],
        multisigProposalExecutedEvents: [],
        multisigProposalCancelledEvents: [],
        multisigProposalRemovedEvents: [],
        multisigDepositsClaimedEvents: [],
        techReferendumSubmittedEvents: [],
        techReferendumDecisionStartedEvents: [],
        techReferendumConfirmStartedEvents: [],
        techReferendumConfirmAbortedEvents: [],
        techReferendumConfirmedEvents: [],
        techReferendumApprovedEvents: [],
        techReferendumRejectedEvents: [],
        techReferendumTimedOutEvents: [],
        techReferendumCancelledEvents: [],
        techReferendumKilledEvents: [],
        runtimeUpgradeEvents: [],
        blocks: mockBlocks,
        extrinsics: new Map(),
        executedTransferToReversibleExecutedMapping: new Map(),
    });

    it("should create a proposal from storage at creation time", async () => {
        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 0,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(mockStorageGet).toHaveBeenCalled();
        expect(result.proposals).toHaveLength(1);
        expect(result.proposals[0].id).toEqual(multisigProposalKey(MULTISIG_ADDR, 0));
        expect(result.proposals[0].callRaw).toEqual("0x010203");
        expect(result.proposals[0].pallet).toEqual("Unknown");
        expect(result.proposals[0].call).toEqual("unknown");
        expect(result.proposals[0].decodeError).toBeDefined();
        expect(result.proposals[0].expiryBlock).toEqual(100);
        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.ACTIVE);
        expect(result.proposalCreated).toHaveLength(1);
        expect(result.proposalCreated[0].id).toEqual("evt-prop");
        expect(result.proposalCreated[0].proposal).toBe(result.proposals[0]);
        expect(result.proposals[0].deposit).toEqual(1000n);
        expect(result.proposals[0].burnedPalletFee).toEqual(computeProposalBurnedFee(PROPOSAL_FEE_PARAMS, 2));
        expect(result.proposals[0].creationNetworkFee).toEqual(0n);
        expect(result.proposalCreated[0].deposit).toEqual(1000n);
        expect(result.proposalCreated[0].burnedPalletFee).toEqual(computeProposalBurnedFee(PROPOSAL_FEE_PARAMS, 2));
        expect(result.proposalCreated[0].fee).toEqual(0n);
        expect(result.executed).toHaveLength(0);
    });

    it("should keep status ACTIVE when storage says Approved but no ready event", async () => {
        mockStorageGet.mockResolvedValue({
            proposer: "0x" + "00".repeat(32),
            call: "0x010203",
            expiry: 100,
            approvals: [],
            deposit: 1000n,
            status: { __kind: "Approved" },
        });

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 0,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals).toHaveLength(1);
        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.ACTIVE);
        expect(result.proposalReady).toHaveLength(0);
    });

    it("should keep status ACTIVE on signer approved until ready event", async () => {
        mockStorageGet.mockResolvedValue({
            proposer: "0x" + "00".repeat(32),
            call: "0x010203",
            expiry: 100,
            approvals: [],
            deposit: 1000n,
            status: { __kind: "Approved" },
        });

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 6,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];
        processedEvents.multisigSignerApprovedEvents = [
            {
                id: "evt-approve",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                approver: ALICE_ADDR,
                proposalId: 6,
                approvalsCount: 1,
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.ACTIVE);
        expect(result.signerApproved).toHaveLength(1);
        expect(result.proposalReady).toHaveLength(0);
    });

    it("should mark a proposal APPROVED on ProposalReadyToExecute", async () => {
        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 7,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];
        processedEvents.multisigProposalReadyEvents = [
            {
                id: "evt-ready",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposalId: 7,
                approvalsCount: 2,
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.APPROVED);
        expect(result.proposalReady).toHaveLength(1);
    });

    it("should price each proposal of a batched extrinsic from the runtime constants", async () => {
        // Two propose() calls in one Utility.batch share an extrinsic hash and proposer; each
        // burns proposal_fee(signers) on its own, so neither may see the other's fee.
        const extrinsicHash = "ext-propose-batch";
        const networkFee = 9_244_906_214n;
        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [3, 4].map((proposalId) => ({
            id: `evt-prop-${proposalId}`,
            block: "block-1",
            timestamp: new Date(),
            extrinsicHash,
            fee: networkFee,
            multisigAddress: MULTISIG_ADDR,
            proposer: ALICE_ADDR,
            proposalId,
            feeParams: PROPOSAL_FEE_PARAMS,
        }));

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        const expectedFee = computeProposalBurnedFee(PROPOSAL_FEE_PARAMS, 2);
        expect(expectedFee).toEqual(5_100_000_000n);
        expect(result.proposals.map((p) => p.burnedPalletFee)).toEqual([expectedFee, expectedFee]);
        expect(result.proposalCreated.map((p) => p.burnedPalletFee)).toEqual([expectedFee, expectedFee]);
        expect(result.proposals.map((p) => p.creationNetworkFee)).toEqual([networkFee, networkFee]);
    });

    it("should execute a proposal in the same batch", async () => {
        const executeExtrinsicHash = "ext-execute-1";
        const executeExtrinsic = registerMockExtrinsic(executeExtrinsicHash);

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: "ext-propose-1",
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 1,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];
        processedEvents.multisigProposalExecutedEvents = [
            {
                id: "evt-exec",
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: executeExtrinsicHash,
                multisigAddress: MULTISIG_ADDR,
                proposalId: 1,
                proposer: ALICE_ADDR,
                call: new Uint8Array([4, 5, 6]),
                approvers: [ALICE_ADDR, MULTISIG_ADDR],
                result: "Ok",
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals).toHaveLength(1);
        expect(result.executed).toHaveLength(1);
        expect(result.executed[0].proposal).toBe(result.proposals[0]);
        expect(result.executed[0].extrinsic).toBe(executeExtrinsic);
        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.EXECUTED);
        expect(result.proposalsToUpsert).toHaveLength(1);
    });

    it("should execute a proposal from a previous batch", async () => {
        const existingProposal = {
            id: multisigProposalKey(MULTISIG_ADDR, 2),
            createdAtBlock: mockBlocks.get("block-1"),
            createdAt: new Date(),
            multisig: multisigs[0],
            proposalId: 2,
            proposer: mockAccounts.get(ALICE_ADDR),
            callRaw: "0xdead",
            pallet: "Unknown",
            call: "unknown",
            decodeError: "test",
            expiryBlock: 50,
            deposit: 500n,
            approvals: "[]",
            status: MultisigProposalStatus.APPROVED,
        };
        (mockStore as any).find = async () => [existingProposal];
        (mockStore as any).findOne = async () => multisigs[0];

        const executeExtrinsicHash = "ext-execute-2";
        const executeExtrinsic = registerMockExtrinsic(executeExtrinsicHash);

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalExecutedEvents = [
            {
                id: "evt-exec-2",
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: executeExtrinsicHash,
                multisigAddress: MULTISIG_ADDR,
                proposalId: 2,
                proposer: ALICE_ADDR,
                call: new Uint8Array([7, 8]),
                approvers: [ALICE_ADDR],
                result: "Ok",
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals).toHaveLength(0);
        expect(result.executed).toHaveLength(1);
        expect(result.executed[0].proposal).toBe(existingProposal);
        expect(result.executed[0].extrinsic).toBe(executeExtrinsic);
        expect(existingProposal.status).toEqual(MultisigProposalStatus.EXECUTED);
    });

    const buildExecutedEvent = (
        overrides: Partial<MultisigProposalExecutedEvent> = {},
    ): MultisigProposalExecutedEvent => ({
        id: "evt-exec-fail",
        block: "block-1",
        timestamp: new Date(),
        extrinsicHash: "ext-execute-fail",
        multisigAddress: MULTISIG_ADDR,
        proposalId: 9,
        proposer: ALICE_ADDR,
        call: new Uint8Array([1]),
        approvers: [ALICE_ADDR],
        result: "Ok",
        ...overrides,
    });

    it("should fail when execute extrinsic is missing from map", async () => {
        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalExecutedEvents = [buildExecutedEvent({ extrinsicHash: "ext-missing" })];

        await expect(
            createMultisigProposals(mockCtx, processedEvents, multisigs, mockAccounts, mockBlocks, mockExtrinsics),
        ).rejects.toThrow(/Extrinsic signer not found for proposal executed event evt-exec-fail/);
    });

    it("should fail when execute extrinsic has no signer", async () => {
        const executeExtrinsicHash = "ext-execute-no-signer";
        mockExtrinsics.set(
            executeExtrinsicHash,
            new Extrinsic({
                id: executeExtrinsicHash,
                block: mockBlocks.get("block-1")!,
                indexInBlock: 0,
                timestamp: new Date(),
                signer: null,
                pallet: "Multisig",
                call: "as_multi",
                args: "{}",
                success: true,
                fee: 0n,
            }),
        );

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalExecutedEvents = [buildExecutedEvent({ extrinsicHash: executeExtrinsicHash })];

        await expect(
            createMultisigProposals(mockCtx, processedEvents, multisigs, mockAccounts, mockBlocks, mockExtrinsics),
        ).rejects.toThrow(/Extrinsic signer not found for proposal executed event evt-exec-fail/);
    });

    it("should create and execute in the same batch when storage is cleared at end of block", async () => {
        mockStorageGet.mockResolvedValue(undefined);

        const executedCall = new Uint8Array([4, 5, 6]);
        const executeExtrinsicHash = "ext-execute-3";
        const executeExtrinsic = registerMockExtrinsic(executeExtrinsicHash);

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: "ext-propose-3",
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 3,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];
        processedEvents.multisigProposalExecutedEvents = [
            {
                id: "evt-exec",
                block: "block-1",
                timestamp: new Date(),
                extrinsicHash: executeExtrinsicHash,
                multisigAddress: MULTISIG_ADDR,
                proposalId: 3,
                proposer: ALICE_ADDR,
                call: executedCall,
                approvers: [ALICE_ADDR],
                result: "Ok",
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals).toHaveLength(1);
        expect(result.proposalCreated).toHaveLength(1);
        expect(result.executed).toHaveLength(1);
        expect(result.executed[0].extrinsic).toBe(executeExtrinsic);
        expect(result.proposals[0].callRaw).toEqual(bytesToHex(executedCall));
        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.EXECUTED);
    });

    it("should create a proposal when storage is cleared and no same-batch execute", async () => {
        mockStorageGet.mockResolvedValue(undefined);

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 4,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals).toHaveLength(1);
        expect(result.proposals[0].decodeError).toEqual("storage cleared at creation block");
        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.ACTIVE);
        expect(result.proposalCreated).toHaveLength(1);
    });

    it("should create and cancel in the same batch when storage is cleared at end of block", async () => {
        mockStorageGet.mockResolvedValue(undefined);

        const processedEvents = emptyProcessedEvents();
        processedEvents.multisigProposalCreatedEvents = [
            {
                id: "evt-prop",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 5,
                feeParams: PROPOSAL_FEE_PARAMS,
            },
        ];
        processedEvents.multisigProposalCancelledEvents = [
            {
                id: "evt-cancel",
                block: "block-1",
                timestamp: new Date(),
                multisigAddress: MULTISIG_ADDR,
                proposer: ALICE_ADDR,
                proposalId: 5,
            },
        ];

        const result = await createMultisigProposals(
            mockCtx,
            processedEvents,
            multisigs,
            mockAccounts,
            mockBlocks,
            mockExtrinsics,
        );

        expect(result.proposals).toHaveLength(1);
        expect(result.proposals[0].decodeError).toEqual("storage cleared at creation block");
        expect(result.proposals[0].status).toEqual(MultisigProposalStatus.CANCELLED);
        expect(result.proposalCreated).toHaveLength(1);
        expect(result.cancelled).toHaveLength(1);
    });
});

describe("buildUnifiedTransactions", () => {
    const block = new Block({
        id: "block-1",
        height: 42,
        hash: "0xblock",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        reward: 0n,
    });
    const from = new Account({
        id: "from",
        free: 0n,
        reserved: 0n,
        frozen: 0n,
        lastUpdated: 0,
        isDepositOnly: false,
        privacyDeposits: "[]",
    });
    const to = new Account({
        id: "to",
        free: 0n,
        reserved: 0n,
        frozen: 0n,
        lastUpdated: 0,
        isDepositOnly: false,
        privacyDeposits: "[]",
    });
    const canceller = new Account({
        id: "canceller",
        free: 0n,
        reserved: 0n,
        frozen: 0n,
        lastUpdated: 0,
        isDepositOnly: false,
        privacyDeposits: "[]",
    });
    const extrinsic = new Extrinsic({
        id: "0xext",
        block,
        indexInBlock: 0,
        timestamp: block.timestamp,
        signer: from,
        pallet: "Balances",
        call: "transfer",
        args: "{}",
        success: true,
        fee: 10n,
    });
    const wormholeExtrinsic = new Extrinsic({
        id: "0xwh",
        block,
        indexInBlock: 1,
        timestamp: block.timestamp,
        signer: from,
        pallet: "Wormhole",
        call: "exit",
        args: "{}",
        success: true,
        fee: 20n,
    });

    it("emits immediate, scheduled, executed, cancelled and skips settlement transfers", () => {
        const immediate = new Transfer({
            id: "t-imm",
            block,
            timestamp: block.timestamp,
            extrinsic,
            from,
            to,
            amount: 100n,
            fee: 10n,
            fromHash: "a",
            toHash: "b",
            transferCount: 1n,
            leafIndex: 0n,
        });
        const settlement = new Transfer({
            id: "t-settle",
            block,
            timestamp: block.timestamp,
            extrinsic: undefined,
            from,
            to,
            amount: 50n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 2n,
            leafIndex: 1n,
        });
        const scheduled = new ScheduledReversibleTransfer({
            id: "s1",
            block,
            timestamp: block.timestamp,
            extrinsic,
            from,
            to,
            amount: 50n,
            fee: 5n,
            txId: "tx-1",
            scheduledAt: block.timestamp,
        });
        const executed = new ExecutedReversibleTransfer({
            id: "e1",
            block,
            timestamp: block.timestamp,
            txId: "tx-1",
            scheduledTransfer: scheduled,
            executedTransfer: settlement,
        });
        const cancelled = new CancelledReversibleTransfer({
            id: "c1",
            block,
            timestamp: block.timestamp,
            extrinsic,
            txId: "tx-2",
            cancelledBy: canceller,
            scheduledTransfer: scheduled,
        });

        const rows = buildUnifiedTransactions([immediate, settlement], [scheduled], [executed], [cancelled], []);

        expect(rows.map((r) => r.id).sort()).toEqual(
            ["cancelled-reversible:c1", "executed-reversible:e1", "immediate:t-imm", "scheduled-reversible:s1"].sort(),
        );

        const imm = rows.find((r) => r.id === "immediate:t-imm")!;
        expect(imm.type).toEqual(UnifiedTransactionType.IMMEDIATE);
        expect(imm.status).toEqual(UnifiedTransactionStatus.SUCCESS);
        expect(imm.blockHeight).toEqual(42);
        expect(imm.detailId).toEqual("t-imm");

        const exec = rows.find((r) => r.id === "executed-reversible:e1")!;
        expect(exec.hash).toBeUndefined();
        expect(exec.status).toEqual(UnifiedTransactionStatus.EXECUTED);
        expect(exec.amount).toEqual(50n);
        expect(exec.from?.id).toEqual("from");

        const canc = rows.find((r) => r.id === "cancelled-reversible:c1")!;
        expect(canc.status).toEqual(UnifiedTransactionStatus.CANCELLED);
        expect(canc.from?.id).toEqual("from");
        expect(canc.to?.id).toEqual("to");
    });

    it("types wormhole-exit transfers as WORMHOLE with from/to and skips aggregate duplicate", () => {
        const exitTransfer = new Transfer({
            id: "t-exit",
            block,
            timestamp: block.timestamp,
            extrinsic: wormholeExtrinsic,
            from,
            to,
            amount: 200n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 1n,
            leafIndex: 0n,
        });
        const wormhole = new WormholeExtrinsic({
            id: "0xwh",
            block,
            timestamp: block.timestamp,
            extrinsic: wormholeExtrinsic,
            totalAmount: 200n,
            outputCount: 1,
            privacyScore: 1,
            privacyScore01Pct: 1,
            privacyScore1Pct: 1,
            privacyScore5Pct: 1,
            privacyLabel: "low",
            poolSnapshot: "{}",
        });

        const rows = buildUnifiedTransactions([exitTransfer], [], [], [], [wormhole]);

        expect(rows).toHaveLength(1);
        expect(rows[0].id).toEqual("wormhole:t-exit");
        expect(rows[0].type).toEqual(UnifiedTransactionType.WORMHOLE);
        expect(rows[0].from?.id).toEqual("from");
        expect(rows[0].to?.id).toEqual("to");
        expect(rows[0].amount).toEqual(200n);
        expect(rows[0].fee).toEqual(20n);
        expect(rows[0].hash).toEqual("0xwh");
        expect(rows[0].detailId).toEqual("0xwh");
        expect(rows.find((r) => r.id === "immediate:t-exit")).toBeUndefined();
        expect(rows.find((r) => r.id === "wormhole:0xwh")).toBeUndefined();
    });

    it("emits one WORMHOLE row per exit output sharing the same detailId", () => {
        const exit1 = new Transfer({
            id: "t-exit-1",
            block,
            timestamp: block.timestamp,
            extrinsic: wormholeExtrinsic,
            from,
            to,
            amount: 100n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 1n,
            leafIndex: 0n,
        });
        const exit2 = new Transfer({
            id: "t-exit-2",
            block,
            timestamp: block.timestamp,
            extrinsic: wormholeExtrinsic,
            from,
            to,
            amount: 100n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 2n,
            leafIndex: 1n,
        });
        const wormhole = new WormholeExtrinsic({
            id: "0xwh",
            block,
            timestamp: block.timestamp,
            extrinsic: wormholeExtrinsic,
            totalAmount: 200n,
            outputCount: 2,
            privacyScore: 1,
            privacyScore01Pct: 1,
            privacyScore1Pct: 1,
            privacyScore5Pct: 1,
            privacyLabel: "low",
            poolSnapshot: "{}",
        });

        // Reverse input order so carrier selection must use leafIndex, not encounter order
        const rows = buildUnifiedTransactions([exit2, exit1], [], [], [], [wormhole]);

        expect(rows.map((r) => r.id).sort()).toEqual(["wormhole:t-exit-1", "wormhole:t-exit-2"].sort());
        expect(rows.every((r) => r.type === UnifiedTransactionType.WORMHOLE)).toBe(true);
        expect(rows.every((r) => r.detailId === "0xwh")).toBe(true);
        expect(rows.every((r) => r.hash === "0xwh")).toBe(true);
        expect(rows.find((r) => r.id === "wormhole:t-exit-1")!.fee).toEqual(20n);
        expect(rows.find((r) => r.id === "wormhole:t-exit-2")!.fee).toEqual(0n);
    });

    it("falls back to aggregate WORMHOLE when no matching transfer exists", () => {
        const wormhole = new WormholeExtrinsic({
            id: "0xwh",
            block,
            timestamp: block.timestamp,
            extrinsic: wormholeExtrinsic,
            totalAmount: 200n,
            outputCount: 1,
            privacyScore: 1,
            privacyScore01Pct: 1,
            privacyScore1Pct: 1,
            privacyScore5Pct: 1,
            privacyLabel: "low",
            poolSnapshot: "{}",
        });

        const rows = buildUnifiedTransactions([], [], [], [], [wormhole]);

        expect(rows).toHaveLength(1);
        expect(rows[0].id).toEqual("wormhole:0xwh");
        expect(rows[0].type).toEqual(UnifiedTransactionType.WORMHOLE);
        expect(rows[0].from).toBeUndefined();
        expect(rows[0].to).toBeUndefined();
        expect(rows[0].amount).toEqual(200n);
        expect(rows[0].fee).toEqual(20n);
        expect(rows[0].detailId).toEqual("0xwh");
    });

    it("types wormhole exits as WORMHOLE via output id when Extrinsic entity is missing", () => {
        const exitTransfer = new Transfer({
            id: "t-exit",
            block,
            timestamp: block.timestamp,
            extrinsic: undefined,
            from,
            to,
            amount: 200n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 1n,
            leafIndex: 0n,
        });
        const wormhole = new WormholeExtrinsic({
            id: "0xwh",
            block,
            timestamp: block.timestamp,
            extrinsic: undefined,
            totalAmount: 200n,
            outputCount: 1,
            privacyScore: 1,
            privacyScore01Pct: 1,
            privacyScore1Pct: 1,
            privacyScore5Pct: 1,
            privacyLabel: "low",
            poolSnapshot: "{}",
        });
        const output = new WormholeOutput({
            id: "t-exit",
            wormholeExtrinsic: wormhole,
            exitAccount: to,
            amount: 200n,
        });

        const rows = buildUnifiedTransactions([exitTransfer], [], [], [], [wormhole], [output]);

        expect(rows).toHaveLength(1);
        expect(rows[0].id).toEqual("wormhole:t-exit");
        expect(rows[0].type).toEqual(UnifiedTransactionType.WORMHOLE);
        expect(rows[0].from?.id).toEqual("from");
        expect(rows[0].to?.id).toEqual("to");
        expect(rows[0].amount).toEqual(200n);
        expect(rows[0].hash).toEqual("0xwh");
        expect(rows[0].detailId).toEqual("0xwh");
        expect(rows.find((r) => r.id === "immediate:t-exit")).toBeUndefined();
        expect(rows.find((r) => r.id === "wormhole:0xwh")).toBeUndefined();
    });

    it("emits null-hash IMMEDIATE for unsigned mint transfers", () => {
        const mint = new Transfer({
            id: "t-mint",
            block,
            timestamp: block.timestamp,
            extrinsic: undefined,
            from,
            to,
            amount: 75n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 1n,
            leafIndex: 0n,
        });

        const rows = buildUnifiedTransactions([mint], [], [], [], []);

        expect(rows).toHaveLength(1);
        expect(rows[0].id).toEqual("immediate:t-mint");
        expect(rows[0].type).toEqual(UnifiedTransactionType.IMMEDIATE);
        expect(rows[0].hash).toBeUndefined();
        expect(rows[0].amount).toEqual(75n);
        expect(rows[0].detailId).toEqual("t-mint");
    });
});

const emptyProcessedEvents = (): ProcessedEvents => ({
    minerRewardEvents: [],
    treasuryRewardEvents: [],
    feesCollectedEvents: [],
    transferEvents: [],
    reversibleTransferEvents: [],
    reversibleTransferCancelledEvents: [],
    reversibleTransferExecutedEvents: [],
    endowedEvents: [],
    dustLostEvents: [],
    balanceSetEvents: [],
    reservedEvents: [],
    unreservedEvents: [],
    reserveRepatriatedEvents: [],
    depositEvents: [],
    withdrawEvents: [],
    slashedEvents: [],
    mintedEvents: [],
    burnedEvents: [],
    suspendedEvents: [],
    restoredEvents: [],
    upgradedEvents: [],
    issuedEvents: [],
    rescindedEvents: [],
    lockedEvents: [],
    unlockedEvents: [],
    frozenEvents: [],
    thawedEvents: [],
    errorEvents: [],
    highSecuritySetEvents: [],
    wormholeNativeTransferredEvents: [],
    wormholeProofVerifiedEvents: [],
    wormholeMinerVolumeFeeEvents: [],
    multisigCreatedEvents: [],
    multisigProposalCreatedEvents: [],
    multisigSignerApprovedEvents: [],
    multisigProposalReadyEvents: [],
    multisigProposalExecutedEvents: [],
    multisigProposalCancelledEvents: [],
    multisigProposalRemovedEvents: [],
    multisigDepositsClaimedEvents: [],
    techReferendumSubmittedEvents: [],
    techReferendumDecisionStartedEvents: [],
    techReferendumConfirmStartedEvents: [],
    techReferendumConfirmAbortedEvents: [],
    techReferendumConfirmedEvents: [],
    techReferendumApprovedEvents: [],
    techReferendumRejectedEvents: [],
    techReferendumTimedOutEvents: [],
    techReferendumCancelledEvents: [],
    techReferendumKilledEvents: [],
    runtimeUpgradeEvents: [],
    blocks: new Map(),
    extrinsics: new Map(),
    executedTransferToReversibleExecutedMapping: new Map(),
});

describe("updateAndCreateAccounts — wormhole miner volume fee", () => {
    const MINT_ADDR = "qzMintSentinel";
    const AUTHOR_ADDR = "qzBlockAuthor";
    const EXIT_ADDR = "qzExitRecipient";
    const EXT_HASH = "0xwormhole-verify";
    const EXIT_AMOUNT = 2_220_000_000_000n;
    const MINER_FEE = 1_111_111_111n;

    const mockCtx = {
        blocks: [{ header: { id: "block-1", height: 1 } }],
        store: {
            findBy: async (): Promise<any[]> => [],
            find: async (): Promise<any[]> => [],
            findOneBy: async (): Promise<any> => null,
        },
    };

    const baseEvent = { block: "block-1", timestamp: new Date() };

    const addWormholeExit = (events: ProcessedEvents, exitTo: string, exitAmount: bigint, minerFee: bigint) => {
        events.wormholeProofVerifiedEvents.push({
            id: "evt-pv",
            ...baseEvent,
            extrinsicHash: EXT_HASH,
            exitAmount,
            nullifiers: [],
        });
        events.wormholeNativeTransferredEvents.push({
            id: "evt-nt-exit",
            ...baseEvent,
            extrinsicHash: EXT_HASH,
            from: MINT_ADDR,
            to: exitTo,
            amount: exitAmount,
            transferCount: 0n,
            leafIndex: 0n,
        });
        // Exit payout mint — matched by the NativeTransferred above.
        events.mintedEvents.push({
            id: "evt-mint-exit",
            ...baseEvent,
            extrinsicHash: EXT_HASH,
            who: exitTo,
            amount: exitAmount,
        });
        // Miner volume-fee mint — no matching NativeTransferred.
        if (minerFee > 0n) {
            events.mintedEvents.push({
                id: "evt-mint-fee",
                ...baseEvent,
                extrinsicHash: EXT_HASH,
                who: AUTHOR_ADDR,
                amount: minerFee,
            });
        }
    };

    it("credits the block author's wormhole volume fee from the unmatched Minted event", async () => {
        const events = emptyProcessedEvents();
        addWormholeExit(events, EXIT_ADDR, EXIT_AMOUNT, MINER_FEE);

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        // Exit payout credited exactly once (via NativeTransferred, not double via Minted)
        expect(accounts.get(EXIT_ADDR)?.free).toEqual(EXIT_AMOUNT);
        // Miner volume fee credited via the unmatched Minted event
        expect(accounts.get(AUTHOR_ADDR)?.free).toEqual(MINER_FEE);
        expect(accounts.get(MINT_ADDR)?.free).toEqual(-EXIT_AMOUNT);
    });

    it("credits both exit payout and miner fee when the author is also an exit recipient", async () => {
        const events = emptyProcessedEvents();
        addWormholeExit(events, AUTHOR_ADDR, EXIT_AMOUNT, MINER_FEE);

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        expect(accounts.get(AUTHOR_ADDR)?.free).toEqual(EXIT_AMOUNT + MINER_FEE);
    });

    it("ignores Minted events outside wormhole verify extrinsics", async () => {
        const events = emptyProcessedEvents();
        // Mining reward mint from a block hook — no extrinsic, covered by NativeTransferred.
        events.mintedEvents.push({ id: "evt-mint-reward", ...baseEvent, who: AUTHOR_ADDR, amount: MINER_FEE });
        events.wormholeNativeTransferredEvents.push({
            id: "evt-nt-reward",
            ...baseEvent,
            from: MINT_ADDR,
            to: AUTHOR_ADDR,
            amount: MINER_FEE,
            transferCount: 0n,
            leafIndex: 0n,
        });

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        expect(accounts.get(AUTHOR_ADDR)?.free).toEqual(MINER_FEE);
    });

    it("credits the block author's fee from MinerVolumeFeePaid (upgraded runtime)", async () => {
        const events = emptyProcessedEvents();
        // Exit payout only — the fee arrives via the explicit event, not a Minted.
        addWormholeExit(events, EXIT_ADDR, EXIT_AMOUNT, 0n);
        events.wormholeMinerVolumeFeeEvents.push({
            id: "evt-fee",
            ...baseEvent,
            extrinsicHash: EXT_HASH,
            miner: AUTHOR_ADDR,
            amount: MINER_FEE,
        });

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        expect(accounts.get(EXIT_ADDR)?.free).toEqual(EXIT_AMOUNT);
        expect(accounts.get(AUTHOR_ADDR)?.free).toEqual(MINER_FEE);
    });

    it("does not double-credit when MinerVolumeFeePaid and the unmatched Minted coexist", async () => {
        const events = emptyProcessedEvents();
        // Upgraded runtime still emits Balances.Minted for the fee (increase_balance),
        // alongside the explicit event — the Minted fallback must defer to the event.
        addWormholeExit(events, EXIT_ADDR, EXIT_AMOUNT, MINER_FEE);
        events.wormholeMinerVolumeFeeEvents.push({
            id: "evt-fee",
            ...baseEvent,
            extrinsicHash: EXT_HASH,
            miner: AUTHOR_ADDR,
            amount: MINER_FEE,
        });

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        expect(accounts.get(AUTHOR_ADDR)?.free).toEqual(MINER_FEE);
    });
});

describe("updateAndCreateAccounts — block-1 genesis leaves", () => {
    const POT = "qzGenesisPot";
    const MINER = "qzBlockOneMiner";
    const GENESIS_BALANCE = 5_669_940_001_000_000_000n;
    const REWARD = 300_000_000_000n;

    const genesisPot = () =>
        new Account({
            id: POT,
            free: GENESIS_BALANCE,
            reserved: 0n,
            frozen: 0n,
            lastUpdated: 0,
            isDepositOnly: true,
            privacyDeposits: "[]",
        });
    const mockCtx = {
        blocks: [{ header: { id: "block-1", height: 1 } }, { header: { id: "block-2", height: 2 } }],
        store: {
            findBy: async (): Promise<any[]> => [genesisPot()],
            find: async (): Promise<any[]> => [],
            findOneBy: async (): Promise<any> => null,
        },
    };
    const sentinelMint = (id: string, block: string, to: string, amount: bigint): WormholeNativeTransferredEvent => ({
        id,
        block,
        timestamp: new Date(),
        from: MINTING_ACCOUNT_ADDRESS,
        to,
        amount,
        transferCount: 0n,
        leafIndex: 0n,
    });

    it("keeps the snapshotted genesis balance instead of adding the block-1 leaf to it", async () => {
        const events = emptyProcessedEvents();
        events.wormholeNativeTransferredEvents.push(sentinelMint("evt-genesis-leaf", "block-1", POT, GENESIS_BALANCE));
        events.wormholeNativeTransferredEvents.push(sentinelMint("evt-block-1-reward", "block-1", MINER, REWARD));

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        expect(accounts.get(POT)?.free).toEqual(GENESIS_BALANCE);
        expect(accounts.get(MINER)?.free).toEqual(REWARD);
    });

    it("still credits a sentinel mint to a genesis account after block 1", async () => {
        const events = emptyProcessedEvents();
        events.wormholeNativeTransferredEvents.push(sentinelMint("evt-later-mint", "block-2", POT, REWARD));

        const { accounts } = await updateAndCreateAccounts(mockCtx as any, events);

        expect(accounts.get(POT)?.free).toEqual(GENESIS_BALANCE + REWARD);
    });
});

describe("createAccountEventEntries — direction flags", () => {
    const block = new Block({
        id: "block-1",
        height: 1,
        hash: "0xblock",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        reward: 0n,
    });
    const account = (id: string) =>
        new Account({
            id,
            free: 0n,
            reserved: 0n,
            frozen: 0n,
            lastUpdated: 0,
            isDepositOnly: false,
            privacyDeposits: "[]",
        });
    const alice = account("alice");
    const bob = account("bob");
    const extrinsic = new Extrinsic({
        id: "0xext",
        block,
        indexInBlock: 0,
        timestamp: block.timestamp,
        signer: alice,
        pallet: "Balances",
        call: "transfer",
        args: "{}",
        success: true,
        fee: 1n,
    });
    const transfer = (id: string, from: Account, to: Account, ext: Extrinsic | undefined) =>
        new Transfer({
            id,
            block,
            blockHeight: block.height,
            timestamp: block.timestamp,
            extrinsic: ext,
            from,
            to,
            amount: 10n,
            fee: 0n,
            fromHash: "a",
            toHash: "b",
            transferCount: 0n,
            leafIndex: 0n,
        });

    interface EntryInputs {
        transfers: Transfer[];
        scheduledReversibles: ScheduledReversibleTransfer[];
        executedReversibles: ExecutedReversibleTransfer[];
        cancelledReversibles: CancelledReversibleTransfer[];
        minerRewards: MinerReward[];
        highSecuritySetEvents: HighSecuritySet[];
        multisigs: Multisig[];
    }

    const entriesFor = (overrides: Partial<EntryInputs>) => {
        const args: EntryInputs = {
            transfers: [],
            scheduledReversibles: [],
            executedReversibles: [],
            cancelledReversibles: [],
            minerRewards: [],
            highSecuritySetEvents: [],
            multisigs: [],
            ...overrides,
        };
        return createAccountEventEntries(
            args.transfers,
            args.scheduledReversibles,
            args.executedReversibles,
            args.cancelledReversibles,
            args.minerRewards,
            args.highSecuritySetEvents,
            args.multisigs,
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
        );
    };

    const flags = (rows: ReturnType<typeof createAccountEventEntries>) =>
        rows.map((r) => ({ account: r.account.id, outgoing: r.outgoing, incoming: r.incoming }));

    it("marks the sender outgoing and the recipient incoming for a signed transfer", () => {
        const rows = entriesFor({ transfers: [transfer("t1", alice, bob, extrinsic)] });

        expect(flags(rows)).toEqual([
            { account: "alice", outgoing: true, incoming: false },
            { account: "bob", outgoing: false, incoming: true },
        ]);
    });

    it("marks a self-transfer as both outgoing and incoming on its single row", () => {
        const rows = entriesFor({ transfers: [transfer("t-self", alice, alice, extrinsic)] });

        expect(flags(rows)).toEqual([{ account: "alice", outgoing: true, incoming: true }]);
    });

    it("emits no rows for transfers without an extrinsic (mint / settlement leaves)", () => {
        const rows = entriesFor({ transfers: [transfer("t-mint", alice, bob, undefined)] });

        expect(rows).toEqual([]);
    });

    it("marks a miner reward incoming only", () => {
        const reward = new MinerReward({ id: "mr-1", block, timestamp: block.timestamp, miner: bob, reward: 5n });
        const rows = entriesFor({ minerRewards: [reward] });

        expect(flags(rows)).toEqual([{ account: "bob", outgoing: false, incoming: true }]);
    });

    it("marks scheduled, executed and cancelled reversibles by party", () => {
        const scheduled = new ScheduledReversibleTransfer({
            id: "s1",
            block,
            timestamp: block.timestamp,
            extrinsic,
            from: alice,
            to: bob,
            amount: 10n,
            fee: 0n,
            txId: "tx-1",
            scheduledAt: block.timestamp,
        });
        const executed = new ExecutedReversibleTransfer({
            id: "e1",
            block,
            timestamp: block.timestamp,
            txId: "tx-1",
            scheduledTransfer: scheduled,
        });
        const guardian = account("guardian");
        const cancelled = new CancelledReversibleTransfer({
            id: "c1",
            block,
            timestamp: block.timestamp,
            extrinsic,
            txId: "tx-1",
            cancelledBy: guardian,
            scheduledTransfer: scheduled,
        });

        const rows = entriesFor({
            scheduledReversibles: [scheduled],
            executedReversibles: [executed],
            cancelledReversibles: [cancelled],
        });

        expect(flags(rows)).toEqual([
            { account: "alice", outgoing: true, incoming: false },
            { account: "bob", outgoing: false, incoming: true },
            { account: "alice", outgoing: true, incoming: false },
            { account: "bob", outgoing: false, incoming: true },
            { account: "alice", outgoing: true, incoming: false },
            { account: "bob", outgoing: false, incoming: true },
            { account: "guardian", outgoing: false, incoming: false },
        ]);
    });

    it("marks multisig creation outgoing for the creator", () => {
        const multisig = new Multisig({
            id: "ms-1",
            block,
            timestamp: block.timestamp,
            extrinsic,
            creator: alice,
            signers: ["alice", "bob"],
            threshold: 2,
            nonce: 0n,
        });
        const rows = entriesFor({ multisigs: [multisig] });

        expect(flags(rows)).toEqual([{ account: "alice", outgoing: true, incoming: false }]);
    });

    it("leaves high-security-set rows out of both directions", () => {
        const highSec = new HighSecuritySet({
            id: "hs-1",
            block,
            timestamp: block.timestamp,
            extrinsic,
            who: alice,
            guardian: bob,
            delay: 10n,
        });
        const rows = entriesFor({ highSecuritySetEvents: [highSec] });

        expect(flags(rows)).toEqual([
            { account: "alice", outgoing: false, incoming: false },
            { account: "bob", outgoing: false, incoming: false },
        ]);
    });
});

describe("createEvents — transfer block height", () => {
    // Real SS58 addresses: createEvents hashes both parties with decodeAddress.
    const SENDER_ADDR = "qzjVsKygc34wWPcC5gaRArB5PZPV92h1BTzEaY8kQHuBs9Kjk";

    it("denormalizes the block height onto each transfer", () => {
        const block = new Block({
            id: "block-9",
            height: 9,
            hash: "0xnine",
            timestamp: new Date("2024-01-01T00:00:00Z"),
            reward: 0n,
        });
        const account = (id: string) =>
            new Account({
                id,
                free: 0n,
                reserved: 0n,
                frozen: 0n,
                lastUpdated: 0,
                isDepositOnly: false,
                privacyDeposits: "[]",
            });
        const accounts = new Map<string, Account>([
            [SENDER_ADDR, account(SENDER_ADDR)],
            [MULTISIG_ADDR, account(MULTISIG_ADDR)],
        ]);
        const processed = emptyProcessedEvents();
        processed.blocks = new Map([[block.id, block]]);
        processed.wormholeNativeTransferredEvents.push({
            id: "t-1",
            block: block.id,
            timestamp: block.timestamp,
            from: SENDER_ADDR,
            to: MULTISIG_ADDR,
            amount: 5n,
            transferCount: 1n,
            leafIndex: 0n,
        });

        const { transfers } = createEvents(
            processed,
            accounts,
            [],
            [],
            [],
            [],
            new Map(),
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
        );

        expect(transfers).toHaveLength(1);
        expect(transfers[0].blockHeight).toBe(9);
    });
});

describe("applyAccountFlags — denormalized listing flags", () => {
    const block = new Block({
        id: "block-7",
        height: 7,
        hash: "0xseven",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        reward: 0n,
    });
    const account = (id: string) =>
        new Account({
            id,
            free: 0n,
            reserved: 0n,
            frozen: 0n,
            lastUpdated: 3,
            isDepositOnly: false,
            privacyDeposits: "[]",
            isHighSecurity: false,
            isGuardian: false,
            isMultisig: false,
        });
    const multisigFor = (id: string, creator: Account) =>
        new Multisig({
            id,
            block,
            timestamp: block.timestamp,
            creator,
            signers: [creator.id],
            threshold: 1,
            nonce: 0n,
        });

    it("flags who as high-security and guardian as guardian", async () => {
        const alice = account("alice");
        const bob = account("bob");
        const accounts = new Map([
            ["alice", alice],
            ["bob", bob],
        ]);
        const highSec = new HighSecuritySet({
            id: "hs-1",
            block,
            timestamp: block.timestamp,
            who: alice,
            guardian: bob,
            delay: 10n,
        });
        const ctx = { store: { findBy: async (): Promise<any[]> => [] } };

        const { newCreatedAccounts } = await applyAccountFlags(ctx as any, accounts, [highSec], []);

        expect(newCreatedAccounts).toBe(0);
        expect(alice).toEqual(expect.objectContaining({ isHighSecurity: true, isGuardian: false, isMultisig: false }));
        expect(bob).toEqual(expect.objectContaining({ isHighSecurity: false, isGuardian: true, isMultisig: false }));
    });

    it("flags the multisig address itself, not its creator", async () => {
        const creator = account("creator");
        const multisigAccount = account("ms-existing");
        const accounts = new Map([
            ["creator", creator],
            ["ms-existing", multisigAccount],
        ]);
        const ctx = { store: { findBy: async (): Promise<any[]> => [] } };

        const { newCreatedAccounts } = await applyAccountFlags(
            ctx as any,
            accounts,
            [],
            [multisigFor("ms-existing", creator)],
        );

        expect(newCreatedAccounts).toBe(0);
        expect(multisigAccount.isMultisig).toBe(true);
        expect(multisigAccount.lastUpdated).toBe(3); // untouched: only balances / creation move lastUpdated
        expect(creator.isMultisig).toBe(false);
    });

    it("creates the Account row for a fundless multisig address and reports it as new", async () => {
        const creator = account("creator");
        const accounts = new Map([["creator", creator]]);
        const ctx = { store: { findBy: async (): Promise<any[]> => [] } };

        const { newCreatedAccounts } = await applyAccountFlags(
            ctx as any,
            accounts,
            [],
            [multisigFor("ms-fresh", creator)],
        );

        expect(newCreatedAccounts).toBe(1);
        const created = accounts.get("ms-fresh");
        expect(created).toEqual(
            expect.objectContaining({
                id: "ms-fresh",
                free: 0n,
                isMultisig: true,
                isHighSecurity: false,
                isGuardian: false,
                lastUpdated: 7,
            }),
        );
    });

    it("loads a multisig account already in the DB instead of overwriting it", async () => {
        const creator = account("creator");
        const accounts = new Map([["creator", creator]]);
        const stored = account("ms-stored");
        stored.free = 500n;
        const ctx = { store: { findBy: async (): Promise<any[]> => [stored] } };

        const { newCreatedAccounts } = await applyAccountFlags(
            ctx as any,
            accounts,
            [],
            [multisigFor("ms-stored", creator)],
        );

        expect(newCreatedAccounts).toBe(0);
        expect(accounts.get("ms-stored")).toBe(stored);
        expect(stored).toEqual(expect.objectContaining({ free: 500n, isMultisig: true, lastUpdated: 3 }));
    });
});

describe("createMinerRewards", () => {
    const timestamp = new Date("2024-01-01T00:00:00Z");
    const block = new Block({
        id: "block-1",
        height: 1,
        hash: "0xblock",
        timestamp,
        reward: 0n,
    });
    const miner = new Account({
        id: "miner",
        free: 0n,
        reserved: 0n,
        frozen: 0n,
        lastUpdated: 0,
        isDepositOnly: false,
        privacyDeposits: "[]",
    });
    const ctx = { store: { findBy: async (): Promise<any[]> => [] } };

    it("sets block reward to the miner payout and does not add collected fees again", async () => {
        const { minerRewards, blocks } = await createMinerRewards(
            ctx as any,
            [
                {
                    id: "mr-1",
                    block: block.id,
                    timestamp,
                    miner: miner.id,
                    reward: 1000n,
                },
            ],
            [],
            new Map([[miner.id, miner]]),
            new Map([[block.id, block]]),
        );

        expect(minerRewards).toHaveLength(1);
        expect(minerRewards[0].reward).toBe(1000n);
        expect(blocks.find((b) => b.id === block.id)?.reward).toBe(1000n);
    });

    it("keeps a historical treasury share in the block reward", async () => {
        block.reward = 0n;
        const { blocks } = await createMinerRewards(
            ctx as any,
            [
                {
                    id: "mr-1",
                    block: block.id,
                    timestamp,
                    miner: miner.id,
                    reward: 600n,
                },
            ],
            [{ id: "tr-1", block: block.id, timestamp, reward: 400n }],
            new Map([[miner.id, miner]]),
            new Map([[block.id, block]]),
        );

        expect(blocks.find((b) => b.id === block.id)?.reward).toBe(1000n);
    });
});
