import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Event} from "./event.model"

@Entity_()
export class ErrorEvent {
    constructor(props?: Partial<ErrorEvent>) {
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
     * Link to the extrinsic that failed
     */
    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    @Index_()
    @StringColumn_({nullable: false})
    errorType!: string

    @Index_()
    @StringColumn_({nullable: true})
    errorModule!: string | undefined | null

    @Index_()
    @StringColumn_({nullable: true})
    errorName!: string | undefined | null

    @StringColumn_({nullable: true})
    errorDocs!: string | undefined | null

    @OneToOne_(() => Event, e => e.errorEvent)
    event!: Event | undefined | null
}
