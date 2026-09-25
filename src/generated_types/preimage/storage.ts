import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const requestStatusFor =  {
    /**
     *  The request status of a given hash.
     */
    v126: new StorageType('Preimage.RequestStatusFor', 'Optional', [v126.H256], v126.RequestStatus) as RequestStatusForV126,
}

/**
 *  The request status of a given hash.
 */
export interface RequestStatusForV126  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: v126.H256): Promise<(v126.RequestStatus | undefined)>
    getMany(block: Block, keys: v126.H256[]): Promise<(v126.RequestStatus | undefined)[]>
    getKeys(block: Block): Promise<v126.H256[]>
    getKeys(block: Block, key: v126.H256): Promise<v126.H256[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<v126.H256[]>
    getKeysPaged(pageSize: number, block: Block, key: v126.H256): AsyncIterable<v126.H256[]>
    getPairs(block: Block): Promise<[k: v126.H256, v: (v126.RequestStatus | undefined)][]>
    getPairs(block: Block, key: v126.H256): Promise<[k: v126.H256, v: (v126.RequestStatus | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: v126.H256, v: (v126.RequestStatus | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: v126.H256): AsyncIterable<[k: v126.H256, v: (v126.RequestStatus | undefined)][]>
}

export const preimageFor =  {
    v126: new StorageType('Preimage.PreimageFor', 'Optional', [sts.tuple(() => [v126.H256, sts.number()])], sts.bytes()) as PreimageForV126,
}

export interface PreimageForV126  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: [v126.H256, number]): Promise<(Bytes | undefined)>
    getMany(block: Block, keys: [v126.H256, number][]): Promise<(Bytes | undefined)[]>
    getKeys(block: Block): Promise<[v126.H256, number][]>
    getKeys(block: Block, key: [v126.H256, number]): Promise<[v126.H256, number][]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<[v126.H256, number][]>
    getKeysPaged(pageSize: number, block: Block, key: [v126.H256, number]): AsyncIterable<[v126.H256, number][]>
    getPairs(block: Block): Promise<[k: [v126.H256, number], v: (Bytes | undefined)][]>
    getPairs(block: Block, key: [v126.H256, number]): Promise<[k: [v126.H256, number], v: (Bytes | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: [v126.H256, number], v: (Bytes | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: [v126.H256, number]): AsyncIterable<[k: [v126.H256, number], v: (Bytes | undefined)][]>
}
