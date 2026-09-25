/**
 * Unit tests for addressHash utility functions.
 */

import { computeAccountIdHash, hashMatchesPrefix } from "./addressHash";

// Known test vectors - these values are verified against the Rust implementation
const ZERO_BYTES_HASH = "2ada83c1819a5372dae1238fc1ded123c8104fdaa15862aaee69428a1820fcda";
const ONES_BYTES_HASH = "9b34f060fbc0f0aa11f150e26519deff613277b60656f0f8356ed2261505f5c5";
const SEQUENTIAL_BYTES_HASH = "e528e95798037df410543d9f31e396ecdd458d71b157d6014398bae32fb56c65";

describe("addressHash", () => {
    const ZERO_BYTES = new Uint8Array(32).fill(0);
    const ONES_BYTES = new Uint8Array(32).fill(0xff);
    const SEQUENTIAL_BYTES = new Uint8Array(32).map((_, i) => i);

    describe("computeAccountIdHash", () => {
        it("should produce known hash vectors matching Rust implementation", () => {
            expect(computeAccountIdHash(ZERO_BYTES)).toBe(ZERO_BYTES_HASH);
            expect(computeAccountIdHash(ONES_BYTES)).toBe(ONES_BYTES_HASH);
            expect(computeAccountIdHash(SEQUENTIAL_BYTES)).toBe(SEQUENTIAL_BYTES_HASH);
        });

        it("should produce 64-character hex string", () => {
            const hash = computeAccountIdHash(ZERO_BYTES);
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[0-9a-f]+$/);
        });

        it("should be deterministic", () => {
            const hash1 = computeAccountIdHash(ZERO_BYTES);
            const hash2 = computeAccountIdHash(ZERO_BYTES);
            expect(hash1).toBe(hash2);
        });

        it("should produce different hashes for different inputs", () => {
            expect(computeAccountIdHash(ZERO_BYTES)).not.toBe(computeAccountIdHash(ONES_BYTES));
        });
    });

    describe("hashMatchesPrefix", () => {
        const testHash = "abcdef1234567890";

        it("should match correct prefixes", () => {
            expect(hashMatchesPrefix(testHash, "a")).toBe(true);
            expect(hashMatchesPrefix(testHash, "ab")).toBe(true);
            expect(hashMatchesPrefix(testHash, "abcd")).toBe(true);
        });

        it("should not match incorrect prefixes", () => {
            expect(hashMatchesPrefix(testHash, "b")).toBe(false);
            expect(hashMatchesPrefix(testHash, "abce")).toBe(false);
        });

        it("should be case-insensitive", () => {
            expect(hashMatchesPrefix(testHash, "ABCD")).toBe(true);
            expect(hashMatchesPrefix("ABCDEF", "abcd")).toBe(true);
        });

        it("should handle edge cases", () => {
            expect(hashMatchesPrefix(testHash, "")).toBe(true);
            expect(hashMatchesPrefix(testHash, testHash)).toBe(true);
            expect(hashMatchesPrefix(testHash, testHash + "00")).toBe(false);
        });
    });
});
