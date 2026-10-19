import { describe, expect, it } from "vitest";
import { compatibleAppearanceLoad, supportsAppearanceContract } from "./appearanceCompatibility";

describe("appearance advertisement scoping", () => {
  it.each([undefined, null, {}, [], { appearanceP2: "1" }, { appearanceP2: 2 }, { appearanceP2: true }])("fails closed for missing/unknown metadata %j", (value) => {
    expect(supportsAppearanceContract(value)).toBe(false);
  });
  it("ties a compatible advertisement to the current site and API load", () => {
    const load = { siteId: "site-a", apiOrigin: "https://api.example", writeCompatibility: { appearanceP2: 1 } };
    expect(compatibleAppearanceLoad("site-a", "https://api.example", load)).toBe(true);
    expect(compatibleAppearanceLoad("site-b", "https://api.example", load)).toBe(false);
    expect(compatibleAppearanceLoad("site-a", "https://other.example", load)).toBe(false);
    expect(compatibleAppearanceLoad("site-a", "https://api.example", null)).toBe(false);
  });
});
