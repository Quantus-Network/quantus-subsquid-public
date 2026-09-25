import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Event} from "./event.model"

/**
 * A runtime upgrade applied on-chain, emitted as System.CodeUpdated
 */
@Entity_()
export class RuntimeUpgrade {
    constructor(props?: Partial<RuntimeUpgrade>) {
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

    /**
     * Runtime spec version in effect after the upgrade
     */
    @Index_()
    @IntColumn_({nullable: true})
    specVersion!: number | undefined | null

    @OneToOne_(() => Event, e => e.runtimeUpgrade)
    event!: Event | undefined | null
}
