import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WindowChromeSchema,
  createStarterDocument,
  makeBlock,
  makeGalleryImage,
  makeWindow,
  migrateSiteDocumentV2
} from "@retrodesk/shared";

const state = {
  document: null as unknown,
  updatedDocument: null as unknown,
  pendingUpdate: false
};
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => {
    if (state.pendingUpdate) {
      state.pendingUpdate = false;
      return { data: { draft_version: 2, updated_at: "2026-10-17T00:00:00.000Z" }, error: null };
    }
    return { data: { id: "site-a", owner_id: "user-a", draft_version: 1, draft_document: state.document }, error: null };
  },
  update: (value: { draft_document?: unknown }) => {
    state.updatedDocument = value.draft_document ?? null;
    state.pendingUpdate = true;
    return query;
  }
};
vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a" })),
  serviceClient: vi.fn(() => ({ from: vi.fn(() => query) }))
}));

const { sites } = await import("../src/routes/sites");

function validV2() {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Draft", "classic98", "instagram"), { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  return migrated.document;
}

function mediaAndChromeV1() {
  const document = createStarterDocument("Draft", "classic98", "oc");
  const documentWindow = document.windows.find((window) => window.type === "document");
  const galleryWindow = document.windows.find((window) => window.type === "gallery");
  if (!documentWindow || documentWindow.type !== "document" || !galleryWindow || galleryWindow.type !== "gallery") {
    throw new Error("compatibility fixture missing document/gallery");
  }
  documentWindow.chrome = WindowChromeSchema.parse({ preset: "classic-95", controls: ["close"] });
  documentWindow.content.blocks.push({ ...makeBlock("image"), alt: "Portrait alternative", caption: "Visible portrait caption" });
  galleryWindow.content.images.push(makeGalleryImage({ title: "Portrait", caption: "Visible gallery caption", alt: "Independent gallery alternative" }));
  galleryWindow.icon = "haiku:folder";
  const explorer = makeWindow("explorer", document.windows.length);
  const music = makeWindow("music", document.windows.length + 1);
  if (explorer.type !== "explorer" || music.type !== "music") throw new Error("integration fixture types");
  explorer.content.folders = [{ id: "icons-folder", parentId: null, name: "Icons", icon: "pixelart:heart", order: 0, visibility: "published" }];
  explorer.content.shortcuts = [{ id: "gallery-shortcut", parentId: "icons-folder", label: "Gallery", icon: "pixelarticons:image", order: 0, visibility: "published", target: { siteId: "site-a", id: galleryWindow.id, kind: "window" } }];
  music.content.tracks = [{ id: "spotify-track", title: "Official player", artist: "", cover: null, coverUrl: "", lyrics: "", rightsNote: "", source: { kind: "providerEmbed", provider: "spotify", resourceType: "track", resourceId: "50q2aUjWoTn6CJIfSPRJQA", canonicalUrl: "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA", originalUrl: "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA" } }];
  music.content.playlist.trackIds = ["spotify-track"];
  document.windows.push(explorer, music);
  return document;
}

function mediaAndChromeV2() {
  const migrated = migrateSiteDocumentV2(mediaAndChromeV1(), { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("compatibility fixture migration failed");
  return migrated.document;
}

describe("draft route semantic validation", () => {
  beforeEach(() => {
    state.document = validV2();
    state.updatedDocument = null;
    state.pendingUpdate = false;
  });

  it.each([
    ["duplicate handles", (document: any) => ({ ...document, entities: { ...document.entities, profiles: [{ ...document.entities.profiles[0], id: "profile:copy", handle: document.entities.profiles[0].handle }] } })],
    ["missing profile ref", (document: any) => ({ ...document, windows: document.windows.map((window: any) => window.type === "instagram" ? { ...window, content: { ...window.content, profileRef: { ...window.content.profileRef, id: "missing" } } } : window) })],
    ["cross-site entity scope", (document: any) => ({ ...document, entities: { ...document.entities, profiles: document.entities.profiles.map((profile: any) => ({ ...profile, siteId: "site-other" })) } })]
  ])("rejects %s before writing", async (_label, mutate) => {
    const document = mutate(validV2());
    const response = await sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document }) }, {} as never);
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error.code).toBe("invalid_draft");
    expect(body.error.details).toBeDefined();
  });

  it("rejects a self-consistent site-b document submitted to site-a", async () => {
    const migrated = migrateSiteDocumentV2(createStarterDocument("Other", "classic98", "instagram"), { siteId: "site-b" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
    const response = await sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document: migrated.document }) }, {} as never);
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toMatchObject({ code: "invalid_draft", message: expect.stringContaining("does not belong") });
    expect(body.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "cross_site" })]));
  });

  it.each([
    ["legacy v1", mediaAndChromeV1],
    ["canonical v2", mediaAndChromeV2]
  ])("accepts and preserves #43 media fields and #49 chrome in %s drafts", async (_label, makeDocument) => {
    const document = makeDocument();
    state.document = document;
    const response = await sites.request("/sites/site-a/draft", {
      method: "PUT",
      body: JSON.stringify({ expectedVersion: 1, document })
    }, {} as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 2 });
    expect(state.updatedDocument).toEqual(document);

    const saved = state.updatedDocument as typeof document;
    const documentWindow = saved.windows.find((window) => window.type === "document");
    const galleryWindow = saved.windows.find((window) => window.type === "gallery");
    expect(documentWindow?.chrome).toMatchObject({ preset: "classic-95", controls: ["close"] });
    if (!documentWindow || documentWindow.type !== "document" || !galleryWindow || galleryWindow.type !== "gallery") {
      throw new Error("saved compatibility fixture missing document/gallery");
    }
    expect(documentWindow.content.blocks.find((block) => block.kind === "image")).toMatchObject({
      alt: "Portrait alternative",
      caption: "Visible portrait caption"
    });
    expect(galleryWindow.content.images[0]).toMatchObject({
      caption: "Visible gallery caption",
      alt: "Independent gallery alternative"
    });
    expect(galleryWindow.icon).toBe("haiku:folder");
    const explorer = saved.windows.find((window) => window.type === "explorer");
    const music = saved.windows.find((window) => window.type === "music");
    expect(explorer?.content.folders[0].icon).toBe("pixelart:heart");
    expect(explorer?.content.shortcuts[0].icon).toBe("pixelarticons:image");
    expect(music?.content.tracks[0].source).toMatchObject({ kind: "providerEmbed", provider: "spotify" });
  });

});
