import { describe, expect, it, vi } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2, SiteDocumentV2Schema } from "@retrodesk/shared";
import { useEditorStore } from "./store";

vi.mock("../../lib/imageWindowCreation", () => ({ IMAGE_WINDOW_CREATION_ENABLED: true, canCreateWindowType: () => true }));
describe("local image authoring history", () => {
  it("adds, edits, duplicates and travels history with canonical v2 source/crop intact", () => {
    const legacy = createStarterDocument("Art", "classic98", "card");
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "image-author" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
    const store = useEditorStore.getState();
    store.setSite("image-author", "art", legacy, 1, null, null, "owner"); store.setVersionedDocument(migrated.document);
    store.addWindow("image");
    const id = useEditorStore.getState().selectedId!;
    const source = "retro-asset:11111111-1111-4111-8111-111111111111";
    store.updateWindow(id, (window) => window.type === "image" ? { ...window, content: { ...window.content, src: source, alt: "Art", crop: { x: 25, y: 75, zoom: 2 }, frameMode: "none", interactionMode: "decorative" } } : window);
    const edited = useEditorStore.getState().document!;
    expect(SiteDocumentV2Schema.safeParse(useEditorStore.getState().versionedDocument).success).toBe(true);
    store.duplicateWindow(id);
    const copied = useEditorStore.getState().document!.windows.at(-1)!;
    expect(copied.id).not.toBe(id); expect(copied.content).toEqual(edited.windows.at(-1)!.content);
    store.undo(); expect(useEditorStore.getState().document).toEqual(edited);
    store.redo(); expect(useEditorStore.getState().document!.windows.at(-1)).toEqual(copied);
    store.updateWindow(id, (window) => window.type === "image" ? { ...window, content: { ...window.content, frameMode: "simple" } } : window);
    expect(useEditorStore.getState().document!.windows.find((w) => w.id === id)?.content).toMatchObject({ src: source, crop: { x: 25, y: 75, zoom: 2 } });
  });
});
