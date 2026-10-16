import { describe, expect, it } from "vitest";
import { createStarterDocument, THEME_PRESETS, type SiteDocumentV2Input } from "@retrodesk/shared";
import { useEditorStore } from "./store";

const emptyV2 = (siteName: string): SiteDocumentV2Input => ({
  schemaVersion: 2,
  siteName,
  theme: THEME_PRESETS.classic98,
  windows: [],
  mobileColumns: 4,
  entities: { profiles: [], posts: [] }
});

describe("editor canonical history", () => {
  it("keeps profile-only and normal edits paired, and clears redo after coalesced edits", () => {
    const legacy = createStarterDocument("Desk", "classic98", "blank");
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null);
    const profileOnly = { ...emptyV2("Desk"), theme: { ...THEME_PRESETS.classic98, accent: "#ff00aa" } };
    store.replaceDocument(legacy, "profile", profileOnly);
    store.setSiteName("Normal edit");
    expect(useEditorStore.getState().versionedDocument?.siteName).toBe("Normal edit");
    store.undo();
    expect(useEditorStore.getState().versionedDocument?.theme.accent).toBe("#ff00aa");
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.siteName).toBe("Normal edit");
    store.undo();
    store.replaceDocument(legacy, "profile", { ...profileOnly, theme: { ...profileOnly.theme, accent: "#00aa00" } });
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.theme.accent).toBe("#00aa00");
    expect(useEditorStore.getState().versionedFuture).toHaveLength(0);
  });
});
