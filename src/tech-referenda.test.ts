import { Runtime } from "@subsquid/substrate-runtime";

import { constants, storage } from "./generated_types";
import { ReferendumStatus } from "./generated_types/v148";
import {
    buildReferendumDetails,
    decodeReferendumProposal,
    isFallbackProposal,
    mergeReferendumDetails,
    needsSnapshotForward,
    referendumDetailsFromStoredSnapshot,
    RuntimeBlockHeader,
    serializeReferendumTally,
} from "./tech-referenda";
import { ss58Encode } from "./utils/ss58";

const PREIMAGE_HASH = "0x" + "aa".repeat(32);
const ACCOUNT_ID = "0x" + "01".repeat(32);
const SIGNED_ADDR = ss58Encode(ACCOUNT_ID);

function textToHex(text: string): string {
    return "0x" + Buffer.from(text, "utf-8").toString("hex");
}

function createMockBlock(decodeCall: jest.Mock): RuntimeBlockHeader {
    return {
        hash: "0xabc",
        height: 100,
        _runtime: {
            decodeCall,
            checkStorageType: () => true,
            checkConstantType: () => true,
        } as unknown as Runtime,
    };
}

function minimalOngoing(overrides: Partial<ReferendumStatus> = {}): ReferendumStatus {
    return {
        track: 1,
        origin: { __kind: "system", value: { __kind: "Root" } },
        proposal: { __kind: "Inline", value: "0x0102" },
        enactment: { __kind: "After", value: 10 },
        submitted: 100,
        submissionDeposit: { who: "0x" + "00".repeat(32), amount: 0n },
        tally: { bareAyes: 0, ayes: 0, nays: 0 },
        inQueue: false,
        ...overrides,
    };
}

describe("tech-referenda", () => {
    let mockDecodeCall: jest.Mock;
    let mockBlock: RuntimeBlockHeader;

    let mockPreimageForGet: jest.SpiedFunction<typeof storage.preimage.preimageFor.v126.get>;
    let mockRequestStatusGet: jest.SpiedFunction<typeof storage.preimage.requestStatusFor.v126.get>;
    let mockReferendumInfoGet: jest.SpiedFunction<typeof storage.techReferenda.referendumInfoFor.v148.get>;
    let mockMetadataOfGet: jest.SpiedFunction<typeof storage.techReferenda.metadataOf.v126.get>;
    let mockTracksGet: jest.SpiedFunction<typeof constants.techReferenda.tracks.v126.get>;

    beforeEach(() => {
        mockDecodeCall = jest.fn();
        mockBlock = createMockBlock(mockDecodeCall);

        mockPreimageForGet = jest.spyOn(storage.preimage.preimageFor.v126, "get");
        mockRequestStatusGet = jest.spyOn(storage.preimage.requestStatusFor.v126, "get");
        mockReferendumInfoGet = jest.spyOn(storage.techReferenda.referendumInfoFor.v148, "get");
        mockMetadataOfGet = jest.spyOn(storage.techReferenda.metadataOf.v126, "get");
        mockTracksGet = jest.spyOn(constants.techReferenda.tracks.v126, "get");
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("serializeReferendumTally", () => {
        it("maps ayes, nays, and bareAyes", () => {
            expect(
                serializeReferendumTally({
                    bareAyes: 3,
                    ayes: 42,
                    nays: 7,
                }),
            ).toEqual({
                ayes: 42n,
                nays: 7n,
                bareAyes: 3n,
            });
        });
    });

    describe("decodeReferendumProposal", () => {
        it("decodes Inline proposals using flat {name, args} call shape", async () => {
            mockDecodeCall.mockReturnValue({
                name: "System.remark",
                args: { remark: textToHex("Hello referendum") },
            });

            const result = await decodeReferendumProposal({ __kind: "Inline", value: "0x010203" }, mockBlock);

            expect(result.storage).toEqual("INLINE");
            expect(result.sizeBytes).toEqual(3);
            expect(result.summary).toEqual('Remark: "Hello referendum"');
            expect(result.calls).toHaveLength(1);
            expect(result.calls[0]).toMatchObject({
                name: "System.remark",
                pallet: "System",
                method: "remark",
                category: "REMARK",
            });
            expect(result.isRuntimeUpgrade).toEqual(false);
        });

        it("decodes Inline proposals using enum {__kind, value} call shape", async () => {
            mockDecodeCall.mockReturnValue({
                __kind: "System",
                value: {
                    __kind: "remark_with_event",
                    value: { remark: textToHex("Enum-shaped remark") },
                },
            });

            const result = await decodeReferendumProposal({ __kind: "Inline", value: "0x0102" }, mockBlock);

            expect(result.calls[0]).toMatchObject({
                name: "System.remark_with_event",
                category: "REMARK",
            });
            expect(result.summary).toEqual('Remark: "Enum-shaped remark"');
        });

        it("decodes enum calls whose args live directly on the inner variant", async () => {
            mockDecodeCall.mockReturnValue({
                __kind: "Balances",
                value: {
                    __kind: "transfer_keep_alive",
                    dest: ACCOUNT_ID,
                    value: 1000n,
                },
            });

            const result = await decodeReferendumProposal({ __kind: "Inline", value: "0x0102" }, mockBlock);

            expect(result.calls[0]).toMatchObject({
                name: "Balances.transfer_keep_alive",
                category: "BALANCE",
            });
        });

        it("flattens Utility.batch proposals into individual humanized calls", async () => {
            mockDecodeCall.mockReturnValue({
                name: "Utility.batch",
                args: {
                    calls: [
                        { name: "System.remark", args: { remark: textToHex("First") } },
                        {
                            __kind: "System",
                            value: {
                                __kind: "set_code",
                                value: { code: "0x" + "ab".repeat(64) },
                            },
                        },
                        { name: "Balances.transfer_keep_alive", args: {} },
                    ],
                },
            });

            const result = await decodeReferendumProposal({ __kind: "Inline", value: "0x0102" }, mockBlock);

            expect(result.calls).toHaveLength(3);
            expect(result.calls.map((call) => call.name)).toEqual([
                "System.remark",
                "System.set_code",
                "Balances.transfer_keep_alive",
            ]);
            expect(result.summary).toMatch(/^Batch proposal \(3 actions\):/);
            expect(result.isRuntimeUpgrade).toEqual(true);
        });

        it("recursively flattens nested batch calls", async () => {
            mockDecodeCall.mockReturnValue({
                name: "Utility.force_batch",
                args: {
                    calls: [
                        {
                            name: "Utility.batch_all",
                            args: {
                                calls: [
                                    { name: "System.remark", args: { remark: textToHex("Nested") } },
                                    { name: "System.authorize_upgrade", args: {} },
                                ],
                            },
                        },
                    ],
                },
            });

            const result = await decodeReferendumProposal({ __kind: "Inline", value: "0x0102" }, mockBlock);

            expect(result.calls.map((call) => call.name)).toEqual(["System.remark", "System.authorize_upgrade"]);
            expect(result.summary).toMatch(/^Batch proposal \(2 actions\):/);
        });

        it("loads Lookup proposals from preimage storage", async () => {
            const callBytes = "0xdeadbeef";
            mockPreimageForGet.mockResolvedValue(callBytes);
            mockDecodeCall.mockReturnValue({
                name: "System.set_storage",
                args: {
                    items: [
                        ["0x01", "0x02"],
                        ["0x03", "0x04"],
                    ],
                },
            });

            const result = await decodeReferendumProposal({ __kind: "Lookup", hash: PREIMAGE_HASH, len: 4 }, mockBlock);

            expect(mockPreimageForGet).toHaveBeenCalledWith(mockBlock, [PREIMAGE_HASH, 4]);
            expect(result.storage).toEqual("LOOKUP");
            expect(result.preimageHash).toEqual(PREIMAGE_HASH);
            expect(result.sizeBytes).toEqual(4);
            expect(result.summary).toEqual("Modify on-chain storage (2 items)");
            expect(result.calls[0].category).toEqual("STORAGE_CHANGE");
        });

        it("loads Legacy proposals after resolving preimage length", async () => {
            const callBytes = "0x01020304";
            mockRequestStatusGet.mockResolvedValue({
                __kind: "Unrequested",
                ticket: ["0x" + "00".repeat(32), { amount: 0n }],
                len: 4,
            });
            mockPreimageForGet.mockResolvedValue(callBytes);
            mockDecodeCall.mockReturnValue({
                name: "System.authorize_upgrade",
                args: {},
            });

            const result = await decodeReferendumProposal({ __kind: "Legacy", hash: PREIMAGE_HASH }, mockBlock);

            expect(mockRequestStatusGet).toHaveBeenCalledWith(mockBlock, PREIMAGE_HASH);
            expect(mockPreimageForGet).toHaveBeenCalledWith(mockBlock, [PREIMAGE_HASH, 4]);
            expect(result.storage).toEqual("LEGACY");
            expect(result.summary).toEqual("Authorize runtime upgrade");
            expect(result.isRuntimeUpgrade).toEqual(true);
        });

        it("returns a preimage-missing summary for Lookup proposals without bytes", async () => {
            mockPreimageForGet.mockResolvedValue(undefined);

            const result = await decodeReferendumProposal(
                { __kind: "Lookup", hash: PREIMAGE_HASH, len: 128 },
                mockBlock,
            );

            expect(result.storage).toEqual("LOOKUP");
            expect(result.preimageHash).toEqual(PREIMAGE_HASH);
            expect(result.sizeBytes).toEqual(128);
            expect(result.calls).toEqual([]);
            expect(result.summary).toMatch(/not available on chain yet/);
            expect(result.isRuntimeUpgrade).toEqual(false);
        });

        it("returns an empty proposal when call bytes fail to decode", async () => {
            mockDecodeCall.mockReturnValue(null);

            const result = await decodeReferendumProposal({ __kind: "Inline", value: "0x0102" }, mockBlock);

            expect(result.summary).toEqual("Proposal could not be decoded");
            expect(result.calls).toEqual([]);
        });
    });

    describe("buildReferendumDetails", () => {
        it("humanizes dispatch origins", async () => {
            mockTracksGet.mockReturnValue([]);
            mockDecodeCall.mockReturnValue({
                name: "System.remark",
                args: { remark: textToHex("From origin test") },
            });

            const origins: Array<[ReferendumStatus["origin"], string]> = [
                [{ __kind: "system", value: { __kind: "Root" } }, "Root"],
                [{ __kind: "system", value: { __kind: "None" } }, "None"],
                [{ __kind: "system", value: { __kind: "Authorized" } }, "Authorized"],
                [{ __kind: "system", value: { __kind: "Signed", value: ACCOUNT_ID } }, `Signed (${SIGNED_ADDR})`],
                [{ __kind: "Origins", value: { __kind: "FastUpgrade" } }, "FastUpgrade"],
            ];

            for (const [origin, expected] of origins) {
                mockReferendumInfoGet.mockResolvedValue({
                    __kind: "Ongoing",
                    value: minimalOngoing({ origin }),
                });

                const details = await buildReferendumDetails(7, mockBlock);

                expect(details.origin).toEqual(expected);
            }
        });

        it("resolves track names and strips NUL padding", async () => {
            mockTracksGet.mockReturnValue([[1, { name: "Root Track\u0000\u0000" }]] as any);
            mockReferendumInfoGet.mockResolvedValue({
                __kind: "Ongoing",
                value: minimalOngoing(),
            });
            mockDecodeCall.mockReturnValue({
                name: "System.remark",
                args: { remark: textToHex("Track test") },
            });

            const details = await buildReferendumDetails(7, mockBlock);

            expect(details.track).toEqual(1);
            expect(details.trackName).toEqual("Root Track");
        });

        it("loads JSON metadata from preimage storage", async () => {
            const metadataJson = JSON.stringify({
                title: "Upgrade runtime",
                description: "Ships a new WASM blob",
            });
            const metadataHash = "0x" + "bb".repeat(32);

            mockTracksGet.mockReturnValue([]);
            mockReferendumInfoGet.mockResolvedValue(undefined);
            mockMetadataOfGet.mockResolvedValue(metadataHash);
            mockRequestStatusGet.mockResolvedValue({
                __kind: "Requested",
                count: 1,
                maybeLen: metadataJson.length,
            });
            mockPreimageForGet.mockResolvedValue(textToHex(metadataJson));
            mockDecodeCall.mockReturnValue({
                name: "System.remark",
                args: { remark: textToHex("Metadata proposal") },
            });

            const details = await buildReferendumDetails(9, mockBlock, {
                track: 2,
                proposalFromEvent: { __kind: "Inline", value: "0x0102" },
            });

            expect(mockMetadataOfGet).toHaveBeenCalledWith(mockBlock, 9);
            expect(details.title).toEqual("Upgrade runtime");
            expect(details.description).toEqual("Ships a new WASM blob");
            expect(details.proposal.summary).toEqual('Remark: "Metadata proposal"');
        });

        it("reads ReferendumInfoFor via the v126 storage type on the old-genesis runtime", async () => {
            mockTracksGet.mockReturnValue([]);
            jest.spyOn(storage.techReferenda.referendumInfoFor.v148, "is").mockReturnValue(false);
            const v126Get = jest.spyOn(storage.techReferenda.referendumInfoFor.v126, "get").mockResolvedValue({
                __kind: "Ongoing",
                value: {
                    ...minimalOngoing(),
                    origin: { __kind: "system", value: { __kind: "Signed", value: ACCOUNT_ID } },
                },
            });
            mockDecodeCall.mockReturnValue({
                name: "System.remark",
                args: { remark: textToHex("Old genesis") },
            });

            const details = await buildReferendumDetails(3, mockBlock);

            expect(v126Get).toHaveBeenCalledWith(mockBlock, 3);
            expect(mockReferendumInfoGet).not.toHaveBeenCalled();
            expect(details.origin).toEqual(`Signed (${SIGNED_ADDR})`);
            expect(details.proposal.summary).toEqual('Remark: "Old genesis"');
        });

        it("falls back when referendum info is unavailable", async () => {
            mockReferendumInfoGet.mockResolvedValue(undefined);

            const details = await buildReferendumDetails(12, mockBlock);

            expect(details.origin).toBeUndefined();
            expect(details.proposal.summary).toEqual("Referendum #12");
            expect(details.proposal.calls).toEqual([]);
        });
    });

    describe("snapshot forwarding helpers", () => {
        const snapshot = {
            track: 1,
            trackName: "Root Track",
            origin: "Root",
            title: "Upgrade runtime",
            description: "Ships a new WASM blob",
            proposal: {
                summary: "Runtime upgrade (1.0 KB WASM blob)",
                storage: "INLINE" as const,
                calls: [
                    {
                        name: "System.set_code",
                        pallet: "System",
                        method: "set_code",
                        summary: "Runtime upgrade (1.0 KB WASM blob)",
                        category: "RUNTIME_UPGRADE" as const,
                    },
                ],
                isRuntimeUpgrade: true,
            },
        };

        it("detects fallback proposals", () => {
            expect(isFallbackProposal({ summary: "Referendum #5", calls: [], isRuntimeUpgrade: false }, 5)).toEqual(
                true,
            );
            expect(isFallbackProposal(snapshot.proposal, 5)).toEqual(false);
        });

        it("flags incomplete details that need snapshot forwarding", () => {
            expect(needsSnapshotForward(undefined, 5)).toEqual(true);
            expect(
                needsSnapshotForward(
                    {
                        proposal: { summary: "Referendum #5", calls: [], isRuntimeUpgrade: false },
                    },
                    5,
                ),
            ).toEqual(true);
            expect(needsSnapshotForward(snapshot, 5)).toEqual(false);
        });

        it("rehydrates stored snapshots from persisted fields", () => {
            const details = referendumDetailsFromStoredSnapshot({
                referendumIndex: 7,
                track: 1,
                trackName: "Root Track",
                origin: "Root",
                title: "Upgrade runtime",
                description: "Ships a new WASM blob",
                proposalSummary: snapshot.proposal.summary,
                proposalStorage: "INLINE",
                proposalCalls: JSON.stringify(snapshot.proposal.calls),
                isRuntimeUpgrade: true,
            });

            expect(details).toMatchObject(snapshot);
        });

        it("merges a stored snapshot into terminal-event details", () => {
            const fresh = {
                proposal: { summary: "Referendum #7", calls: [], isRuntimeUpgrade: false },
            };

            expect(mergeReferendumDetails(snapshot, fresh, 7)).toEqual(snapshot);
        });

        it("keeps fresh metadata when merging with a snapshot", () => {
            const fresh = {
                title: "Updated title",
                proposal: { summary: "Referendum #7", calls: [], isRuntimeUpgrade: false },
            };

            expect(mergeReferendumDetails(snapshot, fresh, 7)).toMatchObject({
                ...snapshot,
                title: "Updated title",
            });
        });
    });
});
