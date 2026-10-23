import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2, parseSiteDocument, projectV2ToLegacyDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { useEditorStore } from "./store";

function profileFixture() {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Desk", "classic98", "instagram"), { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  const projected = projectV2ToLegacyDocument(migrated.document);
  if (!projected.ok) throw new Error("fixture projection failed");
  return { legacy: projected.document, versioned: migrated.document };
}

function withProfileAccent(document: SiteDocumentV2Input, accent: string): SiteDocumentV2Input {
  const next = structuredClone(document);
  const profile = next.entities.profiles[0];
  if (!profile) throw new Error("fixture profile missing");
  profile.themeOverride = { accent, background: "#ffffff" };
  return next;
}

describe("editor canonical history", () => {
  it("keeps theme previews outside draft history until Apply and clears them on site change", () => {
    const { legacy, versioned } = profileFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    const preview = { ...legacy.theme, wall: "#112233" };
    store.setThemePreview(preview);
    expect(useEditorStore.getState().document).toBe(legacy);
    expect(useEditorStore.getState().versionedDocument).toBe(versioned);
    expect(useEditorStore.getState().saveStatus).toBe("saved");
    expect(useEditorStore.getState().past).toHaveLength(0);
    store.undo();
    expect(useEditorStore.getState().themePreview).toBeNull();
    expect(useEditorStore.getState().document).toBe(legacy);
    store.setThemePreview(preview);
    store.setTheme(preview);
    expect(useEditorStore.getState().themePreview).toBeNull();
    expect(useEditorStore.getState().document?.theme).toEqual(preview);
    expect(useEditorStore.getState().past).toHaveLength(1);
    store.undo();
    expect(useEditorStore.getState().document).toEqual(legacy);
    store.redo();
    expect(useEditorStore.getState().document?.theme).toEqual(preview);
    store.setThemePreview(legacy.theme);
    store.setSite("site-b", "bob", legacy, 1, null, null, "owner");
    expect(useEditorStore.getState().themePreview).toBeNull();
  });
  it("applies a theme as one undo step while retaining window appearance and OC content", () => {
    const { legacy, versioned } = profileFixture();
    const appearance = { titleFrom: "#ffffff", titleTo: "#001144", titleGradient: false };
    legacy.windows[0].appearance = appearance;
    versioned.windows[0].appearance = appearance;
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    store.setTheme({ ...legacy.theme, titleFrom: "#445566", titleTo: "#556677" });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().versionedDocument?.windows[0].appearance).toEqual(appearance);
    expect(useEditorStore.getState().versionedDocument?.entities).toEqual(versioned.entities);
    expect(useEditorStore.getState().document?.theme.accent).toBe(legacy.theme.accent);
    store.undo();
    expect(useEditorStore.getState().document).toEqual(legacy);
    store.redo();
    expect(useEditorStore.getState().document?.theme.titleFrom).toBe("#445566");
    store.duplicateWindow(legacy.windows[0].id);
    expect(useEditorStore.getState().document?.windows.at(-1)?.appearance).toEqual(appearance);
  });

  it("keeps profile-only and normal edits paired through undo and redo", () => {
    const { legacy, versioned } = profileFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    const profileOnly = withProfileAccent(versioned, "#ff00aa");
    store.replaceDocument(legacy, "profile-theme-mixed", profileOnly);
    store.setSiteName("Normal edit");
    expect(useEditorStore.getState().versionedDocument?.siteName).toBe("Normal edit");
    store.undo();
    expect(useEditorStore.getState().versionedDocument?.entities.profiles[0]?.themeOverride?.accent).toBe("#ff00aa");
    expect(useEditorStore.getState().versionedDocument?.siteName).toBe("Desk");
    store.undo();
    expect(useEditorStore.getState().versionedDocument?.entities.profiles[0]?.themeOverride).toBeUndefined();
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.entities.profiles[0]?.themeOverride?.accent).toBe("#ff00aa");
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.siteName).toBe("Normal edit");
  });

  it("clears canonical redo after a coalesced replacement edit", () => {
    const { legacy, versioned } = profileFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    store.setSiteName("Baseline history");
    const pink = withProfileAccent(useEditorStore.getState().versionedDocument!, "#ff00aa");
    store.replaceDocument(useEditorStore.getState().document!, "profile-theme-coalesce", pink);
    store.undo();
    expect(useEditorStore.getState().versionedFuture).toHaveLength(1);
    const green = withProfileAccent(useEditorStore.getState().versionedDocument!, "#00aa00");
    store.replaceDocument(useEditorStore.getState().document!, "profile-theme-coalesce", green);
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.entities.profiles[0]?.themeOverride?.accent).toBe("#00aa00");
    expect(useEditorStore.getState().versionedFuture).toHaveLength(0);
  });

  it("records and resets the access role with the loaded site", () => {
    const { legacy } = profileFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "editor");
    expect(useEditorStore.getState().accessRole).toBe("editor");
    store.setSite("site-b", "bob", legacy, 2, null, null, "owner");
    expect(useEditorStore.getState().accessRole).toBe("owner");
  });


  it("removes Explorer shortcuts to a deleted window and restores them through undo", () => {
    const source = createStarterDocument("Desk", "classic98", "blank");
    const target = makeWindow("document", source.windows.length);
    target.id = "target-window";
    target.title = "Target.exe";
    const explorer = makeWindow("explorer", source.windows.length + 1);
    explorer.id = "world-explorer";
    if (explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
    explorer.content.shortcuts = [{
      id: "target-shortcut",
      parentId: null,
      label: "Target",
      order: 0,
      visibility: "published",
      target: { siteId: "site-a", id: target.id, kind: "window" }
    }];
    source.windows.push(target, explorer);

    const migrated = migrateSiteDocumentV2(source, { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
    const projected = projectV2ToLegacyDocument(migrated.document);
    if (!projected.ok) throw new Error("fixture projection failed");

    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", projected.document, 1, null, null, "owner");
    store.setVersionedDocument(migrated.document);
    store.deleteWindow(target.id);

    const beforeConfirmation = useEditorStore.getState();
    expect(beforeConfirmation.pendingIntegrity?.impacts.map((item) => item.shortcutId)).toEqual(["target-shortcut"]);
    expect(beforeConfirmation.document?.windows.some((window) => window.id === target.id)).toBe(true);
    expect(beforeConfirmation.past).toHaveLength(0);
    beforeConfirmation.confirmIntegrity();

    const afterDelete = useEditorStore.getState();
    expect(afterDelete.document?.windows.some((window) => window.id === target.id)).toBe(false);
    const legacyExplorer = afterDelete.document?.windows.find((window) => window.id === explorer.id);
    expect(legacyExplorer?.type === "explorer" ? legacyExplorer.content.shortcuts : null).toEqual([]);
    const canonicalExplorer = afterDelete.versionedDocument?.windows.find((window) => window.id === explorer.id);
    expect(canonicalExplorer?.type === "explorer" ? canonicalExplorer.content.shortcuts : null).toEqual([]);
    expect(parseSiteDocument(afterDelete.versionedDocument).ok).toBe(true);

    store.undo();
    const restored = useEditorStore.getState();
    expect(restored.document?.windows.some((window) => window.id === target.id)).toBe(true);
    const restoredExplorer = restored.versionedDocument?.windows.find((window) => window.id === explorer.id);
    expect(restoredExplorer?.type === "explorer" ? restoredExplorer.content.shortcuts.map((shortcut) => shortcut.id) : null).toEqual(["target-shortcut"]);
  });
  it("stores indexing in canonical v2 history without changing the legacy renderer", () => {
    const { legacy, versioned } = profileFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    store.setSeoIndexing(false);
    expect(useEditorStore.getState().versionedDocument?.seo).toEqual({ indexing: false });
    expect(useEditorStore.getState().document).toEqual(legacy);
    expect(useEditorStore.getState().saveStatus).toBe("dirty");
  });
});

describe("explorer shortcut integrity in the editor store", () => {
  function explorerFixture() {
    const legacy = createStarterDocument("Desk", "classic98", "card");
    const explorer = makeWindow("explorer", 1);
    if (explorer.type !== "explorer") throw new Error("fixture");
    explorer.id = "ex";
    explorer.content = {
      folders: [{ id: "f", parentId: null, name: "資料", order: 0, visibility: "published" }],
      shortcuts: [
        { id: "to-doc", parentId: "f", label: "文件", order: 0, visibility: "published", target: { siteId: "site-a", id: legacy.windows[0].id, kind: "window" } },
        { id: "to-self", parentId: null, label: "自己", order: 1, visibility: "published", target: { siteId: "site-a", id: "ex", kind: "window" } }
      ]
    };
    legacy.windows.push(explorer);
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
    const projected = projectV2ToLegacyDocument(migrated.document);
    if (!projected.ok) throw new Error("projection failed");
    return { legacy: projected.document, versioned: migrated.document, docId: legacy.windows[0].id };
  }
  const shortcutIds = () => {
    const world = useEditorStore.getState().document?.windows.find((window) => window.id === "ex");
    return world?.type === "explorer" ? world.content.shortcuts.map((shortcut) => shortcut.id) : [];
  };

  it("holds a delete that would orphan shortcuts until confirmed, then removes target and shortcuts in one undo step", () => {
    const { legacy, versioned, docId } = explorerFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    store.deleteWindow(docId);
    let state = useEditorStore.getState();
    expect(state.pendingIntegrity?.impacts.map((item) => item.shortcutId)).toEqual(["to-doc"]);
    expect(state.document?.windows.some((window) => window.id === docId)).toBe(true); // nothing applied yet
    expect(state.past).toHaveLength(0);
    state.cancelIntegrity();
    state = useEditorStore.getState();
    expect(state.pendingIntegrity).toBeNull();
    expect(state.document?.windows.some((window) => window.id === docId)).toBe(true);
    expect(shortcutIds()).toEqual(["to-doc", "to-self"]);

    state.deleteWindow(docId);
    useEditorStore.getState().confirmIntegrity();
    state = useEditorStore.getState();
    expect(state.pendingIntegrity).toBeNull();
    expect(state.document?.windows.some((window) => window.id === docId)).toBe(false);
    expect(shortcutIds()).toEqual(["to-self"]);
    expect(state.past).toHaveLength(1);
    expect(parseSiteDocument(state.versionedDocument).ok).toBe(true);

    state.undo();
    expect(useEditorStore.getState().document?.windows.some((window) => window.id === docId)).toBe(true);
    expect(shortcutIds()).toEqual(["to-doc", "to-self"]);
    expect(parseSiteDocument(useEditorStore.getState().versionedDocument).ok).toBe(true);
  });

  it("deletes immediately when no shortcut points at the window", () => {
    const { legacy, versioned } = explorerFixture();
    const extra = makeWindow("document", 2);
    extra.id = "free";
    legacy.windows.push(extra);
    versioned.windows.push(extra as never);
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null, "owner");
    store.setVersionedDocument(versioned);
    store.deleteWindow("free");
    expect(useEditorStore.getState().pendingIntegrity).toBeNull();
    expect(useEditorStore.getState().document?.windows.some((window) => window.id === "free")).toBe(false);
  });
});


describe("mobile handoff atomic reorder",()=>{
 it("commits all IDs once, rejects incomplete/stale orders and preserves canonical entities through Undo",()=>{
  const {legacy,versioned}=profileFixture();const second=makeWindow("links");second.id="second";second.layout.mobile.order=1;legacy.windows.push(second);versioned.windows.push(structuredClone(second));
  const store=useEditorStore.getState();store.setSite("site-a","alice",legacy,1,null,null,"owner");store.setVersionedDocument(versioned);
  const before=useEditorStore.getState();const ids=legacy.windows.map(window=>window.id);
  store.reorderMobileIds(["missing",ids[0]]);store.reorderMobileIds([ids[0]]);store.reorderMobileIds([ids[0],ids[0]]);
  expect(useEditorStore.getState().versionedDocument).toBe(before.versionedDocument);expect(useEditorStore.getState().past).toHaveLength(0);
  store.reorderMobileIds([...ids].reverse());const after=useEditorStore.getState();expect(after.past).toHaveLength(1);expect(after.versionedDocument?.entities).toEqual(versioned.entities);expect(after.document?.windows.find(window=>window.id==="second")?.layout.mobile.order).toBe(0);
  store.undo();expect(useEditorStore.getState().versionedDocument).toEqual(before.versionedDocument);store.redo();expect(useEditorStore.getState().versionedDocument).toEqual(after.versionedDocument);
 });
});
