import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, OneToOne as OneToOne_, JoinColumn as JoinColumn_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {ScheduledReversibleTransfer} from "./scheduledReversibleTransfer.model"
import {Transfer} from "./transfer.model"
import {Event} from "./event.model"

@Entity_()
export class ExecutedReversibleTransfer {
    constructor(props?: Partial<ExecutedReversibleTransfer>) {
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
    @StringColumn_({nullable: false})
    txId!: string

    @Index_()
    @ManyToOne_(() => ScheduledReversibleTransfer, {nullable: true})
    scheduledTransfer!: ScheduledReversibleTransfer

    @Index_({unique: true})
    @OneToOne_(() => Transfer, {nullable: true})
    @JoinColumn_()
    executedTransfer!: Transfer | undefined | null

    @OneToOne_(() => Event, e => e.executedReversibleTransfer)
    event!: Event | undefined | null
}
