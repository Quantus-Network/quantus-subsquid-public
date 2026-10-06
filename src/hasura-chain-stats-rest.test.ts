import fs from "fs";
import path from "path";
import {
    CHAIN_STATS_REST_URL,
    GET_CHAIN_STATS_QUERY,
    applyChainStatsRestEndpoint,
} from "../scripts/patch-hasura-chain-stats-rest";

describe("hasura chain stats REST endpoint", () => {
    it("adds a GET endpoint for the singleton chain stats row and leaves other metadata alone", () => {
        const metadata = {
            metadata: {
                version: 3,
                sources: [],
                query_collections: [
                    {
                        name: "rest",
                        definition: {
                            queries: [{ name: "other_query", query: "query other_query { account { id } }" }],
                        },
                    },
                ],
                rest_endpoints: [
                    {
                        name: "other_endpoint",
                        url: "other",
                        methods: ["POST"],
                        definition: {
                            query: { collection_name: "rest", query_name: "other_query" },
                        },
                    },
                ],
            },
        };

        applyChainStatsRestEndpoint(metadata);
        applyChainStatsRestEndpoint(metadata);

        expect("allowlist" in metadata.metadata).toBe(false);
        expect(metadata.metadata.query_collections).toHaveLength(1);
        expect(metadata.metadata.query_collections[0].definition.queries).toEqual([
            { name: "other_query", query: "query other_query { account { id } }" },
            { name: "get_chain_stats", query: GET_CHAIN_STATS_QUERY },
        ]);
        expect(metadata.metadata.rest_endpoints).toEqual([
            {
                name: "other_endpoint",
                url: "other",
                methods: ["POST"],
                definition: {
                    query: { collection_name: "rest", query_name: "other_query" },
                },
            },
            {
                name: "get_chain_stats",
                url: CHAIN_STATS_REST_URL,
                methods: ["GET"],
                definition: {
                    query: { collection_name: "rest", query_name: "get_chain_stats" },
                },
                comment: "GET the singleton chain stats row (id = global)",
            },
        ]);
        expect(GET_CHAIN_STATS_QUERY).toContain('chain_stats: chain_stats_by_pk(id: "global")');
        expect(GET_CHAIN_STATS_QUERY).toContain("circulating_supply");
        expect(GET_CHAIN_STATS_QUERY).toContain("total_transferred_amount");
    });

    it("stores the chain stats GET endpoint in hasura_metadata.json", () => {
        const raw = fs.readFileSync(path.join(__dirname, "../hasura_metadata.json"), "utf8");
        const metadata = JSON.parse(raw);

        expect(metadata.metadata.allowlist).toBeUndefined();
        const collection = metadata.metadata.query_collections.find(
            (entry: { name: string }) => entry.name === "rest",
        );
        const query = collection.definition.queries.find(
            (entry: { name: string }) => entry.name === "get_chain_stats",
        );
        const endpoint = metadata.metadata.rest_endpoints.find(
            (entry: { name: string }) => entry.name === "get_chain_stats",
        );

        expect(query.query).toBe(GET_CHAIN_STATS_QUERY);
        expect(endpoint).toEqual({
            name: "get_chain_stats",
            url: CHAIN_STATS_REST_URL,
            methods: ["GET"],
            definition: {
                query: { collection_name: "rest", query_name: "get_chain_stats" },
            },
            comment: "GET the singleton chain stats row (id = global)",
        });
    });
});
