import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const extrinsicFailed =  {
    name: 'System.ExtrinsicFailed',
    /**
     * An extrinsic failed.
     */
    v126: new EventType(
        'System.ExtrinsicFailed',
        sts.struct({
            dispatchError: v126.DispatchError,
            dispatchInfo: v126.DispatchEventInfo,
        })
    ),
}

export const codeUpdated =  {
    name: 'System.CodeUpdated',
    /**
     * `:code` was updated.
     */
    v126: new EventType(
        'System.CodeUpdated',
        sts.unit()
    ),
}
