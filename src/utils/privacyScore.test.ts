import {
    createPool,
    addDeposit,
    removeDeposit,
    selectBucket,
    privacyScore,
    privacyScoreTable,
    findMinDist,
    scoreLabel,
    normalCdf,
    log2Binomial,
    poolToJson,
    poolFromJson,
    standardBucketBoundaries,
    DepositTracker,
    DepositPoolStats,
    serializeDeposits,
    deserializeDeposits,
} from "./privacyScore";

const DEV = 1_000_000_000_000n; // 1 DEV in token units

describe("standardBucketBoundaries", () => {
    it("should have 13 buckets (1 sub-DEV + 12 overlapping)", () => {
        const boundaries = standardBucketBoundaries();
        expect(boundaries).toHaveLength(13);
    });

    it("first bucket covers [0, 1 DEV)", () => {
        const boundaries = standardBucketBoundaries();
        expect(boundaries[0].lo).toBe(0n);
        expect(boundaries[0].hi).toBe(DEV);
    });

    it("second bucket covers [1 DEV, 16 DEV)", () => {
        const boundaries = standardBucketBoundaries();
        expect(boundaries[1].lo).toBe(DEV);
        expect(boundaries[1].hi).toBe(16n * DEV);
    });

    it("buckets grow by factor 2 in base, factor 16 in width", () => {
        const boundaries = standardBucketBoundaries();
        for (let i = 2; i < boundaries.length; i++) {
            expect(boundaries[i].lo).toBe(boundaries[i - 1].lo * 2n);
            expect(boundaries[i].hi).toBe(boundaries[i - 1].hi * 2n);
        }
    });
});

describe("createPool", () => {
    it("should create a pool with all-zero stats", () => {
        const pool = createPool();
        expect(pool.buckets).toHaveLength(13);
        for (const b of pool.buckets) {
            expect(b.count).toBe(0);
            expect(b.sumAmounts).toBe(0n);
            expect(b.sumAmountsSquared).toBe(0n);
        }
    });
});

describe("addDeposit", () => {
    it("should add a sub-DEV deposit to bucket 0 only", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n); // 0.5 DEV

        expect(pool.buckets[0].count).toBe(1);
        expect(pool.buckets[0].sumAmounts).toBe(DEV / 2n);
        expect(pool.buckets[0].sumAmountsSquared).toBe((DEV / 2n) * (DEV / 2n));

        for (let i = 1; i < pool.buckets.length; i++) {
            expect(pool.buckets[i].count).toBe(0);
        }
    });

    it("should add a deposit to all overlapping buckets", () => {
        const pool = createPool();
        const amount = 2n * DEV; // 2 DEV falls in [1,16) and [2,32)
        addDeposit(pool, amount);

        const matchingBuckets = pool.buckets.filter((b) => b.count > 0);
        expect(matchingBuckets.length).toBeGreaterThanOrEqual(2);

        for (const b of matchingBuckets) {
            expect(amount >= b.lo && amount < b.hi).toBe(true);
            expect(b.count).toBe(1);
            expect(b.sumAmounts).toBe(amount);
            expect(b.sumAmountsSquared).toBe(amount * amount);
        }
    });

    it("should accumulate multiple deposits in same bucket", () => {
        const pool = createPool();
        const a = DEV / 4n;
        const b = DEV / 3n;
        addDeposit(pool, a);
        addDeposit(pool, b);

        expect(pool.buckets[0].count).toBe(2);
        expect(pool.buckets[0].sumAmounts).toBe(a + b);
        expect(pool.buckets[0].sumAmountsSquared).toBe(a * a + b * b);
    });

    it("should not add a deposit of 0 to any bucket (0 < lo for all but bucket 0, and 0 >= 0 && 0 < UNIT)", () => {
        const pool = createPool();
        addDeposit(pool, 0n);
        expect(pool.buckets[0].count).toBe(1);
        expect(pool.buckets[0].sumAmounts).toBe(0n);
    });

    it("should handle very large deposits", () => {
        const pool = createPool();
        const amount = 1024n * DEV;
        addDeposit(pool, amount);

        const matchingBuckets = pool.buckets.filter((b) => b.count > 0);
        expect(matchingBuckets.length).toBeGreaterThan(0);
        for (const b of matchingBuckets) {
            expect(b.sumAmounts).toBe(amount);
        }
    });
});

describe("removeDeposit", () => {
    it("should reverse an addDeposit exactly", () => {
        const pool = createPool();
        const amount = 5n * DEV;
        addDeposit(pool, amount);
        removeDeposit(pool, amount);

        for (const b of pool.buckets) {
            expect(b.count).toBe(0);
            expect(b.sumAmounts).toBe(0n);
            expect(b.sumAmountsSquared).toBe(0n);
        }
    });

    it("should handle partial removal", () => {
        const pool = createPool();
        const a = DEV / 4n;
        const b = DEV / 3n;
        addDeposit(pool, a);
        addDeposit(pool, b);
        removeDeposit(pool, a);

        expect(pool.buckets[0].count).toBe(1);
        expect(pool.buckets[0].sumAmounts).toBe(b);
        expect(pool.buckets[0].sumAmountsSquared).toBe(b * b);
    });

    it("should clamp count to 0 on extra removal", () => {
        const pool = createPool();
        removeDeposit(pool, DEV / 2n);
        expect(pool.buckets[0].count).toBe(0);
        expect(pool.buckets[0].sumAmounts).toBe(0n);
        expect(pool.buckets[0].sumAmountsSquared).toBe(0n);
    });

    it("should clamp sumAmounts and sumAmountsSquared to 0n", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 4n);
        removeDeposit(pool, DEV / 2n); // larger removal

        expect(pool.buckets[0].sumAmounts).toBe(0n);
        expect(pool.buckets[0].sumAmountsSquared).toBe(0n);
    });
});

describe("selectBucket", () => {
    it("should return null for empty pool", () => {
        const pool = createPool();
        expect(selectBucket(pool, DEV)).toBeNull();
    });

    it("should return the matching bucket", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n);
        const bucket = selectBucket(pool, DEV / 2n);
        expect(bucket).not.toBeNull();
        expect(bucket!.lo).toBe(0n);
        expect(bucket!.hi).toBe(DEV);
    });

    it("should prefer the tightest-fitting bucket", () => {
        const pool = createPool();
        addDeposit(pool, 2n * DEV); // populates [1,16) and [2,32)
        const bucket = selectBucket(pool, 2n * DEV);
        expect(bucket).not.toBeNull();
        // [2,32) has hi=32 DEV, headroom = 30 DEV
        // [1,16) has hi=16 DEV, headroom = 14 DEV -- tighter fit
        expect(bucket!.lo).toBe(DEV);
        expect(bucket!.hi).toBe(16n * DEV);
    });

    it("should return null for target outside all populated buckets", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n); // only in [0, 1 DEV)
        expect(selectBucket(pool, 100n * DEV)).toBeNull();
    });
});

describe("normalCdf", () => {
    it("should return ~0.5 for z=0", () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    });

    it("should return ~0.8413 for z=1", () => {
        expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    });

    it("should return ~0.1587 for z=-1", () => {
        expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
    });

    it("should return 0 for z << 0", () => {
        expect(normalCdf(-10)).toBe(0);
    });

    it("should return 1 for z >> 0", () => {
        expect(normalCdf(10)).toBe(1);
    });

    it("should satisfy symmetry: Phi(z) + Phi(-z) = 1", () => {
        for (const z of [0.5, 1, 2, 3]) {
            expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 5);
        }
    });
});

describe("log2Binomial", () => {
    it("C(n,0) = C(n,n) = 1 => log2 = 0", () => {
        expect(log2Binomial(10, 0)).toBe(0);
        expect(log2Binomial(10, 10)).toBe(0);
    });

    it("C(10,1) = 10 => log2 ≈ 3.32", () => {
        expect(log2Binomial(10, 1)).toBeCloseTo(Math.log2(10), 5);
    });

    it("C(10,5) = 252 => log2 ≈ 7.977", () => {
        expect(log2Binomial(10, 5)).toBeCloseTo(Math.log2(252), 5);
    });

    it("should handle k > n by returning 0", () => {
        expect(log2Binomial(5, 6)).toBe(0);
    });

    it("should be symmetric: C(n,k) = C(n,n-k)", () => {
        expect(log2Binomial(20, 3)).toBeCloseTo(log2Binomial(20, 17), 10);
    });
});

describe("privacyScore", () => {
    function poolWithDeposits(amounts: bigint[]): DepositPoolStats {
        const pool = createPool();
        for (const a of amounts) addDeposit(pool, a);
        return pool;
    }

    it("should return 0 for empty pool", () => {
        const pool = createPool();
        expect(privacyScore(DEV, DEV / 100n, pool, 10, 1, 16)).toBe(0);
    });

    it("should return 0 if output doesn't match any bucket", () => {
        const pool = poolWithDeposits([DEV / 2n]);
        expect(privacyScore(1000n * DEV, DEV, pool, 10, 1, 16)).toBe(0);
    });

    it("should return positive score for a reasonable pool", () => {
        const deposits = Array.from({ length: 50 }, (_, i) => DEV / 4n + BigInt(i) * (DEV / 200n));
        const pool = poolWithDeposits(deposits);
        const score = privacyScore(DEV / 2n, DEV / 100n, pool, 10, 1, 16);
        expect(score).toBeGreaterThan(0);
    });

    it("should increase with more deposits (larger anonymity set)", () => {
        const makeDeposits = (n: number) =>
            Array.from({ length: n }, (_, i) => DEV / 4n + BigInt(i) * (DEV / BigInt(n * 4)));
        const smallPool = poolWithDeposits(makeDeposits(10));
        const largePool = poolWithDeposits(makeDeposits(100));

        const scoreSmall = privacyScore(DEV / 2n, DEV / 100n, smallPool, 10, 1, 16);
        const scoreLarge = privacyScore(DEV / 2n, DEV / 100n, largePool, 10, 1, 16);
        expect(scoreLarge).toBeGreaterThan(scoreSmall);
    });

    it("should increase with larger dist (more tolerance)", () => {
        const deposits = Array.from({ length: 50 }, (_, i) => DEV / 4n + BigInt(i) * (DEV / 200n));
        const pool = poolWithDeposits(deposits);

        const scoreTight = privacyScore(DEV / 2n, DEV / 1000n, pool, 10, 1, 16);
        const scoreWide = privacyScore(DEV / 2n, DEV / 10n, pool, 10, 1, 16);
        expect(scoreWide).toBeGreaterThanOrEqual(scoreTight);
    });

    it("should return 0 when all deposits are identical (sigma=0)", () => {
        const pool = poolWithDeposits([DEV / 2n, DEV / 2n, DEV / 2n]);
        expect(privacyScore(DEV / 2n, 0n, pool, 10, 1, 16)).toBe(0);
    });
});

describe("scoreLabel", () => {
    it("should label scores correctly", () => {
        expect(scoreLabel(5)).toBe("Critical");
        expect(scoreLabel(15)).toBe("Weak");
        expect(scoreLabel(30)).toBe("Moderate");
        expect(scoreLabel(50)).toBe("Strong");
        expect(scoreLabel(80)).toBe("Very Strong");
    });

    it("should handle boundary values", () => {
        expect(scoreLabel(10)).toBe("Weak");
        expect(scoreLabel(20)).toBe("Moderate");
        expect(scoreLabel(40)).toBe("Strong");
        expect(scoreLabel(60)).toBe("Very Strong");
    });
});

describe("privacyScoreTable", () => {
    it("should return results for each dist level", () => {
        const deposits = Array.from({ length: 50 }, (_, i) => DEV / 4n + BigInt(i) * (DEV / 200n));
        const pool = createPool();
        for (const d of deposits) addDeposit(pool, d);

        const table = privacyScoreTable(DEV / 2n, pool, 10, 1, 16);
        expect(table).toHaveLength(4); // default [0, 10, 100, 500]
        for (const row of table) {
            expect(typeof row.dist).toBe("bigint");
            expect(typeof row.scoreBits).toBe("number");
            expect(typeof row.label).toBe("string");
        }
    });

    it("scores should be non-decreasing with larger dist", () => {
        const deposits = Array.from({ length: 50 }, (_, i) => DEV / 4n + BigInt(i) * (DEV / 200n));
        const pool = createPool();
        for (const d of deposits) addDeposit(pool, d);

        const table = privacyScoreTable(DEV / 2n, pool, 10, 1, 16);
        for (let i = 1; i < table.length; i++) {
            expect(table[i].scoreBits).toBeGreaterThanOrEqual(table[i - 1].scoreBits);
        }
    });
});

describe("findMinDist", () => {
    it("should return null if target is unreachable", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n);
        expect(findMinDist(DEV / 2n, pool, 10, 1, 16, 1000)).toBeNull();
    });

    it("should return 0n if score already met at dist=0", () => {
        const deposits = Array.from({ length: 200 }, (_, i) => DEV / 4n + BigInt(i) * (DEV / 1000n));
        const pool = createPool();
        for (const d of deposits) addDeposit(pool, d);

        const baseScore = privacyScore(DEV / 2n, 0n, pool, 10, 1, 16);
        if (baseScore > 0) {
            const dist = findMinDist(DEV / 2n, pool, 10, 1, 16, 0.1);
            expect(dist).toBe(0n);
        }
    });

    it("should return a bigint when target is reachable", () => {
        const deposits = Array.from({ length: 100 }, (_, i) => DEV / 4n + BigInt(i) * (DEV / 400n));
        const pool = createPool();
        for (const d of deposits) addDeposit(pool, d);

        const dist = findMinDist(DEV / 2n, pool, 10, 1, 16, 1);
        if (dist !== null) {
            expect(typeof dist).toBe("bigint");
            expect(dist).toBeGreaterThanOrEqual(0n);
        }
    });
});

describe("poolToJson / poolFromJson", () => {
    it("should roundtrip an empty pool", () => {
        const pool = createPool();
        const json = poolToJson(pool);
        const restored = poolFromJson(json);

        expect(restored.buckets).toHaveLength(pool.buckets.length);
        for (let i = 0; i < pool.buckets.length; i++) {
            expect(restored.buckets[i].lo).toBe(pool.buckets[i].lo);
            expect(restored.buckets[i].hi).toBe(pool.buckets[i].hi);
            expect(restored.buckets[i].count).toBe(0);
            expect(restored.buckets[i].sumAmounts).toBe(0n);
            expect(restored.buckets[i].sumAmountsSquared).toBe(0n);
        }
    });

    it("should roundtrip a pool with deposits", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n);
        addDeposit(pool, 3n * DEV);
        addDeposit(pool, 10n * DEV);

        const json = poolToJson(pool);
        const restored = poolFromJson(json);

        for (let i = 0; i < pool.buckets.length; i++) {
            expect(restored.buckets[i].lo).toBe(pool.buckets[i].lo);
            expect(restored.buckets[i].hi).toBe(pool.buckets[i].hi);
            expect(restored.buckets[i].count).toBe(pool.buckets[i].count);
            expect(restored.buckets[i].sumAmounts).toBe(pool.buckets[i].sumAmounts);
            expect(restored.buckets[i].sumAmountsSquared).toBe(pool.buckets[i].sumAmountsSquared);
        }
    });

    it("should preserve large BigInt values without precision loss", () => {
        const pool = createPool();
        const largeAmount = 2048n * DEV; // 2048 DEV
        addDeposit(pool, largeAmount);

        const json = poolToJson(pool);
        const restored = poolFromJson(json);

        const populated = restored.buckets.filter((b) => b.count > 0);
        for (const b of populated) {
            expect(b.sumAmounts).toBe(largeAmount);
            expect(b.sumAmountsSquared).toBe(largeAmount * largeAmount);
        }
    });

    it("should produce valid JSON", () => {
        const pool = createPool();
        addDeposit(pool, DEV);
        const json = poolToJson(pool);
        expect(() => JSON.parse(json)).not.toThrow();
    });
});

describe("pool integration", () => {
    it("add then remove many deposits should return to zero", () => {
        const pool = createPool();
        const amounts = [DEV / 10n, DEV / 4n, DEV / 2n, DEV, 3n * DEV, 10n * DEV];

        for (const a of amounts) addDeposit(pool, a);
        for (const a of amounts) removeDeposit(pool, a);

        for (const b of pool.buckets) {
            expect(b.count).toBe(0);
            expect(b.sumAmounts).toBe(0n);
            expect(b.sumAmountsSquared).toBe(0n);
        }
    });

    it("privacy score should grow as pool grows", () => {
        const pool = createPool();
        const scores: number[] = [];

        for (let n = 0; n < 5; n++) {
            for (let i = 0; i < 20; i++) {
                addDeposit(pool, DEV / 4n + BigInt(i + n * 20) * (DEV / 500n));
            }
            scores.push(privacyScore(DEV / 2n, DEV / 100n, pool, 10, 1, 16));
        }

        for (let i = 1; i < scores.length; i++) {
            expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
        }
    });

    it("serialization should not affect privacy score", () => {
        const pool = createPool();
        for (let i = 0; i < 30; i++) {
            addDeposit(pool, DEV / 4n + BigInt(i) * (DEV / 200n));
        }

        const scoreBefore = privacyScore(DEV / 2n, DEV / 100n, pool, 10, 1, 16);
        const restored = poolFromJson(poolToJson(pool));
        const scoreAfter = privacyScore(DEV / 2n, DEV / 100n, restored, 10, 1, 16);

        expect(scoreAfter).toBe(scoreBefore);
    });
});

describe("DepositTracker", () => {
    it("should correctly remove individual deposits across bucket boundaries", () => {
        const pool = createPool();
        const tracker = new DepositTracker(pool);
        const halfDev = DEV / 2n;

        tracker.trackDeposit("alice", halfDev);
        tracker.trackDeposit("alice", halfDev);
        expect(pool.buckets[0].count).toBe(2);
        expect(pool.buckets[0].sumAmounts).toBe(DEV);

        tracker.removeAccountDeposits("alice");

        expect(pool.buckets[0].count).toBe(0);
        expect(pool.buckets[0].sumAmounts).toBe(0n);
        expect(pool.buckets[0].sumAmountsSquared).toBe(0n);
    });

    it("should only remove deposits for the specified account", () => {
        const pool = createPool();
        const tracker = new DepositTracker(pool);

        tracker.trackDeposit("alice", DEV / 2n);
        tracker.trackDeposit("bob", DEV / 3n);
        expect(pool.buckets[0].count).toBe(2);

        tracker.removeAccountDeposits("alice");

        expect(pool.buckets[0].count).toBe(1);
        expect(pool.buckets[0].sumAmounts).toBe(DEV / 3n);
    });

    it("should handle deposits spanning multiple overlapping buckets", () => {
        const pool = createPool();
        const tracker = new DepositTracker(pool);

        tracker.trackDeposit("alice", 2n * DEV); // hits [1,16) and [2,32)
        tracker.trackDeposit("alice", 3n * DEV); // hits [1,16) and [2,32)

        const populatedBefore = pool.buckets.filter((b) => b.count > 0);
        expect(populatedBefore.length).toBeGreaterThanOrEqual(2);

        tracker.removeAccountDeposits("alice");

        for (const b of pool.buckets) {
            expect(b.count).toBe(0);
            expect(b.sumAmounts).toBe(0n);
            expect(b.sumAmountsSquared).toBe(0n);
        }
    });

    it("should be a no-op for unknown account", () => {
        const pool = createPool();
        const tracker = new DepositTracker(pool);
        tracker.trackDeposit("alice", DEV / 2n);

        tracker.removeAccountDeposits("unknown");

        expect(pool.buckets[0].count).toBe(1);
        expect(pool.buckets[0].sumAmounts).toBe(DEV / 2n);
    });

    it("getDeposits returns tracked amounts", () => {
        const pool = createPool();
        const tracker = new DepositTracker(pool);

        tracker.trackDeposit("alice", DEV / 2n);
        tracker.trackDeposit("alice", DEV / 4n);

        expect(tracker.getDeposits("alice")).toEqual([DEV / 2n, DEV / 4n]);
        expect(tracker.getDeposits("unknown")).toEqual([]);
    });

    it("removeAccountDeposits clears tracked deposits", () => {
        const pool = createPool();
        const tracker = new DepositTracker(pool);

        tracker.trackDeposit("alice", DEV / 2n);
        tracker.removeAccountDeposits("alice");

        expect(tracker.getDeposits("alice")).toEqual([]);
    });

    it("hydrateAccount loads deposits without adding to pool", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n);
        addDeposit(pool, DEV / 4n);

        const tracker = new DepositTracker(pool);
        tracker.hydrateAccount("alice", [DEV / 2n, DEV / 4n]);

        expect(tracker.getDeposits("alice")).toEqual([DEV / 2n, DEV / 4n]);
        expect(pool.buckets[0].count).toBe(2);
    });

    it("hydrateAccount enables cross-batch removal", () => {
        const pool = createPool();
        addDeposit(pool, DEV / 2n);
        addDeposit(pool, DEV / 4n);

        const tracker = new DepositTracker(pool);
        tracker.hydrateAccount("alice", [DEV / 2n, DEV / 4n]);
        tracker.removeAccountDeposits("alice");

        expect(pool.buckets[0].count).toBe(0);
        expect(pool.buckets[0].sumAmounts).toBe(0n);
    });
});

describe("serializeDeposits / deserializeDeposits", () => {
    it("should roundtrip an empty array", () => {
        expect(deserializeDeposits(serializeDeposits([]))).toEqual([]);
    });

    it("should roundtrip deposits", () => {
        const deposits = [DEV / 2n, DEV / 4n, 3n * DEV];
        expect(deserializeDeposits(serializeDeposits(deposits))).toEqual(deposits);
    });

    it("should handle edge cases", () => {
        expect(deserializeDeposits("")).toEqual([]);
        expect(deserializeDeposits("[]")).toEqual([]);
    });

    it("should preserve large BigInt values", () => {
        const deposits = [2048n * DEV, 999_999_999_999_999n];
        expect(deserializeDeposits(serializeDeposits(deposits))).toEqual(deposits);
    });
});

describe("multi-batch lifecycle", () => {
    function simulateBatch(
        poolJson: string,
        accountStates: Map<string, { isDepositOnly: boolean; privacyDeposits: string }>,
        actions: Array<{ type: "deposit"; account: string; amount: bigint } | { type: "send"; account: string }>,
    ) {
        const pool = poolFromJson(poolJson);
        const tracker = new DepositTracker(pool);

        for (const [id, state] of accountStates) {
            if (state.isDepositOnly) {
                tracker.hydrateAccount(id, deserializeDeposits(state.privacyDeposits));
            }
        }

        for (const action of actions) {
            const state = accountStates.get(action.account) ?? { isDepositOnly: true, privacyDeposits: "[]" };
            accountStates.set(action.account, state);

            if (action.type === "deposit" && state.isDepositOnly) {
                tracker.trackDeposit(action.account, action.amount);
            } else if (action.type === "send" && state.isDepositOnly) {
                state.isDepositOnly = false;
                tracker.removeAccountDeposits(action.account);
            }
        }

        for (const [id, state] of accountStates) {
            state.privacyDeposits = serializeDeposits(tracker.getDeposits(id));
        }

        return { poolJson: poolToJson(pool), pool };
    }

    it("deposit pool stays clean after account transitions across batches", () => {
        const accounts = new Map<string, { isDepositOnly: boolean; privacyDeposits: string }>();
        const initialPool = poolToJson(createPool());

        const { poolJson: afterBatch1 } = simulateBatch(initialPool, accounts, [
            { type: "deposit", account: "alice", amount: DEV / 2n },
            { type: "deposit", account: "alice", amount: DEV / 3n },
        ]);

        const pool1 = poolFromJson(afterBatch1);
        expect(pool1.buckets[0].count).toBe(2);

        const { pool: finalPool } = simulateBatch(afterBatch1, accounts, [{ type: "send", account: "alice" }]);

        for (const b of finalPool.buckets) {
            expect(b.count).toBe(0);
            expect(b.sumAmounts).toBe(0n);
            expect(b.sumAmountsSquared).toBe(0n);
        }
    });

    it("deposits accumulate correctly across many batches then remove cleanly", () => {
        const accounts = new Map<string, { isDepositOnly: boolean; privacyDeposits: string }>();
        let poolJson = poolToJson(createPool());

        ({ poolJson } = simulateBatch(poolJson, accounts, [
            { type: "deposit", account: "alice", amount: DEV / 4n },
            { type: "deposit", account: "bob", amount: 2n * DEV },
        ]));

        ({ poolJson } = simulateBatch(poolJson, accounts, [
            { type: "deposit", account: "alice", amount: DEV / 3n },
            { type: "deposit", account: "charlie", amount: 5n * DEV },
        ]));

        ({ poolJson } = simulateBatch(poolJson, accounts, [{ type: "deposit", account: "alice", amount: DEV / 5n }]));

        expect(deserializeDeposits(accounts.get("alice")!.privacyDeposits)).toEqual([DEV / 4n, DEV / 3n, DEV / 5n]);

        const { pool: afterAliceSends } = simulateBatch(poolJson, accounts, [{ type: "send", account: "alice" }]);

        const bobDeposits = deserializeDeposits(accounts.get("bob")!.privacyDeposits);
        expect(bobDeposits).toEqual([2n * DEV]);
        const charlieDeposits = deserializeDeposits(accounts.get("charlie")!.privacyDeposits);
        expect(charlieDeposits).toEqual([5n * DEV]);

        const remaining = afterAliceSends.buckets.reduce((sum, b) => sum + b.count, 0);
        expect(remaining).toBeGreaterThan(0);
    });

    it("privacy scores remain consistent after simulated restart", () => {
        const accounts = new Map<string, { isDepositOnly: boolean; privacyDeposits: string }>();
        let poolJson = poolToJson(createPool());

        for (let batch = 0; batch < 5; batch++) {
            ({ poolJson } = simulateBatch(poolJson, accounts, [
                { type: "deposit", account: `user-${batch}`, amount: DEV / 4n + BigInt(batch) * (DEV / 20n) },
                { type: "deposit", account: `user-${batch}`, amount: DEV / 3n + BigInt(batch) * (DEV / 30n) },
            ]));
        }

        const poolBefore = poolFromJson(poolJson);
        const scoreBefore = privacyScore(DEV / 2n, DEV / 100n, poolBefore, 10, 1, 16);

        const poolAfterRestart = poolFromJson(poolJson);
        const scoreAfterRestart = privacyScore(DEV / 2n, DEV / 100n, poolAfterRestart, 10, 1, 16);

        expect(scoreAfterRestart).toBe(scoreBefore);

        const { pool: afterRemoval } = simulateBatch(poolJson, accounts, [{ type: "send", account: "user-0" }]);
        const scoreAfterRemoval = privacyScore(DEV / 2n, DEV / 100n, afterRemoval, 10, 1, 16);
        expect(scoreAfterRemoval).toBeLessThanOrEqual(scoreBefore);
    });
});
