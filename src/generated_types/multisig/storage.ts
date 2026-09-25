import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v126 from '../v126'
import * as v131 from '../v131'

export const proposals =  {
    /**
     *  Proposals indexed by (multisig_address, proposal_nonce)
     */
    v126: new StorageType('Multisig.Proposals', 'Optional', [v126.AccountId32, sts.number()], v126.ProposalData) as ProposalsV126,
    /**
     *  Proposals indexed by (multisig_address, proposal_nonce)
     */
    v131: new StorageType('Multisig.Proposals', 'Optional', [v131.AccountId32, sts.number()], v131.ProposalData) as ProposalsV131,
}

/**
 *  Proposals indexed by (multisig_address, proposal_nonce)
 */
export interface ProposalsV126  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key1: v126.AccountId32, key2: number): Promise<(v126.ProposalData | undefined)>
    getMany(block: Block, keys: [v126.AccountId32, number][]): Promise<(v126.ProposalData | undefined)[]>
    getKeys(block: Block): Promise<[v126.AccountId32, number][]>
    getKeys(block: Block, key1: v126.AccountId32): Promise<[v126.AccountId32, number][]>
    getKeys(block: Block, key1: v126.AccountId32, key2: number): Promise<[v126.AccountId32, number][]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<[v126.AccountId32, number][]>
    getKeysPaged(pageSize: number, block: Block, key1: v126.AccountId32): AsyncIterable<[v126.AccountId32, number][]>
    getKeysPaged(pageSize: number, block: Block, key1: v126.AccountId32, key2: number): AsyncIterable<[v126.AccountId32, number][]>
    getPairs(block: Block): Promise<[k: [v126.AccountId32, number], v: (v126.ProposalData | undefined)][]>
    getPairs(block: Block, key1: v126.AccountId32): Promise<[k: [v126.AccountId32, number], v: (v126.ProposalData | undefined)][]>
    getPairs(block: Block, key1: v126.AccountId32, key2: number): Promise<[k: [v126.AccountId32, number], v: (v126.ProposalData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: [v126.AccountId32, number], v: (v126.ProposalData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key1: v126.AccountId32): AsyncIterable<[k: [v126.AccountId32, number], v: (v126.ProposalData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key1: v126.AccountId32, key2: number): AsyncIterable<[k: [v126.AccountId32, number], v: (v126.ProposalData | undefined)][]>
}

/**
 *  Proposals indexed by (multisig_address, proposal_nonce)
 */
export interface ProposalsV131  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key1: v131.AccountId32, key2: number): Promise<(v131.ProposalData | undefined)>
    getMany(block: Block, keys: [v131.AccountId32, number][]): Promise<(v131.ProposalData | undefined)[]>
    getKeys(block: Block): Promise<[v131.AccountId32, number][]>
    getKeys(block: Block, key1: v131.AccountId32): Promise<[v131.AccountId32, number][]>
    getKeys(block: Block, key1: v131.AccountId32, key2: number): Promise<[v131.AccountId32, number][]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<[v131.AccountId32, number][]>
    getKeysPaged(pageSize: number, block: Block, key1: v131.AccountId32): AsyncIterable<[v131.AccountId32, number][]>
    getKeysPaged(pageSize: number, block: Block, key1: v131.AccountId32, key2: number): AsyncIterable<[v131.AccountId32, number][]>
    getPairs(block: Block): Promise<[k: [v131.AccountId32, number], v: (v131.ProposalData | undefined)][]>
    getPairs(block: Block, key1: v131.AccountId32): Promise<[k: [v131.AccountId32, number], v: (v131.ProposalData | undefined)][]>
    getPairs(block: Block, key1: v131.AccountId32, key2: number): Promise<[k: [v131.AccountId32, number], v: (v131.ProposalData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: [v131.AccountId32, number], v: (v131.ProposalData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key1: v131.AccountId32): AsyncIterable<[k: [v131.AccountId32, number], v: (v131.ProposalData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key1: v131.AccountId32, key2: number): AsyncIterable<[k: [v131.AccountId32, number], v: (v131.ProposalData | undefined)][]>
}
