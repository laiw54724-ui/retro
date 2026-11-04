import type { DesktopWindow } from "@retrodesk/shared";
import type { ProfileDirectoryEntry } from "../modules/types";

/** Runtime-only adapters for existing serialized URL/window and Explorer refs. */
export type InternalDestination = { kind: "window" | "profile" | "post"; siteId: string; id: string };
export type LinkDestination = InternalDestination | { kind: "url"; url: string };
export type NavigationCatalog = { siteId: string | null; windows: readonly DesktopWindow[]; profiles: readonly ProfileDirectoryEntry[]; profileIdsByWindow: Readonly<Record<string, string>> };
export type NavigationRequest = { requestId: number; profileId: string; postId: string | null; consumed?: boolean };
export type NavigationResult = { ok: true } | { ok: false; reason: "unavailable" };
export type ResolvedDestination = { kind: "url"; url: string } | { kind: "window"; window: DesktopWindow } | { kind: "entity"; profile: ProfileDirectoryEntry; postId: string | null; window: DesktopWindow | null };
