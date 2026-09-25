import {sts, Block, Bytes, Option, Result, ConstantType, RuntimeCtx} from '../support'
import * as v126 from '../v126'

export const proposalFee =  {
    /**
     *  Fee charged for creating a proposal (non-refundable, paid always)
     */
    v126: new ConstantType(
        'Multisig.ProposalFee',
        sts.bigint()
    ),
}

export const signerStepFactor =  {
    /**
     *  Percentage increase in ProposalFee for each signer in the multisig.
     * 
     *  Formula: `FinalFee = ProposalFee + (ProposalFee * SignerCount * SignerStepFactor)`
     *  Example: If Fee=100, Signers=5, Factor=1%, then Extra = 100 * 5 * 0.01 = 5. Total = 105.
     */
    v126: new ConstantType(
        'Multisig.SignerStepFactor',
        v126.Permill
    ),
}
