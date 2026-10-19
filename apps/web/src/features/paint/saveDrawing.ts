import { isAssetReference, makeGalleryImage, SiteDocumentSchema } from "@retrodesk/shared";
import { api } from "../../lib/api";
import { useEditorStore } from "../editor/store";
import { createWindow } from "../modules/registry";
import type { PaintSaveRequest } from "./PaintWorkspace";

type Options = {
  siteId: string;
  captureSession: () => () => boolean;
  blocked: () => boolean;
  upload?: typeof api.uploadAsset;
};

/** One dialog/engine owns this receipt cache. Assets and original pictures are never overwritten. */
export function createPaintSaveSession({ siteId, captureSession, blocked, upload = api.uploadAsset }: Options) {
  let receipt: { revision: number; asset: string } | null = null;
  return async (request: PaintSaveRequest, name: string) => {
    const sessionCurrent = captureSession();
    const current = () => {
      const state = useEditorStore.getState();
      return sessionCurrent() && request.isCurrent() && !blocked() && state.siteId === siteId &&
        state.accessRole !== "viewer" && !!state.document;
    };
    const ensureCurrent = () => { if (!current()) throw new Error("Paint editor target changed"); };
    const ensureRoom = () => { if (useEditorStore.getState().document!.windows.length >= 100) throw new Error("Window limit"); };
    ensureCurrent(); ensureRoom();
    const title = name.trim().slice(0, 120) || "Paint";
    if (!receipt || receipt.revision !== request.revision) {
      const file = new File([request.blob], `${title}-${request.width}x${request.height}.png`, { type: "image/png" });
      const { asset } = await upload(siteId, file, { kind: "image", name: title });
      ensureCurrent();
      if (!isAssetReference(asset.url)) throw new Error("Expected stable asset reference");
      receipt = { revision: request.revision, asset: asset.url };
    }
    ensureCurrent(); ensureRoom();
    const state = useEditorStore.getState();
    const gallery = createWindow("gallery", state.document!.windows.length);
    gallery.title = title;
    gallery.content.images = [makeGalleryImage({ src: receipt.asset, srcUrl: "", title })];
    const next = { ...state.document!, windows: [...state.document!.windows, gallery] };
    if (!SiteDocumentSchema.safeParse(next).success) throw new Error("Invalid gallery draft");
    state.replaceDocument(next);
    if (!useEditorStore.getState().document?.windows.some((window) => window.id === gallery.id)) throw new Error("Draft insertion was not applied");
    useEditorStore.getState().select(gallery.id);
  };
}
