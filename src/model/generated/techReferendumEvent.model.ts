import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, ManyToOne as ManyToOne_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {TechReferendumEventType} from "./_techReferendumEventType"
import {Block} from "./block.model"
import {Extrinsic} from "./extrinsic.model"
import {Account} from "./account.model"
import {Event} from "./event.model"

/**
 * A single technical-referendum lifecycle event (submission, decision, approval, rejection, etc.).
 * Each event is self-contained: it carries the referendum index it belongs to plus a snapshot of
 * what the proposal is about and who proposed it, so the full runtime-upgrade history can be read
 * directly from the chronological stream of these events.
 */
@Entity_()
export class TechReferendumEvent {
    constructor(props?: Partial<TechReferendumEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    /**
     * Index of the referendum this event belongs to
     */
    @Index_()
    @IntColumn_({nullable: false})
    referendumIndex!: number

    @Index_()
    @Column_("varchar", {length: 16, nullable: false})
    type!: TechReferendumEventType

    @Index_()
    @ManyToOne_(() => Block, {nullable: true})
    block!: Block

    @Index_()
    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @Index_()
    @ManyToOne_(() => Extrinsic, {nullable: true})
    extrinsic!: Extrinsic | undefined | null

    /**
     * Account that triggered this event (the submitter for SUBMITTED); null for system-driven transitions
     */
    @Index_()
    @ManyToOne_(() => Account, {nullable: true})
    actor!: Account | undefined | null

    /**
     * Governance track id
     */
    @Index_()
    @IntColumn_({nullable: true})
    track!: number | undefined | null

    /**
     * Human-readable track name (e.g. 'whitelisted_caller')
     */
    @StringColumn_({nullable: true})
    trackName!: string | undefined | null

    /**
     * Humanized dispatch origin (e.g. 'Root', 'Signed (...)')
     */
    @StringColumn_({nullable: true})
    origin!: string | undefined | null

    /**
     * Off-chain metadata title, if available
     */
    @StringColumn_({nullable: true})
    title!: string | undefined | null

    /**
     * Off-chain metadata description, if available
     */
    @StringColumn_({nullable: true})
    description!: string | undefined | null

    /**
     * Human-readable summary of what the proposal does
     */
    @StringColumn_({nullable: true})
    proposalSummary!: string | undefined | null

    /**
     * Preimage storage kind: INLINE | LOOKUP | LEGACY
     */
    @StringColumn_({nullable: true})
    proposalStorage!: string | undefined | null

    /**
     * Preimage hash when the proposal is stored by lookup/legacy
     */
    @StringColumn_({nullable: true})
    proposalPreimageHash!: string | undefined | null

    /**
     * Encoded proposal size in bytes
     */
    @IntColumn_({nullable: true})
    proposalSizeBytes!: number | undefined | null

    /**
     * Decoded calls as a JSON array (name, pallet, method, summary, category)
     */
    @StringColumn_({nullable: true})
    proposalCalls!: string | undefined | null

    /**
     * True when the proposal contains a runtime upgrade call (System.set_code / authorize_upgrade)
     */
    @Index_()
    @BooleanColumn_({nullable: false})
    isRuntimeUpgrade!: boolean

    /**
     * Aye votes captured with this event (when the event carries a tally)
     */
    @BigIntColumn_({nullable: true})
    tallyAyes!: bigint | undefined | null

    /**
     * Nay votes captured with this event
     */
    @BigIntColumn_({nullable: true})
    tallyNays!: bigint | undefined | null

    /**
     * Bare aye votes (count of aye voters) captured with this event
     */
    @BigIntColumn_({nullable: true})
    tallyBareAyes!: bigint | undefined | null

    @OneToOne_(() => Event, e => e.techReferendumEvent)
    event!: Event | undefined | null
}
