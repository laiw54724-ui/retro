import { describe, expect, it } from "vitest";
import { commitNumericDraft } from "./numericDraft";

describe("numeric draft commits", () => {
  it.each(["", " ", "-", "1.5", "1e2", "NaN", "Infinity", "9007199254740992"])("restores invalid/incomplete %j without changing the saved value", (text) => {
    expect(commitNumericDraft(text, 8, 5, 12)).toBe(8);
  });
  it.each([["5", 5], ["12", 12], [" 10 ", 10], ["1", 5], ["99", 12]])("commits %j within row/column bounds", (text, expected) => {
    expect(commitNumericDraft(text, 8, 5, 12)).toBe(expected);
  });
  it("preserves zero where allowed rather than treating it as missing", () => {
    expect(commitNumericDraft("0", 8, 0, 12)).toBe(0);
  });
  it("respects the existing mine minimum and dynamic maximum", () => {
    expect(commitNumericDraft("0", 10, 1, 40)).toBe(1);
    expect(commitNumericDraft("40", 10, 1, 40)).toBe(40);
    expect(commitNumericDraft("40", 10, 1, 24)).toBe(24);
  });
});
