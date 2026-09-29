/**
 * Initial migrations are identified by class name. Replacing
 * InitialSchema1790152249086 with a new InitialSchema leaves the old name
 * in the migrations table, so TypeORM runs CREATE TABLE against a database
 * that already has indexer tables.
 *
 * Refuse that path. Drop the database and reindex; chain totals are rebuilt
 * from chain history. A database that already recorded the current migration
 * name never enters up().
 */

const RETAINED_SCHEMA_SQL = `SELECT to_regclass('public.extrinsic') AS retained_schema`;

const CLEAN_REINDEX_REQUIRED =
    "This schema version requires a clean reindex. Indexer tables are already present (for example from InitialSchema1790152249086). TypeORM tracks applied migrations by name, so a replaced initial migration is pending and would CREATE TABLE against the existing schema. Drop the database, apply migrations on the empty database, and start the processor so chain totals are rebuilt from chain history. Local: npx sqd down && npx sqd up && npx sqd migration:apply";

async function assertCleanReindex(db) {
    const rows = await db.query(RETAINED_SCHEMA_SQL);
    if (!Array.isArray(rows)) {
        throw new Error(
            `clean reindex check failed: expected rows from to_regclass('public.extrinsic')`,
        );
    }
    const retained = rows[0]?.retained_schema;
    if (retained != null && retained !== "") {
        throw new Error(CLEAN_REINDEX_REQUIRED);
    }
}

module.exports = {
    RETAINED_SCHEMA_SQL,
    CLEAN_REINDEX_REQUIRED,
    assertCleanReindex,
};
