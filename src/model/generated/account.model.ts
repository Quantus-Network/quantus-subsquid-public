import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, Index as Index_, IntColumn as IntColumn_, BooleanColumn as BooleanColumn_, StringColumn as StringColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Transfer} from "./transfer.model"
import {Extrinsic} from "./extrinsic.model"
import {Block} from "./block.model"
import {AccountEvent} from "./accountEvent.model"

@Entity_()
export class Account {
    constructor(props?: Partial<Account>) {
        Object.assign(this, props)
    }

    /**
     * Account address
     */
    @PrimaryColumn_()
    id!: string

    @Index_()
    @BigIntColumn_({nullable: false})
    free!: bigint

    @Index_()
    @BigIntColumn_({nullable: false})
    reserved!: bigint

    @Index_()
    @BigIntColumn_({nullable: false})
    frozen!: bigint

    /**
     * Block number of last update. Indexed: default sort of the explorer account listing.
     */
    @Index_()
    @IntColumn_({nullable: false})
    lastUpdated!: number

    /**
     * Whether this account has only received transfers (never sent). Used for deposit pool tracking.
     */
    @Index_()
    @BooleanColumn_({nullable: false})
    isDepositOnly!: boolean

    /**
     * Individual privacy deposit amounts (JSON array of token-unit strings). Cleared when account sends.
     */
    @StringColumn_({nullable: false})
    privacyDeposits!: string

    /**
     * True once this account was the `who` of a HighSecuritySet event (denormalized for the account listing).
     */
    @BooleanColumn_({nullable: false})
    isHighSecurity!: boolean

    /**
     * True once this account was the guardian of a HighSecuritySet event (denormalized for the account listing).
     */
    @BooleanColumn_({nullable: false})
    isGuardian!: boolean

    /**
     * True when this address is a Multisig account (denormalized for the account listing).
     */
    @BooleanColumn_({nullable: false})
    isMultisig!: boolean

    @OneToMany_(() => Transfer, e => e.to)
    transfersTo!: Transfer[]

    @OneToMany_(() => Transfer, e => e.from)
    transfersFrom!: Transfer[]

    /**
     * Extrinsics signed by this account
     */
    @OneToMany_(() => Extrinsic, e => e.signer)
    extrinsics!: Extrinsic[]

    /**
     * Blocks mined by this account
     */
    @OneToMany_(() => Block, e => e.minedBy)
    minedBlocks!: Block[]

    @OneToMany_(() => AccountEvent, e => e.account)
    accountEvents!: AccountEvent[]
}
