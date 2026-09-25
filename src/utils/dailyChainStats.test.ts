import {
    accumulateDailyRollupDeltas,
    countNonRewardUnifiedTransactions,
    isRewardUnifiedTransaction,
    updateDailyChainStats,
    utcDayId,
    utcDayStart,
    type DailyRollupStore,
} from "./dailyChainStats";
import {
    Account,
    Block,
    DailyActiveAccount,
    DailyChainStats,
    Extrinsic,
    Transfer,
    UnifiedTransaction,
    UnifiedTransactionStatus,
    UnifiedTransactionType,
} from "../model";

function makeBlock(height: number, timestamp: Date): Block {
    return new Block({
        id: String(height),
        height,
        hash: `0xblock${height}`,
        timestamp,
        reward: 0n,
    });
}

function makeAccount(id: string): Account {
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

function makeTransfer(id: string, timestamp: Date, block: Block, from: Account, to: Account): Transfer {
    return new Transfer({
        id,
        block,
        blockHeight: block.height,
        timestamp,
        from,
        to,
        amount: 1n,
        fee: 0n,
        fromHash: `h:${from.id}`,
        toHash: `h:${to.id}`,
        transferCount: 0n,
        leafIndex: 0n,
    });
}

function makeExtrinsic(
    partial: Partial<Extrinsic> & Pick<Extrinsic, "id" | "timestamp" | "block"> & { signer?: Account | null },
): Extrinsic {
    return new Extrinsic({
        indexInBlock: 0,
        pallet: "Balances",
        call: "transfer",
        args: "{}",
        success: true,
        fee: 0n,
        ...partial,
    });
}

function makeUnified(
    partial: Partial<UnifiedTransaction> & Pick<UnifiedTransaction, "id" | "type" | "timestamp">,
): UnifiedTransaction {
    const block = partial.block ?? makeBlock(1, partial.timestamp);
    return new UnifiedTransaction({
        detailId: partial.detailId ?? partial.id,
        block,
        blockHeight: block.height,
        status: UnifiedTransactionStatus.SUCCESS,
        hash: partial.hash,
        from: partial.from,
        to: partial.to,
        amount: partial.amount,
        fee: partial.fee,
        ...partial,
    });
}

describe("dailyChainStats helpers", () => {
    it("utcDayId uses UTC calendar date", () => {
        // 2024-01-02 01:00 local might still be Jan 1 UTC depending on offset;
        // construct explicitly in UTC.
        expect(utcDayId(new Date("2024-06-15T23:30:00.000Z"))).toEqual("2024-06-15");
        expect(utcDayId(new Date("2024-06-16T00:00:00.000Z"))).toEqual("2024-06-16");
        expect(utcDayStart("2024-06-15").toISOString()).toEqual("2024-06-15T00:00:00.000Z");
    });

    it("identifies hashless IMMEDIATE as rewards", () => {
        const reward = makeUnified({
            id: "immediate:r1",
            type: UnifiedTransactionType.IMMEDIATE,
            timestamp: new Date("2024-01-01T12:00:00.000Z"),
            hash: undefined,
        });
        const user = makeUnified({
            id: "immediate:u1",
            type: UnifiedTransactionType.IMMEDIATE,
            timestamp: new Date("2024-01-01T12:00:00.000Z"),
            hash: "0xabc",
        });
        expect(isRewardUnifiedTransaction(reward)).toBe(true);
        expect(isRewardUnifiedTransaction(user)).toBe(false);
        expect(countNonRewardUnifiedTransactions([reward, user])).toEqual(1);
    });

    it("accumulateDailyRollupDeltas buckets by UTC day, excludes rewards, uses Extrinsic.signer", () => {
        const dayA = new Date("2024-03-10T10:00:00.000Z");
        const dayB = new Date("2024-03-11T01:00:00.000Z");
        const alice = makeAccount("alice");
        const bob = makeAccount("bob");
        const carol = makeAccount("carol");

        const blocks = [makeBlock(1, dayA), makeBlock(2, dayA), makeBlock(3, dayB)];
        const txs = [
            makeUnified({
                id: "immediate:1",
                type: UnifiedTransactionType.IMMEDIATE,
                timestamp: dayA,
                hash: "0x1",
            }),
            makeUnified({
                id: "immediate:reward",
                type: UnifiedTransactionType.IMMEDIATE,
                timestamp: dayA,
                hash: undefined,
            }),
            makeUnified({
                id: "scheduled-reversible:1",
                type: UnifiedTransactionType.SCHEDULED_REVERSIBLE,
                timestamp: dayB,
                hash: "0x2",
            }),
        ];
        const extrinsics = [
            makeExtrinsic({ id: "0xa1", timestamp: dayA, block: blocks[0], signer: alice }),
            makeExtrinsic({ id: "0xa2", timestamp: dayA, block: blocks[0], signer: alice }), // same signer same day
            makeExtrinsic({ id: "0xw", timestamp: dayA, block: blocks[0], signer: null }), // unsigned wormhole
            makeExtrinsic({ id: "0xb1", timestamp: dayB, block: blocks[2], signer: bob }),
        ];
        const transfers = [
            makeTransfer("t1", dayA, blocks[0], alice, bob),
            makeTransfer("t2", dayA, blocks[1], alice, carol), // same sender same day
            makeTransfer("t3", dayB, blocks[2], carol, alice),
        ];

        const deltas = accumulateDailyRollupDeltas(blocks, txs, extrinsics, transfers);
        expect(deltas.get("2024-03-10")).toEqual(expect.objectContaining({ blocks: 2, txs: 1 }));
        expect([...deltas.get("2024-03-10")!.signerIds].sort()).toEqual(["alice"]);
        expect([...deltas.get("2024-03-10")!.senderIds].sort()).toEqual(["alice"]);
        expect([...deltas.get("2024-03-10")!.receiverIds].sort()).toEqual(["bob", "carol"]);
        expect(deltas.get("2024-03-11")).toEqual(expect.objectContaining({ blocks: 1, txs: 1 }));
        expect([...deltas.get("2024-03-11")!.signerIds]).toEqual(["bob"]);
        expect([...deltas.get("2024-03-11")!.senderIds]).toEqual(["carol"]);
        expect([...deltas.get("2024-03-11")!.receiverIds]).toEqual(["alice"]);
    });

    describe("updateDailyChainStats", () => {
        const day = new Date("2024-04-01T15:00:00.000Z");
        const dayId = "2024-04-01";

        function makeStore(existingStats: DailyChainStats[], existingActive: DailyActiveAccount[]): DailyRollupStore {
            return {
                findBy: async (entityClass) => {
                    if (entityClass === DailyChainStats) return existingStats;
                    if (entityClass === DailyActiveAccount) return existingActive;
                    return [];
                },
            };
        }

        function makeActive(accountId: string, flags: Pick<DailyActiveAccount, "signed" | "sent" | "received">) {
            return new DailyActiveAccount({
                id: `${dayId}:${accountId}`,
                date: utcDayStart(dayId),
                accountId,
                ...flags,
            });
        }

        it("increments existing stats, creates rows for new accounts, OR-s flags onto existing rows", async () => {
            const existing = new DailyChainStats({
                id: dayId,
                date: utcDayStart(dayId),
                blocksCount: 5,
                txCount: 10,
                activeAccounts: 1,
            });
            const aliceRow = makeActive("alice", { signed: true, sent: false, received: false });
            const store = makeStore([existing], [aliceRow]);

            const alice = makeAccount("alice");
            const carol = makeAccount("carol");
            const dave = makeAccount("dave");
            const block = makeBlock(100, day);

            const { dailyStats, activeAccounts } = await updateDailyChainStats(
                store,
                [block],
                [
                    makeUnified({
                        id: "immediate:x",
                        type: UnifiedTransactionType.IMMEDIATE,
                        timestamp: day,
                        hash: "0xhash",
                        block,
                    }),
                ],
                [
                    makeExtrinsic({ id: "0xalice", timestamp: day, block, signer: alice }),
                    makeExtrinsic({ id: "0xcarol", timestamp: day, block, signer: carol }),
                ],
                [makeTransfer("t1", day, block, alice, dave)],
            );

            expect(dailyStats).toHaveLength(1);
            expect(dailyStats[0].blocksCount).toEqual(6);
            expect(dailyStats[0].txCount).toEqual(11);
            // alice already counted as signer; carol is a new signer; dave only received → not "active"
            expect(dailyStats[0].activeAccounts).toEqual(2);

            const byId = new Map(activeAccounts.map((a) => [a.id, a]));
            expect([...byId.keys()].sort()).toEqual([`${dayId}:alice`, `${dayId}:carol`, `${dayId}:dave`]);

            const aliceOut = byId.get(`${dayId}:alice`)!;
            expect(aliceOut).toBe(aliceRow); // existing row mutated, not replaced
            expect(aliceOut).toEqual(expect.objectContaining({ signed: true, sent: true, received: false }));

            expect(byId.get(`${dayId}:carol`)).toEqual(
                expect.objectContaining({
                    date: utcDayStart(dayId),
                    accountId: "carol",
                    signed: true,
                    sent: false,
                    received: false,
                }),
            );
            expect(byId.get(`${dayId}:dave`)).toEqual(
                expect.objectContaining({ accountId: "dave", signed: false, sent: false, received: true }),
            );
        });

        it("counts an account as active only when its signed flag flips to true", async () => {
            const existing = new DailyChainStats({
                id: dayId,
                date: utcDayStart(dayId),
                blocksCount: 0,
                txCount: 0,
                activeAccounts: 0,
            });
            const daveRow = makeActive("dave", { signed: false, sent: false, received: true });
            const store = makeStore([existing], [daveRow]);

            const dave = makeAccount("dave");
            const block = makeBlock(101, day);

            const { dailyStats, activeAccounts } = await updateDailyChainStats(
                store,
                [block],
                [],
                [makeExtrinsic({ id: "0xdave", timestamp: day, block, signer: dave })],
                [],
            );

            expect(dailyStats[0].activeAccounts).toEqual(1);
            expect(activeAccounts).toHaveLength(1);
            expect(activeAccounts[0]).toBe(daveRow);
            expect(daveRow).toEqual(expect.objectContaining({ signed: true, sent: false, received: true }));
        });

        it("does not return rows whose flags did not change", async () => {
            const existing = new DailyChainStats({
                id: dayId,
                date: utcDayStart(dayId),
                blocksCount: 0,
                txCount: 0,
                activeAccounts: 1,
            });
            const aliceRow = makeActive("alice", { signed: true, sent: true, received: false });
            const store = makeStore([existing], [aliceRow]);

            const alice = makeAccount("alice");
            const bob = makeAccount("bob");
            const block = makeBlock(102, day);

            const { dailyStats, activeAccounts } = await updateDailyChainStats(
                store,
                [block],
                [],
                [makeExtrinsic({ id: "0xalice2", timestamp: day, block, signer: alice })],
                [makeTransfer("t2", day, block, alice, bob)],
            );

            expect(dailyStats[0].activeAccounts).toEqual(1);
            expect(activeAccounts.map((a) => a.id)).toEqual([`${dayId}:bob`]);
        });

        it("returns nothing for an empty batch", async () => {
            const store = makeStore([], []);
            const result = await updateDailyChainStats(store, [], [], [], []);
            expect(result).toEqual({ dailyStats: [], activeAccounts: [] });
        });
    });
});
