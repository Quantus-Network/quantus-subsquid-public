import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, Index as Index_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

/**
 * Per-UTC-day account activity (id = YYYY-MM-DD:{address}). Backs DailyChainStats.activeAccounts and the explorer's 7-day active / deposit account counts.
 */
@Entity_()
export class DailyActiveAccount {
    constructor(props?: Partial<DailyActiveAccount>) {
        Object.assign(this, props)
    }

    /**
     * Composite key: YYYY-MM-DD:{accountAddress}
     */
    @PrimaryColumn_()
    id!: string

    /**
     * Start of the UTC day (00:00:00.000Z)
     */
    @Index_()
    @DateTimeColumn_({nullable: false})
    date!: Date

    /**
     * Account address
     */
    @StringColumn_({nullable: false})
    accountId!: string

    /**
     * Signed at least one extrinsic on this day
     */
    @BooleanColumn_({nullable: false})
    signed!: boolean

    /**
     * Was Transfer.from on at least one transfer this day (any transfer row, including hashless ones)
     */
    @BooleanColumn_({nullable: false})
    sent!: boolean

    /**
     * Was Transfer.to on at least one transfer this day (any transfer row, including hashless ones)
     */
    @BooleanColumn_({nullable: false})
    received!: boolean
}
