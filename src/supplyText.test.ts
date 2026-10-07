import fs from "fs";
import http from "http";
import path from "path";
import {
    CIRCULATING_SUPPLY_PATH,
    PUBLIC_CIRCULATING_SUPPLY_PATH,
    PUBLIC_TOTAL_SUPPLY_PATH,
    SUPPLY_TEXT_PORT,
    TOTAL_SUPPLY_PATH,
    assertSupplyText,
    createSupplyTextServer,
    readChainStatsSupply,
    type SupplyColumn,
    type SupplyQuery,
} from "./supplyText";

const CIRCULATING = "21000000000000000000";
const TOTAL = "42000000000000000000";

function request(
    port: number,
    requestPath: string,
    method = "GET",
): Promise<{ status: number; contentType: string | undefined; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path: requestPath, method }, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    status: res.statusCode ?? 0,
                    contentType: res.headers["content-type"],
                    body: Buffer.concat(chunks).toString("utf8"),
                });
            });
        });
        req.on("error", reject);
        req.end();
    });
}

async function withServer(
    readSupply: (column: SupplyColumn) => Promise<string | null>,
    run: (port: number) => Promise<void>,
): Promise<void> {
    const server = createSupplyTextServer(readSupply);
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (address == null || typeof address === "string") {
        throw new Error("supply text server did not bind a tcp port");
    }
    try {
        await run(address.port);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

describe("plain-text supply endpoints", () => {
    it("returns circulating supply as text and nothing else", async () => {
        const columns: SupplyColumn[] = [];
        await withServer(
            async (column) => {
                columns.push(column);
                return CIRCULATING;
            },
            async (port) => {
                const response = await request(port, CIRCULATING_SUPPLY_PATH);
                expect(response.status).toBe(200);
                expect(response.contentType).toBe("text/plain; charset=utf-8");
                expect(response.body).toBe(CIRCULATING);
                expect(columns).toEqual(["circulating_supply"]);
            },
        );
    });

    it("returns total supply as text and nothing else", async () => {
        await withServer(
            async (column) => (column === "total_supply" ? TOTAL : CIRCULATING),
            async (port) => {
                const response = await request(port, `${TOTAL_SUPPLY_PATH}?unused=1`);
                expect(response.status).toBe(200);
                expect(response.contentType).toBe("text/plain; charset=utf-8");
                expect(response.body).toBe(TOTAL);
            },
        );
    });

    it("answers unknown paths and other methods with plain text not found", async () => {
        await withServer(
            async () => CIRCULATING,
            async (port) => {
                const missing = await request(port, "/api/rest/chain-stats");
                const posted = await request(port, CIRCULATING_SUPPLY_PATH, "POST");
                expect(missing).toMatchObject({ status: 404, contentType: "text/plain; charset=utf-8" });
                expect(posted.status).toBe(404);
                expect(missing.body).not.toContain("{");
                expect(posted.body).not.toContain("{");
            },
        );
    });

    it("returns a read failure as plain text", async () => {
        await withServer(
            async () => {
                throw new Error("database unavailable");
            },
            async (port) => {
                const response = await request(port, TOTAL_SUPPLY_PATH);
                expect(response.status).toBe(500);
                expect(response.contentType).toBe("text/plain; charset=utf-8");
                expect(response.body).toBe("database unavailable");
            },
        );
    });

    it("reports a missing chain stats row instead of inventing a supply", async () => {
        await withServer(
            async () => null,
            async (port) => {
                const response = await request(port, CIRCULATING_SUPPLY_PATH);
                expect(response.status).toBe(404);
                expect(response.contentType).toBe("text/plain; charset=utf-8");
                expect(response.body).toBe("chain stats circulating_supply is missing");
            },
        );
    });

    it("rejects a supply value that is not a non-negative integer", () => {
        expect(assertSupplyText("0")).toBe("0");
        expect(assertSupplyText(CIRCULATING)).toBe(CIRCULATING);
        expect(() => assertSupplyText("12.5")).toThrow(/non-negative integer/);
        expect(() => assertSupplyText('{"circulating_supply":"1"}')).toThrow(/non-negative integer/);
    });

    it("reads one numeric column from the global chain stats row", async () => {
        const calls: Array<{ sql: string; params: unknown[] }> = [];
        const client: SupplyQuery = {
            async query(sql, params) {
                calls.push({ sql, params });
                return { rows: [{ value: TOTAL }] };
            },
        };

        await expect(readChainStatsSupply(client, "total_supply")).resolves.toBe(TOTAL);
        expect(calls).toEqual([
            {
                sql: "SELECT total_supply::text AS value FROM chain_stats WHERE id = $1",
                params: ["global"],
            },
        ]);
    });

    it("returns null when the global chain stats row is absent", async () => {
        const client: SupplyQuery = {
            async query() {
                return { rows: [] };
            },
        };
        await expect(readChainStatsSupply(client, "circulating_supply")).resolves.toBeNull();
    });

    it("nginx publishes the plain-text paths on the public API port", () => {
        const conf = fs.readFileSync(path.join(__dirname, "../nginx/nginx.conf"), "utf8");
        expect(conf).toContain(`location = ${PUBLIC_CIRCULATING_SUPPLY_PATH} {`);
        expect(conf).toContain(`location = ${PUBLIC_TOTAL_SUPPLY_PATH} {`);
        expect(conf).toContain(`\${app_servers}-processor:${SUPPLY_TEXT_PORT}`);
        expect(conf).toContain(`proxy_pass http://$upstream_host${CIRCULATING_SUPPLY_PATH};`);
        expect(conf).toContain(`proxy_pass http://$upstream_host${TOTAL_SUPPLY_PATH};`);
    });
});
