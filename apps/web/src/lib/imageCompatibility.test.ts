import { describe, expect, it } from "vitest";
import { compatibleDocumentRecovery, compatibleImageLoad, containsImageWindow, supportsImageWindowContract } from "./imageCompatibility";

describe("independent image reader advertisements and recovery", () => {
  it.each([undefined, null, [], {}, { imageWindow: "1" }, { imageWindow: 2 }, { appearanceP2: 1 }])("fails closed for unknown image metadata %j", (value) => expect(supportsImageWindowContract(value)).toBe(false));
  it("binds compatible loads to both site and API origin", () => {
    const load = { siteId: "a", apiOrigin: "https://api.example", writeCompatibility: { imageWindow: 1 } };
    expect(compatibleImageLoad("a", load.apiOrigin, load)).toBe(true);
    expect(compatibleImageLoad("b", load.apiOrigin, load)).toBe(false);
    expect(compatibleImageLoad("a", "https://other.example", load)).toBe(false);
    expect(compatibleImageLoad("a", load.apiOrigin, null)).toBe(false);
  });
  it("requires image support for either local or stored raw image windows, while preserving appearance-only recovery", () => {
    const load = { siteId: "a", apiOrigin: "https://api.example", writeCompatibility: { appearanceP2: 1 } };
    const image = { windows: [{ type: "image", content: null }] };
    expect(containsImageWindow(image)).toBe(true);
    expect(compatibleDocumentRecovery("a", load.apiOrigin, load, {}, {})).toBe(true);
    expect(compatibleDocumentRecovery("a", load.apiOrigin, load, image, {})).toBe(false);
    expect(compatibleDocumentRecovery("a", load.apiOrigin, load, {}, image)).toBe(false);
    const ready = { ...load, writeCompatibility: { appearanceP2: 1, imageWindow: 1 } };
    expect(compatibleDocumentRecovery("a", load.apiOrigin, ready, image, image)).toBe(true);
    expect(compatibleDocumentRecovery("a", load.apiOrigin, { ...load, writeCompatibility: { imageWindow: 1 } }, image, image)).toBe(false);
  });
});
