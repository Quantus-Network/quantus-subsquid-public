import { decodeCallData, resetDecodeCallDataRegistry } from "./decodeCallData";

/** Latest spec of the v148 (mainnet) genesis. */
const SPEC_V148 = 148;
/** Genesis spec of the v126 (Planck testnet) chain. */
const SPEC_V126 = 126;

const GUARDIAN_ADDR = "qzjVsKygc34wWPcC5gaRArB5PZPV92h1BTzEaY8kQHuBs9Kjk";

function setHighSecurityCall(): Uint8Array {
    const guardian = Buffer.alloc(32, 2);
    const millisBuf = Buffer.alloc(8);
    millisBuf.writeBigUInt64LE(60_000n);
    return new Uint8Array([...Buffer.from([11, 0, 1]), ...millisBuf, ...guardian]);
}

describe("decodeCallData", () => {
    beforeEach(() => {
        resetDecodeCallDataRegistry();
    });

    it("returns decodeError for calls that are too short", () => {
        const decoded = decodeCallData(new Uint8Array([1]), SPEC_V148);

        expect(decoded.callRaw).toEqual("0x01");
        expect(decoded.pallet).toEqual("Unknown");
        expect(decoded.call).toEqual("unknown");
        expect(decoded.decodeError).toEqual("Call data too short (1 bytes)");
        expect(decoded.transferTo).toBeUndefined();
    });

    it("decodes Balances.transfer_keep_alive into flat fields", () => {
        const account = Buffer.alloc(32, 1);
        const callBytes = new Uint8Array([...Buffer.from([2, 3, 0]), ...account, 0xa1, 0x0f]);

        const decoded = decodeCallData(callBytes, SPEC_V148);

        expect(decoded.pallet).toEqual("Balances");
        expect(decoded.call).toEqual("transfer_keep_alive");
        expect(decoded.callRaw).toEqual(`0x${Buffer.from(callBytes).toString("hex")}`);
        expect(decoded.transferTo).toEqual("qzjUYyuN4L3HKmBPMxHvK2n8HYnaLZcQvLSQTgdwB2nQ1g2mc");
        expect(decoded.transferAmount).toEqual(1000n);
        expect(decoded.decodeError).toBeUndefined();
    });

    it("decodes ReversibleTransfers.set_high_security delay and guardian fields", () => {
        const decoded = decodeCallData(setHighSecurityCall(), SPEC_V148);

        expect(decoded.pallet).toEqual("ReversibleTransfers");
        expect(decoded.call).toEqual("set_high_security");
        expect(decoded.delayKind).toEqual("Timestamp");
        expect(decoded.delayValue).toEqual(60_000n);
        expect(decoded.guardian).toEqual(GUARDIAN_ADDR);
    });

    it("decodes with the metadata of the block's spec version (v126 names the guardian `interceptor`)", () => {
        const decoded = decodeCallData(setHighSecurityCall(), SPEC_V126);

        expect(decoded.decodeError).toBeUndefined();
        expect(decoded.pallet).toEqual("ReversibleTransfers");
        expect(decoded.call).toEqual("set_high_security");
        expect(decoded.delayKind).toEqual("Timestamp");
        expect(decoded.delayValue).toEqual(60_000n);
        expect(decoded.guardian).toEqual(GUARDIAN_ADDR);
    });

    it("reports a decodeError when metadata.jsonl has no record for the spec version", () => {
        const decoded = decodeCallData(setHighSecurityCall(), 999);

        expect(decoded.pallet).toEqual("Unknown");
        expect(decoded.decodeError).toEqual("No metadata for spec version 999 in metadata.jsonl");
    });
});
