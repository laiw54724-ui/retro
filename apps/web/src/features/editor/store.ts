import { create } from "zustand";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { makeWindow } from "@retrodesk/shared";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type EditorState = {
  siteId: string | null;
  username: string;
  document: SiteDocument | null;
  version: number;
  selectedId: string | null;
  device: "desktop" | "mobile";
  saveStatus: SaveStatus;
  setSite: (siteId: string, username: string, document: SiteDocument, version: number) => void;
  setVersion: (version: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  select: (id: string | null) => void;
  focusWindow: (id: string) => void;
  setDevice: (device: "desktop" | "mobile") => void;
  setSiteName: (name: string) => void;
  setTheme: (theme: SiteDocument["theme"]) => void;
  addWindow: (type: DesktopWindow["type"]) => void;
  updateWindow: (id: string, recipe: (window: DesktopWindow) => DesktopWindow) => void;
  deleteWindow: (id: string) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  siteId: null,
  username: "",
  document: null,
  version: 0,
  selectedId: null,
  device: "desktop",
  saveStatus: "idle",

  setSite: (siteId, username, document, version) => set({
    siteId,
    username,
    document,
    version,
    selectedId: document.windows[0]?.id ?? null,
    saveStatus: "saved"
  }),
  setVersion: (version) => set({ version }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  select: (selectedId) => set({ selectedId }),
  focusWindow: (id) => set((state) => {
    if (!state.document) return { selectedId: id };
    const windows = state.document.windows;
    const target = windows.find((window) => window.id === id);
    if (!target) return { selectedId: id };

    const maxZ = Math.max(0, ...windows.map((window) => window.layout.desktop.z));
    if (target.layout.desktop.z === maxZ) return { selectedId: id };

    if (maxZ < 9999) {
      return {
        selectedId: id,
        document: {
          ...state.document,
          windows: windows.map((window) => window.id === id
            ? { ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, z: maxZ + 1 } } }
            : window)
        },
        saveStatus: "dirty"
      };
    }

    const ordered = [...windows].sort((a, b) => a.layout.desktop.z - b.layout.desktop.z);
    const normalized = ordered.map((window, index) => ({
      ...window,
      layout: { ...window.layout, desktop: { ...window.layout.desktop, z: index + 1 } }
    }));
    const nextMax = normalized.length;
    return {
      selectedId: id,
      document: {
        ...state.document,
        windows: normalized.map((window) => window.id === id
          ? { ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, z: nextMax + 1 } } }
          : window)
      },
      saveStatus: "dirty"
    };
  }),
  setDevice: (device) => set({ device }),
  setSiteName: (siteName) => set((state) => state.document ? {
    document: { ...state.document, siteName },
    saveStatus: "dirty"
  } : {}),
  setTheme: (theme) => set((state) => state.document ? {
    document: { ...state.document, theme },
    saveStatus: "dirty"
  } : {}),
  addWindow: (type) => set((state) => {
    if (!state.document) return {};
    const window = makeWindow(type, state.document.windows.length);
    return {
      document: { ...state.document, windows: [...state.document.windows, window] },
      selectedId: window.id,
      saveStatus: "dirty"
    };
  }),
  updateWindow: (id, recipe) => set((state) => state.document ? {
    document: {
      ...state.document,
      windows: state.document.windows.map((window) => window.id === id ? recipe(window) : window)
    },
    saveStatus: "dirty"
  } : {}),
  deleteWindow: (id) => set((state) => {
    if (!state.document) return {};
    const windows = state.document.windows
      .filter((window) => window.id !== id)
      .map((window, index) => ({ ...window, layout: { ...window.layout, mobile: { order: index } } }));
    return {
      document: { ...state.document, windows },
      selectedId: windows[0]?.id ?? null,
      saveStatus: "dirty"
    };
  })
}));
