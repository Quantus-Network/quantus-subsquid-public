/**
 * squid-hasura-configuration regenerate rebuilds hasura_metadata.json from
 * the TypeORM models and drops anything that is not a tracked table.
 *
 * This puts back a public GET /api/rest/chain-stats endpoint for the
 * singleton chain_stats row (id = global). The query lives in a collection
 * because Hasura REST endpoints require one. The collection is not added to
 * an allowlist, so the existing GraphQL API stays open.
 *
 * Usage: node scripts/patch-hasura-chain-stats-rest.js
 */
const fs = require("fs");
const path = require("path");

const COLLECTION_NAME = "rest";
const QUERY_NAME = "get_chain_stats";
const ENDPOINT_NAME = "get_chain_stats";
const CHAIN_STATS_REST_URL = "chain-stats";
const CHAIN_STATS_REST_COMMENT = "GET the singleton chain stats row (id = global)";

const GET_CHAIN_STATS_QUERY = `query get_chain_stats {
  chain_stats: chain_stats_by_pk(id: "global") {
    id
    block_height
    finalized_block_height
    total_accounts
    total_miners
    total_deposit_accounts
    total_immediate_transfers
    total_scheduled_transfers
    total_executed_transfers
    total_cancelled_transfers
    total_high_security_sets
    total_multisigs_created
    total_multisig_proposals
    total_multisig_signer_approved
    total_multisig_proposal_ready
    total_multisig_proposals_executed
    total_multisig_proposals_cancelled
    total_multisig_proposals_removed
    total_multisig_deposits_claimed
    total_miner_rewards
    total_error_events
    total_tech_referenda
    total_runtime_upgrades
    max_supply
    total_supply
    circulating_supply
    total_transferred_amount
  }
}`;

function applyChainStatsRestEndpoint(metadata) {
    const body = metadata?.metadata;
    if (!body || typeof body !== "object") {
        throw new Error("hasura metadata has no metadata object");
    }

    if (!Array.isArray(body.query_collections)) {
        body.query_collections = [];
    }
    let collection = body.query_collections.find((entry) => entry.name === COLLECTION_NAME);
    if (!collection) {
        collection = { name: COLLECTION_NAME, definition: { queries: [] } };
        body.query_collections.push(collection);
    }
    if (!collection.definition || !Array.isArray(collection.definition.queries)) {
        throw new Error(`query collection ${COLLECTION_NAME} has no queries`);
    }
    const queries = collection.definition.queries;
    const existingQuery = queries.find((entry) => entry.name === QUERY_NAME);
    if (existingQuery) {
        existingQuery.query = GET_CHAIN_STATS_QUERY;
    } else {
        queries.push({ name: QUERY_NAME, query: GET_CHAIN_STATS_QUERY });
    }

    if (!Array.isArray(body.rest_endpoints)) {
        body.rest_endpoints = [];
    }
    const endpoint = {
        name: ENDPOINT_NAME,
        url: CHAIN_STATS_REST_URL,
        methods: ["GET"],
        definition: {
            query: {
                collection_name: COLLECTION_NAME,
                query_name: QUERY_NAME,
            },
        },
        comment: CHAIN_STATS_REST_COMMENT,
    };
    const endpointIndex = body.rest_endpoints.findIndex((entry) => entry.name === ENDPOINT_NAME);
    if (endpointIndex === -1) {
        body.rest_endpoints.push(endpoint);
    } else {
        body.rest_endpoints[endpointIndex] = endpoint;
    }
}

function patchHasuraMetadataFile(filePath) {
    const metadata = JSON.parse(fs.readFileSync(filePath, "utf8"));
    applyChainStatsRestEndpoint(metadata);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
}

module.exports = {
    CHAIN_STATS_REST_URL,
    GET_CHAIN_STATS_QUERY,
    applyChainStatsRestEndpoint,
    patchHasuraMetadataFile,
};

if (require.main === module) {
    const filePath = path.join(__dirname, "../hasura_metadata.json");
    patchHasuraMetadataFile(filePath);
    console.log(`[patch-hasura-chain-stats-rest] GET /api/rest/${CHAIN_STATS_REST_URL}`);
}
