import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {WormholeExtrinsic} from "./wormholeExtrinsic.model"
import {Account} from "./account.model"

/**
 * An individual exit output within a wormhole proof verification.
 */
@Entity_()
export class WormholeOutput {
    constructor(props?: Partial<WormholeOutput>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => WormholeExtrinsic, {nullable: true})
    wormholeExtrinsic!: WormholeExtrinsic

    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    exitAccount!: Account

    @Index_()
    @BigIntColumn_({nullable: false})
    amount!: bigint
}
