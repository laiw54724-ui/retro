import { describe, expect, it } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { patchAppearance, resetTitleAppearance } from "./appearanceDraft";
import { useEditorStore } from "./store";

describe("P2 appearance draft transactions", () => {
  const appearance = { titleFrom: "#112233", titleTo: "#223344", titleGradient: false, titleText: "#ffeecc", frameColor: "#554433", contentBackground: "#eeddcc", contentText: "#221133", desktopLabelText: "#ffffff", desktopLabelBackground: "#000000" };
  it("resets one field without defaults or losing unrelated overrides", () => {
    const partial = patchAppearance(undefined, "contentText", "#112233");
    expect(partial).toEqual({ contentText: "#112233" });
    expect(patchAppearance(partial, "contentText", undefined)).toBeUndefined();
    expect(patchAppearance(appearance, "contentText", undefined)).toEqual({ ...appearance, contentText: undefined });
    expect(resetTitleAppearance(appearance)).toEqual({ frameColor: "#554433", contentBackground: "#eeddcc", contentText: "#221133", desktopLabelText: "#ffffff", desktopLabelBackground: "#000000" });
    expect(appearance.contentText).toBe("#221133");
  });
  it("applies all window draft fields as exactly one undo transaction, with canonical redo and duplication", () => {
    const legacy = structuredClone(createStarterDocument("Colors", "classic98", "card"));
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("migration");
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(migrated.document);
    const draft = patchAppearance(appearance, "contentText", "#224466");
    expect(useEditorStore.getState().past).toHaveLength(0);
    store.updateWindow(legacy.windows[0].id, (window) => ({ ...window, appearance: draft }));
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().versionedDocument?.windows[0].appearance).toEqual(draft);
    expect(useEditorStore.getState().versionedDocument?.windows[1].appearance).toBeUndefined();
    store.undo();
    expect(useEditorStore.getState().versionedDocument?.windows[0].appearance).toBeUndefined();
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.windows[0].appearance).toEqual(draft);
    store.duplicateWindow(legacy.windows[0].id);
    expect(useEditorStore.getState().versionedDocument?.windows.at(-1)?.appearance).toEqual(draft);
  });
  it("applies site colors once, preserves window overrides across a preset, and undoes every optional field", () => {
    const legacy = structuredClone(createStarterDocument("Colors", "classic98", "card"));
    legacy.windows[0].appearance = appearance;
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("migration");
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(migrated.document);
    store.setTheme({ ...legacy.theme, appearance: { contentText: "#556677", desktopLabelText: "#ffffff" } });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().versionedDocument?.windows[0].appearance).toEqual(appearance);
    store.undo();
    expect(useEditorStore.getState().versionedDocument?.theme.appearance).toBeUndefined();
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.theme.appearance).toEqual({ contentText: "#556677", desktopLabelText: "#ffffff" });
  });
});
