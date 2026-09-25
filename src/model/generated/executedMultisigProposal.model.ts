import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {MultisigProposal} from "./multisigProposal.model"
import {Event} from "./event.model"

@Entity_()
export class ExecutedMultisigProposal {
    constructor(props?: Partial<ExecutedMultisigProposal>) {
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

    /**
     * Final approver SS58 addresses at execution (Postgres text[])
     */
    @StringColumn_({array: true, nullable: false})
    approvers!: (string)[]

    /**
     * Execution result: Ok or encoded DispatchError
     */
    @StringColumn_({nullable: false})
    result!: string

    /**
     * best-effort and may be zero for some extrinsics
     */
    @BigIntColumn_({nullable: false})
    fee!: bigint

    @OneToOne_(() => Event, e => e.executedMultisigProposal)
    event!: Event | undefined | null
}
