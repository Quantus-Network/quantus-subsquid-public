/**
 * GraphQL documents copied from explorer/src/api (Hasura snake_case).
 * Keep smoke + breakpoint aligned with real explorer traffic.
 *
 * Sources:
 * - unified-transactions.tsx
 * - accounts.tsx
 * - blocks.tsx
 * - transactions.tsx
 * - search.tsx
 * - chain-status.tsx
 * - miner-leaderboard.tsx
 * - miner-rewards.tsx
 * - errors.tsx
 * - high-security-sets.tsx
 * - multisig-created.tsx
 * - multisig-proposals.tsx
 * - scheduled/executed/cancelled-reversible-transactions.tsx
 * - wormhole.tsx
 */

export const QUERY_DEFAULT_LIMIT = 25;
export const QUERY_RECENT_LIMIT = 6;
export const SEARCH_PREVIEW_RESULTS_LIMIT = 5;
export const MINER_LEADERBOARD_CHART_TOP_N = 10;

/** Hashless IMMEDIATE rows are miner/treasury rewards (explorer filter). */
export const EXCLUDE_REWARD_TRANSFERS = {
  _not: {
    _and: [{ type: { _eq: 'IMMEDIATE' } }, { hash: { _is_null: true } }],
  },
};

export function withExcludedRewardTransfers(where) {
  if (!where) return EXCLUDE_REWARD_TRANSFERS;
  return { _and: [EXCLUDE_REWARD_TRANSFERS, where] };
}

// --- Documents (from explorer) ---

export const GET_RECENT_UNIFIED_TRANSACTIONS = `
  query GetRecentUnifiedTransactions(
    $limit: Int
    $offset: Int
    $orderBy: [unified_transaction_order_by!]
    $where: unified_transaction_bool_exp
  ) {
    transactions: unified_transaction(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      type
      hash
      block {
        height
        hash
      }
      timestamp
      amount
      fee
      status
      detail_id
      from { id }
      to { id }
    }
  }
`;

export const GET_UNIFIED_TRANSACTIONS = `
  query GetUnifiedTransactionsWithChainTotal(
    $limit: Int
    $offset: Int
    $orderBy: [unified_transaction_order_by!]
    $where: unified_transaction_bool_exp
  ) {
    transactions: unified_transaction(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      type
      hash
      block {
        height
        hash
      }
      timestamp
      amount
      fee
      status
      detail_id
      from { id }
      to { id }
    }
    meta: chain_stats_by_pk(id: "global") {
      total_immediate_transfers
      total_scheduled_transfers
      total_executed_transfers
      total_cancelled_transfers
    }
  }
`;

export const GET_UNIFIED_TRANSACTIONS_FILTERED = `
  query GetUnifiedTransactions(
    $limit: Int
    $offset: Int
    $orderBy: [unified_transaction_order_by!]
    $where: unified_transaction_bool_exp
  ) {
    transactions: unified_transaction(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      type
      hash
      block {
        height
        hash
      }
      timestamp
      amount
      fee
      status
      detail_id
      from { id }
      to { id }
    }
    meta: unified_transaction_aggregate(where: $where) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

/** Account party list: O(1) total from account_stats (matches explorer fast path). */
export const GET_UNIFIED_TRANSACTIONS_WITH_ACCOUNT_TOTAL = `
  query GetUnifiedTransactionsWithAccountTotal(
    $limit: Int
    $offset: Int
    $orderBy: [unified_transaction_order_by!]
    $where: unified_transaction_bool_exp
    $accountId: String!
  ) {
    transactions: unified_transaction(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      type
      hash
      block {
        height
        hash
      }
      timestamp
      amount
      fee
      status
      detail_id
      from { id }
      to { id }
    }
    meta: account_stats_by_pk(id: $accountId) {
      total_immediate_transfers
      total_scheduled_transfers
      total_executed_transfers
      total_cancelled_transfers
    }
  }
`;

export const GET_UNIFIED_TRANSACTIONS_STATS = `
  query GetUnifiedTransactionsStats(
    $last24HourWhere: unified_transaction_bool_exp!
  ) {
    last24Hour: unified_transaction_aggregate(where: $last24HourWhere) {
      aggregate {
        totalCount: count
      }
    }
    allTime: chain_stats_by_pk(id: "global") {
      total_immediate_transfers
      total_scheduled_transfers
      total_executed_transfers
      total_cancelled_transfers
    }
  }
`;

export const GET_ACCOUNTS = `
  query GetAccounts(
    $limit: Int
    $offset: Int
    $orderBy: [account_order_by!]
  ) {
    accounts: account(limit: $limit, offset: $offset, order_by: $orderBy) {
      id
      free
      frozen
      reserved
      flagEvents: accountEvents(
        where: {
          _or: [
            { high_security_set_id: { _is_null: false } }
            { multisig_id: { _is_null: false } }
          ]
        }
        limit: 20
      ) {
        highSecuritySet {
          who_id
          guardian_id
        }
        multisig_id
      }
    }
    meta: chain_stats_by_pk(id: "global") {
      totalCount: total_accounts
    }
  }
`;

export const GET_ACCOUNT_BY_ID = `
  query GetAccountById($id: String!) {
    account: account_by_pk(id: $id) {
      id
      free
      frozen
      reserved
    }
    accountStats: account_stats_by_pk(id: $id) {
      total_cancelled_transfers
      total_executed_transfers
      total_immediate_transfers
      total_mined_blocks
      total_rewards
      total_scheduled_transfers
    }
    multisig: multisig_by_pk(id: $id) {
      id
    }
    guardian: high_security_set_aggregate(
      where: { who: { id: { _eq: $id } } }
    ) {
      aggregate {
        totalCount: count
      }
    }
    beneficiaries: high_security_set_aggregate(
      where: { guardian: { id: { _eq: $id } } }
    ) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_ACCOUNTS_STATS = `
  query GetAccountsStats($startDate: timestamptz!, $endDate: timestamptz!) {
    all: chain_stats_by_pk(id: "global") {
      total_accounts
    }
    recentlyActive: account_aggregate(
      where: {
        transfersFrom: { timestamp: { _gte: $startDate, _lte: $endDate } }
      }
    ) {
      aggregate {
        count
      }
    }
    recentlyDeposited: account_aggregate(
      where: {
        transfersTo: { timestamp: { _gte: $startDate, _lte: $endDate } }
      }
    ) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_BLOCKS = `
  query GetBlocks(
    $limit: Int
    $offset: Int
    $orderBy: [block_order_by!]!
    $where: block_bool_exp
  ) {
    blocks: block(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      hash
      height
      reward
      timestamp
      mined_by_id
      extrinsics {
        id
      }
    }
    meta: chain_stats_by_pk(id: "global") {
      totalCount: block_height
    }
  }
`;

export const GET_BLOCK_BY_ID = `
  query GetBlockById($height: Int!, $hash: String!) {
    blocks: block(
      where: {
        _or: [{ height: { _eq: $height } }, { hash: { _eq: $hash } }]
      }
    ) {
      id
      hash
      height
      reward
      timestamp
      extrinsics(order_by: { index_in_block: asc }) {
        id
        pallet
        call
        success
        fee
        timestamp
        indexInBlock: index_in_block
        signer {
          id
        }
      }
    }
    minerRewards: miner_reward(
      where: {
        block: {
          _or: [{ height: { _eq: $height } }, { hash: { _eq: $hash } }]
        }
      }
    ) {
      reward
      timestamp
      miner {
        id
      }
      block {
        height
        hash
      }
    }
    rewardTransfers: unified_transaction(
      where: {
        type: { _eq: "IMMEDIATE" }
        hash: { _is_null: true }
        block: {
          _or: [{ height: { _eq: $height } }, { hash: { _eq: $hash } }]
        }
      }
    ) {
      amount
      detail_id
      from { id }
      to { id }
    }
  }
`;

export const GET_BLOCK_STATS = `
  query GetBlockStats($startDate: timestamptz!, $endDate: timestamptz!) {
    chain: chain_stats_by_pk(id: "global") {
      block_height
      finalized_block_height
    }
    minedIn24Hours: block_aggregate(
      where: { timestamp: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_EXTRINSIC_BY_HASH = `
  query GetExtrinsicByHash($hash: String!) {
    extrinsics: extrinsic(where: { id: { _eq: $hash } }) {
      id
      pallet
      call
      success
      fee
      timestamp
      index_in_block
      signer {
        id
      }
      block {
        height
      }
    }
    transfersByExtrinsic: transfer(
      where: { extrinsic: { id: { _eq: $hash } } }
      order_by: { timestamp: asc }
    ) {
      id
      amount
      timestamp
      from { id }
      to { id }
      block {
        height
      }
      extrinsic {
        id
        pallet
        call
        success
        fee
        timestamp
        index_in_block
        signer {
          id
        }
        block {
          height
        }
      }
    }
    transfersById: transfer(where: { id: { _eq: $hash } }) {
      id
      amount
      timestamp
      from { id }
      to { id }
      block {
        height
      }
      extrinsic {
        id
        pallet
        call
        success
        fee
        timestamp
        index_in_block
        signer {
          id
        }
        block {
          height
        }
      }
    }
  }
`;

export const GET_SCHEDULED_REVERSIBLE_BY_TX_ID = `
  query GetScheduledReversibleTransactionByTxId($tx_id: String!) {
    scheduledReversibleTransactions: scheduled_reversible_transfer(
      where: { tx_id: { _eq: $tx_id } }
    ) {
      extrinsic {
        id
        pallet
        call
      }
      amount
      timestamp
      scheduled_at
      tx_id
      fee
      block {
        height
      }
      from { id }
      to { id }
    }
  }
`;

export const GET_EXECUTED_REVERSIBLE_BY_TX_ID = `
  query GetExecutedReversibleTransactionByTxId($tx_id: String!) {
    executedReversibleTransactions: executed_reversible_transfer(
      where: { tx_id: { _eq: $tx_id } }
    ) {
      timestamp
      tx_id
      block {
        height
      }
      scheduledTransfer {
        amount
        scheduled_at
        fee
        from { id }
        to { id }
      }
    }
  }
`;

export const GET_CANCELLED_REVERSIBLE_BY_TX_ID = `
  query GetCancelledReversibleTransactionByTxId($tx_id: String!) {
    cancelledReversibleTransactions: cancelled_reversible_transfer(
      where: { tx_id: { _eq: $tx_id } }
    ) {
      timestamp
      tx_id
      block {
        height
      }
      cancelledBy { id }
      extrinsic {
        id
        pallet
        call
      }
      scheduledTransfer {
        amount
        scheduled_at
        fee
        from { id }
        to { id }
      }
    }
  }
`;

export const GET_WORMHOLE_EXTRINSIC_BY_ID = `
  query GetWormholeExtrinsicById($id: String!) {
    wormholeExtrinsicById: wormhole_extrinsic_by_pk(id: $id) {
      id
      extrinsic {
        id
        pallet
        call
      }
      total_amount
      output_count
      timestamp
      privacy_score
      privacy_score01_pct
      privacy_score1_pct
      privacy_score5_pct
      privacy_label
      pool_snapshot
      block {
        id
        height
        hash
        timestamp
      }
      outputs {
        id
        exitAccount { id }
        amount
      }
    }
    wormholeNullifiers: wormhole_nullifier(
      where: { wormholeExtrinsic: { id: { _eq: $id } } }
    ) {
      nullifier
      nullifier_hash
    }
  }
`;

export const SEARCH_HEX = `
  query SearchHex($keyword: String, $limit: Int) {
    transactions: unified_transaction(
      limit: $limit
      where: {
        _or: [
          { hash: { _like: $keyword } }
          { detail_id: { _like: $keyword } }
        ]
      }
    ) {
      id
      type
      hash
      detail_id
      block {
        height
        hash
      }
    }
    blocks: block(limit: $limit, where: { hash: { _like: $keyword } }) {
      height
    }
    highSecuritySets: high_security_set(
      limit: $limit
      where: { extrinsic: { id: { _like: $keyword } } }
    ) {
      extrinsic {
        id
        pallet
        call
      }
    }
  }
`;

export const SEARCH_NUMERIC = `
  query SearchNumeric($keyword: String, $keyword_number: Int, $limit: Int) {
    transactions: unified_transaction(
      limit: $limit
      where: { detail_id: { _like: $keyword } }
    ) {
      id
      type
      hash
      detail_id
      block {
        height
        hash
      }
    }
    blocks: block(
      limit: $limit
      where: { height: { _eq: $keyword_number } }
    ) {
      height
    }
  }
`;

export const SEARCH_TEXT = `
  query SearchText($keyword: String, $limit: Int) {
    accounts: account(limit: $limit, where: { id: { _like: $keyword } }) {
      id
    }
    errorEvents: error_event(
      limit: $limit
      where: {
        _or: [
          { error_type: { _ilike: $keyword } }
          { error_name: { _ilike: $keyword } }
        ]
      }
    ) {
      extrinsic {
        id
        pallet
        call
      }
    }
  }
`;

/** @deprecated Use SEARCH_HEX / SEARCH_NUMERIC / SEARCH_TEXT via searchRequest() */
export const SEARCH_ALL = SEARCH_HEX;

export const GET_STATUS = `
  query GetStatus {
    status: chain_stats_by_pk(id: "global") {
      block_height
      total_accounts
      total_deposit_accounts
      total_executed_transfers
      total_immediate_transfers
      total_scheduled_transfers
      total_cancelled_transfers
    }
  }
`;

/** Home hero stats — chain_stats + last24h + UTC daily rollups. */
export const GET_HOME_CHAIN_STATS = `
  query GetHomeChainStats(
    $last24HourWhere: unified_transaction_bool_exp!
    $dayLimit: Int!
  ) {
    status: chain_stats_by_pk(id: "global") {
      block_height
      total_accounts
      total_deposit_accounts
      total_immediate_transfers
      total_scheduled_transfers
      total_executed_transfers
      total_cancelled_transfers
    }
    last24Hour: unified_transaction_aggregate(where: $last24HourWhere) {
      aggregate { count }
    }
    dailyStats: daily_chain_stats(
      order_by: { date: desc }
      limit: $dayLimit
    ) {
      id
      date
      blocks_count
      tx_count
      active_accounts
    }
  }
`;

export const GET_MINER_LEADERBOARD = `
  query GetMinerLeaderboard($limit: Int, $offset: Int) {
    leaderboardEntries: account_stats(
      limit: $limit
      offset: $offset
      order_by: { total_mined_blocks: desc }
      where: { total_mined_blocks: { _gt: 0 } }
    ) {
      id
      total_mined_blocks
      total_rewards
    }
    meta: chain_stats_by_pk(id: "global") {
      totalCount: total_miners
      block_height
    }
    topMiner: account_stats(
      limit: 1
      order_by: { total_mined_blocks: desc }
      where: { total_mined_blocks: { _gt: 0 } }
    ) {
      total_mined_blocks
    }
  }
`;

export const GET_MINER_LEADERBOARD_CHART = `
  query GetMinerLeaderboardChart($limit: Int) {
    topMiners: account_stats(
      limit: $limit
      order_by: { total_mined_blocks: desc }
      where: { total_mined_blocks: { _gt: 0 } }
    ) {
      id
      total_mined_blocks
    }
    blocks: chain_stats_by_pk(id: "global") {
      totalCount: block_height
    }
  }
`;

export const GET_MINER_LEADERBOARD_STATS = `
  query GetMinerLeaderboardStats(
    $startDate: timestamptz!
    $endDate: timestamptz!
  ) {
    chain: chain_stats_by_pk(id: "global") {
      block_height
      total_miners
    }
    last24Hour: miner_reward_aggregate(
      where: { timestamp: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_MINER_REWARDS = `
  query GetMinerRewards(
    $limit: Int
    $offset: Int
    $orderBy: [miner_reward_order_by!]
    $where: miner_reward_bool_exp
  ) {
    minerRewards: miner_reward(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      block {
        height
        hash
      }
      reward
      miner { id }
      timestamp
    }
    meta: miner_reward_aggregate(where: $where) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_MINER_REWARDS_STATS = `
  query GetMinerRewardsStats(
    $startDate: timestamptz!
    $endDate: timestamptz!
  ) {
    last24Hour: miner_reward_aggregate(
      where: { timestamp: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
    allTime: chain_stats_by_pk(id: "global") {
      total_miner_rewards
    }
  }
`;

export const GET_ERROR_EVENTS = `
  query GetErrorEvents(
    $limit: Int
    $offset: Int
    $orderBy: [error_event_order_by!]
    $where: error_event_bool_exp
  ) {
    errorEvents: error_event(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      error_docs
      error_module
      error_name
      error_type
      extrinsic {
        id
        pallet
        call
      }
      id
      timestamp
      block {
        height
      }
    }
    meta: error_event_aggregate(where: $where) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_ERROR_EVENTS_STATS = `
  query GetErrorEventsStats(
    $startDate: timestamptz!
    $endDate: timestamptz!
  ) {
    last24Hour: error_event_aggregate(
      where: { timestamp: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
    allTime: chain_stats_by_pk(id: "global") {
      total_error_events
    }
  }
`;

export const GET_HIGH_SECURITY_SETS = `
  query GetHighSecuritySets(
    $limit: Int
    $offset: Int
    $orderBy: [high_security_set_order_by!]
    $where: high_security_set_bool_exp
  ) {
    highSecuritySets: high_security_set(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      extrinsic {
        id
        pallet
        call
      }
      who { id }
      guardian { id }
      timestamp
      delay
      block {
        height
      }
    }
    meta: high_security_set_aggregate(where: $where) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_HIGH_SECURITY_SETS_STATS = `
  query GetHighSecuritySetsStats(
    $startDate: timestamptz!
    $endDate: timestamptz!
  ) {
    last24Hour: high_security_set_aggregate(
      where: { timestamp: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
    allTime: chain_stats_by_pk(id: "global") {
      total_high_security_sets
    }
  }
`;

export const GET_MULTISIG_CREATED = `
  query GetMultisigCreated(
    $limit: Int
    $offset: Int
    $orderBy: [multisig_order_by!]
    $where: multisig_bool_exp
  ) {
    multisigCreatedEvents: multisig(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      timestamp
      threshold
      nonce
      signers
      creator { id }
      block {
        height
      }
      extrinsic {
        id
        pallet
        call
      }
    }
    meta: multisig_aggregate(where: $where) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_MULTISIG_CREATED_STATS = `
  query GetMultisigCreatedStats(
    $startDate: timestamptz!
    $endDate: timestamptz!
  ) {
    last24Hour: multisig_aggregate(
      where: { timestamp: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
    allTime: chain_stats_by_pk(id: "global") {
      total_multisigs_created
    }
  }
`;

export const GET_MULTISIG_BY_ID = `
  query GetMultisigById($id: String!) {
    multisig: multisig_by_pk(id: $id) {
      id
      timestamp
      threshold
      nonce
      signers
      creator { id }
      block {
        height
      }
      extrinsic {
        id
        pallet
        call
      }
    }
  }
`;

export const GET_MULTISIG_PROPOSALS = `
  query GetMultisigProposals(
    $limit: Int
    $offset: Int
    $orderBy: [multisig_proposal_order_by!]
    $where: multisig_proposal_bool_exp
  ) {
    multisigProposals: multisig_proposal(
      limit: $limit
      offset: $offset
      order_by: $orderBy
      where: $where
    ) {
      id
      status
      deposit
      expiry_block
      approvals
      created_at
      multisig { id }
      proposer { id }
    }
    meta: multisig_proposal_aggregate(where: $where) {
      aggregate {
        totalCount: count
      }
    }
  }
`;

export const GET_MULTISIG_PROPOSAL_STATS = `
  query GetMultisigProposalStats(
    $startDate: timestamptz!
    $endDate: timestamptz!
  ) {
    last24Hour: multisig_proposal_aggregate(
      where: { created_at: { _gte: $startDate, _lte: $endDate } }
    ) {
      aggregate {
        totalCount: count
      }
    }
    allTime: chain_stats_by_pk(id: "global") {
      total_multisig_proposals
    }
  }
`;

export const GET_MULTISIG_PROPOSAL_BY_ID = `
  query GetMultisigProposalById($id: String!) {
    multisigProposal: multisig_proposal_by_pk(id: $id) {
      id
      status
      deposit
      expiry_block
      approvals
      pallet
      call
      call_raw
      decode_error
      created_at
      tx_id
      transfer_amount
      schedule_amount
      delay_kind
      delay_value
      schedule_asset_id
      multisig { id }
      proposer { id }
      guardian { id }
      transferTo { id }
      scheduleTo { id }
      recoverAccount { id }
      createdExtrinsic {
        id
        pallet
        call
      }
      createdAtBlock {
        height
      }
    }
    createdEvents: multisig_proposal_created(
      where: { proposal_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      timestamp
      extrinsic { id }
      block { height }
    }
    signerApprovedEvents: multisig_signer_approved(
      where: { proposal_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      timestamp
      extrinsic { id }
      block { height }
    }
    readyEvents: multisig_proposal_ready(
      where: { proposal_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      timestamp
      extrinsic { id }
      block { height }
    }
    executedEvents: executed_multisig_proposal(
      where: { proposal_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      timestamp
      extrinsic { id }
      block { height }
    }
    cancelledEvents: cancelled_multisig_proposal(
      where: { proposal_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      timestamp
      extrinsic { id }
      block { height }
    }
    removedEvents: removed_multisig_proposal(
      where: { proposal_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      timestamp
      extrinsic { id }
      block { height }
    }
  }
`;

/** Seed fixtures for detail/list queries used in the mix. */
export const SEED_FIXTURES = `
  query SeedFixtures($limit: Int!) {
    transactions: unified_transaction(
      limit: $limit
      order_by: { timestamp: desc }
      where: {
        _not: {
          _and: [{ type: { _eq: "IMMEDIATE" } }, { hash: { _is_null: true } }]
        }
      }
    ) {
      type
      hash
      detail_id
      from { id }
      to { id }
      block {
        height
        hash
      }
    }
    multisigs: multisig(limit: 20, order_by: { timestamp: desc }) {
      id
    }
    proposals: multisig_proposal(limit: 20, order_by: { created_at: desc }) {
      id
    }
    wormholes: wormhole_extrinsic(limit: 10, order_by: { timestamp: desc }) {
      id
    }
  }
`;

// --- Date helpers (mirror explorer get-recent-date-range / day windows) ---

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function recent24hRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function last7DaysRange() {
  const end = endOfLocalDay(new Date());
  const start = startOfLocalDay(new Date());
  start.setDate(start.getDate() - 7);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function homeStatsVariables() {
  const { startDate, endDate } = recent24hRange();
  return {
    last24HourWhere: withExcludedRewardTransfers({
      timestamp: { _gte: startDate, _lte: endDate },
    }),
    dayLimit: 7,
  };
}

function accountTransactionsRequest(account, limit = QUERY_DEFAULT_LIMIT) {
  return {
    name: 'GetAccountTransactions',
    query: GET_UNIFIED_TRANSACTIONS_WITH_ACCOUNT_TOTAL,
    variables: {
      orderBy: { timestamp: 'desc' },
      limit,
      offset: 0,
      accountId: account,
      where: withExcludedRewardTransfers({
        _or: [
          { from: { id: { _eq: account } } },
          { to: { id: { _eq: account } } },
        ],
      }),
    },
  };
}

/**
 * Prefer realistic typed prefixes; full hex hashes are fine now that search
 * uses pattern-ops indexes + shape routing (no more OR+_ilike seq scans).
 */
function toTypedSearchKeyword(value) {
  if (!value || typeof value !== 'string') return null;
  return value;
}

function classifySearchKeyword(keyword) {
  if (keyword.startsWith('0x') || keyword.startsWith('0X')) return 'hex';
  if (/^\d+$/.test(keyword)) return 'numeric';
  return 'text';
}

function searchRequest(keyword) {
  const shape = classifySearchKeyword(keyword);
  let k = keyword;
  if (shape === 'hex') k = keyword.toLowerCase();
  if (k.length > 0) k = `${k}%`;

  // Hasura rejects undeclared variables — only send what each document declares.
  if (shape === 'hex') {
    return {
      name: 'SearchHex',
      query: SEARCH_HEX,
      variables: { keyword: k, limit: SEARCH_PREVIEW_RESULTS_LIMIT },
    };
  }
  if (shape === 'numeric') {
    return {
      name: 'SearchNumeric',
      query: SEARCH_NUMERIC,
      variables: {
        keyword: k,
        keyword_number: Number(keyword),
        limit: SEARCH_PREVIEW_RESULTS_LIMIT,
      },
    };
  }
  return {
    name: 'SearchText',
    query: SEARCH_TEXT,
    variables: { keyword: k, limit: SEARCH_PREVIEW_RESULTS_LIMIT },
  };
}

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function listVars(orderBy) {
  return {
    orderBy,
    limit: QUERY_DEFAULT_LIMIT,
    offset: 0,
  };
}

/**
 * Parse SeedFixtures response into IDs for detail queries.
 */
export function fixturesFromSeed(body) {
  const rows = body?.data?.transactions || [];
  const accounts = [];
  const blocks = [];
  const hashes = [];
  const keywords = [];
  const scheduledTxIds = [];
  const executedTxIds = [];
  const cancelledTxIds = [];

  for (const row of rows) {
    if (row.from?.id) {
      accounts.push(row.from.id);
      const kw = toTypedSearchKeyword(row.from.id);
      if (kw) keywords.push(kw);
    }
    if (row.to?.id) accounts.push(row.to.id);
    if (row.block?.height != null && row.block?.hash) {
      blocks.push({ height: row.block.height, hash: row.block.hash });
      keywords.push(String(row.block.height));
    }
    if (row.hash) {
      hashes.push(row.hash);
      const kw = toTypedSearchKeyword(row.hash);
      if (kw) keywords.push(kw);
    }
    if (row.detail_id) {
      const kw = toTypedSearchKeyword(row.detail_id);
      if (kw) keywords.push(kw);
      if (row.type === 'SCHEDULED_REVERSIBLE') scheduledTxIds.push(row.detail_id);
      if (row.type === 'EXECUTED_REVERSIBLE') executedTxIds.push(row.detail_id);
      if (row.type === 'CANCELLED_REVERSIBLE') cancelledTxIds.push(row.detail_id);
    }
  }

  const multisigIds = (body?.data?.multisigs || [])
    .map((m) => m.id)
    .filter(Boolean);
  const proposalIds = (body?.data?.proposals || [])
    .map((p) => p.id)
    .filter(Boolean);
  const wormholeIds = (body?.data?.wormholes || [])
    .map((w) => w.id)
    .filter(Boolean);

  return {
    accounts: [...new Set(accounts)],
    blocks,
    hashes: [...new Set(hashes)],
    keywords: [...new Set(keywords)],
    scheduledTxIds: [...new Set(scheduledTxIds)],
    executedTxIds: [...new Set(executedTxIds)],
    cancelledTxIds: [...new Set(cancelledTxIds)],
    multisigIds: [...new Set(multisigIds)],
    proposalIds: [...new Set(proposalIds)],
    wormholeIds: [...new Set(wormholeIds)],
  };
}

function pickTxDetail(fixtures) {
  const options = [];
  if (fixtures.hashes?.length) {
    options.push({
      name: 'GetExtrinsicByHash',
      query: GET_EXTRINSIC_BY_HASH,
      variables: { hash: pick(fixtures.hashes) },
    });
  }
  if (fixtures.scheduledTxIds?.length) {
    options.push({
      name: 'GetScheduledReversibleTransactionByTxId',
      query: GET_SCHEDULED_REVERSIBLE_BY_TX_ID,
      variables: { tx_id: pick(fixtures.scheduledTxIds) },
    });
  }
  if (fixtures.executedTxIds?.length) {
    options.push({
      name: 'GetExecutedReversibleTransactionByTxId',
      query: GET_EXECUTED_REVERSIBLE_BY_TX_ID,
      variables: { tx_id: pick(fixtures.executedTxIds) },
    });
  }
  if (fixtures.cancelledTxIds?.length) {
    options.push({
      name: 'GetCancelledReversibleTransactionByTxId',
      query: GET_CANCELLED_REVERSIBLE_BY_TX_ID,
      variables: { tx_id: pick(fixtures.cancelledTxIds) },
    });
  }
  if (fixtures.wormholeIds?.length) {
    options.push({
      name: 'GetWormholeExtrinsicById',
      query: GET_WORMHOLE_EXTRINSIC_BY_ID,
      variables: { id: pick(fixtures.wormholeIds) },
    });
  }
  if (options.length === 0) {
    return {
      name: 'GetExtrinsicByHash',
      query: GET_EXTRINSIC_BY_HASH,
      variables: { hash: '0x' },
    };
  }
  return pick(options);
}

function pickStatsProbe() {
  const { startDate, endDate } = recent24hRange();
  const week = last7DaysRange();
  const options = [
    {
      name: 'GetUnifiedTransactionsStats',
      query: GET_UNIFIED_TRANSACTIONS_STATS,
      variables: {
        last24HourWhere: withExcludedRewardTransfers({
          timestamp: { _gte: startDate, _lte: endDate },
        }),
      },
    },
    {
      name: 'GetBlockStats',
      query: GET_BLOCK_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetAccountsStats',
      query: GET_ACCOUNTS_STATS,
      variables: { startDate: week.startDate, endDate: week.endDate },
    },
    {
      name: 'GetMinerLeaderboardStats',
      query: GET_MINER_LEADERBOARD_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetMinerRewardsStats',
      query: GET_MINER_REWARDS_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetErrorEventsStats',
      query: GET_ERROR_EVENTS_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetHighSecuritySetsStats',
      query: GET_HIGH_SECURITY_SETS_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetMultisigCreatedStats',
      query: GET_MULTISIG_CREATED_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetMultisigProposalStats',
      query: GET_MULTISIG_PROPOSAL_STATS,
      variables: { startDate, endDate },
    },
  ];
  return pick(options);
}

/**
 * Weighted mix approximating explorer browsing across current src/api pages.
 *
 * @param {ReturnType<typeof fixturesFromSeed>} fixtures
 */
export function pickQuery(fixtures) {
  const r = Math.random();
  const account = pick(fixtures.accounts) || 'unknown';
  const block = pick(fixtures.blocks) || { height: 0, hash: '' };
  const keyword = pick(fixtures.keywords) || account;
  const multisigId = pick(fixtures.multisigIds);
  const proposalId = pick(fixtures.proposalIds);

  // ~14% landing recent txs
  if (r < 0.14) {
    return {
      name: 'GetRecentUnifiedTransactions',
      query: GET_RECENT_UNIFIED_TRANSACTIONS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: QUERY_RECENT_LIMIT,
        offset: 0,
        where: EXCLUDE_REWARD_TRANSFERS,
      },
    };
  }

  // ~17% blocks list — split landing (limit 6) vs blocks page (limit 25)
  if (r < 0.31) {
    const landing = Math.random() < 0.59;
    return {
      name: landing ? 'GetBlocksLanding' : 'GetBlocks',
      query: GET_BLOCKS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: landing ? QUERY_RECENT_LIMIT : QUERY_DEFAULT_LIMIT,
        offset: 0,
      },
    };
  }

  // ~12% transactions list (with chain_stats total)
  if (r < 0.43) {
    return {
      name: 'GetUnifiedTransactions',
      query: GET_UNIFIED_TRANSACTIONS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: QUERY_DEFAULT_LIMIT,
        offset: 0,
        where: EXCLUDE_REWARD_TRANSFERS,
      },
    };
  }

  // ~8% account detail
  if (r < 0.51) {
    return {
      name: 'GetAccountById',
      query: GET_ACCOUNT_BY_ID,
      variables: { id: account },
    };
  }

  // ~8% account transactions
  if (r < 0.59) {
    return accountTransactionsRequest(account);
  }

  // ~6% home chain stats (expensive)
  if (r < 0.65) {
    return {
      name: 'GetHomeChainStats',
      query: GET_HOME_CHAIN_STATS,
      variables: homeStatsVariables(),
    };
  }

  // ~5% block detail
  if (r < 0.7) {
    return {
      name: 'GetBlockById',
      query: GET_BLOCK_BY_ID,
      variables: { height: block.height, hash: block.hash },
    };
  }

  // ~5% tx / reversible / wormhole detail
  if (r < 0.75) {
    return pickTxDetail(fixtures);
  }

  // ~3% search
  if (r < 0.78) {
    return searchRequest(keyword);
  }

  // ~3% accounts list
  if (r < 0.81) {
    return {
      name: 'GetAccounts',
      query: GET_ACCOUNTS,
      variables: listVars({ id: 'desc' }),
    };
  }

  // ~3% miner leaderboard (+ occasional chart poll)
  if (r < 0.84) {
    if (Math.random() < 0.4) {
      return {
        name: 'GetMinerLeaderboardChart',
        query: GET_MINER_LEADERBOARD_CHART,
        variables: { limit: MINER_LEADERBOARD_CHART_TOP_N },
      };
    }
    return {
      name: 'GetMinerLeaderboard',
      query: GET_MINER_LEADERBOARD,
      variables: { limit: QUERY_DEFAULT_LIMIT, offset: 0 },
    };
  }

  // ~2% miner rewards list
  if (r < 0.86) {
    return {
      name: 'GetMinerRewards',
      query: GET_MINER_REWARDS,
      variables: listVars({ timestamp: 'desc' }),
    };
  }

  // ~2% error events list
  if (r < 0.88) {
    return {
      name: 'GetErrorEvents',
      query: GET_ERROR_EVENTS,
      variables: listVars({ timestamp: 'desc' }),
    };
  }

  // ~2% high security sets list
  if (r < 0.9) {
    return {
      name: 'GetHighSecuritySets',
      query: GET_HIGH_SECURITY_SETS,
      variables: listVars({ timestamp: 'desc' }),
    };
  }

  // ~2% multisig created list / detail
  if (r < 0.92) {
    if (multisigId && Math.random() < 0.35) {
      return {
        name: 'GetMultisigById',
        query: GET_MULTISIG_BY_ID,
        variables: { id: multisigId },
      };
    }
    return {
      name: 'GetMultisigCreated',
      query: GET_MULTISIG_CREATED,
      variables: listVars({ timestamp: 'desc' }),
    };
  }

  // ~2% multisig proposals list / detail
  if (r < 0.94) {
    if (proposalId && Math.random() < 0.35) {
      return {
        name: 'GetMultisigProposalById',
        query: GET_MULTISIG_PROPOSAL_BY_ID,
        variables: { id: proposalId },
      };
    }
    return {
      name: 'GetMultisigProposals',
      query: GET_MULTISIG_PROPOSALS,
      variables: listVars({ created_at: 'desc' }),
    };
  }

  // ~2% light status poll
  if (r < 0.96) {
    return {
      name: 'GetStatus',
      query: GET_STATUS,
      variables: {},
    };
  }

  // ~4% listing stats probes
  return pickStatsProbe();
}

/** All named probes for smoke setup (one of each hot path). */
export function smokeProbes(fixtures) {
  const account = fixtures.accounts[0] || 'unknown';
  const block = fixtures.blocks[0] || { height: 0, hash: '' };
  const hash = fixtures.hashes[0] || '0x';
  const keyword = fixtures.keywords[0] || '0xab';
  const { startDate, endDate } = recent24hRange();

  const probes = [
    {
      name: 'GetRecentUnifiedTransactions',
      query: GET_RECENT_UNIFIED_TRANSACTIONS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: QUERY_RECENT_LIMIT,
        where: EXCLUDE_REWARD_TRANSFERS,
      },
    },
    {
      name: 'GetUnifiedTransactions',
      query: GET_UNIFIED_TRANSACTIONS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: 5,
        offset: 0,
        where: EXCLUDE_REWARD_TRANSFERS,
      },
    },
    {
      name: 'GetBlocks',
      query: GET_BLOCKS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: 5,
        offset: 0,
      },
    },
    {
      name: 'GetAccountById',
      query: GET_ACCOUNT_BY_ID,
      variables: { id: account },
    },
    accountTransactionsRequest(account, 5),
    {
      name: 'GetBlockById',
      query: GET_BLOCK_BY_ID,
      variables: { height: block.height, hash: block.hash },
    },
    {
      name: 'GetExtrinsicByHash',
      query: GET_EXTRINSIC_BY_HASH,
      variables: { hash },
    },
    {
      ...searchRequest(keyword),
    },
    ...(fixtures.hashes[0]
      ? [searchRequest(fixtures.hashes[0])]
      : []),
    {
      name: 'GetStatus',
      query: GET_STATUS,
      variables: {},
    },
    {
      name: 'GetHomeChainStats',
      query: GET_HOME_CHAIN_STATS,
      variables: homeStatsVariables(),
    },
    {
      name: 'GetBlockStats',
      query: GET_BLOCK_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetMinerLeaderboard',
      query: GET_MINER_LEADERBOARD,
      variables: { limit: 5, offset: 0 },
    },
    {
      name: 'GetMinerLeaderboardChart',
      query: GET_MINER_LEADERBOARD_CHART,
      variables: { limit: MINER_LEADERBOARD_CHART_TOP_N },
    },
    {
      name: 'GetMinerRewards',
      query: GET_MINER_REWARDS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: 5,
        offset: 0,
      },
    },
    {
      name: 'GetErrorEvents',
      query: GET_ERROR_EVENTS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: 5,
        offset: 0,
      },
    },
    {
      name: 'GetHighSecuritySets',
      query: GET_HIGH_SECURITY_SETS,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: 5,
        offset: 0,
      },
    },
    {
      name: 'GetMultisigCreated',
      query: GET_MULTISIG_CREATED,
      variables: {
        orderBy: { timestamp: 'desc' },
        limit: 5,
        offset: 0,
      },
    },
    {
      name: 'GetMultisigProposals',
      query: GET_MULTISIG_PROPOSALS,
      variables: {
        orderBy: { created_at: 'desc' },
        limit: 5,
        offset: 0,
      },
    },
  ];

  if (fixtures.scheduledTxIds[0]) {
    probes.push({
      name: 'GetScheduledReversibleTransactionByTxId',
      query: GET_SCHEDULED_REVERSIBLE_BY_TX_ID,
      variables: { tx_id: fixtures.scheduledTxIds[0] },
    });
  }
  if (fixtures.executedTxIds[0]) {
    probes.push({
      name: 'GetExecutedReversibleTransactionByTxId',
      query: GET_EXECUTED_REVERSIBLE_BY_TX_ID,
      variables: { tx_id: fixtures.executedTxIds[0] },
    });
  }
  if (fixtures.cancelledTxIds[0]) {
    probes.push({
      name: 'GetCancelledReversibleTransactionByTxId',
      query: GET_CANCELLED_REVERSIBLE_BY_TX_ID,
      variables: { tx_id: fixtures.cancelledTxIds[0] },
    });
  }
  if (fixtures.wormholeIds[0]) {
    probes.push({
      name: 'GetWormholeExtrinsicById',
      query: GET_WORMHOLE_EXTRINSIC_BY_ID,
      variables: { id: fixtures.wormholeIds[0] },
    });
  }
  if (fixtures.multisigIds[0]) {
    probes.push({
      name: 'GetMultisigById',
      query: GET_MULTISIG_BY_ID,
      variables: { id: fixtures.multisigIds[0] },
    });
  }
  if (fixtures.proposalIds[0]) {
    probes.push({
      name: 'GetMultisigProposalById',
      query: GET_MULTISIG_PROPOSAL_BY_ID,
      variables: { id: fixtures.proposalIds[0] },
    });
  }

  return probes;
}

/**
 * Formerly expensive explorer queries (home day rollups, search, 24h aggregates).
 * Used by latency.js to assert each stays under ~1s at low concurrency.
 */
export function latencyProbes(fixtures) {
  const { startDate, endDate } = recent24hRange();
  const accountsRange = last7DaysRange();
  const account = fixtures.accounts[0] || 'unknown';
  const hash = fixtures.hashes[0] || '0xab';
  const keyword = fixtures.keywords[0] || account.slice(0, 8);

  return [
    {
      name: 'GetHomeChainStats',
      query: GET_HOME_CHAIN_STATS,
      variables: homeStatsVariables(),
    },
    {
      name: 'GetUnifiedTransactionsStats',
      query: GET_UNIFIED_TRANSACTIONS_STATS,
      variables: {
        last24HourWhere: withExcludedRewardTransfers({
          timestamp: { _gte: startDate, _lte: endDate },
        }),
      },
    },
    {
      name: 'GetBlockStats',
      query: GET_BLOCK_STATS,
      variables: { startDate, endDate },
    },
    {
      name: 'GetAccountsStats',
      query: GET_ACCOUNTS_STATS,
      variables: accountsRange,
    },
    accountTransactionsRequest(account),
    searchRequest(hash),
    searchRequest(String(fixtures.blocks[0]?.height ?? 1)),
    searchRequest(keyword),
  ];
}
