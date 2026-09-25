import * as ss58 from "@subsquid/ss58";

/** Quantus SS58 address prefix. */
export const SS58_PREFIX = 189;

export function ss58Encode(accountId: string): string {
    return ss58.codec(SS58_PREFIX).encode(accountId);
}

export function ss58Decode(address: string): string {
    return ss58.codec(SS58_PREFIX).decode(address);
}
