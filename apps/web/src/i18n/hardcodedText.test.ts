import { describe, expect, it } from "vitest";

/**
 * Every user-visible string must come from the translation catalogs. This guard fails when a Chinese literal appears in app
 * source outside the few files that intentionally hold Chinese data. A line can opt out with `i18n-ignore: <reason>`.
 */
const sources = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const DATA_FILES = [
  "features/modules/registry.ts", // module registry data; catalog labels are translated at render time (editor:modules)
  "i18n/locale.ts", // locale names in their own language
  "i18n/systemMessages.ts", // zh wording of shared-package messages used as lookup keys
  "i18n/localizedDefaults.ts", // zh wording of creation defaults used as lookup keys
];
const HAN = /[㐀-鿿]/;

describe("no hard-coded Chinese UI text", () => {
  it("only intentional data files and marked lines contain Chinese", () => {
    const offenders: string[] = [];
    for (const [key, source] of Object.entries(sources)) {
      const path = key.startsWith("./") ? `i18n/${key.slice(2)}` : key.replace(/^\.\.\//, ""); // relative to src/
      if (/\.test\.tsx?$/.test(path) || path.startsWith("dev/") || path.includes("/locales/") || path.includes(".generated.")) continue;
      if (DATA_FILES.includes(path)) continue;
      source.split("\n").forEach((line, index) => {
        const code = line.trim();
        if (!HAN.test(code) || code.startsWith("//") || code.startsWith("*") || code.startsWith("/*") || code.includes("i18n-ignore")) return;
        offenders.push(`src/${path}:${index + 1} ${code.slice(0, 90)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
