import { create } from "zustand";
import { i18n } from "../../i18n";
import { danglingExplorerShortcuts, describeShortcutTargetParts, mergeLegacyDocumentIntoV2, newlyDanglingShortcuts, projectPublicSiteDocument, removeExplorerShortcuts, type DanglingShortcut, type DesktopWindow, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { createWindow } from "../modules/registry";
import { canCreateWindowType } from "../../lib/imageWindowCreation";
import type { SiteAccessRole } from "../../lib/collaboration";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type EditorState = {
  siteId: string | null;
  accessRole: SiteAccessRole;
  username: string;
  document: SiteDocument | null;
  versionedDocument: SiteDocumentV2Input | null;
  versionedPast: SiteDocumentV2Input[];
  versionedFuture: SiteDocumentV2Input[];
  lastSavedDocument: SiteDocument | null;
  publishedDocument: SiteDocument | null;
  /** The published document as stored (any version), or what publishing just wrote; null when never published. */
  publishedRaw: unknown | null;
  publishedVersion: number | null;
  version: number;
  selectedId: string | null;
  device: "desktop" | "mobile";
  saveStatus: SaveStatus;
  past: SiteDocument[];
  future: SiteDocument[];
  setSite: (
    siteId: string,
    username: string,
    document: SiteDocument,
    version: number,
    publishedDocument: SiteDocument | null,
    publishedVersion: number | null,
    accessRole: SiteAccessRole
  ) => void;
  setSaveStatus: (status: SaveStatus) => void;
  markSaved: (version: number, savedDocument: SiteDocument) => void;
  setVersionedDocument: (document: SiteDocumentV2Input | null) => void;
  setPublishedRaw: (document: unknown | null) => void;
  /** Replace the legacy render projection and canonical v2 snapshot atomically. */
  replaceDocument: (document: SiteDocument, historyKey?: string, versionedDocument?: SiteDocumentV2Input) => void;
  retrySave: () => void;
  markPublished: (publishedVersion: number) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  focusWindow: (id: string) => void;
  setDevice: (device: "desktop" | "mobile") => void;
  reorderMobile: (id: string, direction: -1 | 1) => void;
  setMobileColumns: (columns: 3 | 4) => void;
  setSiteName: (name: string) => void;
  setSeoIndexing: (indexing: boolean) => void;
  setTheme: (theme: SiteDocument["theme"]) => void;
  addWindow: (type: DesktopWindow["type"]) => void;
  /** `historyKey`: edits with the same key within 1200ms collapse into one undo step. */
  updateWindow: (id: string, recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
  deleteWindow: (id: string) => void;
  /** An edit that would orphan Explorer shortcuts waits here for the author's confirmation. */
  pendingIntegrity: PendingIntegrity | null;
  confirmIntegrity: () => void;
  cancelIntegrity: () => void;
  duplicateWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
  /** View-only window state in the editor canvas (never saved). */
  viewState: Record<string, "min" | "closed" | "max">;
  setViewState: (id: string, state: "min" | "closed" | "max" | null) => void;
  layoutMode: boolean;
  snap: boolean;
  setLayoutMode: (on: boolean) => void;
  toggleSnap: () => void;
  moveIcon: (id: string, x: number, y: number) => void;
  autoArrangeIcons: (rows: number) => void;
};

const sameDocument = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Coalesces rapid edits (typing) into one undo step.
let lastHistoryKey: string | null = null;
let lastHistoryAt = 0;

export type PendingIntegrity = {
  impacts: Array<DanglingShortcut & { target: { kind: DanglingShortcut["targetKind"]; name: string | null } }>;
  document: SiteDocument;
  extra: Partial<EditorState>;
  historyKey?: string;
  explicitVersioned?: SiteDocumentV2Input;
};

/**
 * `guard`: an edit that leaves an Explorer shortcut without its target is not applied. It is parked in
 * `pendingIntegrity` so the author sees the affected shortcuts first; confirming applies the edit together with
 * removal of exactly those shortcuts in one history step.
 */
function withHistory(state: EditorState, document: SiteDocument, extra: Partial<EditorState> = {}, historyKey?: string, explicitVersioned?: SiteDocumentV2Input, guard = true): Partial<EditorState> {
  let nextVersioned = explicitVersioned ?? (state.versionedDocument && state.siteId
    ? mergeLegacyDocumentIntoV2(state.versionedDocument, document, { siteId: state.siteId })
    : undefined);
  if (guard) {
    const before = state.versionedDocument ?? state.document;
    const after = nextVersioned ?? document;
    const impacts = before ? newlyDanglingShortcuts(before, after) : [];
    if (impacts.length) {
      return { pendingIntegrity: { impacts: impacts.map((item) => ({ ...item, target: describeShortcutTargetParts(before!, item) })), document, extra, historyKey, explicitVersioned } };
    }
  } else {
    // Confirmed edit: also sweep any other broken shortcut so the draft is always savable.
    document = removeExplorerShortcuts(document, danglingExplorerShortcuts(nextVersioned ?? document));
    if (nextVersioned) nextVersioned = removeExplorerShortcuts(nextVersioned, danglingExplorerShortcuts(nextVersioned));
  }
  const legacyChanged = !!state.document && !sameDocument(state.document, document);
  const versionedChanged = !!nextVersioned && !sameDocument(state.versionedDocument, nextVersioned);
  if (!legacyChanged && !versionedChanged) return extra;
  const now = Date.now();
  const merge = !!historyKey && historyKey === lastHistoryKey && now - lastHistoryAt < 1200 && state.past.length > 0;
  lastHistoryKey = historyKey ?? null;
  lastHistoryAt = now;
  if (merge) return { ...extra, document, versionedDocument: nextVersioned ?? state.versionedDocument, future: [], versionedFuture: [], saveStatus: "dirty" as SaveStatus };
  return {
    ...extra,
    document,
    versionedDocument: nextVersioned ?? state.versionedDocument,
    versionedPast: nextVersioned && state.versionedDocument ? [...state.versionedPast, state.versionedDocument].slice(-50) : state.versionedPast,
    versionedFuture: nextVersioned ? [] : state.versionedFuture,
    past: state.document ? [...state.past, state.document].slice(-50) : state.past,
    future: [],
    saveStatus: "dirty" as SaveStatus
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  siteId: null,
  accessRole: "owner",
  username: "",
  document: null,
  versionedDocument: null,
  versionedPast: [],
  versionedFuture: [],
  lastSavedDocument: null,
  publishedDocument: null,
  publishedRaw: null,
  publishedVersion: null,
  version: 0,
  selectedId: null,
  device: "desktop",
  saveStatus: "idle",
  past: [],
  future: [],

  setSite: (siteId, username, document, version, publishedDocument, publishedVersion, accessRole) => set({
    siteId,
    accessRole,
    username,
    document,
    versionedDocument: null,
    versionedPast: [],
    versionedFuture: [],
    lastSavedDocument: document,
    publishedDocument,
    publishedVersion,
    version,
    selectedId: document.windows[0]?.id ?? null,
    saveStatus: "saved",
    past: [],
    future: [],
    pendingIntegrity: null,
    viewState: {}
  }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  markSaved: (version, savedDocument) => set((state) => ({
    version,
    lastSavedDocument: savedDocument,
    saveStatus: sameDocument(state.document, savedDocument) ? "saved" : "dirty"
  })),
  setVersionedDocument: (versionedDocument) => set({ versionedDocument, versionedPast: [], versionedFuture: [] }),
  setPublishedRaw: (publishedRaw) => set({ publishedRaw }),
  replaceDocument: (document, historyKey, versionedDocument) => set((state) => withHistory(state, document, {}, historyKey, versionedDocument)),
  retrySave: () => set((state) => state.document ? { saveStatus: "dirty" } : {}),
  markPublished: (publishedVersion) => set((state) => ({
    publishedVersion,
    publishedDocument: state.document,
    // What the API stores is the draft's public projection (private content removed); asset URLs are written server-side
    // and are mapped back to references when compared, so the local projection is the right baseline here.
    publishedRaw: (() => { if (!state.versionedDocument || !state.siteId) return null; const projected = projectPublicSiteDocument(state.versionedDocument, state.siteId); return projected.ok ? projected.document : null; })(),
  })),
  undo: () => set((state) => {
    if ((!state.document || state.past.length === 0) && state.versionedPast.length === 0) return {};
    const previous = state.past[state.past.length - 1] ?? state.document!;
    const future = state.document ? [state.document, ...state.future].slice(0, 50) : state.future;
    const selectedId = previous.windows.some((window) => window.id === state.selectedId)
      ? state.selectedId
      : previous.windows[0]?.id ?? null;
    const previousVersioned = state.versionedPast[state.versionedPast.length - 1];
    return {
      document: previous,
      versionedDocument: previousVersioned ?? state.versionedDocument,
      past: state.past.length ? state.past.slice(0, -1) : state.past,
      future,
      versionedPast: previousVersioned ? state.versionedPast.slice(0, -1) : state.versionedPast,
      versionedFuture: previousVersioned && state.versionedDocument ? [state.versionedDocument, ...state.versionedFuture].slice(0, 50) : state.versionedFuture,
      selectedId,
      saveStatus: "dirty"
    };
  }),
  redo: () => set((state) => {
    if ((!state.document || state.future.length === 0) && state.versionedFuture.length === 0) return {};
    const next = state.future[0] ?? state.document!;
    const selectedId = next.windows.some((window) => window.id === state.selectedId)
      ? state.selectedId
      : next.windows[0]?.id ?? null;
    const nextVersioned = state.versionedFuture[0];
    return {
      document: next,
      versionedDocument: nextVersioned ?? state.versionedDocument,
      past: state.document ? [...state.past, state.document].slice(-50) : state.past,
      future: state.future.length ? state.future.slice(1) : state.future,
      versionedPast: nextVersioned && state.versionedDocument ? [...state.versionedPast, state.versionedDocument].slice(-50) : state.versionedPast,
      versionedFuture: nextVersioned ? state.versionedFuture.slice(1) : state.versionedFuture,
      selectedId,
      saveStatus: "dirty"
    };
  }),
  select: (selectedId) => set({ selectedId }),
  focusWindow: (id) => set((state) => {
    if (!state.document) return { selectedId: id };
    const windows = state.document.windows;
    const target = windows.find((window) => window.id === id);
    if (!target) return { selectedId: id };

    const maxZ = Math.max(0, ...windows.map((window) => window.layout.desktop.z));
    if (target.layout.desktop.z === maxZ) return { selectedId: id };

    if (maxZ < 9999) {
      const document = {
        ...state.document,
        windows: windows.map((window) => window.id === id
          ? { ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, z: maxZ + 1 } } }
          : window)
      };
      return withHistory(state, document, { selectedId: id });
    }

    const ordered = [...windows].sort((a, b) => a.layout.desktop.z - b.layout.desktop.z);
    const normalized = ordered.map((window, index) => ({
      ...window,
      layout: { ...window.layout, desktop: { ...window.layout.desktop, z: index + 1 } }
    }));
    const nextMax = normalized.length;
    const document = {
      ...state.document,
      windows: normalized.map((window) => window.id === id
        ? { ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, z: nextMax + 1 } } }
        : window)
    };
    return withHistory(state, document, { selectedId: id });
  }),
  setDevice: (device) => set({ device }),
  reorderMobile: (id, direction) => set((state) => {
    if (!state.document) return {};
    const ordered = [...state.document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order);
    const index = ordered.findIndex((window) => window.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return {};
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    const orderMap = new Map(ordered.map((window, order) => [window.id, order]));
    const document = {
      ...state.document,
      windows: state.document.windows.map((window) => ({
        ...window,
        layout: { ...window.layout, mobile: { order: orderMap.get(window.id) ?? window.layout.mobile.order } }
      }))
    };
    return withHistory(state, document, { selectedId: id });
  }),
  setMobileColumns: (columns) => set((state) => state.document
    ? withHistory(state, { ...state.document, mobileColumns: columns })
    : {}),
  setSiteName: (siteName) => set((state) => state.document
    ? withHistory(state, { ...state.document, siteName })
    : {}),
  setSeoIndexing: (indexing) => set((state) => state.document && state.versionedDocument
    ? withHistory(state, state.document, {}, undefined, { ...state.versionedDocument, seo: { indexing } })
    : {}),
  setTheme: (theme) => set((state) => state.document
    ? withHistory(state, { ...state.document, theme })
    : {}),
  addWindow: (type) => set((state) => {
    if (!state.document || !canCreateWindowType(type)) return {};
    const window = createWindow(type, state.document.windows.length);
    return withHistory(
      state,
      { ...state.document, windows: [...state.document.windows, window] },
      { selectedId: window.id }
    );
  }),
  updateWindow: (id, recipe, historyKey) => set((state) => {
    if (!state.document) return {};
    const document = {
      ...state.document,
      windows: state.document.windows.map((window) => {
        if (window.id !== id) return window;
        const next = recipe(window);
        if ((window.type === "image" || next.type === "image") && !canCreateWindowType("image") && (window.type !== next.type || !sameDocument(window.content, next.content))) return window;
        return next;
      })
    };
    if (sameDocument(document, state.document)) return {};
    return withHistory(state, document, {}, historyKey);
  }),
  duplicateWindow: (id) => set((state) => {
    if (!state.document) return {};
    const source = state.document.windows.find((window) => window.id === id);
    if (!source || !canCreateWindowType(source.type)) return {};
    const copyId = crypto.randomUUID();
    const maxZ = Math.max(0, ...state.document.windows.map((window) => window.layout.desktop.z));
    const copy = JSON.parse(JSON.stringify(source)) as DesktopWindow;
    copy.id = copyId;
    copy.title = source.title + i18n.t("editor:store.copySuffix");
    copy.layout = {
      desktop: { ...source.layout.desktop, x: source.layout.desktop.x + 28, y: source.layout.desktop.y + 28, z: Math.min(9999, maxZ + 1), iconX: source.layout.desktop.iconX + 16, iconY: source.layout.desktop.iconY + 16 },
      mobile: { order: state.document.windows.length }
    };
    return withHistory(state, { ...state.document, windows: [...state.document.windows, copy] }, { selectedId: copyId });
  }),
  bringToFront: (id) => set((state) => {
    if (!state.document) return {};
    const maxZ = Math.max(0, ...state.document.windows.map((window) => window.layout.desktop.z));
    const document = {
      ...state.document,
      windows: state.document.windows.map((window) => window.id === id
        ? { ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, z: Math.min(9999, maxZ + 1) } } }
        : window)
    };
    return withHistory(state, document, { selectedId: id });
  }),
  moveLayer: (id, direction) => set((state) => {
    if (!state.document) return {};
    // Order by z, swap with the neighbour, then renumber 1..n so z stays dense.
    const ordered = [...state.document.windows].sort((a, b) => a.layout.desktop.z - b.layout.desktop.z);
    const index = ordered.findIndex((window) => window.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ordered.length) return {};
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    const zById = new Map(ordered.map((window, order) => [window.id, order + 1]));
    const document = {
      ...state.document,
      windows: state.document.windows.map((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, z: zById.get(window.id) ?? window.layout.desktop.z } } }))
    };
    return withHistory(state, document);
  }),
  viewState: {},
  setViewState: (id, next) => set((state) => {
    const viewState = { ...state.viewState };
    if (next) viewState[id] = next; else delete viewState[id];
    return { viewState };
  }),
  layoutMode: false,
  snap: true,
  setLayoutMode: (layoutMode) => set((state) => layoutMode ? { layoutMode, device: "desktop" as const } : { layoutMode }),
  toggleSnap: () => set((state) => ({ snap: !state.snap })),
  moveIcon: (id, x, y) => set((state) => {
    if (!state.document) return {};
    const document = {
      ...state.document,
      windows: state.document.windows.map((window) => window.id === id
        ? { ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, iconX: x, iconY: y } } }
        : window)
    };
    return withHistory(state, document);
  }),
  autoArrangeIcons: (rows) => set((state) => {
    if (!state.document) return {};
    const perColumn = Math.max(1, rows);
    const document = {
      ...state.document,
      windows: state.document.windows.map((window, index) => ({
        ...window,
        layout: { ...window.layout, desktop: { ...window.layout.desktop, iconX: 8 + Math.floor(index / perColumn) * 86, iconY: 10 + (index % perColumn) * 94 } }
      }))
    };
    return withHistory(state, document);
  }),
  pendingIntegrity: null,
  cancelIntegrity: () => set({ pendingIntegrity: null }),
  confirmIntegrity: () => set((state) => {
    const pending = state.pendingIntegrity;
    if (!pending) return {};
    const drop = pending.impacts;
    const legacy = removeExplorerShortcuts(pending.document, drop);
    const versioned = pending.explicitVersioned ? removeExplorerShortcuts(pending.explicitVersioned, drop) : undefined;
    return { ...withHistory(state, legacy, pending.extra, pending.historyKey, versioned, false), pendingIntegrity: null };
  }),
  deleteWindow: (id) => set((state) => {
    if (!state.document) return {};
    const windows = state.document.windows
      .filter((window) => window.id !== id)
      // Leave references intact until withHistory can show the affected shortcuts.
      // confirmIntegrity removes the target and those references in one undo step.
      .map((window, index) => ({ ...window, layout: { ...window.layout, mobile: { order: index } } }));
    return withHistory(
      state,
      { ...state.document, windows },
      { selectedId: windows[0]?.id ?? null }
    );
  })
}));
