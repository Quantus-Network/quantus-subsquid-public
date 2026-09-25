import {sts, Result, Option, Bytes, BitSequence} from './support'

export const Permill = sts.number()

export const TrackDetails: sts.Type<TrackDetails> = sts.struct(() => {
    return  {
        name: sts.string(),
        maxDeciding: sts.number(),
        decisionDeposit: sts.bigint(),
        preparePeriod: sts.number(),
        decisionPeriod: sts.number(),
        confirmPeriod: sts.number(),
        minEnactmentPeriod: sts.number(),
        minApproval: Curve,
        minSupport: Curve,
    }
})

export const Curve: sts.Type<Curve> = sts.closedEnum(() => {
    return  {
        LinearDecreasing: sts.enumStruct({
            length: Perbill,
            floor: Perbill,
            ceil: Perbill,
        }),
        Reciprocal: sts.enumStruct({
            factor: FixedI64,
            xOffset: FixedI64,
            yOffset: FixedI64,
        }),
        SteppedDecreasing: sts.enumStruct({
            begin: Perbill,
            end: Perbill,
            step: Perbill,
            period: Perbill,
        }),
    }
})

export const FixedI64 = sts.bigint()

export const Perbill = sts.number()

export type Curve = Curve_LinearDecreasing | Curve_Reciprocal | Curve_SteppedDecreasing

export interface Curve_LinearDecreasing {
    __kind: 'LinearDecreasing'
    length: Perbill
    floor: Perbill
    ceil: Perbill
}

export interface Curve_Reciprocal {
    __kind: 'Reciprocal'
    factor: FixedI64
    xOffset: FixedI64
    yOffset: FixedI64
}

export interface Curve_SteppedDecreasing {
    __kind: 'SteppedDecreasing'
    begin: Perbill
    end: Perbill
    step: Perbill
    period: Perbill
}

export type FixedI64 = bigint

export type Perbill = number

export interface TrackDetails {
    name: string
    maxDeciding: number
    decisionDeposit: bigint
    preparePeriod: number
    decisionPeriod: number
    confirmPeriod: number
    minEnactmentPeriod: number
    minApproval: Curve
    minSupport: Curve
}

export interface ProposalData {
    proposer: AccountId32
    call: Bytes
    expiry: number
    approvals: AccountId32[]
    deposit: bigint
    status: ProposalStatus
}

export type ProposalStatus = ProposalStatus_Active | ProposalStatus_Approved | ProposalStatus_Cancelled | ProposalStatus_Executed

export interface ProposalStatus_Active {
    __kind: 'Active'
}

export interface ProposalStatus_Approved {
    __kind: 'Approved'
}

export interface ProposalStatus_Cancelled {
    __kind: 'Cancelled'
}

export interface ProposalStatus_Executed {
    __kind: 'Executed'
}

export const ProposalData: sts.Type<ProposalData> = sts.struct(() => {
    return  {
        proposer: AccountId32,
        call: sts.bytes(),
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
        Cancelled: sts.unit(),
        Executed: sts.unit(),
    }
})

export type Type_219 = Type_219_Approved | Type_219_Cancelled | Type_219_Killed | Type_219_Ongoing | Type_219_Rejected | Type_219_TimedOut

export interface Type_219_Approved {
    __kind: 'Approved'
    value: [number, (Deposit | undefined), (Deposit | undefined)]
}

export interface Type_219_Cancelled {
    __kind: 'Cancelled'
    value: [number, (Deposit | undefined), (Deposit | undefined)]
}

export interface Type_219_Killed {
    __kind: 'Killed'
    value: number
}

export interface Type_219_Ongoing {
    __kind: 'Ongoing'
    value: Type_220
}

export interface Type_219_Rejected {
    __kind: 'Rejected'
    value: [number, (Deposit | undefined), (Deposit | undefined)]
}

export interface Type_219_TimedOut {
    __kind: 'TimedOut'
    value: [number, (Deposit | undefined), (Deposit | undefined)]
}

export interface Type_220 {
    track: number
    origin: OriginCaller
    proposal: Bounded
    enactment: DispatchTime
    submitted: number
    submissionDeposit: Deposit
    decisionDeposit?: (Deposit | undefined)
    deciding?: (DecidingStatus | undefined)
    tally: Type_109
    inQueue: boolean
    alarm?: ([number, [BlockNumberOrTimestamp, number]] | undefined)
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

export interface Type_109 {
    bareAyes: number
    ayes: number
    nays: number
}

export interface DecidingStatus {
    since: number
    confirming?: (number | undefined)
}

export type DispatchTime = DispatchTime_After | DispatchTime_At

export interface DispatchTime_After {
    __kind: 'After'
    value: number
}

export interface DispatchTime_At {
    __kind: 'At'
    value: number
}

export type Bounded = Bounded_Inline | Bounded_Legacy | Bounded_Lookup

export interface Bounded_Inline {
    __kind: 'Inline'
    value: BoundedVec
}

export interface Bounded_Legacy {
    __kind: 'Legacy'
    hash: H256
}

export interface Bounded_Lookup {
    __kind: 'Lookup'
    hash: H256
    len: number
}

export type BoundedVec = Bytes

export type OriginCaller = OriginCaller_system

export interface OriginCaller_system {
    __kind: 'system'
    value: RawOrigin
}

export type RawOrigin = RawOrigin_Authorized | RawOrigin_None | RawOrigin_Root | RawOrigin_Signed

export interface RawOrigin_Authorized {
    __kind: 'Authorized'
}

export interface RawOrigin_None {
    __kind: 'None'
}

export interface RawOrigin_Root {
    __kind: 'Root'
}

export interface RawOrigin_Signed {
    __kind: 'Signed'
    value: AccountId32
}

export interface Deposit {
    who: AccountId32
    amount: bigint
}

export const Type_219: sts.Type<Type_219> = sts.closedEnum(() => {
    return  {
        Approved: sts.tuple(() => [sts.number(), sts.option(() => Deposit), sts.option(() => Deposit)]),
        Cancelled: sts.tuple(() => [sts.number(), sts.option(() => Deposit), sts.option(() => Deposit)]),
        Killed: sts.number(),
        Ongoing: Type_220,
        Rejected: sts.tuple(() => [sts.number(), sts.option(() => Deposit), sts.option(() => Deposit)]),
        TimedOut: sts.tuple(() => [sts.number(), sts.option(() => Deposit), sts.option(() => Deposit)]),
    }
})

export const Type_220: sts.Type<Type_220> = sts.struct(() => {
    return  {
        track: sts.number(),
        origin: OriginCaller,
        proposal: Bounded,
        enactment: DispatchTime,
        submitted: sts.number(),
        submissionDeposit: Deposit,
        decisionDeposit: sts.option(() => Deposit),
        deciding: sts.option(() => DecidingStatus),
        tally: Type_109,
        inQueue: sts.boolean(),
        alarm: sts.option(() => sts.tuple(() => [sts.number(), sts.tuple(() => [BlockNumberOrTimestamp, sts.number()])])),
    }
})

export const DecidingStatus: sts.Type<DecidingStatus> = sts.struct(() => {
    return  {
        since: sts.number(),
        confirming: sts.option(() => sts.number()),
    }
})

export const DispatchTime: sts.Type<DispatchTime> = sts.closedEnum(() => {
    return  {
        After: sts.number(),
        At: sts.number(),
    }
})

export const OriginCaller: sts.Type<OriginCaller> = sts.closedEnum(() => {
    return  {
        system: RawOrigin,
    }
})

export const RawOrigin: sts.Type<RawOrigin> = sts.closedEnum(() => {
    return  {
        Authorized: sts.unit(),
        None: sts.unit(),
        Root: sts.unit(),
        Signed: AccountId32,
    }
})

export const Deposit: sts.Type<Deposit> = sts.struct(() => {
    return  {
        who: AccountId32,
        amount: sts.bigint(),
    }
})

export interface PendingTransfer {
    from: AccountId32
    to: AccountId32
    interceptor: AccountId32
    call: Bounded
    amount: bigint
}

export const PendingTransfer: sts.Type<PendingTransfer> = sts.struct(() => {
    return  {
        from: AccountId32,
        to: AccountId32,
        interceptor: AccountId32,
        call: Bounded,
        amount: sts.bigint(),
    }
})

export type H256 = Bytes

export type RequestStatus = RequestStatus_Requested | RequestStatus_Unrequested

export interface RequestStatus_Requested {
    __kind: 'Requested'
    maybeTicket?: ([AccountId32, PreimageDeposit] | undefined)
    count: number
    maybeLen?: (number | undefined)
}

export interface RequestStatus_Unrequested {
    __kind: 'Unrequested'
    ticket: [AccountId32, PreimageDeposit]
    len: number
}

export interface PreimageDeposit {
    amount: bigint
}

export const RequestStatus: sts.Type<RequestStatus> = sts.closedEnum(() => {
    return  {
        Requested: sts.enumStruct({
            maybeTicket: sts.option(() => sts.tuple(() => [AccountId32, PreimageDeposit])),
            count: sts.number(),
            maybeLen: sts.option(() => sts.number()),
        }),
        Unrequested: sts.enumStruct({
            ticket: sts.tuple(() => [AccountId32, PreimageDeposit]),
            len: sts.number(),
        }),
    }
})

export const PreimageDeposit: sts.Type<PreimageDeposit> = sts.struct(() => {
    return  {
        amount: sts.bigint(),
    }
})

export interface IdAmount {
    id: RuntimeHoldReason
    amount: bigint
}

export type RuntimeHoldReason = RuntimeHoldReason_Preimage | RuntimeHoldReason_ReversibleTransfers

export interface RuntimeHoldReason_Preimage {
    __kind: 'Preimage'
    value: HoldReason
}

export interface RuntimeHoldReason_ReversibleTransfers {
    __kind: 'ReversibleTransfers'
    value: Type_36
}

export type Type_36 = Type_36_ScheduledTransfer

export interface Type_36_ScheduledTransfer {
    __kind: 'ScheduledTransfer'
}

export type HoldReason = HoldReason_Preimage

export interface HoldReason_Preimage {
    __kind: 'Preimage'
}

export const IdAmount: sts.Type<IdAmount> = sts.struct(() => {
    return  {
        id: RuntimeHoldReason,
        amount: sts.bigint(),
    }
})

export const RuntimeHoldReason: sts.Type<RuntimeHoldReason> = sts.closedEnum(() => {
    return  {
        Preimage: HoldReason,
        ReversibleTransfers: Type_36,
    }
})

export const Type_36: sts.Type<Type_36> = sts.closedEnum(() => {
    return  {
        ScheduledTransfer: sts.unit(),
    }
})

export const HoldReason: sts.Type<HoldReason> = sts.closedEnum(() => {
    return  {
        Preimage: sts.unit(),
    }
})

export interface AccountData {
    free: bigint
    reserved: bigint
    frozen: bigint
    flags: ExtraFlags
}

export type ExtraFlags = bigint

export const AccountData: sts.Type<AccountData> = sts.struct(() => {
    return  {
        free: sts.bigint(),
        reserved: sts.bigint(),
        frozen: sts.bigint(),
        flags: ExtraFlags,
    }
})

export const ExtraFlags = sts.bigint()

export type AccountId32 = Bytes

export interface AccountInfo {
    nonce: number
    consumers: number
    providers: number
    sufficients: number
    data: AccountData
}

export const AccountInfo: sts.Type<AccountInfo> = sts.struct(() => {
    return  {
        nonce: sts.number(),
        consumers: sts.number(),
        providers: sts.number(),
        sufficients: sts.number(),
        data: AccountData,
    }
})

export const Type_109: sts.Type<Type_109> = sts.struct(() => {
    return  {
        bareAyes: sts.number(),
        ayes: sts.number(),
        nays: sts.number(),
    }
})

export const Bounded: sts.Type<Bounded> = sts.closedEnum(() => {
    return  {
        Inline: BoundedVec,
        Legacy: sts.enumStruct({
            hash: H256,
        }),
        Lookup: sts.enumStruct({
            hash: H256,
            len: sts.number(),
        }),
    }
})

export const BoundedVec = sts.bytes()

export const DispatchErrorWithPostInfo: sts.Type<DispatchErrorWithPostInfo> = sts.struct(() => {
    return  {
        postInfo: PostDispatchInfo,
        error: DispatchError,
    }
})

export interface DispatchErrorWithPostInfo {
    postInfo: PostDispatchInfo
    error: DispatchError
}

export type DispatchError = DispatchError_Arithmetic | DispatchError_BadOrigin | DispatchError_CannotLookup | DispatchError_ConsumerRemaining | DispatchError_Corruption | DispatchError_Exhausted | DispatchError_Module | DispatchError_NoProviders | DispatchError_Other | DispatchError_RootNotAllowed | DispatchError_Token | DispatchError_TooManyConsumers | DispatchError_Transactional | DispatchError_Trie | DispatchError_Unavailable

export interface DispatchError_Arithmetic {
    __kind: 'Arithmetic'
    value: ArithmeticError
}

export interface DispatchError_BadOrigin {
    __kind: 'BadOrigin'
}

export interface DispatchError_CannotLookup {
    __kind: 'CannotLookup'
}

export interface DispatchError_ConsumerRemaining {
    __kind: 'ConsumerRemaining'
}

export interface DispatchError_Corruption {
    __kind: 'Corruption'
}

export interface DispatchError_Exhausted {
    __kind: 'Exhausted'
}

export interface DispatchError_Module {
    __kind: 'Module'
    value: ModuleError
}

export interface DispatchError_NoProviders {
    __kind: 'NoProviders'
}

export interface DispatchError_Other {
    __kind: 'Other'
}

export interface DispatchError_RootNotAllowed {
    __kind: 'RootNotAllowed'
}

export interface DispatchError_Token {
    __kind: 'Token'
    value: TokenError
}

export interface DispatchError_TooManyConsumers {
    __kind: 'TooManyConsumers'
}

export interface DispatchError_Transactional {
    __kind: 'Transactional'
    value: TransactionalError
}

export interface DispatchError_Trie {
    __kind: 'Trie'
    value: TrieError
}

export interface DispatchError_Unavailable {
    __kind: 'Unavailable'
}

export type TrieError = TrieError_DecodeError | TrieError_DecoderError | TrieError_DuplicateKey | TrieError_ExtraneousHashReference | TrieError_ExtraneousNode | TrieError_ExtraneousValue | TrieError_IncompleteDatabase | TrieError_IncompleteProof | TrieError_InvalidChildReference | TrieError_InvalidHash | TrieError_InvalidStateRoot | TrieError_RootMismatch | TrieError_ValueAtIncompleteKey | TrieError_ValueMismatch

export interface TrieError_DecodeError {
    __kind: 'DecodeError'
}

export interface TrieError_DecoderError {
    __kind: 'DecoderError'
}

export interface TrieError_DuplicateKey {
    __kind: 'DuplicateKey'
}

export interface TrieError_ExtraneousHashReference {
    __kind: 'ExtraneousHashReference'
}

export interface TrieError_ExtraneousNode {
    __kind: 'ExtraneousNode'
}

export interface TrieError_ExtraneousValue {
    __kind: 'ExtraneousValue'
}

export interface TrieError_IncompleteDatabase {
    __kind: 'IncompleteDatabase'
}

export interface TrieError_IncompleteProof {
    __kind: 'IncompleteProof'
}

export interface TrieError_InvalidChildReference {
    __kind: 'InvalidChildReference'
}

export interface TrieError_InvalidHash {
    __kind: 'InvalidHash'
}

export interface TrieError_InvalidStateRoot {
    __kind: 'InvalidStateRoot'
}

export interface TrieError_RootMismatch {
    __kind: 'RootMismatch'
}

export interface TrieError_ValueAtIncompleteKey {
    __kind: 'ValueAtIncompleteKey'
}

export interface TrieError_ValueMismatch {
    __kind: 'ValueMismatch'
}

export type TransactionalError = TransactionalError_LimitReached | TransactionalError_NoLayer

export interface TransactionalError_LimitReached {
    __kind: 'LimitReached'
}

export interface TransactionalError_NoLayer {
    __kind: 'NoLayer'
}

export type TokenError = TokenError_BelowMinimum | TokenError_Blocked | TokenError_CannotCreate | TokenError_CannotCreateHold | TokenError_Frozen | TokenError_FundsUnavailable | TokenError_NotExpendable | TokenError_OnlyProvider | TokenError_UnknownAsset | TokenError_Unsupported

export interface TokenError_BelowMinimum {
    __kind: 'BelowMinimum'
}

export interface TokenError_Blocked {
    __kind: 'Blocked'
}

export interface TokenError_CannotCreate {
    __kind: 'CannotCreate'
}

export interface TokenError_CannotCreateHold {
    __kind: 'CannotCreateHold'
}

export interface TokenError_Frozen {
    __kind: 'Frozen'
}

export interface TokenError_FundsUnavailable {
    __kind: 'FundsUnavailable'
}

export interface TokenError_NotExpendable {
    __kind: 'NotExpendable'
}

export interface TokenError_OnlyProvider {
    __kind: 'OnlyProvider'
}

export interface TokenError_UnknownAsset {
    __kind: 'UnknownAsset'
}

export interface TokenError_Unsupported {
    __kind: 'Unsupported'
}

export interface ModuleError {
    index: number
    error: Bytes
}

export type ArithmeticError = ArithmeticError_DivisionByZero | ArithmeticError_Overflow | ArithmeticError_Underflow

export interface ArithmeticError_DivisionByZero {
    __kind: 'DivisionByZero'
}

export interface ArithmeticError_Overflow {
    __kind: 'Overflow'
}

export interface ArithmeticError_Underflow {
    __kind: 'Underflow'
}

export interface PostDispatchInfo {
    actualWeight?: (Weight | undefined)
    paysFee: Pays
}

export type Pays = Pays_No | Pays_Yes

export interface Pays_No {
    __kind: 'No'
}

export interface Pays_Yes {
    __kind: 'Yes'
}

export interface Weight {
    refTime: bigint
    proofSize: bigint
}

export const PostDispatchInfo: sts.Type<PostDispatchInfo> = sts.struct(() => {
    return  {
        actualWeight: sts.option(() => Weight),
        paysFee: Pays,
    }
})

export const Pays: sts.Type<Pays> = sts.closedEnum(() => {
    return  {
        No: sts.unit(),
        Yes: sts.unit(),
    }
})

export const Weight: sts.Type<Weight> = sts.struct(() => {
    return  {
        refTime: sts.bigint(),
        proofSize: sts.bigint(),
    }
})

export const Type_101: sts.Type<Type_101> = sts.closedEnum(() => {
    return  {
        After: BlockNumberOrTimestamp,
        At: sts.number(),
    }
})

export type Type_101 = Type_101_After | Type_101_At

export interface Type_101_After {
    __kind: 'After'
    value: BlockNumberOrTimestamp
}

export interface Type_101_At {
    __kind: 'At'
    value: number
}

export const H256 = sts.bytes()

export const BlockNumberOrTimestamp: sts.Type<BlockNumberOrTimestamp> = sts.closedEnum(() => {
    return  {
        BlockNumber: sts.number(),
        Timestamp: sts.bigint(),
    }
})

export const BalanceStatus: sts.Type<BalanceStatus> = sts.closedEnum(() => {
    return  {
        Free: sts.unit(),
        Reserved: sts.unit(),
    }
})

export type BalanceStatus = BalanceStatus_Free | BalanceStatus_Reserved

export interface BalanceStatus_Free {
    __kind: 'Free'
}

export interface BalanceStatus_Reserved {
    __kind: 'Reserved'
}

export const AccountId32 = sts.bytes()

export const DispatchEventInfo: sts.Type<DispatchEventInfo> = sts.struct(() => {
    return  {
        weight: Weight,
        class: DispatchClass,
        paysFee: Pays,
    }
})

export const DispatchClass: sts.Type<DispatchClass> = sts.closedEnum(() => {
    return  {
        Mandatory: sts.unit(),
        Normal: sts.unit(),
        Operational: sts.unit(),
    }
})

export type DispatchClass = DispatchClass_Mandatory | DispatchClass_Normal | DispatchClass_Operational

export interface DispatchClass_Mandatory {
    __kind: 'Mandatory'
}

export interface DispatchClass_Normal {
    __kind: 'Normal'
}

export interface DispatchClass_Operational {
    __kind: 'Operational'
}

export interface DispatchEventInfo {
    weight: Weight
    class: DispatchClass
    paysFee: Pays
}

export const DispatchError: sts.Type<DispatchError> = sts.closedEnum(() => {
    return  {
        Arithmetic: ArithmeticError,
        BadOrigin: sts.unit(),
        CannotLookup: sts.unit(),
        ConsumerRemaining: sts.unit(),
        Corruption: sts.unit(),
        Exhausted: sts.unit(),
        Module: ModuleError,
        NoProviders: sts.unit(),
        Other: sts.unit(),
        RootNotAllowed: sts.unit(),
        Token: TokenError,
        TooManyConsumers: sts.unit(),
        Transactional: TransactionalError,
        Trie: TrieError,
        Unavailable: sts.unit(),
    }
})

export const TrieError: sts.Type<TrieError> = sts.closedEnum(() => {
    return  {
        DecodeError: sts.unit(),
        DecoderError: sts.unit(),
        DuplicateKey: sts.unit(),
        ExtraneousHashReference: sts.unit(),
        ExtraneousNode: sts.unit(),
        ExtraneousValue: sts.unit(),
        IncompleteDatabase: sts.unit(),
        IncompleteProof: sts.unit(),
        InvalidChildReference: sts.unit(),
        InvalidHash: sts.unit(),
        InvalidStateRoot: sts.unit(),
        RootMismatch: sts.unit(),
        ValueAtIncompleteKey: sts.unit(),
        ValueMismatch: sts.unit(),
    }
})

export const TransactionalError: sts.Type<TransactionalError> = sts.closedEnum(() => {
    return  {
        LimitReached: sts.unit(),
        NoLayer: sts.unit(),
    }
})

export const TokenError: sts.Type<TokenError> = sts.closedEnum(() => {
    return  {
        BelowMinimum: sts.unit(),
        Blocked: sts.unit(),
        CannotCreate: sts.unit(),
        CannotCreateHold: sts.unit(),
        Frozen: sts.unit(),
        FundsUnavailable: sts.unit(),
        NotExpendable: sts.unit(),
        OnlyProvider: sts.unit(),
        UnknownAsset: sts.unit(),
        Unsupported: sts.unit(),
    }
})

export const ModuleError: sts.Type<ModuleError> = sts.struct(() => {
    return  {
        index: sts.number(),
        error: sts.bytes(),
    }
})

export const ArithmeticError: sts.Type<ArithmeticError> = sts.closedEnum(() => {
    return  {
        DivisionByZero: sts.unit(),
        Overflow: sts.unit(),
        Underflow: sts.unit(),
    }
})
