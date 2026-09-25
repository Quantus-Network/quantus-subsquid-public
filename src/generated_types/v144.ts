import {sts, Result, Option, Bytes, BitSequence} from './support'

export interface VestingSchedule {
    beneficiary: AccountId32
    start: bigint
    cliff: bigint
    end: bigint
    total: bigint
    claimed: bigint
    lastClaimAt?: (bigint | undefined)
}

export type AccountId32 = Bytes

export const VestingSchedule: sts.Type<VestingSchedule> = sts.struct(() => {
    return  {
        beneficiary: AccountId32,
        start: sts.bigint(),
        cliff: sts.bigint(),
        end: sts.bigint(),
        total: sts.bigint(),
        claimed: sts.bigint(),
        lastClaimAt: sts.option(() => sts.bigint()),
    }
})

export const AccountId32 = sts.bytes()
