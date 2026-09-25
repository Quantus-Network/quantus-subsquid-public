/**
 * Wormhole Privacy Score
 *
 * Estimates the anonymity set size for a wormhole output based on the
 * current deposit pool statistics. The score is log2 of the estimated
 * number of deposit subsets that could have produced the observed output.
 *
 * Uses bucketed pool statistics to handle skewed deposit distributions
 * (e.g., many small miner rewards + few large transfers).
 *
 * Bucket ranges are bounded [lo, hi) with overlapping ranges growing by factor 4:
 *   [0, 1 DEV), [1, 16), [4, 64), [16, 256), [64, 1024), ...
 *
 * For a target T with k deposits, we need deposits averaging ~T/k.
 * We select the bucket whose range contains T/k_max, ensuring the CLT
 * approximation uses only deposits of the right order of magnitude.
 */

const UNIT = 1_000_000_000_000n; // 1 DEV in token units

/**
 * A single bucket of deposit pool statistics.
 */
export interface PoolBucket {
    /** Lower bound (inclusive) in token units */
    lo: bigint;
    /** Upper bound (exclusive) in token units */
    hi: bigint;
    /** Number of deposits in this range */
    count: number;
    /** Sum of deposit amounts in this range */
    sumAmounts: bigint;
    /** Sum of squared deposit amounts in this range */
    sumAmountsSquared: bigint;
}

/**
 * Bucketed deposit pool statistics.
 */
export interface DepositPoolStats {
    buckets: PoolBucket[];
}

/**
 * Result of a privacy score computation.
 */
export interface PrivacyScoreResult {
    dist: bigint;
    scoreBits: number;
    label: string;
}

/**
 * Define the standard bucket boundaries.
 *
 * Buckets: [0, 1 DEV), then [2^i, 2^i * 16) DEV for i = 0, 1, 2, ...
 * Each bucket has width factor 16 (matching k_max).
 * With base 2, any target has ~4 overlapping buckets for fine-grained selection.
 */
export function standardBucketBoundaries(): Array<{ lo: bigint; hi: bigint }> {
    const boundaries: Array<{ lo: bigint; hi: bigint }> = [];

    boundaries.push({ lo: 0n, hi: UNIT });

    for (let i = 0; i < 12; i++) {
        const base = 1n << BigInt(i);
        const lo = base * UNIT;
        const hi = base * 16n * UNIT;
        boundaries.push({ lo, hi });
    }

    return boundaries;
}

/**
 * Create an empty deposit pool with standard buckets.
 */
export function createPool(): DepositPoolStats {
    const boundaries = standardBucketBoundaries();
    return {
        buckets: boundaries.map(({ lo, hi }) => ({
            lo,
            hi,
            count: 0,
            sumAmounts: 0n,
            sumAmountsSquared: 0n,
        })),
    };
}

/**
 * Add a deposit to the pool. The deposit is added to ALL buckets whose range contains the amount.
 */
export function addDeposit(pool: DepositPoolStats, amount: bigint): void {
    for (const bucket of pool.buckets) {
        if (amount >= bucket.lo && amount < bucket.hi) {
            bucket.count += 1;
            bucket.sumAmounts += amount;
            bucket.sumAmountsSquared += amount * amount;
        }
    }
}

/**
 * Remove a deposit from the pool.
 */
export function removeDeposit(pool: DepositPoolStats, amount: bigint): void {
    for (const bucket of pool.buckets) {
        if (amount >= bucket.lo && amount < bucket.hi) {
            bucket.count = Math.max(0, bucket.count - 1);
            bucket.sumAmounts -= amount;
            bucket.sumAmountsSquared -= amount * amount;
            if (bucket.sumAmounts < 0n) bucket.sumAmounts = 0n;
            if (bucket.sumAmountsSquared < 0n) bucket.sumAmountsSquared = 0n;
        }
    }
}

/**
 * Tracks per-account deposits so they can be correctly removed from the pool
 * when an account stops being deposit-only.
 *
 * Stores individual deposit amounts per account. When an account is invalidated
 * (sends a transaction), each deposit is removed from the pool individually,
 * ensuring the correct buckets are decremented.
 */
export function serializeDeposits(deposits: bigint[]): string {
    return JSON.stringify(deposits.map(String));
}

export function deserializeDeposits(json: string): bigint[] {
    if (!json || json === "[]") return [];
    return (JSON.parse(json) as string[]).map(BigInt);
}

export class DepositTracker {
    private accountDeposits = new Map<string, bigint[]>();

    constructor(private pool: DepositPoolStats) {}

    hydrateAccount(accountId: string, deposits: bigint[]): void {
        if (deposits.length > 0) {
            this.accountDeposits.set(accountId, [...deposits]);
        }
    }

    trackDeposit(accountId: string, amount: bigint): void {
        addDeposit(this.pool, amount);
        const deposits = this.accountDeposits.get(accountId) ?? [];
        deposits.push(amount);
        this.accountDeposits.set(accountId, deposits);
    }

    removeAccountDeposits(accountId: string): void {
        const deposits = this.accountDeposits.get(accountId);
        if (!deposits) return;
        for (const amount of deposits) {
            removeDeposit(this.pool, amount);
        }
        this.accountDeposits.delete(accountId);
    }

    getDeposits(accountId: string): bigint[] {
        return this.accountDeposits.get(accountId) ?? [];
    }

    getPool(): DepositPoolStats {
        return this.pool;
    }
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17).
 */
export function normalCdf(z: number): number {
    if (z < -8) return 0;
    if (z > 8) return 1;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

/**
 * Compute log2(C(n, k)) iteratively without overflow.
 */
export function log2Binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 0;

    const kk = Math.min(k, n - k);
    let result = 0;
    for (let i = 0; i < kk; i++) {
        result += Math.log2(n - i) - Math.log2(i + 1);
    }
    return result;
}

/**
 * Select the best bucket for a given target amount.
 *
 * We choose the bucket that contains the target and where the target
 * is closest to the top of the bucket's range. This ensures:
 * - Deposits in the bucket are not larger than the target (no subtracting)
 * - Multiple deposits from the bucket can plausibly sum to the target
 * - The bucket with the tightest fit is preferred
 */
export function selectBucket(pool: DepositPoolStats, target: bigint): PoolBucket | null {
    let best: PoolBucket | null = null;
    let bestHeadroom = -1n;

    for (const bucket of pool.buckets) {
        if (bucket.count === 0) continue;
        if (target >= bucket.lo && target < bucket.hi) {
            const headroom = bucket.hi - target;
            if (bestHeadroom < 0n || headroom < bestHeadroom) {
                best = bucket;
                bestHeadroom = headroom;
            }
        }
    }

    return best;
}

/**
 * Compute the privacy score for a wormhole output.
 *
 * Selects a single bucket of deposits at the right order of magnitude,
 * then uses CLT across all k values within that bucket.
 *
 * @param outputAmount - Total output amount in token units
 * @param dist - Amount sacrifice for privacy (token units)
 * @param pool - Bucketed deposit pool statistics
 * @param feeBps - Volume fee in basis points (e.g., 10)
 * @param kMin - Minimum subset size
 * @param kMax - Maximum subset size (batch size)
 * @returns Privacy score in bits
 */
export function privacyScore(
    outputAmount: bigint,
    dist: bigint,
    pool: DepositPoolStats,
    feeBps: number,
    kMin: number,
    kMax: number,
): number {
    const feeDenom = BigInt(10000 - feeBps);
    const inputLo = (outputAmount * 10000n) / feeDenom;
    const inputHi = ((outputAmount + dist) * 10000n) / feeDenom;

    const bucket = selectBucket(pool, inputLo);
    if (!bucket || bucket.count === 0) return 0;

    const D = bucket.count;
    const Db = BigInt(D);
    const mu = Number(bucket.sumAmounts / Db) + Number(bucket.sumAmounts % Db) / D;
    const meanSq = Number(bucket.sumAmountsSquared / Db) + Number(bucket.sumAmountsSquared % Db) / D;
    const variance = meanSq - mu * mu;
    const sigma = Math.sqrt(Math.max(0, variance));

    if (sigma === 0) return 0;

    const effectiveKMax = Math.min(kMax, D);
    if (kMin > effectiveKMax) return 0;

    const inputLoNum = Number(inputLo);
    const inputHiNum = Number(inputHi);

    let maxLogTerm = -Infinity;
    const logTerms: number[] = [];

    for (let k = kMin; k <= effectiveKMax; k++) {
        const sumMean = k * mu;
        const sumStd = sigma * Math.sqrt(k);

        const zLo = (inputLoNum - sumMean) / sumStd;
        const zHi = (inputHiNum - sumMean) / sumStd;
        const pK = normalCdf(zHi) - normalCdf(zLo);

        if (pK <= 0) continue;

        const logBinom = log2Binomial(D, k);
        const logP = Math.log2(pK);
        const logTerm = logBinom + logP;

        logTerms.push(logTerm);
        if (logTerm > maxLogTerm) maxLogTerm = logTerm;
    }

    if (logTerms.length === 0) return 0;

    let sumExp = 0;
    for (const lt of logTerms) {
        sumExp += Math.pow(2, lt - maxLogTerm);
    }

    return Math.max(0, maxLogTerm + Math.log2(sumExp));
}

/**
 * Compute privacy scores at multiple dist levels.
 * @param distPermyriad - dist fractions as per-10000 integers (e.g., [0, 10, 100, 500] for 0%, 0.1%, 1%, 5%)
 */
export function privacyScoreTable(
    outputAmount: bigint,
    pool: DepositPoolStats,
    feeBps: number,
    kMin: number,
    kMax: number,
    distPermyriad: number[] = [0, 10, 100, 500],
): PrivacyScoreResult[] {
    return distPermyriad.map((pm) => {
        const dist = (outputAmount * BigInt(pm)) / 10000n;
        const bits = privacyScore(outputAmount, dist, pool, feeBps, kMin, kMax);
        return {
            dist,
            scoreBits: Math.round(bits * 10) / 10,
            label: scoreLabel(bits),
        };
    });
}

/**
 * Find the minimum dist needed to achieve a target privacy score.
 */
export function findMinDist(
    outputAmount: bigint,
    pool: DepositPoolStats,
    feeBps: number,
    kMin: number,
    kMax: number,
    targetBits: number,
    maxDistPermyriad: number = 1000,
): bigint | null {
    const maxDist = (outputAmount * BigInt(maxDistPermyriad)) / 10000n;

    if (privacyScore(outputAmount, maxDist, pool, feeBps, kMin, kMax) < targetBits) {
        return null;
    }

    if (privacyScore(outputAmount, 0n, pool, feeBps, kMin, kMax) >= targetBits) {
        return 0n;
    }

    let lo = 0n;
    let hi = maxDist;
    while (hi - lo > 1n) {
        const mid = (lo + hi) / 2n;
        if (privacyScore(outputAmount, mid, pool, feeBps, kMin, kMax) >= targetBits) {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    return hi;
}

/**
 * Human-readable label for a privacy score.
 */
export function scoreLabel(bits: number): string {
    if (bits < 10) return "Critical";
    if (bits < 20) return "Weak";
    if (bits < 40) return "Moderate";
    if (bits < 60) return "Strong";
    return "Very Strong";
}

/**
 * Serialize pool stats to JSON (for storage/API).
 */
export function poolToJson(pool: DepositPoolStats): string {
    return JSON.stringify(
        pool.buckets.map((b) => ({
            lo: b.lo.toString(),
            hi: b.hi.toString(),
            count: b.count,
            sumAmounts: b.sumAmounts.toString(),
            sumAmountsSquared: b.sumAmountsSquared.toString(),
        })),
    );
}

/**
 * Deserialize pool stats from JSON.
 */
export function poolFromJson(json: string): DepositPoolStats {
    const buckets = JSON.parse(json);
    return {
        buckets: buckets.map(
            (b: { lo: string; hi: string; count: number; sumAmounts: string; sumAmountsSquared: string }) => ({
                lo: BigInt(b.lo),
                hi: BigInt(b.hi),
                count: b.count,
                sumAmounts: BigInt(b.sumAmounts),
                sumAmountsSquared: BigInt(b.sumAmountsSquared),
            }),
        ),
    };
}
