export type SpecVersionRecord = {
    specName: string;
    specVersion: number;
    blockNumber: number;
    blockHash: string;
    metadata: string;
};

function specKey(rec: SpecVersionRecord): string {
    return `${rec.specName}@${rec.specVersion}`;
}

function assertSpecVersionRecord(value: unknown, label: string): SpecVersionRecord {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    const rec = value as Record<string, unknown>;
    if (typeof rec.specName !== "string" || rec.specName.length === 0) {
        throw new Error(`${label} is missing specName`);
    }
    if (!Number.isInteger(rec.specVersion) || (rec.specVersion as number) < 0) {
        throw new Error(`${label} is missing specVersion`);
    }
    if (!Number.isInteger(rec.blockNumber) || (rec.blockNumber as number) < 0) {
        throw new Error(`${label} is missing blockNumber`);
    }
    if (typeof rec.blockHash !== "string" || !rec.blockHash.startsWith("0x")) {
        throw new Error(`${label} is missing blockHash`);
    }
    if (typeof rec.metadata !== "string" || !rec.metadata.startsWith("0x")) {
        throw new Error(`${label} is missing metadata`);
    }
    return {
        specName: rec.specName,
        specVersion: rec.specVersion as number,
        blockNumber: rec.blockNumber as number,
        blockHash: rec.blockHash,
        metadata: rec.metadata,
    };
}

export function parseMetadataJsonl(text: string): SpecVersionRecord[] {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length === 0) {
        throw new Error("metadata file is empty");
    }
    return lines.map((line, index) => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(line);
        } catch {
            throw new Error(`record #${index + 1} is not valid JSON`);
        }
        return assertSpecVersionRecord(parsed, `record #${index + 1}`);
    });
}

export function formatMetadataJsonl(records: SpecVersionRecord[]): string {
    return records.map((rec) => JSON.stringify(rec)).join("\n") + "\n";
}

export function mergeSpecVersions(
    existing: SpecVersionRecord[],
    incoming: SpecVersionRecord[],
): { merged: SpecVersionRecord[]; added: SpecVersionRecord[] } {
    if (existing.length === 0) {
        throw new Error("existing metadata has no spec versions");
    }
    if (incoming.length === 0) {
        throw new Error("incoming metadata has no spec versions");
    }

    const byKey = new Map<string, SpecVersionRecord>();
    for (const rec of existing) {
        const key = specKey(rec);
        if (byKey.has(key)) {
            throw new Error(`duplicate ${key} in existing metadata`);
        }
        byKey.set(key, rec);
    }

    const added: SpecVersionRecord[] = [];
    for (const rec of incoming) {
        const key = specKey(rec);
        const prev = byKey.get(key);
        if (!prev) {
            added.push(rec);
            byKey.set(key, rec);
            continue;
        }
        if (prev.metadata !== rec.metadata) {
            throw new Error(
                `${key} already exists with different metadata ` +
                    `(existing block ${prev.blockNumber} ${prev.blockHash}, ` +
                    `incoming block ${rec.blockNumber} ${rec.blockHash})`,
            );
        }
    }

    added.sort((a, b) => a.specVersion - b.specVersion || a.specName.localeCompare(b.specName));
    return { merged: [...existing, ...added], added };
}
