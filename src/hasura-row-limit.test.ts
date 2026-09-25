import fs from "fs";
import path from "path";
import { applyPublicSelectRowLimit, PUBLIC_SELECT_ROW_LIMIT } from "../scripts/patch-hasura-row-limit";

describe("hasura public row limit", () => {
    it("sets the ceiling on the public select permission and keeps the other fields", () => {
        const metadata = {
            metadata: {
                sources: [
                    {
                        tables: [
                            {
                                table: { name: "account", schema: "public" },
                                select_permissions: [
                                    {
                                        role: "public",
                                        permission: {
                                            columns: "*",
                                            filter: {},
                                            allow_aggregations: true,
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };

        expect(applyPublicSelectRowLimit(metadata)).toBe(1);
        expect(metadata.metadata.sources[0].tables[0].select_permissions[0].permission).toEqual({
            columns: "*",
            filter: {},
            allow_aggregations: true,
            limit: PUBLIC_SELECT_ROW_LIMIT,
        });
    });

    it("stores limit 1000 on every public select permission in hasura_metadata.json", () => {
        const raw = fs.readFileSync(path.join(__dirname, "../hasura_metadata.json"), "utf8");
        const metadata = JSON.parse(raw);
        const tables = metadata.metadata.sources.flatMap((source: { tables: unknown[] }) => source.tables);

        expect(tables.length).toBeGreaterThan(0);
        for (const table of tables) {
            const publicPermissions = table.select_permissions.filter(
                (entry: { role: string }) => entry.role === "public",
            );
            expect(publicPermissions).toHaveLength(1);
            expect(publicPermissions[0].permission.limit).toBe(PUBLIC_SELECT_ROW_LIMIT);
        }
    });
});
