import type { SiVariant } from "@polkadot/types/interfaces/scaleInfo";
import type { TypeRegistry } from "@polkadot/types";
import type { DispatchError } from "../generated_types/v126";
import { getRegistry, hasMetadata } from "./decodeCallData";

export interface ResolvedDispatchError {
    errorType: string;
    errorModule?: string;
    errorName?: string;
    errorDocs?: string;
}

export interface DispatchErrorLog {
    warn: (message: string) => void;
}

const NESTED_ERROR_TYPES: Record<string, { typeName: string; pathRoot: string }> = {
    Arithmetic: { typeName: "ArithmeticError", pathRoot: "sp_arithmetic" },
    Token: { typeName: "TokenError", pathRoot: "sp_runtime" },
    Transactional: { typeName: "TransactionalError", pathRoot: "sp_runtime" },
    Trie: { typeName: "TrieError", pathRoot: "sp_runtime" },
};

function joinDocs(docs: { toString(): string }[]): string {
    return docs
        .map((doc) => doc.toString().trim())
        .filter((doc) => doc.length > 0)
        .join(" ");
}

function moduleErrorBytes(error: string): Uint8Array {
    const hex = error.replace(/^0x/, "");
    if (hex.length !== 8 || !/^[0-9a-fA-F]+$/.test(hex)) {
        throw new Error(`Module error must be 4 bytes, got ${error}`);
    }
    return Uint8Array.from(Buffer.from(hex, "hex"));
}

function variantByIndex(variants: SiVariant[], index: number): SiVariant {
    const variant = variants.find((item) => item.index.toNumber() === index);
    if (!variant) {
        throw new Error(`Unknown error index ${index}`);
    }
    return variant;
}

function moduleError(registry: TypeRegistry, index: number, error: string): ResolvedDispatchError {
    const pallet = registry.metadata.pallets.find((item) => item.index.toNumber() === index);
    if (!pallet || pallet.errors.isNone) {
        throw new Error(`Unknown module index ${index}`);
    }

    const errorType = registry.lookup.getSiType(pallet.errors.unwrap().type);
    const variant = variantByIndex(errorType.def.asVariant.variants, moduleErrorBytes(error)[0]);
    return withDocs(
        {
            errorType: "Module",
            errorModule: pallet.name.toString(),
            errorName: variant.name.toString(),
        },
        joinDocs(variant.docs),
    );
}

function nestedError(
    registry: TypeRegistry,
    errorType: string,
    typeName: string,
    pathRoot: string,
    variantName: string,
): ResolvedDispatchError {
    const portable = registry.lookup.types.find((item) => {
        const path = item.type.path.map((segment) => segment.toString());
        return path[path.length - 1] === typeName && path.includes(pathRoot);
    });
    if (!portable || !portable.type.def.isVariant) {
        throw new Error(`No metadata type ${typeName}`);
    }

    const variant = portable.type.def.asVariant.variants.find((item) => item.name.toString() === variantName);
    if (!variant) {
        throw new Error(`Unknown ${typeName} variant ${variantName}`);
    }

    return withDocs({ errorType, errorName: variantName }, joinDocs(variant.docs));
}

function withDocs(resolved: ResolvedDispatchError, docs: string): ResolvedDispatchError {
    if (docs.length === 0) return resolved;
    return { ...resolved, errorDocs: docs };
}

function unresolvedDispatchError(dispatchError: DispatchError): ResolvedDispatchError {
    const errorType = dispatchError.__kind;

    if (dispatchError.__kind === "Module") {
        return {
            errorType,
            errorModule: String(dispatchError.value.index),
            errorName: dispatchError.value.error,
        };
    }

    if ("value" in dispatchError) {
        return { errorType, errorName: dispatchError.value.__kind };
    }

    return { errorType };
}

function missingMetadataWarning(specVersion: number, resolved: ResolvedDispatchError): string {
    const detail =
        resolved.errorType === "Module"
            ? `Module index ${resolved.errorModule} error ${resolved.errorName}`
            : resolved.errorName
              ? `${resolved.errorType}.${resolved.errorName}`
              : resolved.errorType;
    return `No metadata for spec version ${specVersion} in metadata.jsonl; indexing System.ExtrinsicFailed as ${detail}`;
}

/**
 * Turns a decoded System.ExtrinsicFailed dispatch error into the pallet name,
 * variant name, and docs stored on ErrorEvent. Names come from the runtime
 * metadata for this block's spec version; the event itself only carries indices.
 * When that spec is missing from metadata.jsonl, keeps the error type and, for
 * module errors, the raw pallet index and error bytes, and warns instead of throwing.
 */
export function resolveDispatchError(
    dispatchError: DispatchError,
    specVersion: number,
    log?: DispatchErrorLog,
): ResolvedDispatchError {
    const errorType = dispatchError.__kind;

    if (!hasMetadata(specVersion)) {
        const resolved = unresolvedDispatchError(dispatchError);
        log?.warn(missingMetadataWarning(specVersion, resolved));
        return resolved;
    }

    const registry = getRegistry(specVersion);

    if (dispatchError.__kind === "Module") {
        return moduleError(registry, dispatchError.value.index, dispatchError.value.error);
    }

    const nestedType = NESTED_ERROR_TYPES[errorType];
    if (nestedType && "value" in dispatchError) {
        return nestedError(registry, errorType, nestedType.typeName, nestedType.pathRoot, dispatchError.value.__kind);
    }

    return { errorType };
}
