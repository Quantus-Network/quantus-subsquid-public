import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {MultisigProposal} from "./multisigProposal.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

@Entity_()
export class RemovedMultisigProposal {
    constructor(props?: Partial<RemovedMultisigProposal>) {
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
    @ManyToOne_(() => MultisigProposal, {nullable: true})
    proposal!: MultisigProposal

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    removedBy!: Account

    /**
     * best-effort and may be zero for some extrinsics
     */
    @BigIntColumn_({nullable: false})
    fee!: bigint

    @OneToOne_(() => Event, e => e.removedMultisigProposal)
    event!: Event | undefined | null
}
