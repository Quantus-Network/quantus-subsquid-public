import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v126 from '../v126'
import * as v131 from '../v131'

export const highSecuritySet =  {
    name: 'ReversibleTransfers.HighSecuritySet',
    /**
     * A user has enabled their high-security settings.
     * [who, interceptor, recoverer, delay]
     */
    v126: new EventType(
        'ReversibleTransfers.HighSecuritySet',
        sts.struct({
            who: v126.AccountId32,
            interceptor: v126.AccountId32,
            delay: v126.BlockNumberOrTimestamp,
        })
    ),
    /**
     * A user has enabled their high-security settings.
     */
    v131: new EventType(
        'ReversibleTransfers.HighSecuritySet',
        sts.struct({
            who: v131.AccountId32,
            /**
             * The guardian who can cancel transfers and recover funds.
             */
            guardian: v131.AccountId32,
            delay: v131.BlockNumberOrTimestamp,
        })
    ),
}

export const transactionScheduled =  {
    name: 'ReversibleTransfers.TransactionScheduled',
    /**
     * A transaction has been intercepted and scheduled for delayed execution.
     * [from, to, interceptor, amount, tx_id, execute_at_moment]
     */
    v126: new EventType(
        'ReversibleTransfers.TransactionScheduled',
        sts.struct({
            from: v126.AccountId32,
            to: v126.AccountId32,
            interceptor: v126.AccountId32,
            assetId: sts.option(() => sts.number()),
            amount: sts.bigint(),
            txId: v126.H256,
            executeAt: v126.Type_101,
        })
    ),
    /**
     * A transaction has been scheduled for delayed execution.
     */
    v131: new EventType(
        'ReversibleTransfers.TransactionScheduled',
        sts.struct({
            from: v131.AccountId32,
            to: v131.AccountId32,
            /**
             * The guardian who can cancel this transfer.
             */
            guardian: v131.AccountId32,
            assetId: sts.option(() => sts.number()),
            amount: sts.bigint(),
            txId: v131.H256,
            executeAt: v131.Type_102,
        })
    ),
}

export const transactionCancelled =  {
    name: 'ReversibleTransfers.TransactionCancelled',
    /**
     * A scheduled transaction has been successfully cancelled by the owner.
     */
    v126: new EventType(
        'ReversibleTransfers.TransactionCancelled',
        sts.struct({
            who: v126.AccountId32,
            txId: v126.H256,
        })
    ),
}

export const transactionExecuted =  {
    name: 'ReversibleTransfers.TransactionExecuted',
    /**
     * A scheduled transaction was executed by the scheduler.
     */
    v126: new EventType(
        'ReversibleTransfers.TransactionExecuted',
        sts.struct({
            txId: v126.H256,
            result: sts.result(() => v126.PostDispatchInfo, () => v126.DispatchErrorWithPostInfo),
        })
    ),
}
