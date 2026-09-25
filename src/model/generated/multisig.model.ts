import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

@Entity_()
export class Multisig {
    constructor(props?: Partial<Multisig>) {
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
    @ManyToOne_(() => Account, {nullable: true})
    creator!: Account

    @IntColumn_({nullable: false})
    threshold!: number

    @BigIntColumn_({nullable: false})
    nonce!: bigint

    /**
     * Sorted signer SS58 addresses (Postgres text[], use GIN index for membership queries)
     */
    @StringColumn_({array: true, nullable: false})
    signers!: (string)[]

    /**
     * best-effort and may be zero for some extrinsics
     */
    @BigIntColumn_({nullable: false})
    fee!: bigint

    @OneToOne_(() => Event, e => e.multisig)
    event!: Event | undefined | null
}
