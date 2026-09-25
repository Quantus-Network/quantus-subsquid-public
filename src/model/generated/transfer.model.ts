import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, ManyToOne as ManyToOne_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Account} from "./account.model"
import {ExecutedReversibleTransfer} from "./executedReversibleTransfer.model"
import {Event} from "./event.model"

@Index_(["from", "timestamp"], {unique: false})
@Index_(["to", "timestamp"], {unique: false})
@Index_(["to", "blockHeight", "id"], {unique: false})
@Entity_()
export class Transfer {
    constructor(props?: Partial<Transfer>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    /**
     * Denormalized block.height so recipient walks can filter and keyset-paginate without joining block
     */
    @IntColumn_({nullable: false})
    blockHeight!: number

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    /**
     * Link to the extrinsic that caused this transfer (null for transfers from reversible execution)
     */
    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    @ManyToOne_(() => Account, {nullable: true})
    from!: Account

    @ManyToOne_(() => Account, {nullable: true})
    to!: Account

    @Index_()
    @BigIntColumn_({nullable: false})
    amount!: bigint

    @BigIntColumn_({nullable: false})
    fee!: bigint

    /**
     * Blake3 hash of raw 'from' address bytes (hex string) for privacy-preserving prefix queries
     */
    @Index_()
    @StringColumn_({nullable: false})
    fromHash!: string

    /**
     * Blake3 hash of raw 'to' address bytes (hex string) for privacy-preserving prefix queries
     */
    @Index_()
    @StringColumn_({nullable: false})
    toHash!: string

    @Index_()
    @BigIntColumn_({nullable: false})
    transferCount!: bigint

    /**
     * Index in the ZK trie for Merkle proof generation
     */
    @Index_()
    @BigIntColumn_({nullable: false})
    leafIndex!: bigint

    @OneToOne_(() => ExecutedReversibleTransfer, e => e.executedTransfer)
    executedBy!: ExecutedReversibleTransfer | undefined | null

    @OneToOne_(() => Event, e => e.transfer)
    event!: Event | undefined | null
}
