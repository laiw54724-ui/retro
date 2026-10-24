import { describe, expect, it } from "vitest";
import { followCountLabel } from "./followCountLabel";

describe("follow count labels", () => {
  it("uses the named count for empty and zero legacy labels", () => {
    for (const legacy of ["", "0"]) {
      expect(followCountLabel(null, legacy, 0)).toBe(0);
      expect(followCountLabel(null, legacy, 1)).toBe(1);
      expect(followCountLabel(undefined, legacy, 2)).toBe(2);
    }
  });
  it("preserves arbitrary legacy text without pretending to know its numeric value", () => {
    for (const legacy of ["100", "1.2K", "unknown", " 0 "]) {
      expect(followCountLabel(null, legacy, 0)).toBe(legacy);
      expect(followCountLabel(null, legacy, 1)).toBe(`${legacy} + 1`);
    }
  });
  it("does not add named actors twice to a structured total, including zero", () => {
    expect(followCountLabel(0, "100", 0)).toBe(0);
    expect(followCountLabel(13, "100", 1)).toBe(13);
  });
});
