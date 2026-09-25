import fs from "fs";
import path from "path";
import { Metadata, TypeRegistry } from "@polkadot/types";
import { bytesToHex } from "../helper";

export interface DecodedCallData {
    callRaw: string;
    pallet: string;
    call: string;
    decodeError?: string;
    transferTo?: string;
    transferAmount?: bigint;
    scheduleTo?: string;
    scheduleAmount?: bigint;
    scheduleAssetId?: number;
    delayKind?: string;
    delayValue?: bigint;
    txId?: string;
    recoverAccount?: string;
    guardian?: string;
}

const MULTI_ADDRESS_VARIANTS = new Set(["Id", "Index", "Raw", "Address32"]);
const BALANCE_TRANSFER_CALLS = new Set(["transfer_allow_death", "transfer_keep_alive"]);
const SCHEDULE_TRANSFER_CALLS = new Set(["schedule_transfer", "schedule_transfer_with_delay"]);
const SCHEDULE_ASSET_TRANSFER_CALLS = new Set(["schedule_asset_transfer", "schedule_asset_transfer_with_delay"]);
const TX_ID_CALLS = new Set(["cancel", "execute_transfer"]);

/** Raw metadata hex per spec version, as listed in metadata.jsonl (may span several genesis chains). */
let metadataBySpecVersion: Map<number, `0x${string}`> | undefined;
const registries = new Map<number, TypeRegistry>();

function loadMetadataBySpecVersion(): Map<number, `0x${string}`> {
    if (metadataBySpecVersion) return metadataBySpecVersion;

    const metadataPath = path.join(process.cwd(), "metadata.jsonl");
    const lines = fs
        .readFileSync(metadataPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        throw new Error(`No metadata found in ${metadataPath}`);
    }

    const result = new Map<number, `0x${string}`>();
    for (const line of lines) {
        const { specVersion, metadata } = JSON.parse(line) as { specVersion: number; metadata: `0x${string}` };
        result.set(specVersion, metadata);
    }
    metadataBySpecVersion = result;
    return result;
}

/**
 * Registry for the runtime that produced the call bytes. Call indices and argument
 * names differ between spec versions, so the block's own spec version must be used.
 */
export function hasMetadata(specVersion: number): boolean {
    return loadMetadataBySpecVersion().has(specVersion);
}

export function getRegistry(specVersion: number): TypeRegistry {
    const cached = registries.get(specVersion);
    if (cached) return cached;

    const metadataHex = loadMetadataBySpecVersion().get(specVersion);
    if (!metadataHex) {
        throw new Error(`No metadata for spec version ${specVersion} in metadata.jsonl`);
    }

    const typeRegistry = new TypeRegistry();
    typeRegistry.setMetadata(new Metadata(typeRegistry, metadataHex));
    registries.set(specVersion, typeRegistry);
    return typeRegistry;
}

function camelToSnake(value: string): string {
    return value
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
}

function toPalletName(section: string): string {
    return section.charAt(0).toUpperCase() + section.slice(1);
}

function normalizeCallArgs(value: unknown): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === "string") {
        if (/^[\d,]+$/.test(value)) {
            return value.replace(/,/g, "");
        }
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(normalizeCallArgs);
    }

    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);

        if (keys.length === 1) {
            const [kind] = keys;
            if (MULTI_ADDRESS_VARIANTS.has(kind)) {
                return { [kind]: normalizeCallArgs(obj[kind]) };
            }
            if (/^[A-Z]/.test(kind)) {
                return { __kind: kind, value: normalizeCallArgs(obj[kind]) };
            }
        }

        const normalized: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(obj)) {
            normalized[key] = normalizeCallArgs(nested);
        }
        return normalized;
    }

    return value;
}

function parseAmount(value: unknown): bigint | undefined {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value.length > 0) {
        return BigInt(value.replace(/,/g, ""));
    }
    return undefined;
}

function parseAccountAddress(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return undefined;

    const obj = value as Record<string, unknown>;
    if (typeof obj.Id === "string") return obj.Id;
    if (obj.__kind === "Id" && typeof obj.value === "string") return obj.value;
    return undefined;
}

function parseDelay(value: unknown): { delayKind?: string; delayValue?: bigint } {
    if (!value || typeof value !== "object") return {};

    const obj = value as Record<string, unknown>;
    if (typeof obj.__kind === "string" && obj.value !== undefined) {
        const delayValue = parseAmount(obj.value);
        return delayValue === undefined ? { delayKind: obj.__kind } : { delayKind: obj.__kind, delayValue };
    }

    const keys = Object.keys(obj);
    if (keys.length !== 1) return {};

    const [kind] = keys;
    const delayValue = parseAmount(obj[kind]);
    return delayValue === undefined ? { delayKind: kind } : { delayKind: kind, delayValue };
}

function parseTxId(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    return value.startsWith("0x") ? value : `0x${value}`;
}

function parseAssetId(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.length > 0) {
        return Number.parseInt(value.replace(/,/g, ""), 10);
    }
    return undefined;
}

function extractFlatFields(
    pallet: string,
    call: string,
    args: Record<string, unknown>,
): Omit<DecodedCallData, "callRaw" | "pallet" | "call"> {
    if (pallet === "Balances" && BALANCE_TRANSFER_CALLS.has(call)) {
        return {
            transferTo: parseAccountAddress(args.dest),
            transferAmount: parseAmount(args.value),
        };
    }

    if (pallet === "ReversibleTransfers" && SCHEDULE_TRANSFER_CALLS.has(call)) {
        return {
            scheduleTo: parseAccountAddress(args.dest),
            scheduleAmount: parseAmount(args.amount),
            ...parseDelay(args.delay),
        };
    }

    if (pallet === "ReversibleTransfers" && SCHEDULE_ASSET_TRANSFER_CALLS.has(call)) {
        return {
            scheduleAssetId: parseAssetId(args.assetId),
            scheduleTo: parseAccountAddress(args.dest),
            scheduleAmount: parseAmount(args.amount),
            ...parseDelay(args.delay),
        };
    }

    if (pallet === "ReversibleTransfers" && TX_ID_CALLS.has(call)) {
        return {
            txId: parseTxId(args.txId),
        };
    }

    if (pallet === "ReversibleTransfers" && call === "recover_funds") {
        return {
            recoverAccount: parseAccountAddress(args.account),
        };
    }

    if (pallet === "ReversibleTransfers" && call === "set_high_security") {
        // Runtimes before v131 named the guardian `interceptor`.
        return {
            ...parseDelay(args.delay),
            guardian: parseAccountAddress(args.guardian ?? args.interceptor),
        };
    }

    return {};
}

function fallbackDecodedCall(callBytes: Uint8Array, reason: string): DecodedCallData {
    return {
        callRaw: bytesToHex(callBytes),
        pallet: "Unknown",
        call: "unknown",
        decodeError: reason,
    };
}

export function decodeCallData(callBytes: Uint8Array, specVersion: number): DecodedCallData {
    const callRaw = bytesToHex(callBytes);

    if (callBytes.length < 2) {
        return {
            callRaw,
            pallet: "Unknown",
            call: "unknown",
            decodeError: `Call data too short (${callBytes.length} bytes)`,
        };
    }

    try {
        const typeRegistry = getRegistry(specVersion);
        const decoded = typeRegistry.createType("Call", callBytes);
        const human = decoded.toHuman() as {
            section?: string;
            method?: string;
            args?: Record<string, unknown>;
        };

        if (!human.section || !human.method) {
            return fallbackDecodedCall(callBytes, "Missing section or method in decoded call");
        }

        const pallet = toPalletName(human.section);
        const call = camelToSnake(human.method);
        const normalizedArgs = normalizeCallArgs(human.args ?? {}) as Record<string, unknown>;

        return {
            callRaw,
            pallet,
            call,
            ...extractFlatFields(pallet, call, normalizedArgs),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fallbackDecodedCall(callBytes, message);
    }
}

/** Reset cached metadata registries (for tests). */
export function resetDecodeCallDataRegistry(): void {
    metadataBySpecVersion = undefined;
    registries.clear();
}
