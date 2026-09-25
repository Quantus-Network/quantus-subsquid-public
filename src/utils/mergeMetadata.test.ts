import { formatMetadataJsonl, mergeSpecVersions, parseMetadataJsonl } from "./mergeMetadata";

const v126 = {
    specName: "quantus-runtime",
    specVersion: 126,
    blockNumber: 0,
    blockHash: "0x11",
    metadata: "0xaaaa",
};

const v144 = {
    specName: "quantus-runtime",
    specVersion: 144,
    blockNumber: 866392,
    blockHash: "0x22",
    metadata: "0xbbbb",
};

const v148 = {
    specName: "quantus-runtime",
    specVersion: 148,
    blockNumber: 0,
    blockHash: "0x33",
    metadata: "0xcccc",
};

describe("mergeSpecVersions", () => {
    it("appends a new-genesis spec that the old chain does not have", () => {
        const { merged, added } = mergeSpecVersions([v126, v144], [v148]);

        expect(added).toEqual([v148]);
        expect(merged).toEqual([v126, v144, v148]);
    });

    it("skips an incoming spec that already exists with the same metadata", () => {
        const { merged, added } = mergeSpecVersions([v126, v148], [v148]);

        expect(added).toEqual([]);
        expect(merged).toEqual([v126, v148]);
    });

    it("throws when the same spec version has different metadata", () => {
        const conflicting = { ...v148, metadata: "0xdddd", blockHash: "0x44" };

        expect(() => mergeSpecVersions([v148], [conflicting])).toThrow(
            /quantus-runtime@148 already exists with different metadata/,
        );
    });

    it("throws when existing metadata is empty", () => {
        expect(() => mergeSpecVersions([], [v148])).toThrow(/existing metadata has no spec versions/);
    });

    it("throws when incoming metadata is empty", () => {
        expect(() => mergeSpecVersions([v126], [])).toThrow(/incoming metadata has no spec versions/);
    });
});

describe("parseMetadataJsonl / formatMetadataJsonl", () => {
    it("round-trips records", () => {
        const text = formatMetadataJsonl([v126, v148]);
        expect(parseMetadataJsonl(text)).toEqual([v126, v148]);
    });

    it("throws on an empty file", () => {
        expect(() => parseMetadataJsonl("\n")).toThrow(/metadata file is empty/);
    });
});
