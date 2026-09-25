import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Account} from "./account.model"
import {ScheduledReversibleTransfer} from "./scheduledReversibleTransfer.model"
import {Event} from "./event.model"

@Entity_()
export class CancelledReversibleTransfer {
    constructor(props?: Partial<CancelledReversibleTransfer>) {
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

    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    @Index_()
    @StringColumn_({nullable: false})
    txId!: string

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    cancelledBy!: Account

    @Index_()
    @ManyToOne_(() => ScheduledReversibleTransfer, {nullable: true})
    scheduledTransfer!: ScheduledReversibleTransfer

    @OneToOne_(() => Event, e => e.cancelledReversibleTransfer)
    event!: Event | undefined | null
}
