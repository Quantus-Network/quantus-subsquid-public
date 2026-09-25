import {sts, Block, Bytes, Option, Result, StorageType, RuntimeCtx} from '../support'
import * as v144 from '../v144'
import * as v153 from '../v153'

export const schedules =  {
    /**
     *  All vesting schedules by id. A beneficiary may appear in any number of entries.
     */
    v144: new StorageType('Vesting.Schedules', 'Optional', [sts.bigint()], v144.VestingSchedule) as SchedulesV144,
}

/**
 *  All vesting schedules by id. A beneficiary may appear in any number of entries.
 */
export interface SchedulesV144  {
    is(block: RuntimeCtx): boolean
    get(block: Block, key: bigint): Promise<(v144.VestingSchedule | undefined)>
    getMany(block: Block, keys: bigint[]): Promise<(v144.VestingSchedule | undefined)[]>
    getKeys(block: Block): Promise<bigint[]>
    getKeys(block: Block, key: bigint): Promise<bigint[]>
    getKeysPaged(pageSize: number, block: Block): AsyncIterable<bigint[]>
    getKeysPaged(pageSize: number, block: Block, key: bigint): AsyncIterable<bigint[]>
    getPairs(block: Block): Promise<[k: bigint, v: (v144.VestingSchedule | undefined)][]>
    getPairs(block: Block, key: bigint): Promise<[k: bigint, v: (v144.VestingSchedule | undefined)][]>
    getPairsPaged(pageSize: number, block: Block): AsyncIterable<[k: bigint, v: (v144.VestingSchedule | undefined)][]>
    getPairsPaged(pageSize: number, block: Block, key: bigint): AsyncIterable<[k: bigint, v: (v144.VestingSchedule | undefined)][]>
}

export const launch =  {
    v153: new StorageType('Vesting.Launch', 'Optional', [], v153.LaunchAnchor) as LaunchV153,
}

export interface LaunchV153  {
    is(block: RuntimeCtx): boolean
    get(block: Block): Promise<(v153.LaunchAnchor | undefined)>
}
