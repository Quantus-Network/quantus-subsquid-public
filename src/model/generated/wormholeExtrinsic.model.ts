import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, OneToMany as OneToMany_, FloatColumn as FloatColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {WormholeOutput} from "./wormholeOutput.model"

/**
 * A single wormhole proof verification extrinsic, containing one or more exit outputs.
 */
@Entity_()
export class WormholeExtrinsic {
    constructor(props?: Partial<WormholeExtrinsic>) {
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

    /**
     * Link to the generic Extrinsic entity
     */
    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    /**
     * Total amount across all outputs in this extrinsic
     */
    @Index_()
    @BigIntColumn_({nullable: false})
    totalAmount!: bigint

    /**
     * Number of non-zero exit outputs
     */
    @IntColumn_({nullable: false})
    outputCount!: number

    /**
     * Individual exit outputs in this extrinsic
     */
    @OneToMany_(() => WormholeOutput, e => e.wormholeExtrinsic)
    outputs!: WormholeOutput[]

    /**
     * Privacy score at 0.01 DEV precision, in bits
     */
    @FloatColumn_({nullable: false})
    privacyScore!: number

    /**
     * Privacy score with 0.1% sacrifice, in bits
     */
    @FloatColumn_({nullable: false})
    privacyScore01Pct!: number

    /**
     * Privacy score with 1% sacrifice, in bits
     */
    @FloatColumn_({nullable: false})
    privacyScore1Pct!: number

    /**
     * Privacy score with 5% sacrifice, in bits
     */
    @FloatColumn_({nullable: false})
    privacyScore5Pct!: number

    /**
     * Human-readable privacy label
     */
    @StringColumn_({nullable: false})
    privacyLabel!: string

    /**
     * Pool snapshot at time of proof verification (JSON bucket data)
     */
    @StringColumn_({nullable: false})
    poolSnapshot!: string
}
