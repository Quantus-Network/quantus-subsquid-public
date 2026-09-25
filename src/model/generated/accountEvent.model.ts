import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, ManyToOne as ManyToOne_, DateTimeColumn as DateTimeColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"
import {Account} from "./account.model"
import {Transfer} from "./transfer.model"
import {ScheduledReversibleTransfer} from "./scheduledReversibleTransfer.model"
import {ExecutedReversibleTransfer} from "./executedReversibleTransfer.model"
import {CancelledReversibleTransfer} from "./cancelledReversibleTransfer.model"
import {MinerReward} from "./minerReward.model"
import {HighSecuritySet} from "./highSecuritySet.model"
import {Multisig} from "./multisig.model"
import {MultisigProposalCreated} from "./multisigProposalCreated.model"
import {MultisigSignerApproved} from "./multisigSignerApproved.model"
import {MultisigProposalReady} from "./multisigProposalReady.model"
import {ExecutedMultisigProposal} from "./executedMultisigProposal.model"
import {CancelledMultisigProposal} from "./cancelledMultisigProposal.model"
import {RemovedMultisigProposal} from "./removedMultisigProposal.model"
import {MultisigDepositsClaimed} from "./multisigDepositsClaimed.model"
import {TechReferendumEvent} from "./techReferendumEvent.model"

/**
 * One row per (account, event) so a wallet can page an account's history from a
 * single table. Only transfers with an extrinsic are recorded here; mint and
 * reversible-settlement leaves are excluded (wallets show those via MinerReward /
 * ExecutedReversibleTransfer rows instead).
 */
@Index_(["account", "timestamp", "id"], {unique: false})
@Index_(["account", "outgoing", "timestamp", "id"], {unique: false})
@Index_(["account", "incoming", "timestamp", "id"], {unique: false})
@Entity_()
export class AccountEvent {
    constructor(props?: Partial<AccountEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @ManyToOne_(() => Account, {nullable: true})
    account!: Account

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    /**
     * True when `account` is the party that sent / initiated this event (sender, proposer, approver, ...)
     */
    @BooleanColumn_({nullable: false})
    outgoing!: boolean

    /**
     * True when `account` is the party that received value in this event (recipient, miner)
     */
    @BooleanColumn_({nullable: false})
    incoming!: boolean

    @Index_()
    @ManyToOne_(() => Transfer, {nullable: true})
    transfer!: Transfer | undefined | null

    @Index_()
    @ManyToOne_(() => ScheduledReversibleTransfer, {nullable: true})
    scheduledReversibleTransfer!: ScheduledReversibleTransfer | undefined | null

    @Index_()
    @ManyToOne_(() => ExecutedReversibleTransfer, {nullable: true})
    executedReversibleTransfer!: ExecutedReversibleTransfer | undefined | null

    @Index_()
    @ManyToOne_(() => CancelledReversibleTransfer, {nullable: true})
    cancelledReversibleTransfer!: CancelledReversibleTransfer | undefined | null

    @Index_()
    @ManyToOne_(() => MinerReward, {nullable: true})
    minerReward!: MinerReward | undefined | null

    @Index_()
    @ManyToOne_(() => HighSecuritySet, {nullable: true})
    highSecuritySet!: HighSecuritySet | undefined | null

    @Index_()
    @ManyToOne_(() => Multisig, {nullable: true})
    multisig!: Multisig | undefined | null

    @Index_()
    @ManyToOne_(() => MultisigProposalCreated, {nullable: true})
    multisigProposalCreated!: MultisigProposalCreated | undefined | null

    @Index_()
    @ManyToOne_(() => MultisigSignerApproved, {nullable: true})
    multisigSignerApproved!: MultisigSignerApproved | undefined | null

    @Index_()
    @ManyToOne_(() => MultisigProposalReady, {nullable: true})
    multisigProposalReady!: MultisigProposalReady | undefined | null

    @Index_()
    @ManyToOne_(() => ExecutedMultisigProposal, {nullable: true})
    executedMultisigProposal!: ExecutedMultisigProposal | undefined | null

    @Index_()
    @ManyToOne_(() => CancelledMultisigProposal, {nullable: true})
    cancelledMultisigProposal!: CancelledMultisigProposal | undefined | null

    @Index_()
    @ManyToOne_(() => RemovedMultisigProposal, {nullable: true})
    removedMultisigProposal!: RemovedMultisigProposal | undefined | null

    @Index_()
    @ManyToOne_(() => MultisigDepositsClaimed, {nullable: true})
    multisigDepositsClaimed!: MultisigDepositsClaimed | undefined | null

    @Index_()
    @ManyToOne_(() => TechReferendumEvent, {nullable: true})
    techReferendumEvent!: TechReferendumEvent | undefined | null
}
