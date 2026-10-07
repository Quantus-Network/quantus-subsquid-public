import http from "http";
import { createConnectionOptions } from "@subsquid/typeorm-config/lib/connectionOptions";
import { Pool } from "pg";

export const SUPPLY_TEXT_PORT = 8081;
export const CIRCULATING_SUPPLY_PATH = "/circulating-supply";
export const TOTAL_SUPPLY_PATH = "/total-supply";
export const PUBLIC_CIRCULATING_SUPPLY_PATH = "/api/rest/circulating-supply";
export const PUBLIC_TOTAL_SUPPLY_PATH = "/api/rest/total-supply";

const CHAIN_STATS_ID = "global";
const TEXT_PLAIN = { "Content-Type": "text/plain; charset=utf-8" };

/** One whole token is 10^12 raw chain units. */
export const SUPPLY_DENOMINATOR = 10n ** 12n;
const SUPPLY_DENOMINATOR_DIGITS = 12;

const SUPPLY_COLUMNS = {
    [CIRCULATING_SUPPLY_PATH]: "circulating_supply",
    [TOTAL_SUPPLY_PATH]: "total_supply",
} as const;

export type SupplyColumn = (typeof SUPPLY_COLUMNS)[keyof typeof SUPPLY_COLUMNS];

const SUPPLY_SQL: Record<SupplyColumn, string> = {
    circulating_supply: "SELECT circulating_supply::text AS value FROM chain_stats WHERE id = $1",
    total_supply: "SELECT total_supply::text AS value FROM chain_stats WHERE id = $1",
};

export interface SupplyQuery {
    query(sql: string, params: unknown[]): Promise<{ rows: Array<{ value?: unknown }> }>;
}

/**
 * Raw token amount as digits. Rejects JSON and any other formatting.
 */
export function assertSupplyText(value: string): string {
    if (!/^[0-9]+$/.test(value)) {
        throw new Error(`supply value must be a non-negative integer, got ${JSON.stringify(value)}`);
    }
    return value;
}

/**
 * Coin count for the plain-text endpoints. Chain stats stay raw integers;
 * this divides by the token denominator and keeps only significant fraction digits.
 */
export function formatSupplyAmount(raw: string): string {
    const value = BigInt(assertSupplyText(raw));
    const whole = value / SUPPLY_DENOMINATOR;
    const fraction = value % SUPPLY_DENOMINATOR;
    if (fraction === 0n) {
        return whole.toString();
    }
    const digits = fraction.toString().padStart(SUPPLY_DENOMINATOR_DIGITS, "0").replace(/0+$/, "");
    return `${whole.toString()}.${digits}`;
}

export async function readChainStatsSupply(client: SupplyQuery, column: SupplyColumn): Promise<string | null> {
    const sql = SUPPLY_SQL[column];
    if (sql == null) {
        throw new Error(`unknown supply column ${String(column)}`);
    }
    const result = await client.query(sql, [CHAIN_STATS_ID]);
    if (result.rows.length === 0) {
        return null;
    }
    if (result.rows.length !== 1) {
        throw new Error(`expected one chain stats row, got ${result.rows.length}`);
    }
    const value = result.rows[0]?.value;
    if (typeof value !== "string") {
        throw new Error(`chain stats ${column} is missing`);
    }
    return assertSupplyText(value);
}

export function createSupplyPool(): Pool {
    const options = createConnectionOptions();
    const ssl = options.ssl != null ? { ssl: options.ssl } : {};
    const pool =
        options.url != null
            ? new Pool({ max: 2, connectionString: options.url, ...ssl })
            : new Pool({
                  max: 2,
                  host: options.host,
                  port: options.port,
                  database: options.database,
                  user: options.username,
                  password: options.password,
                  ...ssl,
              });
    pool.on("error", (error) => {
        console.error("supply database pool error", error);
    });
    return pool;
}

export function createSupplyTextServer(readSupply: (column: SupplyColumn) => Promise<string | null>): http.Server {
    return http.createServer((req, res) => {
        void handleSupplyRequest(req, res, readSupply);
    });
}

function supplyColumn(pathname: string): SupplyColumn | undefined {
    if (pathname === CIRCULATING_SUPPLY_PATH || pathname === TOTAL_SUPPLY_PATH) {
        return SUPPLY_COLUMNS[pathname];
    }
    return undefined;
}

function supplyRequestPath(url: string | undefined): string | undefined {
    if (!url || !url.startsWith("/")) {
        return undefined;
    }
    try {
        return new URL(url, "http://127.0.0.1").pathname;
    } catch {
        return undefined;
    }
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
    res.writeHead(status, TEXT_PLAIN);
    res.end(body);
}

async function handleSupplyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    readSupply: (column: SupplyColumn) => Promise<string | null>,
): Promise<void> {
    const pathname = supplyRequestPath(req.url);
    const column = pathname != null ? supplyColumn(pathname) : undefined;
    if (req.method !== "GET" || column == null) {
        sendText(res, 404, "not found");
        return;
    }
    try {
        const value = await readSupply(column);
        if (value == null) {
            sendText(res, 404, `chain stats ${column} is missing`);
            return;
        }
        sendText(res, 200, formatSupplyAmount(value));
    } catch (error) {
        const message = error instanceof Error ? error.message : "failed to read supply";
        if (!res.headersSent) {
            sendText(res, 500, message);
            return;
        }
        res.destroy();
    }
}
