/**
 * Patches squid-typeorm-migration output:
 * 1. Renames duplicate IDX/FK names (TypeORM collision on Extrinsic relations)
 * 2. Appends GIN indexes for multisig text[] membership columns
 * 3. Appends text_pattern_ops + partial indexes for explorer search / filtered counts
 *
 * Usage: node scripts/patch-migration-gin-indexes.js
 */
const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "../db/migrations");
const GIN_MARKER = "IDX_multisig_signers_gin";
const SEARCH_MARKER = "IDX_unified_transaction_hash_pattern";

const GIN_UP_LINES = [
    `        await db.query(` +
        `\`CREATE INDEX "IDX_multisig_signers_gin" ON "multisig" USING GIN ("signers")\`)`,
    `        await db.query(` +
        `\`CREATE INDEX "IDX_multisig_proposal_approvals_gin" ON "multisig_proposal" USING GIN ("approvals")\`)`,
    `        await db.query(` +
        `\`CREATE INDEX "IDX_executed_multisig_proposal_approvers_gin" ON "executed_multisig_proposal" USING GIN ("approvers")\`)`,
];

const GIN_DOWN_LINES = [
    `        await db.query(\`DROP INDEX "IDX_executed_multisig_proposal_approvers_gin"\`)`,
    `        await db.query(\`DROP INDEX "IDX_multisig_proposal_approvals_gin"\`)`,
    `        await db.query(\`DROP INDEX "IDX_multisig_signers_gin"\`)`,
];

const SEARCH_UP_LINES = [
    `        await db.query(\`CREATE INDEX "IDX_unified_transaction_hash_pattern" ON "unified_transaction" ("hash" text_pattern_ops)\`)`,
    `        await db.query(\`CREATE INDEX "IDX_unified_transaction_detail_id_pattern" ON "unified_transaction" ("detail_id" text_pattern_ops)\`)`,
    `        await db.query(\`CREATE INDEX "IDX_account_id_pattern" ON "account" ("id" text_pattern_ops)\`)`,
    `        await db.query(\`CREATE INDEX "IDX_block_hash_pattern" ON "block" ("hash" text_pattern_ops)\`)`,
    `        await db.query(\`CREATE INDEX "IDX_extrinsic_id_pattern" ON "extrinsic" ("id" text_pattern_ops)\`)`,
    `        await db.query(\`CREATE INDEX "IDX_unified_transaction_timestamp_excl_rewards" ON "unified_transaction" ("timestamp") WHERE NOT (type = 'IMMEDIATE' AND hash IS NULL)\`)`,
];

const SEARCH_DOWN_LINES = [
    `        await db.query(\`DROP INDEX "IDX_unified_transaction_timestamp_excl_rewards"\`)`,
    `        await db.query(\`DROP INDEX "IDX_extrinsic_id_pattern"\`)`,
    `        await db.query(\`DROP INDEX "IDX_block_hash_pattern"\`)`,
    `        await db.query(\`DROP INDEX "IDX_account_id_pattern"\`)`,
    `        await db.query(\`DROP INDEX "IDX_unified_transaction_detail_id_pattern"\`)`,
    `        await db.query(\`DROP INDEX "IDX_unified_transaction_hash_pattern"\`)`,
];

const CREATE_INDEX_RE =
    /CREATE INDEX "(IDX_[^"]+)" ON "([^"]+)" \("([^"]+)"\) /g;
const ADD_FK_RE =
    /ALTER TABLE "([^"]+)" ADD CONSTRAINT "(FK_[^"]+)" FOREIGN KEY \("([^"]+)"\) REFERENCES/g;
const DROP_INDEX_RE = /DROP INDEX "public\.(IDX_[^"]+)"/g;
const DROP_FK_RE = /DROP CONSTRAINT "(FK_[^"]+)"/g;

function findLatestMigrationFile() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    }

    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith(".js"))
        .sort();

    if (files.length === 0) {
        throw new Error("No migration files found. Run squid-typeorm-migration generate first.");
    }

    return files[files.length - 1];
}

function uniqueName(prefix, table, column) {
    return `${prefix}_${table}_${column}`;
}

/**
 * TypeORM can emit the same IDX_/FK_ hash for different tables when both
 * reference Extrinsic. Keep the first occurrence; rename later ones.
 */
function patchDuplicateIndexAndFkNames(content) {
    const indexRenames = [];
    const seenIndexNames = new Map();

    for (const match of content.matchAll(CREATE_INDEX_RE)) {
        const [full, name, table, column] = match;
        if (!seenIndexNames.has(name)) {
            seenIndexNames.set(name, [{ table, column, full }]);
            continue;
        }
        const occurrences = seenIndexNames.get(name);
        const duplicate = occurrences.find((o) => o.table === table && o.column === column);
        if (duplicate) {
            continue;
        }
        const newName = uniqueName("IDX", table, column);
        indexRenames.push({ oldName: name, newName, table, column });
        occurrences.push({ table, column, full });
    }

    const fkRenames = [];
    const seenFkNames = new Map();

    for (const match of content.matchAll(ADD_FK_RE)) {
        const [full, table, name, column] = match;
        if (!seenFkNames.has(name)) {
            seenFkNames.set(name, [{ table, column, full }]);
            continue;
        }
        const occurrences = seenFkNames.get(name);
        const duplicate = occurrences.find((o) => o.table === table && o.column === column);
        if (duplicate) {
            continue;
        }
        const newName = uniqueName("FK", table, column);
        fkRenames.push({ oldName: name, newName, table, column });
        occurrences.push({ table, column, full });
    }

    if (indexRenames.length === 0 && fkRenames.length === 0) {
        return { content, changed: false, indexRenames, fkRenames };
    }

    let patched = content;

    for (const { oldName, newName, table } of indexRenames) {
        patched = patched.replace(
            `CREATE INDEX "${oldName}" ON "${table}"`,
            `CREATE INDEX "${newName}" ON "${table}"`,
        );
        let dropCount = 0;
        patched = patched.replace(DROP_INDEX_RE, (line, idxName) => {
            if (idxName !== oldName) {
                return line;
            }
            dropCount += 1;
            if (dropCount === 1) {
                return line;
            }
            return `DROP INDEX "public"."${newName}"`;
        });
    }

    for (const { oldName, newName, table } of fkRenames) {
        patched = patched.replace(
            `ALTER TABLE "${table}" ADD CONSTRAINT "${oldName}"`,
            `ALTER TABLE "${table}" ADD CONSTRAINT "${newName}"`,
        );
        let dropCount = 0;
        patched = patched.replace(DROP_FK_RE, (line, fkName) => {
            if (fkName !== oldName) {
                return line;
            }
            dropCount += 1;
            if (dropCount === 1) {
                return line;
            }
            return `DROP CONSTRAINT "${newName}"`;
        });
    }

    return { content: patched, changed: true, indexRenames, fkRenames };
}

function patchGinIndexes(content) {
    if (content.includes(GIN_MARKER)) {
        return { content, changed: false };
    }

    const upCloseNeedle = "\n    }\n\n    async down(db) {";
    const upCloseIndex = content.indexOf(upCloseNeedle);
    if (upCloseIndex === -1) {
        throw new Error('Could not find end of async up(db) block (expected "\\n    }\\n\\n    async down(db) {")');
    }

    const downNeedle = "\n    async down(db) {\n";
    const downIndex = content.indexOf(downNeedle);
    if (downIndex === -1) {
        throw new Error("Could not find async down(db) block start in migration file");
    }

    const upInsert = "\n" + GIN_UP_LINES.join("\n") + "\n";
    const downInsert = downNeedle + GIN_DOWN_LINES.join("\n") + "\n";

    const patched =
        content.slice(0, upCloseIndex) +
        upInsert +
        content.slice(upCloseIndex, downIndex) +
        downInsert +
        content.slice(downIndex + downNeedle.length);

    return { content: patched, changed: true };
}

function patchSearchIndexes(content) {
    if (content.includes(SEARCH_MARKER)) {
        return { content, changed: false };
    }

    const upCloseNeedle = "\n    }\n\n    async down(db) {";
    const upCloseIndex = content.indexOf(upCloseNeedle);
    if (upCloseIndex === -1) {
        throw new Error('Could not find end of async up(db) block (expected "\\n    }\\n\\n    async down(db) {")');
    }

    const downNeedle = "\n    async down(db) {\n";
    const downIndex = content.indexOf(downNeedle);
    if (downIndex === -1) {
        throw new Error("Could not find async down(db) block start in migration file");
    }

    const upInsert = "\n" + SEARCH_UP_LINES.join("\n") + "\n";
    const downInsert = downNeedle + SEARCH_DOWN_LINES.join("\n") + "\n";

    const patched =
        content.slice(0, upCloseIndex) +
        upInsert +
        content.slice(upCloseIndex, downIndex) +
        downInsert +
        content.slice(downIndex + downNeedle.length);

    return { content: patched, changed: true };
}

function main() {
    const file = findLatestMigrationFile();
    const filePath = path.join(MIGRATIONS_DIR, file);
    const original = fs.readFileSync(filePath, "utf8");

    const dup = patchDuplicateIndexAndFkNames(original);
    const gin = patchGinIndexes(dup.content);
    const search = patchSearchIndexes(gin.content);

    if (!dup.changed && !gin.changed && !search.changed) {
        console.log(`[patch-migration-gin-indexes] ${file} already patched`);
        return;
    }

    fs.writeFileSync(filePath, search.content);

    if (dup.changed) {
        for (const { oldName, newName, table, column } of dup.indexRenames) {
            console.log(
                `[patch-migration-gin-indexes] Renamed duplicate index ${oldName} -> ${newName} (${table}.${column})`,
            );
        }
        for (const { oldName, newName, table, column } of dup.fkRenames) {
            console.log(
                `[patch-migration-gin-indexes] Renamed duplicate FK ${oldName} -> ${newName} (${table}.${column})`,
            );
        }
    }
    if (gin.changed) {
        console.log(`[patch-migration-gin-indexes] Appended GIN indexes to ${file}`);
    }
    if (search.changed) {
        console.log(`[patch-migration-gin-indexes] Appended search/pattern indexes to ${file}`);
    }
    if (!gin.changed && !search.changed) {
        console.log(`[patch-migration-gin-indexes] Patched ${file}`);
    }
}

main();
