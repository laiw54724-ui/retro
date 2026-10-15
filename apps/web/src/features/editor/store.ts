import { create } from "zustand";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { makeWindow } from "@retrodesk/shared";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type EditorState = {
  siteId: string | null;
  username: string;
  document: SiteDocument | null;
  lastSavedDocument: SiteDocument | null;
  publishedDocument: SiteDocument | null;
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
    publishedVersion: number | null
  ) => void;
  setSaveStatus: (status: SaveStatus) => void;
  markSaved: (version: number, savedDocument: SiteDocument) => void;
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
  setTheme: (theme: SiteDocument["theme"]) => void;
  addWindow: (type: DesktopWindow["type"]) => void;
  /** `historyKey`: edits with the same key within 1200ms collapse into one undo step. */
  updateWindow: (id: string, recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
  deleteWindow: (id: string) => void;
  duplicateWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
  layoutMode: boolean;
  snap: boolean;
  setLayoutMode: (on: boolean) => void;
  toggleSnap: () => void;
  moveIcon: (id: string, x: number, y: number) => void;
  autoArrangeIcons: (rows: number) => void;
};

const sameDocument = (a: SiteDocument | null, b: SiteDocument | null) => JSON.stringify(a) === JSON.stringify(b);

// Coalesces rapid edits (typing) into one undo step.
let lastHistoryKey: string | null = null;
let lastHistoryAt = 0;

function withHistory(state: EditorState, document: SiteDocument, extra: Partial<EditorState> = {}, historyKey?: string) {
  if (!state.document || sameDocument(state.document, document)) return extra;
  const now = Date.now();
  const merge = !!historyKey && historyKey === lastHistoryKey && now - lastHistoryAt < 1200 && state.past.length > 0;
  lastHistoryKey = historyKey ?? null;
  lastHistoryAt = now;
  if (merge) return { ...extra, document, future: [], saveStatus: "dirty" as SaveStatus };
  return {
    ...extra,
    document,
    past: [...state.past, state.document].slice(-50),
    future: [],
    saveStatus: "dirty" as SaveStatus
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  siteId: null,
  username: "",
  document: null,
  lastSavedDocument: null,
  publishedDocument: null,
  publishedVersion: null,
  version: 0,
  selectedId: null,
  device: "desktop",
  saveStatus: "idle",
  past: [],
  future: [],

  setSite: (siteId, username, document, version, publishedDocument, publishedVersion) => set({
    siteId,
    username,
    document,
    lastSavedDocument: document,
    publishedDocument,
    publishedVersion,
    version,
    selectedId: document.windows[0]?.id ?? null,
    saveStatus: "saved",
    past: [],
    future: []
  }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  markSaved: (version, savedDocument) => set((state) => ({
    version,
    lastSavedDocument: savedDocument,
    saveStatus: sameDocument(state.document, savedDocument) ? "saved" : "dirty"
  })),
  retrySave: () => set((state) => state.document ? { saveStatus: "dirty" } : {}),
  markPublished: (publishedVersion) => set((state) => ({
    publishedVersion,
    publishedDocument: state.document,
  })),
  undo: () => set((state) => {
    if (!state.document || state.past.length === 0) return {};
    const previous = state.past[state.past.length - 1];
    const future = [state.document, ...state.future].slice(0, 50);
    const selectedId = previous.windows.some((window) => window.id === state.selectedId)
      ? state.selectedId
      : previous.windows[0]?.id ?? null;
    return {
      document: previous,
      past: state.past.slice(0, -1),
      future,
      selectedId,
      saveStatus: "dirty"
    };
  }),
  redo: () => set((state) => {
    if (!state.document || state.future.length === 0) return {};
    const next = state.future[0];
    const selectedId = next.windows.some((window) => window.id === state.selectedId)
      ? state.selectedId
      : next.windows[0]?.id ?? null;
    return {
      document: next,
      past: [...state.past, state.document].slice(-50),
      future: state.future.slice(1),
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
  setTheme: (theme) => set((state) => state.document
    ? withHistory(state, { ...state.document, theme })
    : {}),
  addWindow: (type) => set((state) => {
    if (!state.document) return {};
    const window = makeWindow(type, state.document.windows.length);
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
      windows: state.document.windows.map((window) => window.id === id ? recipe(window) : window)
    };
    return withHistory(state, document, {}, historyKey);
  }),
  duplicateWindow: (id) => set((state) => {
    if (!state.document) return {};
    const source = state.document.windows.find((window) => window.id === id);
    if (!source) return {};
    const copyId = crypto.randomUUID();
    const maxZ = Math.max(0, ...state.document.windows.map((window) => window.layout.desktop.z));
    const copy = JSON.parse(JSON.stringify(source)) as DesktopWindow;
    copy.id = copyId;
    copy.title = source.title + " 複本";
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
  deleteWindow: (id) => set((state) => {
    if (!state.document) return {};
    const windows = state.document.windows
      .filter((window) => window.id !== id)
      .map((window, index) => ({ ...window, layout: { ...window.layout, mobile: { order: index } } }));
    return withHistory(
      state,
      { ...state.document, windows },
      { selectedId: windows[0]?.id ?? null }
    );
  })
}));
