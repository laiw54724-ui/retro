export const WINDOWS_ICON_PACK_MARKER = "/windows-icons/.retro-icon-pack.json";
export const WINDOWS_ICON_PACK_SOURCE = "https://github.com/trapd00r/win95-winxp_icons";
export const WINDOWS_ICON_PACK_COMMIT = "728a866ad59a54fd4082dbe000e1e62e50bd90e9";
export const WINDOWS_ICON_PACK_FILE_COUNT = 1193;
export const WINDOWS_ICON_PACK_INSTALL_COMMAND = "pnpm icons:install -- --acknowledge-third-party-rights";

export type WindowsIconPackMarker = {
  schemaVersion: 1;
  source: string;
  commit: string;
  fileCount: number;
  license: "NOASSERTION";
};

export function isWindowsIconPackMarker(value: unknown): value is WindowsIconPackMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<WindowsIconPackMarker>;
  return marker.schemaVersion === 1
    && marker.source === WINDOWS_ICON_PACK_SOURCE
    && marker.commit === WINDOWS_ICON_PACK_COMMIT
    && marker.fileCount === WINDOWS_ICON_PACK_FILE_COUNT
    && marker.license === "NOASSERTION";
}
export async function hasWindowsIconPack(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(WINDOWS_ICON_PACK_MARKER, { cache: "no-store" });
    if (!response.ok) return false;
    return isWindowsIconPackMarker(await response.json());
  } catch {
    return false;
  }
}
