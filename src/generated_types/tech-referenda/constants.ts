import {sts, Block, Bytes, Option, Result, ConstantType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const tracks =  {
    /**
     *  A list of tracks.
     * 
     *  Note: if the tracks are dynamic, the value in the static metadata might be inaccurate.
     */
    v126: new ConstantType(
        'TechReferenda.Tracks',
        sts.array(() => sts.tuple(() => [sts.number(), v126.TrackDetails]))
    ),
}
