import { resetDecodeCallDataRegistry } from "./decodeCallData";
import { resolveDispatchError } from "./resolveDispatchError";

/** Latest spec of the v148 (mainnet) genesis. */
const SPEC_V148 = 148;

describe("resolveDispatchError", () => {
    beforeEach(() => {
        resetDecodeCallDataRegistry();
    });

    it("resolves a module error to pallet name, variant name, and docs", () => {
        const resolved = resolveDispatchError(
            { __kind: "Module", value: { index: 2, error: "0x02000000" } },
            SPEC_V148,
        );

        expect(resolved).toEqual({
            errorType: "Module",
            errorModule: "Balances",
            errorName: "InsufficientBalance",
            errorDocs: "Balance too low to send value.",
        });
    });

    // sp_runtime TokenError variants are in metadata without doc strings.
    it("resolves a nested token error to its variant name", () => {
        const resolved = resolveDispatchError({ __kind: "Token", value: { __kind: "FundsUnavailable" } }, SPEC_V148);

        expect(resolved).toEqual({
            errorType: "Token",
            errorName: "FundsUnavailable",
        });
    });

    // sp_arithmetic::ArithmeticError, not sp_runtime. Variants have no doc strings.
    it("resolves a nested arithmetic error to its variant name", () => {
        const resolved = resolveDispatchError({ __kind: "Arithmetic", value: { __kind: "Overflow" } }, SPEC_V148);

        expect(resolved).toEqual({
            errorType: "Arithmetic",
            errorName: "Overflow",
        });
    });

    it("keeps a unit error as its type only", () => {
        const resolved = resolveDispatchError({ __kind: "BadOrigin" }, SPEC_V148);

        expect(resolved).toEqual({ errorType: "BadOrigin" });
    });

    it("keeps a unit error when metadata.jsonl has no record for the spec version", () => {
        const warn = jest.fn();

        const resolved = resolveDispatchError({ __kind: "BadOrigin" }, 999, { warn });

        expect(resolved).toEqual({ errorType: "BadOrigin" });
        expect(warn).toHaveBeenCalledWith(
            "No metadata for spec version 999 in metadata.jsonl; indexing System.ExtrinsicFailed as BadOrigin",
        );
    });

    it("keeps the raw module index and error bytes when metadata.jsonl has no record for the spec version", () => {
        const warn = jest.fn();

        const resolved = resolveDispatchError({ __kind: "Module", value: { index: 2, error: "0x02000000" } }, 999, {
            warn,
        });

        expect(resolved).toEqual({
            errorType: "Module",
            errorModule: "2",
            errorName: "0x02000000",
        });
        expect(warn).toHaveBeenCalledWith(
            "No metadata for spec version 999 in metadata.jsonl; indexing System.ExtrinsicFailed as Module index 2 error 0x02000000",
        );
    });

    it("keeps a nested error variant name when metadata.jsonl has no record for the spec version", () => {
        const warn = jest.fn();

        const resolved = resolveDispatchError({ __kind: "Token", value: { __kind: "FundsUnavailable" } }, 999, {
            warn,
        });

        expect(resolved).toEqual({
            errorType: "Token",
            errorName: "FundsUnavailable",
        });
        expect(warn).toHaveBeenCalledWith(
            "No metadata for spec version 999 in metadata.jsonl; indexing System.ExtrinsicFailed as Token.FundsUnavailable",
        );
    });

    it("throws when the module index is not in metadata", () => {
        expect(() =>
            resolveDispatchError({ __kind: "Module", value: { index: 255, error: "0x00000000" } }, SPEC_V148),
        ).toThrow("Unknown module index 255");
    });
});
