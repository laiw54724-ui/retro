import { describe, expect, it } from "vitest";
import {
  createStarterDocument,
  migrateSiteDocumentV2,
  projectV2ToLegacyDocument,
  resolveWindowChrome,
  type DesktopWindow,
  type WindowChromeConfig
} from "@retrodesk/shared";
import { useEditorStore } from "./store";

function loadFixture() {
  const source = createStarterDocument("Chrome history", "classic98", "instagram");
  source.windows[0].appearance = { titleFrom: "#ffffff", titleTo: "#001144", titleGradient: false };
  source.windows[0].layout.desktop = { x: 80, y: 40, w: 420, h: 560, z: 3, iconX: 16, iconY: 18 };
  const migrated = migrateSiteDocumentV2(source, { siteId: "site-chrome" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Chrome history fixture migration failed");
  const projected = projectV2ToLegacyDocument(migrated.document);
  if (!projected.ok) throw new Error("Chrome history fixture projection failed");
  const store = useEditorStore.getState();
  store.setSite("site-chrome", "chrome", projected.document, 1, null, null, "owner");
  store.setVersionedDocument(migrated.document);
  return { store, legacy: projected.document, versioned: migrated.document, id: projected.document.windows[0].id };
}

function retainedFields(window: DesktopWindow) {
  return { content: window.content, appearance: window.appearance, layout: window.layout, title: window.title, icon: window.icon, defaultOpen: window.defaultOpen };
}

// This is the single updateWindow transaction used by both desktop and mobile
// WindowChromeEditor Apply callbacks. Preview edits stay component-local.
function applyChrome(id: string, chrome: WindowChromeConfig | undefined) {
  useEditorStore.getState().updateWindow(id, (window) => ({ ...window, chrome }));
}

describe("window chrome editor history", () => {
  it("applies all chrome fields in one undo step and resets only chrome across canonical v2 history", () => {
    const { store, legacy, versioned, id } = loadFixture();
    const original = structuredClone(retainedFields(legacy.windows[0]));
    const chrome = resolveWindowChrome({ preset: "compact-98", controls: ["close"], showIcon: false, density: "compact", sections: { statusBar: true, toolbar: false } });
    applyChrome(id, chrome);
    let state = useEditorStore.getState();
    expect(state.past).toHaveLength(1);
    expect(state.versionedPast).toHaveLength(1);
    expect(state.saveStatus).toBe("dirty");
    expect(state.document?.windows[0].chrome).toEqual(chrome);
    expect(state.versionedDocument?.windows[0].chrome).toEqual(chrome);
    expect(retainedFields(state.document!.windows[0])).toEqual(original);
    expect(state.versionedDocument?.entities).toEqual(versioned.entities);

    store.undo();
    expect(useEditorStore.getState().document).toEqual(legacy);
    expect(useEditorStore.getState().versionedDocument).toEqual(versioned);
    expect(useEditorStore.getState().past).toHaveLength(0);
    store.redo();
    expect(useEditorStore.getState().document?.windows[0].chrome).toEqual(chrome);
    expect(useEditorStore.getState().versionedDocument?.windows[0].chrome).toEqual(chrome);
    expect(retainedFields(useEditorStore.getState().document!.windows[0])).toEqual(original);

    applyChrome(id, undefined);
    state = useEditorStore.getState();
    expect(state.past).toHaveLength(2);
    expect(state.versionedPast).toHaveLength(2);
    expect(state.document?.windows[0].chrome).toBeUndefined();
    expect(state.versionedDocument?.windows[0].chrome).toBeUndefined();
    expect(retainedFields(state.document!.windows[0])).toEqual(original);
    expect(state.versionedDocument?.entities).toEqual(versioned.entities);
    store.undo();
    expect(useEditorStore.getState().versionedDocument?.windows[0].chrome).toEqual(chrome);
    store.redo();
    expect(useEditorStore.getState().versionedDocument?.windows[0].chrome).toBeUndefined();
    expect(retainedFields(useEditorStore.getState().document!.windows[0])).toEqual(original);
  });

  it("duplicates configured windows independently while retaining content, appearance and dimensions", () => {
    const { store, id } = loadFixture();
    const chrome = resolveWindowChrome({ preset: "classic-95", controls: ["minimize", "close"], sections: { statusBar: true } });
    applyChrome(id, chrome);
    const beforeDuplicate = structuredClone(useEditorStore.getState().document!);
    const original = beforeDuplicate.windows[0];
    store.duplicateWindow(id);
    const state = useEditorStore.getState();
    const copy = state.document!.windows.at(-1)!;
    const canonicalCopy = state.versionedDocument!.windows.find((window) => window.id === copy.id)!;
    expect(copy.id).not.toBe(id);
    expect(copy.content).toEqual(original.content);
    expect(copy.appearance).toEqual(original.appearance);
    expect(copy.chrome).toEqual(chrome);
    expect(canonicalCopy.chrome).toEqual(chrome);
    expect(copy.chrome).not.toBe(state.document!.windows[0].chrome);
    expect(copy.layout.desktop).toMatchObject({ x: original.layout.desktop.x + 28, y: original.layout.desktop.y + 28, w: original.layout.desktop.w, h: original.layout.desktop.h });
    expect(copy.layout.mobile.order).toBe(beforeDuplicate.windows.length);
    expect(state.document!.windows[0]).toEqual(original);

    applyChrome(copy.id, undefined);
    expect(useEditorStore.getState().document!.windows[0].chrome).toEqual(chrome);
    expect(useEditorStore.getState().versionedDocument!.windows.find((window) => window.id === copy.id)?.chrome).toBeUndefined();
    store.undo();
    expect(useEditorStore.getState().document!.windows.at(-1)?.chrome).toEqual(chrome);
    store.undo();
    expect(useEditorStore.getState().document).toEqual(beforeDuplicate);
    store.redo();
    expect(useEditorStore.getState().document!.windows.at(-1)).toEqual(copy);
  });
});
