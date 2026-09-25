import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {UnifiedTransactionType} from "./_unifiedTransactionType"
import {Block} from "./block.model"
import {Account} from "./account.model"
import {UnifiedTransactionStatus} from "./_unifiedTransactionStatus"

/**
 * Denormalized explorer list row for fast global/account offset pagination
 */
@Index_(["type", "timestamp"], {unique: false})
@Index_(["from", "timestamp"], {unique: false})
@Index_(["to", "timestamp"], {unique: false})
@Entity_()
export class UnifiedTransaction {
    constructor(props?: Partial<UnifiedTransaction>) {
        Object.assign(this, props)
    }

    /**
     * Prefixed stable key: immediate:{id}, scheduled-reversible:{id}, executed-reversible:{id}, cancelled-reversible:{id}, wormhole:{id}
     */
    @PrimaryColumn_()
    id!: string

    @Column_("varchar", {length: 20, nullable: false})
    type!: UnifiedTransactionType

    /**
     * Extrinsic hash / id; null for unsigned executed-reversible
     */
    @Index_()
    @StringColumn_({nullable: true})
    hash!: string | undefined | null

    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    @Index_()
    @IntColumn_({nullable: false})
    blockHeight!: number

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @ManyToOne_(() => Account, {nullable: true})
    from!: Account | undefined | null

    @ManyToOne_(() => Account, {nullable: true})
    to!: Account | undefined | null

    @BigIntColumn_({nullable: true})
    amount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    fee!: bigint | undefined | null

    @Index_()
    @Column_("varchar", {length: 9, nullable: false})
    status!: UnifiedTransactionStatus

    /**
     * Detail routing: transfer id, reversible txId, or wormhole extrinsic id
     */
    @Index_()
    @StringColumn_({nullable: false})
    detailId!: string
}
