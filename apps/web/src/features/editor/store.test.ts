import { describe, expect, it } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2, projectV2ToLegacyDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
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
  it("keeps profile-only and normal edits paired through undo and redo", () => {
    const { legacy, versioned } = profileFixture();
    const store = useEditorStore.getState();
    store.setSite("site-a", "alice", legacy, 1, null, null);
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
    store.setSite("site-a", "alice", legacy, 1, null, null);
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
});
