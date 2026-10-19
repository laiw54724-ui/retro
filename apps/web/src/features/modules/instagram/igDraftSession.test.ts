import { afterEach, describe, expect, it } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2, projectV2ToLegacyDocument } from "@retrodesk/shared";
import { useEditorStore } from "../../editor/store";
import { createIgDraftSession } from "./igDraftSession";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));
function setup() {
  const result = migrateSiteDocumentV2(createStarterDocument("Desk", "classic98", "instagram"), { siteId: "site-a" });
  if (!result.ok || result.version !== 2) throw new Error("fixture");
  const projection = projectV2ToLegacyDocument(result.document);
  if (!projection.ok) throw new Error("fixture");
  const store = useEditorStore.getState();
  store.setSite("site-a", "a", projection.document, 1, null, null, "owner");
  store.setVersionedDocument(result.document);
  const session = createIgDraftSession(useEditorStore); cleanups.push(session.dispose);
  const draft = { base: "retro", text: "", error: "required" as const };
  session.controls.set("image-source", { base: "", text: "https:", error: "invalid" });
  session.drafts.set('["site-a","ig","profile-a"]:handle', draft);
  return { store, session, draft, document: projection.document };
}
describe("IG field draft session", () => {
  it("retains drafts through UI selection, ordinary edits and autosave without adding history", () => {
    const { store, session, draft } = setup();
    store.select(null); store.setDevice("mobile");
    expect(useEditorStore.getState().past).toHaveLength(0);
    store.setSiteName("Edited"); store.markSaved(2, useEditorStore.getState().document!);
    expect([...session.drafts.values()]).toEqual([draft]);
    expect(session.controls.get("image-source")).toMatchObject({ text: "https:" });
    expect(session.getEpoch()).toBe(0);
  });
  it.each(["undo", "redo", "reload", "site", "access"])("clears old drafts on %s even while no editor provider is mounted", (action) => {
    const { store, session, document, draft } = setup();
    if (action === "undo" || action === "redo") {
      store.setSiteName("Edited");
      if (action === "redo") { store.undo(); session.drafts.set("field", draft); }
      store[action]();
    } else if (action === "access") useEditorStore.setState({ accessRole: "viewer" });
    else store.setSite(action === "site" ? "site-b" : "site-a", "a", document, 1, null, null, "owner");
    expect(session.drafts.size).toBe(0);
    expect(session.controls.size).toBe(0);
    expect(session.getHasPendingDrafts()).toBe(false);
    expect(session.getEpoch()).toBeGreaterThan(0);
  });
  it("reports local input separately from canonical save state, even without an editor mounted", () => {
    const { store, session } = setup();
    let notified = 0;
    const unsubscribe = session.subscribeControls(() => notified++);
    expect(session.getHasPendingDrafts()).toBe(true);
    store.markSaved(2, useEditorStore.getState().document!);
    expect(session.getHasPendingDrafts()).toBe(true);
    session.drafts.clear(); session.controls.clear(); session.notifyControls();
    expect(session.getHasPendingDrafts()).toBe(false);
    expect(notified).toBe(1); unsubscribe();
  });
  it("tracks source and pending-addition input without counting custom row identities", () => {
    const { session } = setup(); session.drafts.clear(); session.controls.clear();
    session.controls.set("scope:custom-fields", ["row-id"]);
    session.controls.set("scope:avatar-source", { base: "same", text: "same", error: "" });
    expect(session.getHasPendingDrafts()).toBe(false);
    session.controls.set("scope:post-media-urls", { post: "https:" });
    expect(session.getHasPendingDrafts()).toBe(true);
    session.controls.set("scope:post-media-urls", { post: "" });
    session.controls.set("scope:frame-urls", { highlight: "https:" });
    expect(session.getHasPendingDrafts()).toBe(true);
    session.controls.set("scope:frame-urls", {});
    expect(session.getHasPendingDrafts()).toBe(false);
  });

});
