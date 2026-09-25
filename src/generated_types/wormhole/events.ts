import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v126 from '../v126'
import * as v136 from '../v136'

export const nativeTransferred =  {
    name: 'Wormhole.NativeTransferred',
    /**
     * A native token transfer was recorded.
     * 
     * The `leaf_index` can be used to fetch Merkle proofs via the
     * `zkTrie_getMerkleProof` RPC for ZK circuit verification.
     */
    v126: new EventType(
        'Wormhole.NativeTransferred',
        sts.struct({
            from: v126.AccountId32,
            to: v126.AccountId32,
            amount: sts.bigint(),
            transferCount: sts.bigint(),
            /**
             * Index of this transfer in the ZK trie (for Merkle proof lookup)
             */
            leafIndex: sts.bigint(),
        })
    ),
}

export const proofVerified =  {
    name: 'Wormhole.ProofVerified',
    v126: new EventType(
        'Wormhole.ProofVerified',
        sts.struct({
            exitAmount: sts.bigint(),
            nullifiers: sts.array(() => sts.bytes()),
        })
    ),
}

export const minerVolumeFeePaid =  {
    name: 'Wormhole.MinerVolumeFeePaid',
    /**
     * The block author's share of the wormhole exit volume fee was minted.
     * 
     * NOTE: keep this as the last variant — indexers decode events by their
     * position in this enum, so existing variants must never be reordered.
     */
    v136: new EventType(
        'Wormhole.MinerVolumeFeePaid',
        sts.struct({
            miner: v136.AccountId32,
            amount: sts.bigint(),
        })
    ),
}
