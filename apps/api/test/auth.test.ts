import { describe, expect, it } from "vitest";
import { extractBearerToken } from "../src/lib/supabase";

describe("extractBearerToken", () => {
  it("accepts case-insensitive bearer headers", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer token")).toBe("token");
  });

  it("rejects missing, empty, and non-bearer authorization", () => {
    expect(extractBearerToken(undefined)).toBe("");
    expect(extractBearerToken("")).toBe("");
    expect(extractBearerToken("Basic abc")).toBe("");
    expect(extractBearerToken("Bearer   ")).toBe("");
  });
});
