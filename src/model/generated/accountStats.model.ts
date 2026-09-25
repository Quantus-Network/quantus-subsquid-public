import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

/**
 * Transfers in this account stats were a party to (sender or receiver or cancelled by)
 */
@Entity_()
export class AccountStats {
    constructor(props?: Partial<AccountStats>) {
        Object.assign(this, props)
    }

    /**
     * Account address
     */
    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    totalImmediateTransfers!: number

    @IntColumn_({nullable: false})
    totalScheduledTransfers!: number

    @IntColumn_({nullable: false})
    totalExecutedTransfers!: number

    @IntColumn_({nullable: false})
    totalCancelledTransfers!: number

    @Index_()
    @IntColumn_({nullable: false})
    totalMinedBlocks!: number

    @BigIntColumn_({nullable: false})
    totalRewards!: bigint
}
