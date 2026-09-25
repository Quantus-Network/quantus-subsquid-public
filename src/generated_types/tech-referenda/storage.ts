import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v126 from '../v126'
import * as v148 from '../v148'

export const referendumInfoFor =  {
    /**
     *  Information concerning any given referendum.
     */
    v126: new StorageType('TechReferenda.ReferendumInfoFor', 'Optional', [sts.number()], v126.Type_219) as ReferendumInfoForV126,
    /**
     *  Information concerning any given referendum.
     */
    v148: new StorageType('TechReferenda.ReferendumInfoFor', 'Optional', [sts.number()], v148.ReferendumInfo) as ReferendumInfoForV148,
}

/**
 *  Information concerning any given referendum.
 */
export interface ReferendumInfoForV126  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: number): Promise<(v126.Type_219 | undefined)>
    getMany(block: Block, keys: number[]): Promise<(v126.Type_219 | undefined)[]>
    getKeys(block: Block): Promise<number[]>
    getKeys(block: Block, key: number): Promise<number[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<number[]>
    getKeysPaged(pageSize: number, block: Block, key: number): AsyncIterable<number[]>
    getPairs(block: Block): Promise<[k: number, v: (v126.Type_219 | undefined)][]>
    getPairs(block: Block, key: number): Promise<[k: number, v: (v126.Type_219 | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: number, v: (v126.Type_219 | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: number): AsyncIterable<[k: number, v: (v126.Type_219 | undefined)][]>
}

/**
 *  Information concerning any given referendum.
 */
export interface ReferendumInfoForV148  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: number): Promise<(v148.ReferendumInfo | undefined)>
    getMany(block: Block, keys: number[]): Promise<(v148.ReferendumInfo | undefined)[]>
    getKeys(block: Block): Promise<number[]>
    getKeys(block: Block, key: number): Promise<number[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<number[]>
    getKeysPaged(pageSize: number, block: Block, key: number): AsyncIterable<number[]>
    getPairs(block: Block): Promise<[k: number, v: (v148.ReferendumInfo | undefined)][]>
    getPairs(block: Block, key: number): Promise<[k: number, v: (v148.ReferendumInfo | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: number, v: (v148.ReferendumInfo | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: number): AsyncIterable<[k: number, v: (v148.ReferendumInfo | undefined)][]>
}

export const metadataOf =  {
    /**
     *  The metadata is a general information concerning the referendum.
     *  The `Hash` refers to the preimage of the `Preimages` provider which can be a JSON
     *  dump or IPFS hash of a JSON file.
     * 
     *  Consider a garbage collection for a metadata of finished referendums to `unrequest` (remove)
     *  large preimages.
     */
    v126: new StorageType('TechReferenda.MetadataOf', 'Optional', [sts.number()], v126.H256) as MetadataOfV126,
}

/**
 *  The metadata is a general information concerning the referendum.
 *  The `Hash` refers to the preimage of the `Preimages` provider which can be a JSON
 *  dump or IPFS hash of a JSON file.
 * 
 *  Consider a garbage collection for a metadata of finished referendums to `unrequest` (remove)
 *  large preimages.
 */
export interface MetadataOfV126  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: number): Promise<(v126.H256 | undefined)>
    getMany(block: Block, keys: number[]): Promise<(v126.H256 | undefined)[]>
    getKeys(block: Block): Promise<number[]>
    getKeys(block: Block, key: number): Promise<number[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<number[]>
    getKeysPaged(pageSize: number, block: Block, key: number): AsyncIterable<number[]>
    getPairs(block: Block): Promise<[k: number, v: (v126.H256 | undefined)][]>
    getPairs(block: Block, key: number): Promise<[k: number, v: (v126.H256 | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: number, v: (v126.H256 | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: number): AsyncIterable<[k: number, v: (v126.H256 | undefined)][]>
}
