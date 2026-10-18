import { describe, expect, it } from "vitest";
import { ICON_CATALOG } from "./catalog.generated";
import { ICON_LIBRARY_IDS, ICON_LIBRARY_SETS } from "./ids.generated";
import { hasLibraryIdShape, ICON_ID_ALIASES, resolveLibraryIcon } from "./library";
import { iconBackground, iconImageRendering } from "../icons";

// Raw text of every bundled file, keyed by its public URL path (e.g. /icon-library/haiku/folder.svg).
const files: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("/public/icon-library/**/*.{svg,png,txt}", { query: "?raw", import: "default", eager: true }) as Record<string, string>).map(([key, value]) => [key.replace("/public", ""), value])
);
const read = (url: string) => files[url];

describe("open icon library ids", () => {
  it("has the three sets with stable package-prefixed kebab-case ids", () => {
    expect(Object.keys(ICON_LIBRARY_SETS).sort()).toEqual(["haiku", "pixelart", "pixelarticons"]);
    for (const id of ICON_LIBRARY_IDS) expect(id).toMatch(/^(haiku|pixelart|pixelarticons):[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(new Set(ICON_LIBRARY_IDS).size).toBe(ICON_LIBRARY_IDS.length);
    expect(ICON_LIBRARY_IDS).toContain("haiku:folder");
  });

  it("every id has a same-origin file and a catalog entry with a zh name and purposes", () => {
    expect(ICON_CATALOG.map((item) => item.id).sort()).toEqual([...ICON_LIBRARY_IDS].sort());
    for (const item of ICON_CATALOG) {
      const icon = resolveLibraryIcon(item.id)!;
      expect(icon.url.startsWith("/icon-library/")).toBe(true);
      expect(read(icon.url), item.id).toBeDefined();
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.purposes.length).toBeGreaterThan(0);
    }
  });

  it("bundled SVGs contain no scripts, event handlers, external references or foreign content", () => {
    for (const id of ICON_LIBRARY_IDS) {
      const icon = resolveLibraryIcon(id)!;
      if (!icon.url.endsWith(".svg")) continue;
      const text = read(icon.url);
      expect(text, id).not.toMatch(/<script|<foreignObject|<style|<image|<use|\son[a-z]+=|href=|xlink:|javascript:|data:|@import/i);
      for (const match of text.matchAll(/url\(([^)]*)\)/g)) expect(match[1], id).toMatch(/^#/);
    }
  });

  it("ships a NOTICE with license and pinned source per set", () => {
    for (const set of Object.keys(ICON_LIBRARY_SETS)) {
      const notice = read(`/icon-library/${set}/NOTICE.txt`);
      expect(notice).toMatch(/Source: https:\/\/github\.com\/.+ @ [0-9a-f]{40}/);
      expect(notice).toMatch(/License: (MIT|CC0-1\.0)/);
    }
  });

  it("does not include brand marks or trademarked Haiku art", () => {
    const banned = /(firefox|youtube|facebook|github|twitter|tiktok|android|apple|windows|vlc|dropbox|excel|powerpoint)/;
    const haikuBanned = /(haiku|leaf|depot|word)/;
    for (const id of ICON_LIBRARY_IDS) {
      const [set, name] = id.split(":");
      expect(name, id).not.toMatch(banned);
      if (set === "haiku") expect(name, id).not.toMatch(haikuBanned);
    }
  });
});

describe("rendering and fallbacks", () => {
  it("renders library ids from local files and keeps pixel art crisp", () => {
    expect(iconBackground("haiku:folder")).toContain("/icon-library/haiku/folder.svg");
    expect(iconBackground("pixelart:calendar")).toContain("/icon-library/pixelart/calendar.png");
    expect(iconImageRendering("pixelart:calendar")).toBe("pixelated");
    expect(iconImageRendering("haiku:folder")).toBeUndefined();
    expect(iconBackground("haiku:folder")).not.toMatch(/https?:/);
  });

  it("falls back to a meaningful built-in icon for a removed or unknown id, never a broken image", () => {
    expect(hasLibraryIdShape("haiku:removed-folder-icon")).toBe(true);
    expect(resolveLibraryIcon("haiku:removed-folder-icon")).toBeNull();
    expect(iconBackground("haiku:removed-folder-icon")).toContain("data:image/svg+xml");
    expect(iconBackground("haiku:removed-folder-icon")).toBe(iconBackground("folder"));
    expect(iconBackground("evil:thing")).toBe(iconBackground("doc"));
  });

  it("resolves renamed icons through the alias table", () => {
    expect(ICON_ID_ALIASES).toBeTypeOf("object");
    const original = { ...ICON_ID_ALIASES };
    (ICON_ID_ALIASES as Record<string, string>)["haiku:old-folder"] = "haiku:folder";
    expect(resolveLibraryIcon("haiku:old-folder")?.id).toBe("haiku:folder");
    delete (ICON_ID_ALIASES as Record<string, string>)["haiku:old-folder"];
    expect({ ...ICON_ID_ALIASES }).toEqual(original);
  });
});
