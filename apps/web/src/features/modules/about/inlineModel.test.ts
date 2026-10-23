import { describe, expect, it } from "vitest";
import { normalizeSocial, reorderFields } from "./inlineModel";
describe("about pasted socials", () => {
  it("normalizes domains and email and uses hostname-only platform matching", () => {
    expect(normalizeSocial(" instagram.com/artist ")).toEqual({ url: "https://instagram.com/artist", label: "Instagram" });
    expect(normalizeSocial("me@example.com")).toEqual({ url: "mailto:me@example.com", label: "Email" });
    expect(normalizeSocial("https://evil.example/instagram.com")?.label).toBe("evil");
    expect(normalizeSocial("https://notinstagram.com")?.label).toBe("notinstagram");
  });
  it.each(["", "javascript:alert(1)", "data:text/html,x", "https://", "not a url", "https://user:pass@example.com", "mailto:nope", `https://example.com/${"x".repeat(2048)}`])("rejects invalid or oversized %s", (value) => expect(normalizeSocial(value)).toBeNull());
});
describe("about field reordering", () => {
  const fields = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("moves before, after and to the tail", () => {
    expect(reorderFields(fields, "a", "c", true).map(x => x.id)).toEqual(["b", "c", "a"]);
    expect(reorderFields(fields, "c", "a").map(x => x.id)).toEqual(["c", "a", "b"]);
    expect(reorderFields(fields, "b", null).map(x => x.id)).toEqual(["a", "c", "b"]);
    expect(fields.map(x => x.id)).toEqual(["a", "b", "c"]);
  });
  it("ignores stale ids", () => {
    expect(reorderFields(fields, "missing", "b")).toBe(fields);
    expect(reorderFields(fields, "a", "missing")).toBe(fields);
  });
});
