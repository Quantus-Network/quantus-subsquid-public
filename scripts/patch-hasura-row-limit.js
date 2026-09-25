/**
 * squid-hasura-configuration regenerate writes public select permissions
 * with no row cap. Hasura then returns every matching row.
 *
 * This sets a ceiling of 1000, which is the largest limit the explorer and
 * wallet already send (wormhole nullifier lookups). Queries that ask for
 * fewer rows are unchanged.
 *
 * Usage: node scripts/patch-hasura-row-limit.js
 */
const fs = require("fs");
const path = require("path");

const PUBLIC_SELECT_ROW_LIMIT = 1000;

function applyPublicSelectRowLimit(metadata, limit = PUBLIC_SELECT_ROW_LIMIT) {
    const sources = metadata?.metadata?.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
        throw new Error("hasura metadata has no sources");
    }

    let patched = 0;
    for (const source of sources) {
        if (!Array.isArray(source.tables)) {
            throw new Error(`source ${source.name ?? "<unknown>"} has no tables`);
        }
        for (const table of source.tables) {
            const name = table.table?.name ?? "<unknown>";
            if (!Array.isArray(table.select_permissions)) {
                throw new Error(`table ${name} has no select_permissions`);
            }
            const publicPermissions = table.select_permissions.filter((entry) => entry.role === "public");
            if (publicPermissions.length !== 1 || !publicPermissions[0].permission) {
                throw new Error(`table ${name} must have exactly one public select permission`);
            }
            publicPermissions[0].permission.limit = limit;
            patched++;
        }
    }

    if (patched === 0) {
        throw new Error("no public select permissions updated");
    }
    return patched;
}

function patchHasuraMetadataFile(filePath) {
    const metadata = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const patched = applyPublicSelectRowLimit(metadata);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
    return patched;
}

module.exports = {
    PUBLIC_SELECT_ROW_LIMIT,
    applyPublicSelectRowLimit,
    patchHasuraMetadataFile,
};

if (require.main === module) {
    const filePath = path.join(__dirname, "../hasura_metadata.json");
    const patched = patchHasuraMetadataFile(filePath);
    console.log(
        `[patch-hasura-row-limit] set public select limit to ${PUBLIC_SELECT_ROW_LIMIT} on ${patched} tables`,
    );
}
