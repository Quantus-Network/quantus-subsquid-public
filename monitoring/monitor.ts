// ================================================================================================
// Monitoring script for subsquid
//
// This script is used to monitor the health of the subsquid processor and send alerts to a webhook
// if the processor is lagging or stalled.
//
// This should run on a separate server from subsquid - it monitors from the outside.
//
// Required ENV variables:
// - METRICS_URL: The URL of the subsquid metrics endpoint
// - RPC_ENDPOINT_HTTP: The HTTP endpoint of the RPC server
// - MONITOR_INTERVAL_MS: The interval in milliseconds to poll the metrics endpoint. Default is 10 seconds.
// - STALE_THRESHOLD_MS: The threshold in milliseconds to consider the processor stalled. Default is 3 minutes.
// - MAX_LAG_BLOCKS_BLOCKS: The maximum lag in blocks to consider the processor lagging. Default is 3 blocks.
// - ALERT_WEBHOOK_URL: The URL of the webhook to send alerts to
//
// ================================================================================================
import dotenv from "dotenv";
dotenv.config();

const METRICS_URL = process.env.METRICS_URL || "http://localhost:9090/metrics";
const RPC_ENDPOINT_HTTP = process.env.RPC_ENDPOINT_HTTP;
const POLL_INTERVAL = parseInt(process.env.MONITOR_INTERVAL_MS || "10000", 10);
// const POLL_INTERVAL = parseInt(process.env.MONITOR_INTERVAL_MS || "3000", 3); // debug setting
const STALE_THRESHOLD_MS = parseInt(process.env.STALE_THRESHOLD_MS || "300000", 10); // 5 minutes
const MAX_LAG_BLOCKS = parseInt(process.env.MAX_LAG_BLOCKS || "3", 3);
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

interface JsonRpcResponse {
    jsonrpc: string;
    id: number;
    result?: { number: string };
    error?: { code: number; message: string };
}

let lastProcessedBlock: number | null = null;
let lastBlockUpdateTime: number | null = null;

async function fetchMetrics(): Promise<string> {
    const response = await fetch(METRICS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
    }
    return await response.text();
}

function parseMetric(data: string, metricName: string): number | null {
    const regex = new RegExp(`${metricName}\\s+(\\d+)`);
    const match = data.match(regex);
    return match ? parseInt(match[1], 10) : null;
}

async function fetchChainHeight(): Promise<number | null> {
    if (!RPC_ENDPOINT_HTTP) return null;

    try {
        const headerResponse = await fetch(RPC_ENDPOINT_HTTP, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "chain_getHeader",
                params: [],
            }),
        });

        if (!headerResponse.ok) {
            throw new Error(`RPC request failed: ${headerResponse.statusText}`);
        }

        const headerData = (await headerResponse.json()) as JsonRpcResponse;
        if (headerData.error) {
            throw new Error(`RPC error: ${headerData.error.message}`);
        }

        const blockNumber = headerData.result?.number;
        return blockNumber ? parseInt(blockNumber.replace(/^0x/, ""), 16) : null;
    } catch (error: any) {
        console.warn(`⚠️ Failed to fetch chain height from RPC: ${error.message}`);
        return null;
    }
}

async function triggerAlarm(message: string) {
    console.error(`🚨 ALARM: ${message}`);

    if (ALERT_WEBHOOK_URL) {
        try {
            await fetch(ALERT_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: `🚨 **Subsquid Alert**\n\n${message}`,
                    alias: "Quantus Monitor",
                    emoji: ":warning:",
                }),
            });
            console.log("✅ Webhook alert sent.");
        } catch (e: any) {
            console.error(`❌ Failed to send webhook: ${e.message}`);
        }
    }
}

async function checkHealth() {
    try {
        const data = await fetchMetrics();
        const currentBlock = parseMetric(data, "sqd_processor_last_block");

        if (currentBlock === null) {
            console.warn("⚠️ Metrics missing sqd_processor_last_block. Processor might be starting...");
            return;
        }

        const now = Date.now();
        const chainHeight = await fetchChainHeight();

        if (lastProcessedBlock === null) {
            lastProcessedBlock = currentBlock;
            lastBlockUpdateTime = now;
            console.log(`Status: Processor=${currentBlock}${chainHeight ? `, Chain=${chainHeight}` : ""}`);
            return;
        }

        if (currentBlock > lastProcessedBlock) {
            lastProcessedBlock = currentBlock;
            lastBlockUpdateTime = now;
            const lag = chainHeight ? chainHeight - currentBlock : null;
            console.log(`Status: Processor=${currentBlock}${chainHeight ? `, Chain=${chainHeight}, Lag=${lag}` : ""}`);

            if (chainHeight && lag !== null && lag > MAX_LAG_BLOCKS) {
                await triggerAlarm(
                    `Processor is lagging by ${lag} blocks! (Chain: ${chainHeight}, Proc: ${currentBlock})`,
                );
            }
        } else if (lastBlockUpdateTime && now - lastBlockUpdateTime > STALE_THRESHOLD_MS) {
            const staleSeconds = Math.floor((now - lastBlockUpdateTime) / 1000);
            await triggerAlarm(
                `Processor appears stalled! Last block ${currentBlock} hasn't changed in ${staleSeconds}s${chainHeight ? ` (Chain: ${chainHeight})` : ""}`,
            );
        }
    } catch (error: any) {
        console.error(`Monitor Check Failed: ${error.message}`);
    }
}

console.log(`Starting monitor... polling ${METRICS_URL} every ${POLL_INTERVAL}ms`);
if (RPC_ENDPOINT_HTTP) {
    console.log(`RPC endpoint: ${RPC_ENDPOINT_HTTP}`);
}
console.log(`Stale threshold: ${STALE_THRESHOLD_MS}ms`);
setInterval(checkHealth, POLL_INTERVAL);
checkHealth();
