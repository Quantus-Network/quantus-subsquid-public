import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, ManyToOne as ManyToOne_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"
import {WormholeExtrinsic} from "./wormholeExtrinsic.model"
import {Block} from "./block.model"

/**
 * A nullifier consumed by a wormhole proof verification.
 */
@Entity_()
export class WormholeNullifier {
    constructor(props?: Partial<WormholeNullifier>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    /**
     * The nullifier bytes as hex
     */
    @Index_()
    @StringColumn_({nullable: false})
    nullifier!: string

    /**
     * Blake3 hash of the nullifier for prefix queries
     */
    @Index_()
    @StringColumn_({nullable: false})
    nullifierHash!: string

    /**
     * The wormhole extrinsic that consumed this nullifier
     */
    @Index_()
    @ManyToOne_(() => WormholeExtrinsic, {nullable: true})
    wormholeExtrinsic!: WormholeExtrinsic

    /**
     * Block where the nullifier was consumed
     */
    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date
}
