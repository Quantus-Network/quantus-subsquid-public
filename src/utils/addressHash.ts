/**
 * Utility functions for computing blake3 hashes of addresses.
 * Used for privacy-preserving prefix queries.
 */

import { blake3 } from "@noble/hashes/blake3";
import { decodeAddress } from "@polkadot/util-crypto";

/**
 * Compute blake3 hash of raw address bytes and return as hex string.
 *
 * @param ss58Address - The SS58 encoded address (e.g., "qz...")
 * @returns The blake3 hash as a hex string (64 characters)
 */
export function computeAddressHash(ss58Address: string): string {
    const rawBytes = decodeAddress(ss58Address);
    return computeAccountIdHash(rawBytes);
}

/**
 * Compute blake3 hash from raw account ID bytes.
 *
 * @param accountId - Raw account ID as Uint8Array (32 bytes)
 * @returns The blake3 hash as a hex string (64 characters)
 */
export function computeAccountIdHash(accountId: Uint8Array): string {
    const hash = blake3(accountId);
    return Buffer.from(hash).toString("hex");
}

/**
 * Check if a hash matches a given prefix.
 *
 * @param hash - The full hash (hex string)
 * @param prefix - The prefix to check (hex string)
 * @returns True if the hash starts with the prefix
 */
export function hashMatchesPrefix(hash: string, prefix: string): boolean {
    return hash.toLowerCase().startsWith(prefix.toLowerCase());
}
