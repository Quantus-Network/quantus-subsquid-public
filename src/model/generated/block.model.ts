import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, StringColumn as StringColumn_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, ManyToOne as ManyToOne_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Account} from "./account.model"
import {Event} from "./event.model"
import {Extrinsic} from "./extrinsic.model"
import {Transfer} from "./transfer.model"

@Entity_()
export class Block {
    constructor(props?: Partial<Block>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @IntColumn_({nullable: false})
    height!: number

    @Index_()
    @StringColumn_({nullable: false})
    hash!: string

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @BigIntColumn_({nullable: false})
    reward!: bigint

    /**
     * Account that mined this block (null when no miner reward was emitted)
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    minedBy!: Account | undefined | null

    @OneToMany_(() => Event, e => e.block)
    events!: Event[]

    @OneToMany_(() => Extrinsic, e => e.block)
    extrinsics!: Extrinsic[]

    @OneToMany_(() => Transfer, e => e.block)
    transactions!: Transfer[]
}
