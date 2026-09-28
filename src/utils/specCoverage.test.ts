import fs from "fs";
import path from "path";
import { Runtime } from "@subsquid/substrate-runtime";
import { constants, events, storage } from "../generated_types";
import { parseMetadataJsonl, SpecVersionRecord } from "./mergeMetadata";

/**
 * Specs the indexer must decode: the Planck chain history plus mainnet.
 * Mainnet genesis is quantus-runtime@152; both chains later share @153.
 */
const REQUIRED_SPECS = [126, 127, 128, 131, 136, 144, 148, 152, 153];

type RuntimeCtx = { _runtime: Runtime };

type Checker = {
    name: string;
    accepts(block: RuntimeCtx): boolean;
};

function loadRecords(): SpecVersionRecord[] {
    const metadataPath = path.join(process.cwd(), "metadata.jsonl");
    return parseMetadataJsonl(fs.readFileSync(metadataPath, "utf8"));
}

function runtimeFor(record: SpecVersionRecord): Runtime {
    return new Runtime(
        {
            specName: record.specName,
            specVersion: record.specVersion,
            implName: "-",
            implVersion: 0,
        },
        record.metadata,
    );
}

function isChecker(value: unknown): value is { name: string; is(block: RuntimeCtx): boolean } {
    return (
        !!value &&
        typeof value === "object" &&
        typeof (value as { is?: unknown }).is === "function" &&
        typeof (value as { name?: unknown }).name === "string"
    );
}

function isEventType(value: unknown): value is { matches(block: RuntimeCtx): boolean } {
    return !!value && typeof value === "object" && typeof (value as { matches?: unknown }).matches === "function";
}

function eventCheckers(root: object): Checker[] {
    const checkers: Checker[] = [];
    for (const pallet of Object.values(root)) {
        if (!pallet || typeof pallet !== "object") continue;
        for (const item of Object.values(pallet as object)) {
            if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") continue;
            const name = (item as { name: string }).name;
            for (const version of Object.values(item as object)) {
                if (!isEventType(version)) continue;
                checkers.push({
                    name,
                    accepts: (block) => version.matches(block),
                });
            }
        }
    }
    return checkers;
}

function typedCheckers(root: object): Checker[] {
    const checkers: Checker[] = [];
    for (const pallet of Object.values(root)) {
        if (!pallet || typeof pallet !== "object") continue;
        for (const item of Object.values(pallet as object)) {
            if (!item || typeof item !== "object") continue;
            for (const version of Object.values(item as object)) {
                if (!isChecker(version)) continue;
                checkers.push({
                    name: version.name,
                    accepts: (block) => version.is(block),
                });
            }
        }
    }
    return checkers;
}

function uncovered(runtime: Runtime, checkers: Checker[], exists: (name: string) => boolean): string[] {
    const byName = new Map<string, Checker[]>();
    for (const checker of checkers) {
        const group = byName.get(checker.name) ?? [];
        group.push(checker);
        byName.set(checker.name, group);
    }

    const missing: string[] = [];
    for (const [name, group] of byName) {
        if (!exists(name)) continue;
        const block = { _runtime: runtime };
        if (!group.some((checker) => checker.accepts(block))) {
            missing.push(name);
        }
    }
    return missing;
}

describe("metadata spec coverage", () => {
    const records = loadRecords();

    it("includes every Planck spec and the mainnet genesis spec", () => {
        const present = records.map((record) => record.specVersion);
        expect(present).toEqual(expect.arrayContaining(REQUIRED_SPECS));
        // Typegen names a shared type after the first spec in this file. Vesting.Launch
        // is generated as v153; mainnet's earlier spec 152 must stay after it.
        expect(present.indexOf(153)).toBeLessThan(present.indexOf(152));
    });

    it.each(records.map((record) => record.specVersion))("generated types decode spec %s", (specVersion) => {
        const record = records.find((item) => item.specVersion === specVersion);
        if (!record) {
            throw new Error(`metadata.jsonl is missing spec ${specVersion}`);
        }
        const runtime = runtimeFor(record);
        const blockEvents = uncovered(runtime, eventCheckers(events), (name) => runtime.hasEvent(name));
        const blockStorage = uncovered(runtime, typedCheckers(storage), (name) => runtime.hasStorageItem(name));
        const blockConstants = uncovered(runtime, typedCheckers(constants), (name) => runtime.hasConstant(name));

        expect({ events: blockEvents, storage: blockStorage, constants: blockConstants }).toEqual({
            events: [],
            storage: [],
            constants: [],
        });
    });
});
