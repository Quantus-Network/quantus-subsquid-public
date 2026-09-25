import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ChainStats {
    constructor(props?: Partial<ChainStats>) {
        Object.assign(this, props)
    }

    /**
     * Singleton entity (id='global')
     */
    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    blockHeight!: number

    @IntColumn_({nullable: false})
    finalizedBlockHeight!: number

    @IntColumn_({nullable: false})
    totalAccounts!: number

    @IntColumn_({nullable: false})
    totalMiners!: number

    @IntColumn_({nullable: false})
    totalDepositAccounts!: number

    @IntColumn_({nullable: false})
    totalImmediateTransfers!: number

    @IntColumn_({nullable: false})
    totalScheduledTransfers!: number

    @IntColumn_({nullable: false})
    totalExecutedTransfers!: number

    @IntColumn_({nullable: false})
    totalCancelledTransfers!: number

    @IntColumn_({nullable: false})
    totalHighSecuritySets!: number

    @IntColumn_({nullable: false})
    totalMultisigsCreated!: number

    @IntColumn_({nullable: false})
    totalMultisigProposals!: number

    @IntColumn_({nullable: false})
    totalMultisigSignerApproved!: number

    @IntColumn_({nullable: false})
    totalMultisigProposalReady!: number

    @IntColumn_({nullable: false})
    totalMultisigProposalsExecuted!: number

    @IntColumn_({nullable: false})
    totalMultisigProposalsCancelled!: number

    @IntColumn_({nullable: false})
    totalMultisigProposalsRemoved!: number

    @IntColumn_({nullable: false})
    totalMultisigDepositsClaimed!: number

    @IntColumn_({nullable: false})
    totalMinerRewards!: number

    @IntColumn_({nullable: false})
    totalErrorEvents!: number

    @IntColumn_({nullable: false})
    totalTechReferenda!: number

    @IntColumn_({nullable: false})
    totalRuntimeUpgrades!: number

    /**
     * MiningRewards.MaxSupply at blockHeight, as a raw token amount
     */
    @BigIntColumn_({nullable: false})
    maxSupply!: bigint

    /**
     * Balances.TotalIssuance at blockHeight, as a raw token amount
     */
    @BigIntColumn_({nullable: false})
    totalSupply!: bigint

    /**
     * Total supply minus still-locked vesting at blockHeight, as a raw token amount. Unlocked token counts whether or not it has been claimed.
     */
    @BigIntColumn_({nullable: false})
    circulatingSupply!: bigint
}
