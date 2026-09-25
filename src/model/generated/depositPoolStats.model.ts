import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

/**
 * Bucketed deposit pool statistics for privacy score computation. Each bucket covers a bounded range of deposit amounts with overlapping ranges growing by factor 4.
 */
@Entity_()
export class DepositPoolStats {
    constructor(props?: Partial<DepositPoolStats>) {
        Object.assign(this, props)
    }

    /**
     * Singleton entity (id='global')
     */
    @PrimaryColumn_()
    id!: string

    /**
     * Block number of last update
     */
    @IntColumn_({nullable: false})
    lastUpdatedBlock!: number

    /**
     * Bucket definitions and stats as JSON. Each bucket has: lo, hi (token units), count, sumAmounts, sumAmountsSquared
     */
    @StringColumn_({nullable: false})
    buckets!: string
}
