import {sts, Block, Bytes, Option, Result, EventType, RuntimeCtx} from '../support'
import * as v126 from '../v126'
import * as v131 from '../v131'

export const multisigCreated =  {
    name: 'Multisig.MultisigCreated',
    /**
     * A new multisig account was created
     * [creator, multisig_address, signers, threshold, nonce]
     */
    v126: new EventType(
        'Multisig.MultisigCreated',
        sts.struct({
            creator: v126.AccountId32,
            multisigAddress: v126.AccountId32,
            signers: sts.array(() => v126.AccountId32),
            threshold: sts.number(),
            nonce: sts.bigint(),
        })
    ),
}

export const proposalCreated =  {
    name: 'Multisig.ProposalCreated',
    /**
     * A proposal has been created
     */
    v126: new EventType(
        'Multisig.ProposalCreated',
        sts.struct({
            multisigAddress: v126.AccountId32,
            proposer: v126.AccountId32,
            proposalId: sts.number(),
        })
    ),
}

export const proposalReadyToExecute =  {
    name: 'Multisig.ProposalReadyToExecute',
    /**
     * A proposal has reached threshold and is ready to execute
     */
    v126: new EventType(
        'Multisig.ProposalReadyToExecute',
        sts.struct({
            multisigAddress: v126.AccountId32,
            proposalId: sts.number(),
            approvalsCount: sts.number(),
        })
    ),
}

export const proposalExecuted =  {
    name: 'Multisig.ProposalExecuted',
    /**
     * A proposal has been executed
     * Contains all data needed for indexing by SubSquid
     */
    v126: new EventType(
        'Multisig.ProposalExecuted',
        sts.struct({
            multisigAddress: v126.AccountId32,
            proposalId: sts.number(),
            proposer: v126.AccountId32,
            call: sts.bytes(),
            approvers: sts.array(() => v126.AccountId32),
            result: sts.result(() => sts.unit(), () => v126.DispatchError),
        })
    ),
}

export const proposalCancelled =  {
    name: 'Multisig.ProposalCancelled',
    /**
     * A proposal has been cancelled by the proposer
     */
    v126: new EventType(
        'Multisig.ProposalCancelled',
        sts.struct({
            multisigAddress: v126.AccountId32,
            proposer: v126.AccountId32,
            proposalId: sts.number(),
        })
    ),
}

export const proposalRemoved =  {
    name: 'Multisig.ProposalRemoved',
    /**
     * Expired proposal was removed from storage
     */
    v126: new EventType(
        'Multisig.ProposalRemoved',
        sts.struct({
            multisigAddress: v126.AccountId32,
            proposalId: sts.number(),
            proposer: v126.AccountId32,
            removedBy: v126.AccountId32,
        })
    ),
}

export const depositsClaimed =  {
    name: 'Multisig.DepositsClaimed',
    /**
     * Batch deposits claimed
     */
    v126: new EventType(
        'Multisig.DepositsClaimed',
        sts.struct({
            multisigAddress: v126.AccountId32,
            claimer: v126.AccountId32,
            totalReturned: sts.bigint(),
            proposalsRemoved: sts.number(),
            multisigRemoved: sts.boolean(),
        })
    ),
    /**
     * Batch deposits claimed
     */
    v131: new EventType(
        'Multisig.DepositsClaimed',
        sts.struct({
            multisigAddress: v131.AccountId32,
            claimer: v131.AccountId32,
            totalReturned: sts.bigint(),
            proposalsRemoved: sts.number(),
        })
    ),
}

export const signerApproved =  {
    name: 'Multisig.SignerApproved',
    /**
     * A signer has approved a proposal (does not imply threshold reached)
     */
    v131: new EventType(
        'Multisig.SignerApproved',
        sts.struct({
            multisigAddress: v131.AccountId32,
            approver: v131.AccountId32,
            proposalId: sts.number(),
            approvalsCount: sts.number(),
        })
    ),
}
