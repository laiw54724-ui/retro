import type { InternalDestination, NavigationRequest, NavigationResult } from "../navigation/linkDestination";
import type { PreviewNavigation } from "../site/previewNavigation";
import type { ReactElement } from "react";
import type { CollectionEntityV2, DesktopWindow, EntityRef, HighlightEntityV2, IgPost, PostEntityV2, ProfileEntityV2, RetroTheme, SiteDocumentV2Input } from "@retrodesk/shared";
import type { ThemeView } from "../../lib/themeView";

export type LinkAction = { target: "url" | "window"; url?: string; windowId?: string; label?: string };
export type ProfileDirectoryPost = IgPost & Pick<PostEntityV2, "media" | "worldDateLabel" | "taggedProfileIds" | "collectionIds" | "pinned" | "namedLikerIds" | "otherLikeCount" | "actorComments">;
export type ProfileDirectoryEntry = { id: string; siteId: string; profile: Extract<DesktopWindow, { type: "instagram" }>["content"]["profile"]; posts: ProfileDirectoryPost[]; highlights: HighlightEntityV2[]; collections: CollectionEntityV2[]; followerIds: string[]; followingIds: string[]; followerCount: number | null; followingCount: number | null; legacyFollowerLabel: string; legacyFollowingLabel: string; themeOverride?: { accent: string; background: string } };

export type ModuleCtx = {
  theme: RetroTheme;
  tv: ThemeView;
  /** True only in the desktop/mobile editor when inline editing is allowed. */
  editing: boolean;
  mobile: boolean;
  siteId?: string;
  windows: Array<{ id: string; title: string }>;
  onLink: (action: LinkAction) => void;
  onNavigate?: (target: InternalDestination) => NavigationResult;
  navigationRequest?: NavigationRequest;
  navigationSiteId?: string | null;
  /** Editor only. Resolves to the stable stored asset reference, or null after showing an error. */
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  /** Optional boundary for resolving future site-level entities. v1 callers omit it. */
  resolveEntity?: (ref: EntityRef) => unknown | null;
  /** v2 Instagram profile authoring channel; omitted for public/v1 callers. */
  profiles?: ProfileEntityV2[];
  posts?: PostEntityV2[];
  collections?: CollectionEntityV2[];
  profileId?: string;
  initialPostId?: string;
  /** Visitor-only navigation shared across renderers of one preview; see previewNavigation.ts. */
  navigation?: PreviewNavigation;
  /** Previews only: whether a share link may point at this character/post (it must exist in the stored public snapshot). Omitted = always allowed (the real public page). */
  /** The viewer is authorised to see unpublished (draft) content — an owner/collaborator draft preview. Never set on the public page. */
  viewDrafts?: boolean;
  canShareEntity?: (kind: "oc" | "post", id: string) => boolean;
  publicShareBaseUrl?: string;
  siteHandle?: string;
  profileThemeOverride?: { accent: string; background: string };
  onProfileSelect?: (id: string, windowId?: string) => void;
  onProfileAdd?: (windowId?: string) => void;
  onProfileDuplicate?: (id: string, windowId?: string) => void;
  onProfileChange?: (profileId: string, patch: Record<string, unknown>, historyKey?: string) => void;
  onProfileDelete?: (profileId: string, retargetProfileId?: string) => void;
  profileDeleteBlocked?: boolean;
  profileDeleteGuard?: { windowTitles: string[]; postIds: string[] };
  /** Read-only OC directory; public callers receive published entries only. */
  profileDirectory?: ProfileDirectoryEntry[];
  /** Editor-only canonical content mutation. The recipe is committed as one v2 history step. */
  updateContent?: (recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, historyKey?: string) => void;
  /** Editor-only read snapshot used by canonical interaction controls. */
  socialDocument?: SiteDocumentV2Input;
};

export type WindowOf<T extends DesktopWindow["type"]> = Extract<DesktopWindow, { type: T }>;

export type ModuleProps<T extends DesktopWindow["type"]> = {
  window: WindowOf<T>;
  ctx: ModuleCtx;
  /** `historyKey` merges rapid edits (typing) into one undo step. */
  update: (recipe: (window: WindowOf<T>) => WindowOf<T>, historyKey?: string) => void;
};

export type ModuleCapabilities = {
  /** The module exposes an inline editor in the authoring UI. */
  editor: boolean;
  /** The module can render in the visitor site. */
  visitor: boolean;
  /** The module has a mobile presentation. */
  mobile: boolean;
  /** The module can open links through the shared LinkAction boundary. */
  links: boolean;
  /** The module can use the scoped private asset upload boundary. */
  uploads: boolean;
};

export type MobilePresentation = {
  mode: "window";
  /** Mobile add surfaces use the same icon grid for every registered module. */
  icon: string;
};

export type WindowModule<T extends DesktopWindow["type"]> = {
  type: T;
  schemaVersion: number;
  label: string;
  description: string;
  icon: string;
  capabilities: ModuleCapabilities;
  mobile: MobilePresentation;
  create: (index?: number) => WindowOf<T>;
  View: (props: ModuleProps<T>) => ReactElement;
  InlineEditor: (props: ModuleProps<T>) => ReactElement;
};

export function safeHref(url: string | undefined) {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "#";
  } catch {
    return "#";
  }
}

export const opensNewTab = (url: string | undefined) => !!url && /^https?:/i.test(url);

/** Moves one item in an array by id. */
export function moveById<T extends { id: string }>(list: T[], id: string, direction: -1 | 1): T[] {
  const index = list.findIndex((item) => item.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

export function patchById<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
