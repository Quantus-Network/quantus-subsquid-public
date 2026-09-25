import {sts, Block, Bytes, Option, Result, ConstantType, RuntimeCtx} from '../support'

export const targetBlockTime =  {
    v126: new ConstantType(
        'QPoW.TargetBlockTime',
        sts.bigint()
    ),
}
