import fs from "fs";
import path from "path";
import { CLEAN_REINDEX_REQUIRED, RETAINED_SCHEMA_SQL, assertCleanReindex } from "../scripts/require-clean-reindex";
import { patchCleanReindexGuard } from "../scripts/patch-migration-gin-indexes";

type QueryDb = {
    query: (sql: string) => Promise<unknown>;
};

function migrationPaths(): string[] {
    const dir = path.join(__dirname, "../db/migrations");
    return fs
        .readdirSync(dir)
        .filter((name) => name.endsWith(".js"))
        .sort()
        .map((name) => path.join(dir, name));
}

function loadMigration(filePath: string): { up: (db: QueryDb) => Promise<void> } {
    delete require.cache[require.resolve(filePath)];
    const Migration = require(filePath);
    return new Migration();
}

function fakeDb(retainedSchema: string | null): { db: QueryDb; queries: string[] } {
    const queries: string[] = [];
    return {
        queries,
        db: {
            query: async (sql: string) => {
                queries.push(sql);
                if (sql === RETAINED_SCHEMA_SQL) {
                    return [{ retained_schema: retainedSchema }];
                }
                return [];
            },
        },
    };
}

const UNPATCHED_MIGRATION = `module.exports = class InitialSchema1 {
    name = 'InitialSchema1'

    async up(db) {
        await db.query(\`CREATE TABLE "extrinsic" ("id" character varying NOT NULL)\`)
    }

    async down(db) {
        await db.query(\`DROP TABLE "extrinsic"\`)
    }
}
`;

describe("clean reindex enforcement", () => {
    it("refuses when indexer tables already exist", async () => {
        const queries: string[] = [];
        const db: QueryDb = {
            query: async (sql: string) => {
                queries.push(sql);
                return [{ retained_schema: "extrinsic" }];
            },
        };

        await expect(assertCleanReindex(db)).rejects.toThrow(CLEAN_REINDEX_REQUIRED);
        expect(queries).toEqual([RETAINED_SCHEMA_SQL]);
    });

    it("allows an empty database", async () => {
        await expect(
            assertCleanReindex({
                query: async () => [{ retained_schema: null }],
            }),
        ).resolves.toBeUndefined();
    });

    it("stops when the schema probe does not return rows", async () => {
        await expect(
            assertCleanReindex({
                query: async () => ({ rows: [] }),
            }),
        ).rejects.toThrow("to_regclass('public.extrinsic')");
    });

    it.each(migrationPaths())("refuses a retained database before CREATE TABLE (%s)", async (filePath) => {
        const { db, queries } = fakeDb("extrinsic");
        await expect(loadMigration(filePath).up(db)).rejects.toThrow(CLEAN_REINDEX_REQUIRED);
        expect(queries.some((sql) => sql.includes("CREATE TABLE"))).toBe(false);
    });

    it.each(migrationPaths())("creates tables on an empty database (%s)", async (filePath) => {
        const { db, queries } = fakeDb(null);
        await loadMigration(filePath).up(db);
        expect(queries[0]).toBe(RETAINED_SCHEMA_SQL);
        expect(queries.some((sql) => sql.includes('CREATE TABLE "extrinsic"'))).toBe(true);
    });

    it("injects the guard into a generated initial migration", () => {
        const patched = patchCleanReindexGuard(UNPATCHED_MIGRATION);
        expect(patched.changed).toBe(true);
        expect(patched.content.indexOf("assertCleanReindex(db)")).toBeLessThan(
            patched.content.indexOf('CREATE TABLE "extrinsic"'),
        );
        expect(patchCleanReindexGuard(patched.content).changed).toBe(false);
    });
});
