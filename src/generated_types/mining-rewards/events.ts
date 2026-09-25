import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const minerRewarded =  {
    name: 'MiningRewards.MinerRewarded',
    /**
     * A miner has been identified for a block
     */
    v126: new EventType(
        'MiningRewards.MinerRewarded',
        sts.struct({
            /**
             * Miner account
             */
            miner: v126.AccountId32,
            /**
             * Total reward (base + fees)
             */
            reward: sts.bigint(),
        })
    ),
}

export const feesCollected =  {
    name: 'MiningRewards.FeesCollected',
    /**
     * Transaction fees were collected for later distribution
     */
    v126: new EventType(
        'MiningRewards.FeesCollected',
        sts.struct({
            /**
             * The amount collected
             */
            amount: sts.bigint(),
            /**
             * Total fees waiting for distribution
             */
            total: sts.bigint(),
        })
    ),
}

export const treasuryRewarded =  {
    name: 'MiningRewards.TreasuryRewarded',
    /**
     * Rewards were sent to Treasury when no miner was specified
     */
    v126: new EventType(
        'MiningRewards.TreasuryRewarded',
        sts.struct({
            /**
             * Total reward (base + fees)
             */
            reward: sts.bigint(),
        })
    ),
}
