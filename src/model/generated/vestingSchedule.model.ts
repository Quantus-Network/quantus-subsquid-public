import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

/**
 * Current vesting schedule read from Vesting.Schedules
 */
@Entity_()
export class VestingSchedule {
    constructor(props?: Partial<VestingSchedule>) {
        Object.assign(this, props)
    }

    /**
     * Schedule id
     */
    @PrimaryColumn_()
    id!: string

    /**
     * Beneficiary address
     */
    @Index_()
    @StringColumn_({nullable: false})
    beneficiary!: string

    /**
     * When linear accrual starts, as unix milliseconds
     */
    @BigIntColumn_({nullable: false})
    start!: bigint

    /**
     * Nothing is unlocked before this unix millisecond
     */
    @BigIntColumn_({nullable: false})
    cliff!: bigint

    /**
     * When the full total is unlocked, as unix milliseconds
     */
    @BigIntColumn_({nullable: false})
    end!: bigint

    /**
     * Total grant, as a raw token amount
     */
    @BigIntColumn_({nullable: false})
    total!: bigint

    /**
     * Amount already paid out, as a raw token amount
     */
    @BigIntColumn_({nullable: false})
    claimed!: bigint

    /**
     * Unix milliseconds of the last payout
     */
    @BigIntColumn_({nullable: true})
    lastClaimAt!: bigint | undefined | null

    /**
     * Block height of the storage read that wrote this row
     */
    @Index_()
    @IntColumn_({nullable: false})
    blockHeight!: number
}
