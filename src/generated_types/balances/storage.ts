import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const totalIssuance =  {
    /**
     *  The total units issued in the system.
     */
    v126: new StorageType('Balances.TotalIssuance', 'Default', [], sts.bigint()) as TotalIssuanceV126,
}

/**
 *  The total units issued in the system.
 */
export interface TotalIssuanceV126  {
    is(block: RuntimeCtx): boolean
    getDefault(block: Block): bigint
    get(block: Block): Promise<(bigint | undefined)>
}

export const account =  {
    /**
     *  The Balances pallet example of storing the balance of an account.
     * 
     *  # Example
     * 
     *  ```nocompile
     *   impl pallet_balances::Config for Runtime {
     *     type AccountStore = StorageMapShim<Self::Account<Runtime>, frame_system::Provider<Runtime>, AccountId, Self::AccountData<Balance>>
     *   }
     *  ```
     * 
     *  You can also store the balance of an account in the `System` pallet.
     * 
     *  # Example
     * 
     *  ```nocompile
     *   impl pallet_balances::Config for Runtime {
     *    type AccountStore = System
     *   }
     *  ```
     * 
     *  But this comes with tradeoffs, storing account balances in the system pallet stores
     *  `frame_system` data alongside the account data contrary to storing account balances in the
     *  `Balances` pallet, which uses a `StorageMap` to store balances data only.
     *  NOTE: This is only used in the case that this pallet is used to store balances.
     */
    v126: new StorageType('Balances.Account', 'Default', [v126.AccountId32], v126.AccountData) as AccountV126,
}

/**
 *  The Balances pallet example of storing the balance of an account.
 * 
 *  # Example
 * 
 *  ```nocompile
 *   impl pallet_balances::Config for Runtime {
 *     type AccountStore = StorageMapShim<Self::Account<Runtime>, frame_system::Provider<Runtime>, AccountId, Self::AccountData<Balance>>
 *   }
 *  ```
 * 
 *  You can also store the balance of an account in the `System` pallet.
 * 
 *  # Example
 * 
 *  ```nocompile
 *   impl pallet_balances::Config for Runtime {
 *    type AccountStore = System
 *   }
 *  ```
 * 
 *  But this comes with tradeoffs, storing account balances in the system pallet stores
 *  `frame_system` data alongside the account data contrary to storing account balances in the
 *  `Balances` pallet, which uses a `StorageMap` to store balances data only.
 *  NOTE: This is only used in the case that this pallet is used to store balances.
 */
export interface AccountV126  {
    is(block: RuntimeCtx): boolean
    getDefault(block: Block): v126.AccountData
    get(block: Block, key: v126.AccountId32): Promise<(v126.AccountData | undefined)>
    getMany(block: Block, keys: v126.AccountId32[]): Promise<(v126.AccountData | undefined)[]>
    getKeys(block: Block): Promise<v126.AccountId32[]>
    getKeys(block: Block, key: v126.AccountId32): Promise<v126.AccountId32[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<v126.AccountId32[]>
    getKeysPaged(pageSize: number, block: Block, key: v126.AccountId32): AsyncIterable<v126.AccountId32[]>
    getPairs(block: Block): Promise<[k: v126.AccountId32, v: (v126.AccountData | undefined)][]>
    getPairs(block: Block, key: v126.AccountId32): Promise<[k: v126.AccountId32, v: (v126.AccountData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: v126.AccountId32, v: (v126.AccountData | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: v126.AccountId32): AsyncIterable<[k: v126.AccountId32, v: (v126.AccountData | undefined)][]>
}

export const holds =  {
    /**
     *  Holds on account balances.
     */
    v126: new StorageType('Balances.Holds', 'Default', [v126.AccountId32], sts.array(() => v126.IdAmount)) as HoldsV126,
}

/**
 *  Holds on account balances.
 */
export interface HoldsV126  {
    is(block: RuntimeCtx): boolean
    getDefault(block: Block): v126.IdAmount[]
    get(block: Block, key: v126.AccountId32): Promise<(v126.IdAmount[] | undefined)>
    getMany(block: Block, keys: v126.AccountId32[]): Promise<(v126.IdAmount[] | undefined)[]>
    getKeys(block: Block): Promise<v126.AccountId32[]>
    getKeys(block: Block, key: v126.AccountId32): Promise<v126.AccountId32[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<v126.AccountId32[]>
    getKeysPaged(pageSize: number, block: Block, key: v126.AccountId32): AsyncIterable<v126.AccountId32[]>
    getPairs(block: Block): Promise<[k: v126.AccountId32, v: (v126.IdAmount[] | undefined)][]>
    getPairs(block: Block, key: v126.AccountId32): Promise<[k: v126.AccountId32, v: (v126.IdAmount[] | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: v126.AccountId32, v: (v126.IdAmount[] | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: v126.AccountId32): AsyncIterable<[k: v126.AccountId32, v: (v126.IdAmount[] | undefined)][]>
}
