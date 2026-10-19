import type { VisitorSession } from "../navigation/useVisitorNavigation";
/**
 * What a visitor was looking at in a preview, kept above the layout-specific renderers so a rotation (which swaps the
 * desktop, simulated-phone and plain-phone renderers) can put them back on the same app and character. In memory only:
 * it is never written to the document, the API, history or autosave. Media is deliberately *not* part of it — a swapped
 * renderer stops playback and the visitor presses play again.
 */
export type PreviewIgRoute = {
  screen: string;
  profileId: string;
  postId: string | null;
  collectionId: string | null;
  peopleKind: "followers" | "following" | "likers" | null;
};

/** A visitor's Instagram position plus the Back stack that leads out of it. */
export type PreviewIgState = { route: PreviewIgRoute; history: Array<{ route: PreviewIgRoute; scrollTop: number }> };

export type PreviewNavigation = {
  /** The app (window id) in front, or null when the visitor was on the home screen / had nothing open. */
  openId: string | null;
  visitor?: VisitorSession;
  /** Per Instagram window: the character and screen the visitor was on. */
  ig: Record<string, PreviewIgState>;
};

export const createPreviewNavigation = (): PreviewNavigation => ({ openId: null, ig: {} });
