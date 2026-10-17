import { describe, expect, it, vi } from "vitest";
import { hasWindowsIconPack, isWindowsIconPackMarker, WINDOWS_ICON_PACK_COMMIT, WINDOWS_ICON_PACK_FILE_COUNT, WINDOWS_ICON_PACK_SOURCE } from "./optionalIconPack";

const marker = {
  schemaVersion: 1,
  source: WINDOWS_ICON_PACK_SOURCE,
  commit: WINDOWS_ICON_PACK_COMMIT,
  fileCount: WINDOWS_ICON_PACK_FILE_COUNT,
  license: "NOASSERTION",
} as const;

describe("optional Windows icon pack", () => {
  it("accepts only the exact pinned marker", () => {
    expect(isWindowsIconPackMarker(marker)).toBe(true);
    expect(isWindowsIconPackMarker({ ...marker, commit: "main" })).toBe(false);
    expect(isWindowsIconPackMarker({ ...marker, license: "MIT" })).toBe(false);
  });

  it("treats missing, invalid and unreachable markers as unavailable", async () => {
    expect(await hasWindowsIconPack(vi.fn(async () => new Response(JSON.stringify(marker), { status: 200 })) as typeof fetch)).toBe(true);
    expect(await hasWindowsIconPack(vi.fn(async () => new Response("not found", { status: 404 })) as typeof fetch)).toBe(false);
    expect(await hasWindowsIconPack(vi.fn(async () => new Response("<html></html>", { status: 200 })) as typeof fetch)).toBe(false);
    expect(await hasWindowsIconPack(vi.fn(async () => { throw new Error("offline"); }) as typeof fetch)).toBe(false);
  });
});
