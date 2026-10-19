import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { useEditorStore } from "./store";
import { creatableModuleDefinitions, registry } from "../modules/registry";
import { IMAGE_WINDOW_CREATION_ENABLED } from "../../lib/imageWindowCreation";

describe("reader-first image creation stays disabled", () => {
  it("registers a read-only reader but excludes image from shared desktop/mobile Add definitions", () => {
    expect(IMAGE_WINDOW_CREATION_ENABLED).toBe(false);
    expect(registry.image.capabilities).toMatchObject({ editor: false, visitor: true, uploads: false, links: false });
    expect(creatableModuleDefinitions.some((module) => String(module.type) === "image")).toBe(false);
  });
  it("blocks direct add and duplicate paths without changing document, versioned data or history", () => {
    const legacy = createStarterDocument("Reader", "classic98", "card"), image = makeWindow("image");
    legacy.windows.push(image);
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "a" }); if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
    const store = useEditorStore.getState(); store.setSite("a", "reader", legacy, 1, null, null, "owner"); store.setVersionedDocument(migrated.document);
    const before = useEditorStore.getState();
    store.addWindow("image"); store.duplicateWindow(image.id);
    const after = useEditorStore.getState();
    expect(after.document).toEqual(before.document); expect(after.versionedDocument).toEqual(before.versionedDocument);
    expect(after.past).toEqual(before.past); expect(after.saveStatus).toBe(before.saveStatus);
    store.addWindow("gallery"); expect(useEditorStore.getState().document?.windows).toHaveLength(legacy.windows.length + 1);
    expect(useEditorStore.getState().document?.windows.find((window) => window.id === image.id)).toEqual(image);
  });
});
