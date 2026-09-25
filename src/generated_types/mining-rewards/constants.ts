import {sts, Block, Bytes, Option, Result, ConstantType, RuntimeCtx} from '../support'

export const maxSupply =  {
    /**
     *  The maximum total supply of tokens
     */
    v126: new ConstantType(
        'MiningRewards.MaxSupply',
        sts.bigint()
    ),
}
