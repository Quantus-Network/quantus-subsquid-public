import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v126 from '../v126'
import * as v131 from '../v131'

export const pendingTransfers =  {
    /**
     *  Stores the details of pending transactions scheduled for delayed execution.
     *  Keyed by the unique transaction ID.
     */
    v126: new StorageType('ReversibleTransfers.PendingTransfers', 'Optional', [v126.H256], v126.PendingTransfer) as PendingTransfersV126,
    /**
     *  Stores the details of pending transactions scheduled for delayed execution.
     *  Keyed by the unique transaction ID.
     */
    v131: new StorageType('ReversibleTransfers.PendingTransfers', 'Optional', [v131.H256], v131.PendingTransfer) as PendingTransfersV131,
}

/**
 *  Stores the details of pending transactions scheduled for delayed execution.
 *  Keyed by the unique transaction ID.
 */
export interface PendingTransfersV126  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: v126.H256): Promise<(v126.PendingTransfer | undefined)>
    getMany(block: Block, keys: v126.H256[]): Promise<(v126.PendingTransfer | undefined)[]>
    getKeys(block: Block): Promise<v126.H256[]>
    getKeys(block: Block, key: v126.H256): Promise<v126.H256[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<v126.H256[]>
    getKeysPaged(pageSize: number, block: Block, key: v126.H256): AsyncIterable<v126.H256[]>
    getPairs(block: Block): Promise<[k: v126.H256, v: (v126.PendingTransfer | undefined)][]>
    getPairs(block: Block, key: v126.H256): Promise<[k: v126.H256, v: (v126.PendingTransfer | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: v126.H256, v: (v126.PendingTransfer | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: v126.H256): AsyncIterable<[k: v126.H256, v: (v126.PendingTransfer | undefined)][]>
}

/**
 *  Stores the details of pending transactions scheduled for delayed execution.
 *  Keyed by the unique transaction ID.
 */
export interface PendingTransfersV131  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: v131.H256): Promise<(v131.PendingTransfer | undefined)>
    getMany(block: Block, keys: v131.H256[]): Promise<(v131.PendingTransfer | undefined)[]>
    getKeys(block: Block): Promise<v131.H256[]>
    getKeys(block: Block, key: v131.H256): Promise<v131.H256[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<v131.H256[]>
    getKeysPaged(pageSize: number, block: Block, key: v131.H256): AsyncIterable<v131.H256[]>
    getPairs(block: Block): Promise<[k: v131.H256, v: (v131.PendingTransfer | undefined)][]>
    getPairs(block: Block, key: v131.H256): Promise<[k: v131.H256, v: (v131.PendingTransfer | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: v131.H256, v: (v131.PendingTransfer | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: v131.H256): AsyncIterable<[k: v131.H256, v: (v131.PendingTransfer | undefined)][]>
}
