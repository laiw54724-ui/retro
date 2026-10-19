import { beforeAll, describe, expect, it } from "vitest";
import { createStarterDocument, duplicateProfile, makeIgPost, migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { initI18n } from "../../i18n";
import { buildPreviewModel, buildSampleModel, shareableEntities } from "./previewModel";

beforeAll(async () => { await initI18n(); });

const SITE = "site-1";

/** Retro (published, themed) + Bei (published, owns a published and a draft post) + Secret (draft character with a post). */
function draftFixture(): SiteDocumentV2Input {
  const legacy = createStarterDocument("Preview", "classic98", "instagram");
  const ig = legacy.windows.find((window) => window.type === "instagram");
  if (!ig || ig.type !== "instagram") throw new Error("starter has no Instagram window");
  ig.id = "ig-window"; // deterministic character id: profile:ig-window
  ig.content.images = [makeIgPost({ title: "Retro post", caption: "Retro caption" })];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: SITE });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
  const document = migrated.document;
  const retro = document.entities.profiles[0];
  retro.visibility = "published";
  retro.themeOverride = { accent: "#ff00aa", background: "#123456" };
  const bei = duplicateProfile(document, retro.id, { siteId: SITE, id: "profile:bei", handle: "bei" });
  if (!bei.ok) throw new Error("duplicate failed");
  const next = bei.document;
  const beiProfile = next.entities.profiles.find((profile) => profile.id === "profile:bei")!;
  beiProfile.displayName = "Bei"; beiProfile.visibility = "published";
  const secret = duplicateProfile(next, retro.id, { siteId: SITE, id: "profile:secret", handle: "secret" });
  if (!secret.ok) throw new Error("duplicate failed");
  const final = secret.document;
  final.entities.profiles.find((profile) => profile.id === "profile:secret")!.visibility = "draft";
  const template = final.entities.posts[0];
  final.entities.posts.push(
    { ...structuredClone(template), id: "post:bei:pub", authorProfileId: "profile:bei", visibility: "published" },
    { ...structuredClone(template), id: "post:bei:draft", authorProfileId: "profile:bei", visibility: "draft" },
    { ...structuredClone(template), id: "post:secret:1", authorProfileId: "profile:secret", visibility: "published" }
  );
  return final;
}

const ids = (model: NonNullable<ReturnType<typeof buildPreviewModel>>) => model.profileDirectory.map((entry) => entry.id).sort();
const postIds = (model: NonNullable<ReturnType<typeof buildPreviewModel>>) => model.profileDirectory.flatMap((entry) => entry.posts.map((post) => post.id)).sort();

describe("preview model sources", () => {
  it("draft keeps owner-only content so an authorised viewer sees the working draft", () => {
    const model = buildPreviewModel("draft", draftFixture(), SITE)!;
    expect(ids(model)).toEqual(["profile:bei", "profile:ig-window", "profile:secret"]);
    expect(postIds(model)).toContain("post:bei:draft");
    expect(model.profiles.map((profile) => profile.id)).toContain("profile:secret");
  });

  it("publishable is the public projection of the draft: private characters and posts are gone, public data is intact", () => {
    const model = buildPreviewModel("publishable", draftFixture(), SITE)!;
    expect(ids(model)).toEqual(["profile:bei", "profile:ig-window"]);
    expect(postIds(model)).not.toContain("post:bei:draft");
    expect(postIds(model)).not.toContain("post:secret:1");
    expect(postIds(model)).toContain("post:bei:pub");
    expect(model.profiles.map((profile) => profile.id)).not.toContain("profile:secret");
    // the author's character theme survives (it was lost when previews only received the legacy document)
    expect(model.profiles.find((profile) => profile.id === "profile:ig-window")?.themeOverride).toEqual({ accent: "#ff00aa", background: "#123456" });
    expect(JSON.stringify(model)).not.toContain("profile:secret");
  });

  it("maps each Instagram window to its character, from the same snapshot", () => {
    const model = buildPreviewModel("publishable", draftFixture(), SITE)!;
    const igWindow = model.document.windows.find((window) => window.type === "instagram")!;
    expect(model.profileIdsByWindow[igWindow.id]).toBe("profile:ig-window");
  });

  it("published uses the stored snapshot, which can differ from the current draft", () => {
    const storedDraft = draftFixture();
    const stored = JSON.parse(JSON.stringify(storedDraft)) as SiteDocumentV2Input;
    stored.entities.profiles.find((profile) => profile.id === "profile:bei")!.visibility = "draft"; // bei was not yet public when published
    const published = buildPreviewModel("published", stored, SITE)!;
    const publishable = buildPreviewModel("publishable", storedDraft, SITE)!;
    expect(ids(published)).toEqual(["profile:ig-window"]);
    expect(ids(publishable)).toEqual(["profile:bei", "profile:ig-window"]);
  });

  it("returns null for unreadable input instead of guessing", () => {
    expect(buildPreviewModel("publishable", { schemaVersion: 99 }, SITE)).toBeNull();
    expect(buildPreviewModel("draft", null, SITE)).toBeNull();
  });

  it("a v1 document has no character data but still renders", () => {
    const v1 = createStarterDocument("Old", "classic98", "card");
    const model = buildPreviewModel("published", v1, SITE)!;
    expect(model.profileDirectory).toEqual([]);
    expect(model.document.windows.length).toBeGreaterThan(0);
  });

  it("a sample carries no site data", () => {
    const model = buildSampleModel(createStarterDocument("Sample", "classic98", "card"));
    expect(model.source).toBe("sample");
    expect(model.profiles).toEqual([]);
  });
});

describe("shareable entities come only from the stored public snapshot", () => {
  it("a character or post that is public now but not yet published is not shareable", () => {
    const draft = draftFixture();
    const stored = JSON.parse(JSON.stringify(draft)) as SiteDocumentV2Input;
    stored.entities.profiles.find((profile) => profile.id === "profile:bei")!.visibility = "draft";
    const shareable = shareableEntities(stored, SITE);
    expect([...shareable.profileIds]).toEqual(["profile:ig-window"]);
    expect(shareable.profileIds.has("profile:bei")).toBe(false); // would be public after publishing, but is not online
    expect(shareable.postIds.has("post:bei:pub")).toBe(false);
  });

  it("a draft post of a published character is not shareable, a published one is", () => {
    const shareable = shareableEntities(draftFixture(), SITE);
    expect(shareable.postIds.has("post:bei:pub")).toBe(true);
    expect(shareable.postIds.has("post:bei:draft")).toBe(false);
    expect(shareable.postIds.has("post:secret:1")).toBe(false);
    expect(shareable.profileIds.has("profile:secret")).toBe(false);
  });

  it("an unpublished site shares nothing", () => {
    const none = shareableEntities(null, SITE);
    expect(none.profileIds.size + none.postIds.size).toBe(0);
  });
});
