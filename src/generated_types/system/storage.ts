import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const account =  {
    /**
     *  The full account information for a particular account ID.
     */
    v126: new StorageType('System.Account', 'Default', [v126.AccountId32], v126.AccountInfo) as AccountV126,
}

/**
 *  The full account information for a particular account ID.
 */
export interface AccountV126  {
    is(block: RuntimeCtx): boolean
    getDefault(block: Block): v126.AccountInfo
    get(block: Block, key: v126.AccountId32): Promise<(v126.AccountInfo | undefined)>
    getMany(block: Block, keys: v126.AccountId32[]): Promise<(v126.AccountInfo | undefined)[]>
    getKeys(block: Block): Promise<v126.AccountId32[]>
    getKeys(block: Block, key: v126.AccountId32): Promise<v126.AccountId32[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<v126.AccountId32[]>
    getKeysPaged(pageSize: number, block: Block, key: v126.AccountId32): AsyncIterable<v126.AccountId32[]>
    getPairs(block: Block): Promise<[k: v126.AccountId32, v: (v126.AccountInfo | undefined)][]>
    getPairs(block: Block, key: v126.AccountId32): Promise<[k: v126.AccountId32, v: (v126.AccountInfo | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: v126.AccountId32, v: (v126.AccountInfo | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: v126.AccountId32): AsyncIterable<[k: v126.AccountId32, v: (v126.AccountInfo | undefined)][]>
}
