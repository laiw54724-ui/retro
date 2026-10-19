import { makeWindow, type DesktopWindow } from "@retrodesk/shared";
import type { ProfileDirectoryEntry } from "../modules/types";
/** Derived render-only window; never added to a canonical document or registry. */
export function createEntityViewer(profile: ProfileDirectoryEntry, windows: readonly DesktopWindow[]): DesktopWindow {
  const viewer = makeWindow("instagram", windows.length);
  if (viewer.type !== "instagram") throw new Error("Invalid viewer factory");
  let id = "visitor:entity-viewer";
  while (windows.some((window) => window.id === id)) id += ":v";
  return { ...viewer, id, title: `${profile.profile.name || profile.profile.username}.exe`, defaultOpen: false, content: { ...viewer.content, profile: profile.profile, images: profile.posts } };
}
