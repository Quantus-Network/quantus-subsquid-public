import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Multisig} from "./multisig.model"
import {Account} from "./account.model"
import {MultisigProposalStatus} from "./_multisigProposalStatus"

/**
 * Historical proposal record; persisted after on-chain storage is cleared
 */
@Entity_()
export class MultisigProposal {
    constructor(props?: Partial<MultisigProposal>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    /**
     * Block when the proposal was first created on-chain
     */
    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    createdAtBlock!: Block

    @Index_()
    @DateTimeColumn_({nullable: false})
    createdAt!: Date

    @Index_()
    @DateTimeColumn_({nullable: false})
    updatedAt!: Date

    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    createdExtrinsic!: Extrinsic | undefined | null

    @Index_()
    @ManyToOne_(() => Multisig, {nullable: true})
    multisig!: Multisig

    @Index_()
    @IntColumn_({nullable: false})
    proposalId!: number

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    proposer!: Account

    /**
     * Raw encoded call bytes as hex
     */
    @StringColumn_({nullable: false})
    callRaw!: string

    /**
     * Pallet name (e.g., 'Balances', 'ReversibleTransfers')
     */
    @Index_()
    @StringColumn_({nullable: false})
    pallet!: string

    /**
     * Call name (e.g., 'transfer_keep_alive', 'set_high_security')
     */
    @Index_()
    @StringColumn_({nullable: false})
    call!: string

    /**
     * Balances transfer recipient
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    transferTo!: Account | undefined | null

    /**
     * Balances transfer amount in token units
     */
    @Index_()
    @BigIntColumn_({nullable: true})
    transferAmount!: bigint | undefined | null

    /**
     * ReversibleTransfers schedule recipient
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    scheduleTo!: Account | undefined | null

    /**
     * ReversibleTransfers schedule amount in token units
     */
    @BigIntColumn_({nullable: true})
    scheduleAmount!: bigint | undefined | null

    /**
     * ReversibleTransfers schedule asset id
     */
    @IntColumn_({nullable: true})
    scheduleAssetId!: number | undefined | null

    /**
     * ReversibleTransfers delay kind: BlockNumber or Timestamp
     */
    @StringColumn_({nullable: true})
    delayKind!: string | undefined | null

    /**
     * ReversibleTransfers delay value (blocks or milliseconds)
     */
    @BigIntColumn_({nullable: true})
    delayValue!: bigint | undefined | null

    /**
     * ReversibleTransfers cancel/execute tx id (hex)
     */
    @Index_()
    @StringColumn_({nullable: true})
    txId!: string | undefined | null

    /**
     * ReversibleTransfers recover_funds account
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    recoverAccount!: Account | undefined | null

    /**
     * ReversibleTransfers set_high_security guardian
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    guardian!: Account | undefined | null

    /**
     * Set when call bytes could not be decoded
     */
    @StringColumn_({nullable: true})
    decodeError!: string | undefined | null

    /**
     * Block height after which the proposal expires (not a duration)
     */
    @Index_()
    @IntColumn_({nullable: false})
    expiryBlock!: number

    @BigIntColumn_({nullable: false})
    deposit!: bigint

    /**
     * Non-refundable ProposalFee burned at creation (scales with signer count)
     */
    @BigIntColumn_({nullable: false})
    burnedPalletFee!: bigint

    /**
     * TransactionPayment fee on the propose extrinsic
     */
    @BigIntColumn_({nullable: false})
    creationNetworkFee!: bigint

    /**
     * Approver SS58 addresses (Postgres text[])
     */
    @StringColumn_({array: true, nullable: false})
    approvals!: (string)[]

    @Index_()
    @Column_("varchar", {length: 9, nullable: false})
    status!: MultisigProposalStatus
}
