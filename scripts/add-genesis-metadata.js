/**
 * Fetch metadata from a different genesis (e.g. mainnet) and merge unique spec
 * versions into metadata.jsonl without dropping the old-chain history.
 *
 * Do not point squid-substrate-metadata-explorer at metadata.jsonl for a second
 * genesis: it treats a hash mismatch as a different chain and can strip or
 * replace existing specs.
 *
 * Usage:
 *   RPC=wss://<new-genesis-rpc> npm run meta:add
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

require("ts-node/register/transpile-only");
const { formatMetadataJsonl, mergeSpecVersions, parseMetadataJsonl } = require("../src/utils/mergeMetadata");

const REPO_ROOT = path.join(__dirname, "..");
const METADATA_PATH = path.join(REPO_ROOT, "metadata.jsonl");

function resolveRpc() {
    const rpc = process.env.RPC;
    if (!rpc) {
        throw new Error("Set RPC to the new-genesis node, e.g. RPC=wss://... npm run meta:add");
    }
    return rpc;
}

function exploreToTempFile(rpc) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quantus-metadata-"));
    const outFile = path.join(tmpDir, "new-genesis.jsonl");
    const result = spawnSync(
        "npx",
        ["squid-substrate-metadata-explorer", "--rpc", rpc, "--out", outFile],
        { cwd: REPO_ROOT, stdio: "inherit", encoding: "utf8" },
    );
    if (result.status !== 0) {
        throw new Error(`metadata explorer failed with exit code ${result.status ?? "unknown"}`);
    }
    if (!fs.existsSync(outFile)) {
        throw new Error(`metadata explorer did not write ${outFile}`);
    }
    return { outFile, tmpDir };
}

function summarize(records) {
    return records.map((rec) => `${rec.specName}@${rec.specVersion}`).join(", ");
}

function main() {
    const rpc = resolveRpc();

    if (!fs.existsSync(METADATA_PATH)) {
        throw new Error(`${METADATA_PATH} is missing. Fetch the old genesis first with npm run meta:update`);
    }

    console.log(`Merging new-genesis metadata from ${rpc} into metadata.jsonl`);
    const { outFile, tmpDir } = exploreToTempFile(rpc);

    try {
        const existing = parseMetadataJsonl(fs.readFileSync(METADATA_PATH, "utf8"));
        const incoming = parseMetadataJsonl(fs.readFileSync(outFile, "utf8"));
        const { merged, added } = mergeSpecVersions(existing, incoming);

        fs.writeFileSync(METADATA_PATH, formatMetadataJsonl(merged));

        if (added.length === 0) {
            console.log(`No new spec versions. metadata.jsonl still has: ${summarize(existing)}`);
            return;
        }

        console.log(`Added ${added.length} spec version(s): ${summarize(added)}`);
        console.log(`metadata.jsonl now has: ${summarize(merged)}`);
        console.log("Run 'npm run gen:types' next.");
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

try {
    main();
} catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
}
