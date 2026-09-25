import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, ManyToOne as ManyToOne_, DateTimeColumn as DateTimeColumn_, OneToOne as OneToOne_, JoinColumn as JoinColumn_} from "@subsquid/typeorm-store"
import {EventType} from "./_eventType"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Transfer} from "./transfer.model"
import {ScheduledReversibleTransfer} from "./scheduledReversibleTransfer.model"
import {ExecutedReversibleTransfer} from "./executedReversibleTransfer.model"
import {CancelledReversibleTransfer} from "./cancelledReversibleTransfer.model"
import {MinerReward} from "./minerReward.model"
import {ErrorEvent} from "./errorEvent.model"
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
import {RuntimeUpgrade} from "./runtimeUpgrade.model"

@Entity_()
export class Event {
    constructor(props?: Partial<Event>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @Column_("varchar", {length: 29, nullable: false})
    type!: EventType

    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    /**
     * Link to the extrinsic that emitted this event (null for inherent events like miner rewards)
     */
    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => Transfer, {nullable: true})
    @JoinColumn_()
    transfer!: Transfer | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => ScheduledReversibleTransfer, {nullable: true})
    @JoinColumn_()
    scheduledReversibleTransfer!: ScheduledReversibleTransfer | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => ExecutedReversibleTransfer, {nullable: true})
    @JoinColumn_()
    executedReversibleTransfer!: ExecutedReversibleTransfer | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => CancelledReversibleTransfer, {nullable: true})
    @JoinColumn_()
    cancelledReversibleTransfer!: CancelledReversibleTransfer | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => MinerReward, {nullable: true})
    @JoinColumn_()
    minerReward!: MinerReward | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => ErrorEvent, {nullable: true})
    @JoinColumn_()
    errorEvent!: ErrorEvent | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => HighSecuritySet, {nullable: true})
    @JoinColumn_()
    highSecuritySet!: HighSecuritySet | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => Multisig, {nullable: true})
    @JoinColumn_()
    multisig!: Multisig | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => MultisigProposalCreated, {nullable: true})
    @JoinColumn_()
    multisigProposalCreated!: MultisigProposalCreated | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => MultisigSignerApproved, {nullable: true})
    @JoinColumn_()
    multisigSignerApproved!: MultisigSignerApproved | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => MultisigProposalReady, {nullable: true})
    @JoinColumn_()
    multisigProposalReady!: MultisigProposalReady | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => ExecutedMultisigProposal, {nullable: true})
    @JoinColumn_()
    executedMultisigProposal!: ExecutedMultisigProposal | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => CancelledMultisigProposal, {nullable: true})
    @JoinColumn_()
    cancelledMultisigProposal!: CancelledMultisigProposal | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => RemovedMultisigProposal, {nullable: true})
    @JoinColumn_()
    removedMultisigProposal!: RemovedMultisigProposal | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => MultisigDepositsClaimed, {nullable: true})
    @JoinColumn_()
    multisigDepositsClaimed!: MultisigDepositsClaimed | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => TechReferendumEvent, {nullable: true})
    @JoinColumn_()
    techReferendumEvent!: TechReferendumEvent | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => RuntimeUpgrade, {nullable: true})
    @JoinColumn_()
    runtimeUpgrade!: RuntimeUpgrade | undefined | null
}
