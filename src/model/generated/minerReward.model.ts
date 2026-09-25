import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

@Entity_()
export class MinerReward {
    constructor(props?: Partial<MinerReward>) {
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
    @ManyToOne_(() => Account, {nullable: true})
    miner!: Account

    @BigIntColumn_({nullable: false})
    reward!: bigint

    @OneToOne_(() => Event, e => e.minerReward)
    event!: Event | undefined | null
}
