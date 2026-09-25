import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const submitted =  {
    name: 'TechReferenda.Submitted',
    /**
     * A referendum has been submitted.
     */
    v126: new EventType(
        'TechReferenda.Submitted',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The track (and by extension proposal dispatch origin) of this referendum.
             */
            track: sts.number(),
            /**
             * The proposal for the referendum.
             */
            proposal: v126.Bounded,
        })
    ),
}

export const decisionStarted =  {
    name: 'TechReferenda.DecisionStarted',
    /**
     * A referendum has moved into the deciding phase.
     */
    v126: new EventType(
        'TechReferenda.DecisionStarted',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The track (and by extension proposal dispatch origin) of this referendum.
             */
            track: sts.number(),
            /**
             * The proposal for the referendum.
             */
            proposal: v126.Bounded,
            /**
             * The current tally of votes in this referendum.
             */
            tally: v126.Type_109,
        })
    ),
}

export const confirmStarted =  {
    name: 'TechReferenda.ConfirmStarted',
    v126: new EventType(
        'TechReferenda.ConfirmStarted',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
        })
    ),
}

export const confirmAborted =  {
    name: 'TechReferenda.ConfirmAborted',
    v126: new EventType(
        'TechReferenda.ConfirmAborted',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
        })
    ),
}

export const confirmed =  {
    name: 'TechReferenda.Confirmed',
    /**
     * A referendum has ended its confirmation phase and is ready for approval.
     */
    v126: new EventType(
        'TechReferenda.Confirmed',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The final tally of votes in this referendum.
             */
            tally: v126.Type_109,
        })
    ),
}

export const approved =  {
    name: 'TechReferenda.Approved',
    /**
     * A referendum has been approved and its proposal has been scheduled.
     */
    v126: new EventType(
        'TechReferenda.Approved',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
        })
    ),
}

export const rejected =  {
    name: 'TechReferenda.Rejected',
    /**
     * A proposal has been rejected by referendum.
     */
    v126: new EventType(
        'TechReferenda.Rejected',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The final tally of votes in this referendum.
             */
            tally: v126.Type_109,
        })
    ),
}

export const timedOut =  {
    name: 'TechReferenda.TimedOut',
    /**
     * A referendum has been timed out without being decided.
     */
    v126: new EventType(
        'TechReferenda.TimedOut',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The final tally of votes in this referendum.
             */
            tally: v126.Type_109,
        })
    ),
}

export const cancelled =  {
    name: 'TechReferenda.Cancelled',
    /**
     * A referendum has been cancelled.
     */
    v126: new EventType(
        'TechReferenda.Cancelled',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The final tally of votes in this referendum.
             */
            tally: v126.Type_109,
        })
    ),
}

export const killed =  {
    name: 'TechReferenda.Killed',
    /**
     * A referendum has been killed.
     */
    v126: new EventType(
        'TechReferenda.Killed',
        sts.struct({
            /**
             * Index of the referendum.
             */
            index: sts.number(),
            /**
             * The final tally of votes in this referendum.
             */
            tally: v126.Type_109,
        })
    ),
}
