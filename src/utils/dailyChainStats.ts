import { In } from "typeorm";
import {
    Block,
    DailyActiveAccount,
    DailyChainStats,
    ExecutedReversibleTransfer,
    Extrinsic,
    Transfer,
    UnifiedTransaction,
    UnifiedTransactionType,
} from "../model";

/** Hashless IMMEDIATE rows are miner/treasury rewards, not user transactions. */
export function isRewardUnifiedTransaction(tx: UnifiedTransaction): boolean {
    return tx.type === UnifiedTransactionType.IMMEDIATE && tx.hash == null;
}

export function countNonRewardUnifiedTransactions(txs: UnifiedTransaction[]): number {
    return txs.reduce((n, tx) => n + (isRewardUnifiedTransaction(tx) ? 0 : 1), 0);
}

/** Transfer.amount when the row has an extrinsic; hashless mints and settlements contribute nothing. */
export function signedTransferAmount(transfer: Transfer): bigint {
    return transfer.extrinsic != null ? transfer.amount : 0n;
}

/**
 * Scheduled amount when TransactionExecuted succeeded, including a transfer to the same account.
 * A failed inner transfer contributes nothing. Fees are excluded.
 */
export function executedReversibleTransferAmount(executed: ExecutedReversibleTransfer): bigint {
    if (executed.scheduledTransfer == null) {
        throw new Error(`ExecutedReversibleTransfer ${executed.id} has no scheduledTransfer`);
    }
    if (executed.result !== "Ok" && executed.result !== "Err") {
        throw new Error(`ExecutedReversibleTransfer ${executed.id} has result ${String(executed.result)}`);
    }
    if (executed.result === "Err") {
        return 0n;
    }
    return executed.scheduledTransfer.amount;
}

/**
 * Batch total of signed transfer amounts plus successful executed reversible amounts.
 * Daily rollup uses the same two helpers, so the all-time sum matches the sum of daily buckets.
 */
export function sumTransferredAmount(transfers: Transfer[], executedReversibles: ExecutedReversibleTransfer[]): bigint {
    let total = 0n;
    for (const transfer of transfers) {
        total += signedTransferAmount(transfer);
    }
    for (const executed of executedReversibles) {
        total += executedReversibleTransferAmount(executed);
    }
    return total;
}

/** UTC calendar day key YYYY-MM-DD. */
export function utcDayId(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function utcDayStart(dayId: string): Date {
    return new Date(`${dayId}T00:00:00.000Z`);
}

export interface DailyRollupDelta {
    blocks: number;
    txs: number;
    /** Distinct Extrinsic.signer ids (signed user activity only). */
    signerIds: Set<string>;
    /** Distinct Transfer.from ids (every transfer row, including hashless ones). */
    senderIds: Set<string>;
    /** Distinct Transfer.to ids (every transfer row, including hashless ones). */
    receiverIds: Set<string>;
    /** Signed Transfer.amount plus successful executed reversible amount, raw token units. Fees excluded. */
    transferredAmount: bigint;
}

/**
 * Accumulate per-UTC-day increments from a processor batch.
 * txCount excludes hashless IMMEDIATE rewards; activeAccounts uses Extrinsic.signer.
 * senderIds / receiverIds mirror Account.transfersFrom / transfersTo so the explorer
 * can count "sent in window" / "received in window" accounts without scanning transfers.
 * transferredAmount is signed Transfer.amount plus successful executed reversible amount (fees excluded).
 */
export function accumulateDailyRollupDeltas(
    blocks: Block[],
    unifiedTransactions: UnifiedTransaction[],
    extrinsics: Extrinsic[],
    transfers: Transfer[],
    executedReversibles: ExecutedReversibleTransfer[],
): Map<string, DailyRollupDelta> {
    const dayDeltas = new Map<string, DailyRollupDelta>();

    const bump = (dayId: string): DailyRollupDelta => {
        let delta = dayDeltas.get(dayId);
        if (!delta) {
            delta = {
                blocks: 0,
                txs: 0,
                signerIds: new Set(),
                senderIds: new Set(),
                receiverIds: new Set(),
                transferredAmount: 0n,
            };
            dayDeltas.set(dayId, delta);
        }
        return delta;
    };

    for (const block of blocks) {
        bump(utcDayId(block.timestamp)).blocks += 1;
    }

    for (const tx of unifiedTransactions) {
        if (isRewardUnifiedTransaction(tx)) continue;
        bump(utcDayId(tx.timestamp)).txs += 1;
    }

    for (const ext of extrinsics) {
        if (ext.signer?.id) {
            bump(utcDayId(ext.timestamp)).signerIds.add(ext.signer.id);
        }
    }

    for (const transfer of transfers) {
        const delta = bump(utcDayId(transfer.timestamp));
        delta.senderIds.add(transfer.from.id);
        delta.receiverIds.add(transfer.to.id);
        delta.transferredAmount += signedTransferAmount(transfer);
    }

    for (const executed of executedReversibles) {
        bump(utcDayId(executed.timestamp)).transferredAmount += executedReversibleTransferAmount(executed);
    }

    return dayDeltas;
}

/** Minimal store surface used by updateDailyChainStats (matches TypeORM Store.findBy). */
export interface DailyRollupStore {
    findBy(entityClass: any, options: { id: any }): Promise<any[]>;
}

type ActivityFlag = "signed" | "sent" | "received";

/**
 * Apply batch deltas to DailyChainStats / DailyActiveAccount.
 *
 * DailyActiveAccount rows are keyed by day + address and carry OR-ed activity flags, so a row
 * touched in an earlier batch is mutated rather than replaced. `activeAccounts` returns every
 * new or changed row (to be upserted); DailyChainStats.activeAccounts only counts accounts
 * whose `signed` flag flips to true, preserving its "distinct signers per day" meaning.
 */
export async function updateDailyChainStats(
    store: DailyRollupStore,
    blocks: Block[],
    unifiedTransactions: UnifiedTransaction[],
    extrinsics: Extrinsic[],
    transfers: Transfer[],
    executedReversibles: ExecutedReversibleTransfer[],
): Promise<{ dailyStats: DailyChainStats[]; activeAccounts: DailyActiveAccount[] }> {
    const dayDeltas = accumulateDailyRollupDeltas(
        blocks,
        unifiedTransactions,
        extrinsics,
        transfers,
        executedReversibles,
    );
    if (dayDeltas.size === 0) {
        return { dailyStats: [], activeAccounts: [] };
    }

    const dayIds = [...dayDeltas.keys()];
    const existingStats = await store.findBy(DailyChainStats, { id: In(dayIds) });
    const statsMap = new Map(existingStats.map((s) => [s.id, s]));

    const touched = new Map<string, { dayId: string; accountId: string; flags: Set<ActivityFlag> }>();
    const touch = (dayId: string, accountId: string, flag: ActivityFlag) => {
        const rowId = `${dayId}:${accountId}`;
        let entry = touched.get(rowId);
        if (!entry) {
            entry = { dayId, accountId, flags: new Set() };
            touched.set(rowId, entry);
        }
        entry.flags.add(flag);
    };
    for (const [dayId, delta] of dayDeltas) {
        for (const addr of delta.signerIds) touch(dayId, addr, "signed");
        for (const addr of delta.senderIds) touch(dayId, addr, "sent");
        for (const addr of delta.receiverIds) touch(dayId, addr, "received");
    }

    const existingRows =
        touched.size > 0 ? await store.findBy(DailyActiveAccount, { id: In([...touched.keys()]) }) : [];
    const rowsById = new Map<string, DailyActiveAccount>(
        existingRows.map((r: DailyActiveAccount): [string, DailyActiveAccount] => [r.id, r]),
    );

    const activeAccounts: DailyActiveAccount[] = [];
    const newSignersByDay = new Map<string, number>();

    for (const [rowId, { dayId, accountId, flags }] of touched) {
        let row = rowsById.get(rowId);
        let changed = false;
        if (!row) {
            row = new DailyActiveAccount({
                id: rowId,
                date: utcDayStart(dayId),
                accountId,
                signed: false,
                sent: false,
                received: false,
            });
            changed = true;
        }

        for (const flag of flags) {
            if (row[flag]) continue;
            row[flag] = true;
            changed = true;
            if (flag === "signed") {
                newSignersByDay.set(dayId, (newSignersByDay.get(dayId) ?? 0) + 1);
            }
        }

        if (changed) activeAccounts.push(row);
    }

    const dailyStats: DailyChainStats[] = [];
    for (const [dayId, delta] of dayDeltas) {
        let stats = statsMap.get(dayId);
        if (!stats) {
            stats = new DailyChainStats({
                id: dayId,
                date: utcDayStart(dayId),
                blocksCount: 0,
                txCount: 0,
                activeAccounts: 0,
                transferredAmount: 0n,
            });
        }

        stats.blocksCount += delta.blocks;
        stats.txCount += delta.txs;
        stats.activeAccounts += newSignersByDay.get(dayId) ?? 0;
        stats.transferredAmount += delta.transferredAmount;
        dailyStats.push(stats);
    }

    return { dailyStats, activeAccounts };
}
