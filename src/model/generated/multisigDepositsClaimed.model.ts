import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Multisig} from "./multisig.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

@Entity_()
export class MultisigDepositsClaimed {
    constructor(props?: Partial<MultisigDepositsClaimed>) {
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
    @ManyToOne_(() => Multisig, {nullable: true})
    multisig!: Multisig

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    claimer!: Account

    @BigIntColumn_({nullable: false})
    totalReturned!: bigint

    @IntColumn_({nullable: false})
    proposalsRemoved!: number

    /**
     * best-effort and may be zero for some extrinsics
     */
    @BigIntColumn_({nullable: false})
    fee!: bigint

    @OneToOne_(() => Event, e => e.multisigDepositsClaimed)
    event!: Event | undefined | null
}
