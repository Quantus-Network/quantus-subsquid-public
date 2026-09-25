import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

/**
 * An extrinsic (transaction) submitted to the chain
 */
@Entity_()
export class Extrinsic {
    constructor(props?: Partial<Extrinsic>) {
        Object.assign(this, props)
    }

    /**
     * Extrinsic hash
     */
    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    /**
     * Index of the extrinsic within the block
     */
    @Index_()
    @IntColumn_({nullable: false})
    indexInBlock!: number

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    /**
     * Account that signed and submitted the extrinsic (null for unsigned extrinsics like wormhole proofs)
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    signer!: Account | undefined | null

    /**
     * Pallet name (e.g., 'Balances', 'ReversibleTransfers')
     */
    @Index_()
    @StringColumn_({nullable: false})
    pallet!: string

    /**
     * Call name (e.g., 'transfer', 'transfer_keep_alive')
     */
    @Index_()
    @StringColumn_({nullable: false})
    call!: string

    /**
     * Decoded call arguments as JSON
     */
    @StringColumn_({nullable: false})
    args!: string

    /**
     * Whether the extrinsic succeeded
     */
    @Index_()
    @BooleanColumn_({nullable: false})
    success!: boolean

    /**
     * Transaction fee paid
     */
    @BigIntColumn_({nullable: false})
    fee!: bigint

    /**
     * Events emitted by this extrinsic
     */
    @OneToMany_(() => Event, e => e.extrinsic)
    events!: Event[]
}
