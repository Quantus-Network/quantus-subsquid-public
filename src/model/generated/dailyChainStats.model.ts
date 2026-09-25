import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, Index as Index_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

/**
 * UTC calendar-day rollup for explorer home chart (id = YYYY-MM-DD)
 */
@Entity_()
export class DailyChainStats {
    constructor(props?: Partial<DailyChainStats>) {
        Object.assign(this, props)
    }

    /**
     * UTC date key YYYY-MM-DD
     */
    @PrimaryColumn_()
    id!: string

    /**
     * Start of the UTC day (00:00:00.000Z)
     */
    @Index_()
    @DateTimeColumn_({nullable: false})
    date!: Date

    @IntColumn_({nullable: false})
    blocksCount!: number

    /**
     * Unified transactions excluding hashless IMMEDIATE rewards
     */
    @IntColumn_({nullable: false})
    txCount!: number

    /**
     * Distinct accounts that signed at least one extrinsic on this UTC day
     */
    @IntColumn_({nullable: false})
    activeAccounts!: number
}
