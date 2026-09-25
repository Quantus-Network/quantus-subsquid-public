import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

@Entity_()
export class ScheduledReversibleTransfer {
    constructor(props?: Partial<ScheduledReversibleTransfer>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    /**
     * Link to the extrinsic that scheduled this transfer
     */
    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    from!: Account

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    to!: Account

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @BigIntColumn_({nullable: false})
    fee!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    txId!: string

    @Index_()
    @DateTimeColumn_({nullable: false})
    scheduledAt!: Date

    @OneToOne_(() => Event, e => e.scheduledReversibleTransfer)
    event!: Event | undefined | null
}
