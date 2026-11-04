import { afterEach, describe, expect, it } from "vitest";
import { createStarterDocument, makeLink, makeWindow } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import { observeIconSelection, type IconMediaTarget } from "./iconSelectionSession";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); });
function setup() {
  const document = createStarterDocument("Icons", "classic98", "blank");
  const links = makeWindow("links");
  const explorer = makeWindow("explorer");
  if (links.type !== "links" || explorer.type !== "explorer") throw new Error("fixture types");
  links.id = "links"; links.icon = "doc";
  links.content.links = [makeLink({ id: "same-id", icon: "heart" })];
  explorer.id = "explorer";
  explorer.content.folders = [{ id: "same-id", parentId: null, name: "Folder", order: 0, visibility: "published" }];
  explorer.content.shortcuts = [{ id: "shortcut", parentId: null, label: "Links", order: 0, visibility: "published", target: { siteId: "site", id: "links", kind: "window" } }];
  document.windows = [links, explorer];
  useEditorStore.getState().setSite("site", "icons", document, 1, null, null, "owner");
  return document;
}
function observe(target: IconMediaTarget, value: string) {
  const guard = observeIconSelection(useEditorStore, "site", target, value);
  cleanup.push(guard.dispose);
  return guard;
}

describe("staged icon selection identity", () => {
  it("retains a window preview through unrelated typing and selecting another window", () => {
    setup();
    const guard = observe({ windowId: "links", windowType: "links" }, "doc");
    useEditorStore.getState().select("explorer");
    useEditorStore.getState().setSiteName("Other title");
    expect(guard.isCurrent()).toBe(true);
  });
  it.each(["folder", "shortcut"] as const)("accepts an explicit default icon on an Explorer %s", (kind) => {
    setup();
    const guard = observe({ windowId: "explorer", windowType: "explorer", itemId: kind === "folder" ? "same-id" : "shortcut", itemKind: kind }, "");
    expect(guard.isCurrent()).toBe(true);
  });
  it("distinguishes link, folder and missing targets with the same item ID", () => {
    setup();
    expect(observe({ windowId: "links", windowType: "links", itemId: "same-id" }, "heart").isCurrent()).toBe(true);
    expect(observe({ windowId: "explorer", windowType: "explorer", itemId: "same-id", itemKind: "folder" }, "").isCurrent()).toBe(true);
    expect(observe({ windowId: "explorer", windowType: "explorer", itemId: "same-id", itemKind: "shortcut" }, "").isCurrent()).toBe(false);
  });
  it("cannot apply to a deleted and recreated folder with the same ID", () => {
    setup();
    const guard = observe({ windowId: "explorer", windowType: "explorer", itemId: "same-id", itemKind: "folder" }, "");
    const old = useEditorStore.getState().document!.windows.find((w) => w.id === "explorer")!;
    useEditorStore.getState().updateWindow("explorer", (w) => w.type === "explorer" ? { ...w, content: { ...w.content, folders: [] } } : w);
    useEditorStore.getState().updateWindow("explorer", () => old);
    expect(guard.isCurrent()).toBe(false);
  });
  it.each(["undo", "reload", "permission", "icon"] as const)("invalidates even a completed preview after %s", (change) => {
    const document = setup();
    useEditorStore.getState().setSiteName("New title");
    const guard = observe({ windowId: "links", windowType: "links" }, "doc");
    if (change === "undo") useEditorStore.getState().undo();
    if (change === "reload") useEditorStore.getState().setSite("site", "icons", document, 1, null, null, "owner");
    if (change === "permission") useEditorStore.setState({ accessRole: "viewer" });
    if (change === "icon") useEditorStore.getState().updateWindow("links", (w) => ({ ...w, icon: "folder" }));
    expect(guard.isCurrent()).toBe(false);
  });
  it("does not reuse a guard after moving to another site with identical content", () => {
    const document = setup();
    const guard = observe({ windowId: "links", windowType: "links" }, "doc");
    useEditorStore.getState().setSite("other-site", "icons", document, 1, null, null, "owner");
    expect(guard.isCurrent()).toBe(false);
  });
});
