import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./locale";
import { NAMESPACES, resources } from "./resources";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected an object at ${prefix}`);
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "string") {
      if (!entry.trim()) throw new Error(`Empty translation: ${path}`);
      return [[path, entry]];
    }
    return Object.entries(leaves(entry, path));
  }));
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*-?\s*([^},\s]+)(?:[^}]*)\}\}/g)].map((match) => match[1]))].sort();
}

describe("resource quality gates (all supported locales, including preview)", () => {
  it.each(SUPPORTED_LOCALES)("has exact namespace, key and interpolation parity for %s", (locale) => {
    expect(Object.keys(resources[locale]).sort()).toEqual([...NAMESPACES].sort());
    for (const namespace of NAMESPACES) {
      const base = leaves(resources.en[namespace]);
      const translated = leaves(resources[locale][namespace]);
      expect(Object.keys(translated).sort(), `${locale}/${namespace} keys`).toEqual(Object.keys(base).sort());
      for (const [key, value] of Object.entries(translated)) {
        expect(placeholders(value), `${locale}/${namespace}:${key} placeholders`).toEqual(placeholders(base[key]));
        // UI strings are plain text, not an HTML template or authored-content sink.
        expect(value, `${locale}/${namespace}:${key}`).not.toMatch(/<\/?[a-z][^>]*>/i);
      }
    }
  });

  it("covers every app type through render-time catalog labels without changing registry data", async () => {
    const { WINDOW_TYPES } = await import("../features/modules/registry");
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(resources[locale].editor.modules).sort()).toEqual([...WINDOW_TYPES].sort());
    }
  });

  it("does not silently turn empty strings or placeholder drift into valid translations", () => {
    expect(() => leaves({ broken: "  " })).toThrow("Empty translation: broken");
    expect(placeholders("{{count}} {{title}} {{count}}" )).toEqual(["count", "title"]);
    expect(placeholders("{{name}}" )).not.toEqual(placeholders("{{title}}"));
  });
});
