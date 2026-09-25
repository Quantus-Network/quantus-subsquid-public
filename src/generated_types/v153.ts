import {sts, Result, Option, Bytes, BitSequence} from './support'

export type LaunchAnchor = LaunchAnchor_Anchored | LaunchAnchor_Pending

export interface LaunchAnchor_Anchored {
    __kind: 'Anchored'
    value: bigint
}

export interface LaunchAnchor_Pending {
    __kind: 'Pending'
}

export const LaunchAnchor: sts.Type<LaunchAnchor> = sts.closedEnum(() => {
    return  {
        Anchored: sts.bigint(),
        Pending: sts.unit(),
    }
})
