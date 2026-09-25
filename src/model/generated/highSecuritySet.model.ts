import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

@Entity_()
export class HighSecuritySet {
    constructor(props?: Partial<HighSecuritySet>) {
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
     * Link to the extrinsic that set high security
     */
    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    who!: Account

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    guardian!: Account

    @BigIntColumn_({nullable: false})
    delay!: bigint

    @OneToOne_(() => Event, e => e.highSecuritySet)
    event!: Event | undefined | null
}
