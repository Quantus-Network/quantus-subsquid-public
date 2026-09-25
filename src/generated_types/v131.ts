import {sts, Result, Option, Bytes, BitSequence} from './support'

export type AccountId32 = Bytes

export interface ProposalData {
    proposer: AccountId32
    call: BoundedVec
    expiry: number
    approvals: AccountId32[]
    deposit: bigint
    status: ProposalStatus
}

export type ProposalStatus = ProposalStatus_Active | ProposalStatus_Approved

export interface ProposalStatus_Active {
    __kind: 'Active'
}

export interface ProposalStatus_Approved {
    __kind: 'Approved'
}

export type BoundedVec = Bytes

export const ProposalData: sts.Type<ProposalData> = sts.struct(() => {
    return  {
        proposer: AccountId32,
        call: BoundedVec,
        expiry: sts.number(),
        approvals: sts.array(() => AccountId32),
        deposit: sts.bigint(),
        status: ProposalStatus,
    }
})

export const ProposalStatus: sts.Type<ProposalStatus> = sts.closedEnum(() => {
    return  {
        Active: sts.unit(),
        Approved: sts.unit(),
    }
})

export const BoundedVec = sts.bytes()

export type H256 = Bytes

export interface PendingTransfer {
    from: AccountId32
    to: AccountId32
    guardian: AccountId32
    assetId?: (number | undefined)
    amount: bigint
}

export const PendingTransfer: sts.Type<PendingTransfer> = sts.struct(() => {
    return  {
        from: AccountId32,
        to: AccountId32,
        guardian: AccountId32,
        assetId: sts.option(() => sts.number()),
        amount: sts.bigint(),
    }
})

export const Type_102: sts.Type<Type_102> = sts.closedEnum(() => {
    return  {
        After: BlockNumberOrTimestamp,
        At: sts.number(),
    }
})

export type Type_102 = Type_102_After | Type_102_At

export interface Type_102_After {
    __kind: 'After'
    value: BlockNumberOrTimestamp
}

export interface Type_102_At {
    __kind: 'At'
    value: number
}

export type BlockNumberOrTimestamp = BlockNumberOrTimestamp_BlockNumber | BlockNumberOrTimestamp_Timestamp

export interface BlockNumberOrTimestamp_BlockNumber {
    __kind: 'BlockNumber'
    value: number
}

export interface BlockNumberOrTimestamp_Timestamp {
    __kind: 'Timestamp'
    value: bigint
}

export const H256 = sts.bytes()

export const BlockNumberOrTimestamp: sts.Type<BlockNumberOrTimestamp> = sts.closedEnum(() => {
    return  {
        BlockNumber: sts.number(),
        Timestamp: sts.bigint(),
    }
})

export const AccountId32 = sts.bytes()
