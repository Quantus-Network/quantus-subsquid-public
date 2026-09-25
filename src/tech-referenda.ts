import { Runtime } from "@subsquid/substrate-runtime";
import { hexToU8a, u8aToString } from "@polkadot/util";

import { constants, storage } from "./generated_types";
import { ss58Encode } from "./utils/ss58";
import { Bounded, OriginCaller, Tally, ReferendumInfo, ReferendumStatus } from "./generated_types/v148";

/**
 * Minimal block-header shape required to read on-chain storage and decode calls.
 * The Subsquid processor block header satisfies this at runtime.
 */
export type RuntimeBlockHeader = {
    hash: string;
    height: number;
    _runtime: Runtime;
    specVersion?: number;
};

/** Minimal logger surface for observable best-effort decode failures. */
export type ReferendumLog = {
    warn: (message: string) => void;
    debug: (message: string) => void;
};

export type ProposalCategory =
    | "RUNTIME_UPGRADE"
    | "STORAGE_CHANGE"
    | "REMARK"
    | "BALANCE"
    | "MULTISIG"
    | "BATCH"
    | "OTHER";

export interface HumanReadableCall {
    name: string;
    pallet: string;
    method: string;
    summary: string;
    category: ProposalCategory;
}

export interface HumanReadableProposal {
    summary: string;
    storage?: "INLINE" | "LOOKUP" | "LEGACY";
    preimageHash?: string;
    sizeBytes?: number;
    calls: HumanReadableCall[];
    isRuntimeUpgrade: boolean;
}

export interface ReferendumTally {
    ayes: bigint;
    nays: bigint;
    bareAyes: bigint;
}

export interface ReferendumDetails {
    track?: number;
    trackName?: string;
    origin?: string;
    title?: string;
    description?: string;
    proposal: HumanReadableProposal;
}

const BATCH_CALLS = new Set(["Utility.batch", "Utility.batch_all", "Utility.force_batch"]);

/** Tally captured from referenda events. */
export function serializeReferendumTally(tally: Tally): ReferendumTally {
    return {
        ayes: BigInt(tally.ayes),
        nays: BigInt(tally.nays),
        bareAyes: BigInt(tally.bareAyes),
    };
}

// ---------------------------------------------------------------------------
// Proposal decoding / humanization
// ---------------------------------------------------------------------------

function splitCallName(name: string): { pallet: string; method: string } {
    const dot = name.indexOf(".");
    if (dot === -1) return { pallet: name, method: name };
    return { pallet: name.slice(0, dot), method: name.slice(dot + 1) };
}

function categorizeCall(name: string): ProposalCategory {
    if (name === "System.set_code" || name === "System.set_code_without_checks") return "RUNTIME_UPGRADE";
    if (name === "System.authorize_upgrade") return "RUNTIME_UPGRADE";
    if (name === "System.set_storage") return "STORAGE_CHANGE";
    if (name === "System.remark" || name === "System.remark_with_event") return "REMARK";
    if (name.startsWith("Balances.")) return "BALANCE";
    if (name.startsWith("Multisig.")) return "MULTISIG";
    if (BATCH_CALLS.has(name)) return "BATCH";
    return "OTHER";
}

function formatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function hexByteLength(hex: string): number {
    const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
    return normalized.length / 2;
}

function shortHash(hash: string): string {
    return hash.length > 12 ? `${hash.slice(0, 10)}…` : hash;
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
}

function decodeRemarkText(value: unknown, log?: ReferendumLog): string | undefined {
    if (typeof value !== "string") return undefined;

    try {
        const bytes = hexToU8a(value);
        const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "").trim();
        if (utf8.length > 0) return utf8;
    } catch (e) {
        log?.debug(`Failed to decode remark text as UTF-8: ${e}`);
    }

    try {
        const text = u8aToString(hexToU8a(value)).trim();
        return text.length > 0 ? text : undefined;
    } catch (e) {
        log?.debug(`Failed to decode remark text: ${e}`);
        return undefined;
    }
}

function summarizeCall(name: string, args: Record<string, unknown>, log?: ReferendumLog): string {
    const { pallet, method } = splitCallName(name);

    switch (name) {
        case "System.set_code":
        case "System.set_code_without_checks": {
            const code = args.code ?? args.value;
            const size = typeof code === "string" ? hexByteLength(code) : 0;
            return `Runtime upgrade (${formatByteSize(size)} WASM blob)`;
        }
        case "System.authorize_upgrade":
            return "Authorize runtime upgrade";
        case "System.set_storage": {
            const items = Array.isArray(args.items) ? args.items.length : undefined;
            return items
                ? `Modify on-chain storage (${items} item${items === 1 ? "" : "s"})`
                : "Modify on-chain storage";
        }
        case "System.remark":
        case "System.remark_with_event": {
            const remark = decodeRemarkText(args.remark, log);
            return remark ? `Remark: "${truncate(remark, 120)}"` : "On-chain remark";
        }
        default:
            return `${pallet}.${method}`;
    }
}

function enumToCallName(call: { __kind: string; value?: unknown }): string | null {
    const inner = call.value as { __kind?: string } | undefined;
    if (inner?.__kind) return `${call.__kind}.${inner.__kind}`;
    return null;
}

function normalizeCall(call: unknown): { name: string; args: Record<string, unknown> } | null {
    if (!call || typeof call !== "object") return null;

    const record = call as Record<string, unknown>;
    if (typeof record.name === "string") {
        return { name: record.name, args: (record.args as Record<string, unknown>) ?? {} };
    }

    if (typeof record.__kind === "string") {
        const name = enumToCallName(record as { __kind: string; value?: unknown });
        if (!name) return null;

        const inner = record.value as { value?: Record<string, unknown> } | Record<string, unknown> | undefined;
        const args =
            inner && typeof inner === "object" && "value" in inner && inner.value && typeof inner.value === "object"
                ? (inner.value as Record<string, unknown>)
                : ((inner as Record<string, unknown>) ?? {});

        return { name, args };
    }

    return null;
}

function extractNestedCalls(args: Record<string, unknown>): { name: string; args: Record<string, unknown> }[] {
    const rawCalls = args.calls ?? args.call;
    if (!Array.isArray(rawCalls)) return [];

    return rawCalls
        .map((call) => normalizeCall(call))
        .filter((call): call is { name: string; args: Record<string, unknown> } => call !== null);
}

function humanizeCall(call: { name: string; args: Record<string, unknown> }, log?: ReferendumLog): HumanReadableCall[] {
    if (BATCH_CALLS.has(call.name)) {
        return extractNestedCalls(call.args).flatMap((nested) => humanizeCall(nested, log));
    }

    const { pallet, method } = splitCallName(call.name);

    return [
        {
            name: call.name,
            pallet,
            method,
            summary: summarizeCall(call.name, call.args, log),
            category: categorizeCall(call.name),
        },
    ];
}

function buildProposalSummary(calls: HumanReadableCall[]): string {
    if (calls.length === 0) return "Proposal could not be decoded";
    if (calls.length === 1) return calls[0].summary;

    const preview = calls
        .slice(0, 3)
        .map((call) => call.summary)
        .join("; ");

    const suffix = calls.length > 3 ? `; +${calls.length - 3} more` : "";
    return `Batch proposal (${calls.length} actions): ${preview}${suffix}`;
}

async function resolveLegacyPreimageLen(hash: string, block: RuntimeBlockHeader): Promise<number | undefined> {
    if (!storage.preimage.requestStatusFor.v126.is(block)) return undefined;

    const status = await storage.preimage.requestStatusFor.v126.get(block, hash);
    if (!status) return undefined;

    if (status.__kind === "Unrequested") return status.len;
    return status.maybeLen ?? undefined;
}

async function fetchPreimageBytes(hash: string, len: number, block: RuntimeBlockHeader): Promise<string | undefined> {
    if (!storage.preimage.preimageFor.v126.is(block)) return undefined;
    return storage.preimage.preimageFor.v126.get(block, [hash, len]);
}

function decodeCallBytes(runtime: Runtime, callBytes: string): { name: string; args: Record<string, unknown> } {
    const decoded = normalizeCall(runtime.decodeCall(callBytes));
    if (!decoded) throw new Error("Failed to decode referendum call");
    return decoded;
}

function finalizeProposal(partial: Omit<HumanReadableProposal, "isRuntimeUpgrade">): HumanReadableProposal {
    return {
        ...partial,
        isRuntimeUpgrade: partial.calls.some((c) => c.category === "RUNTIME_UPGRADE"),
    };
}

export async function decodeReferendumProposal(
    proposal: Bounded,
    block: RuntimeBlockHeader,
    log?: ReferendumLog,
): Promise<HumanReadableProposal> {
    let callBytes: string | undefined;
    let storageKind: HumanReadableProposal["storage"];
    let preimageHash: string | undefined;
    let sizeBytes: number | undefined;

    switch (proposal.__kind) {
        case "Inline":
            storageKind = "INLINE";
            callBytes = proposal.value;
            sizeBytes = hexByteLength(proposal.value);
            break;
        case "Lookup":
            storageKind = "LOOKUP";
            preimageHash = proposal.hash;
            sizeBytes = proposal.len;
            callBytes = await fetchPreimageBytes(proposal.hash, proposal.len, block);
            break;
        case "Legacy":
            storageKind = "LEGACY";
            preimageHash = proposal.hash;
            {
                const len = await resolveLegacyPreimageLen(proposal.hash, block);
                if (len != null) {
                    sizeBytes = len;
                    callBytes = await fetchPreimageBytes(proposal.hash, len, block);
                }
            }
            break;
    }

    if (!callBytes) {
        return finalizeProposal({
            storage: storageKind,
            preimageHash,
            sizeBytes,
            summary: preimageHash
                ? `Proposal referenced by preimage ${shortHash(preimageHash)} (not available on chain yet)`
                : "Proposal could not be decoded",
            calls: [],
        });
    }

    try {
        const decoded = decodeCallBytes(block._runtime, callBytes);
        const calls = humanizeCall(decoded, log);

        return finalizeProposal({
            storage: storageKind,
            preimageHash,
            sizeBytes,
            summary: buildProposalSummary(calls),
            calls,
        });
    } catch (e) {
        log?.warn(`Failed to decode referendum proposal at block ${block.height}: ${e}`);
        return finalizeProposal({
            storage: storageKind,
            preimageHash,
            sizeBytes,
            summary: "Proposal could not be decoded",
            calls: [],
        });
    }
}

// ---------------------------------------------------------------------------
// Referendum metadata / details
// ---------------------------------------------------------------------------

type ReferendumMetadata = {
    title?: string;
    description?: string;
};

/**
 * Removes NUL (`0x00`) bytes from a decoded string. The chain stores some text
 * (e.g. track names) as fixed-size `[u8; N]` arrays padded with NUL, but the
 * metadata types them as plain strings, so the padding leaks into the decoded
 * value. Postgres `text` columns reject NUL, so we strip it before persisting.
 */
function stripNullBytes(value: string | undefined): string | undefined {
    if (value == null) return undefined;
    const cleaned = value.replace(/\u0000/g, "").trim();
    return cleaned.length > 0 ? cleaned : undefined;
}

function getTrackName(trackId: number, block: RuntimeBlockHeader): string | undefined {
    if (!constants.techReferenda.tracks.v126.is(block)) return undefined;

    const tracks = constants.techReferenda.tracks.v126.get(block);
    const match = tracks.find(([id]) => id === trackId);
    return stripNullBytes(match?.[1].name);
}

function humanizeOrigin(origin: OriginCaller): string {
    if (origin.__kind === "Origins") {
        return origin.value.__kind;
    }
    if (origin.__kind !== "system") {
        return (origin as { __kind: string }).__kind;
    }
    const inner = origin.value;
    switch (inner.__kind) {
        case "Root":
            return "Root";
        case "Signed":
            return `Signed (${ss58Encode(inner.value)})`;
        case "None":
            return "None";
        case "Authorized":
            return "Authorized";
        default:
            return (inner as { __kind?: string }).__kind ?? "system";
    }
}

/**
 * v148 added the `Origins` variant to `OriginCaller`; the v126 shape is a strict subset,
 * so both decode into the v148 `ReferendumInfo` type.
 */
async function fetchReferendumInfo(index: number, block: RuntimeBlockHeader): Promise<ReferendumInfo | undefined> {
    if (storage.techReferenda.referendumInfoFor.v148.is(block)) {
        return storage.techReferenda.referendumInfoFor.v148.get(block, index);
    }
    if (storage.techReferenda.referendumInfoFor.v126.is(block)) {
        return storage.techReferenda.referendumInfoFor.v126.get(block, index);
    }
    return undefined;
}

async function findOngoingStatus(index: number, block: RuntimeBlockHeader): Promise<ReferendumStatus | undefined> {
    const info = await fetchReferendumInfo(index, block);
    if (info?.__kind === "Ongoing") return info.value;
    return undefined;
}

async function resolvePreimageBytes(hash: string, block: RuntimeBlockHeader): Promise<string | undefined> {
    if (!storage.preimage.requestStatusFor.v126.is(block)) return undefined;

    const status = await storage.preimage.requestStatusFor.v126.get(block, hash);
    let len: number | undefined;

    if (status?.__kind === "Unrequested") {
        len = status.len;
    } else if (status?.__kind === "Requested") {
        len = status.maybeLen ?? undefined;
    }

    if (len == null) return undefined;
    if (!storage.preimage.preimageFor.v126.is(block)) return undefined;

    return storage.preimage.preimageFor.v126.get(block, [hash, len]);
}

function parseMetadataJson(bytes: string, log?: ReferendumLog): ReferendumMetadata | undefined {
    try {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(hexToU8a(bytes)).trim();
        if (!text) return undefined;

        if (text.startsWith("Qm") || text.startsWith("bafy")) {
            return { title: `Off-chain metadata (${text.slice(0, 12)}…)` };
        }

        const parsed = JSON.parse(text) as Record<string, unknown>;
        const title =
            (typeof parsed.title === "string" && parsed.title) ||
            (typeof parsed.name === "string" && parsed.name) ||
            undefined;
        const description = typeof parsed.description === "string" ? parsed.description : undefined;

        return { title: stripNullBytes(title || undefined), description: stripNullBytes(description) };
    } catch (e) {
        log?.debug(`Failed to parse referendum metadata JSON: ${e}`);
        return undefined;
    }
}

async function fetchReferendumMetadata(
    index: number,
    block: RuntimeBlockHeader,
    log?: ReferendumLog,
): Promise<ReferendumMetadata | undefined> {
    if (!storage.techReferenda.metadataOf.v126.is(block)) return undefined;

    const hash = await storage.techReferenda.metadataOf.v126.get(block, index);
    if (!hash) return undefined;

    const bytes = await resolvePreimageBytes(hash, block);
    if (!bytes) return undefined;

    return parseMetadataJson(bytes, log);
}

function fallbackProposal(index: number): HumanReadableProposal {
    return {
        summary: `Referendum #${index}`,
        calls: [],
        isRuntimeUpgrade: false,
    };
}

export function isFallbackProposal(proposal: HumanReadableProposal, index: number): boolean {
    return proposal.calls.length === 0 && proposal.summary === `Referendum #${index}`;
}

export function needsSnapshotForward(details: ReferendumDetails | undefined, index: number): boolean {
    if (!details) return true;
    return details.track == null || isFallbackProposal(details.proposal, index);
}

export interface StoredReferendumSnapshot {
    referendumIndex: number;
    track?: number | null;
    trackName?: string | null;
    origin?: string | null;
    title?: string | null;
    description?: string | null;
    proposalSummary?: string | null;
    proposalStorage?: string | null;
    proposalPreimageHash?: string | null;
    proposalSizeBytes?: number | null;
    proposalCalls?: string | null;
    isRuntimeUpgrade: boolean;
}

export function referendumDetailsFromStoredSnapshot(stored: StoredReferendumSnapshot): ReferendumDetails {
    let calls: HumanReadableCall[] = [];
    if (stored.proposalCalls) {
        try {
            calls = JSON.parse(stored.proposalCalls) as HumanReadableCall[];
        } catch {
            calls = [];
        }
    }

    return {
        track: stored.track ?? undefined,
        trackName: stored.trackName ?? undefined,
        origin: stored.origin ?? undefined,
        title: stored.title ?? undefined,
        description: stored.description ?? undefined,
        proposal: finalizeProposal({
            summary: stored.proposalSummary ?? `Referendum #${stored.referendumIndex}`,
            storage: stored.proposalStorage as HumanReadableProposal["storage"],
            preimageHash: stored.proposalPreimageHash ?? undefined,
            sizeBytes: stored.proposalSizeBytes ?? undefined,
            calls,
        }),
    };
}

/**
 * Fills proposal/track/origin gaps in `fresh` from an earlier snapshot while keeping
 * any metadata resolved at the current block.
 */
export function mergeReferendumDetails(
    snapshot: ReferendumDetails,
    fresh: ReferendumDetails,
    index: number,
): ReferendumDetails {
    return {
        track: fresh.track ?? snapshot.track,
        trackName: fresh.trackName ?? snapshot.trackName,
        origin: fresh.origin ?? snapshot.origin,
        title: fresh.title ?? snapshot.title,
        description: fresh.description ?? snapshot.description,
        proposal: isFallbackProposal(fresh.proposal, index) ? snapshot.proposal : fresh.proposal,
    };
}

/**
 * Resolves the human-facing details for a referendum: the proposed action, track,
 * dispatch origin and off-chain metadata. Reads are best-effort against the given
 * block; whatever cannot be resolved is simply omitted.
 */
export async function buildReferendumDetails(
    index: number,
    block: RuntimeBlockHeader,
    options: { track?: number; proposalFromEvent?: Bounded; log?: ReferendumLog } = {},
): Promise<ReferendumDetails> {
    const log = options.log;
    const ongoing = await findOngoingStatus(index, block).catch((e) => {
        log?.warn(`Failed to fetch ongoing referendum status for #${index} at block ${block.height}: ${e}`);
        return undefined;
    });
    const metadata = await fetchReferendumMetadata(index, block, log).catch((e) => {
        log?.warn(`Failed to fetch referendum metadata for #${index} at block ${block.height}: ${e}`);
        return undefined;
    });

    const track = options.track ?? ongoing?.track;
    const trackName = track != null ? getTrackName(track, block) : undefined;
    const origin = ongoing ? humanizeOrigin(ongoing.origin) : undefined;

    let proposal: HumanReadableProposal;
    if (options.proposalFromEvent) {
        proposal = await decodeReferendumProposal(options.proposalFromEvent, block, log);
    } else if (ongoing) {
        proposal = await decodeReferendumProposal(ongoing.proposal, block, log);
    } else {
        proposal = fallbackProposal(index);
    }

    return {
        track,
        trackName,
        origin,
        title: metadata?.title,
        description: metadata?.description,
        proposal,
    };
}
