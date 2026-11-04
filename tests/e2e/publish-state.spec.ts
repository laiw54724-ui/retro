import { expect, test, type Page } from "@playwright/test";
import { collectAssetReferences, createAssetReference, migrateSiteDocumentV2, projectPublicSiteDocument, replaceAssetReferences, type SiteDocumentV2Input } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

/**
 * R1 / Issue #41: the editor decided "has unpublished changes" by comparing the lossy legacy render projection, so a
 * canonical-only edit (custom fields, pronouns, world tags, ...) was saved but still labelled "published" and could not
 * be republished. The decision now compares the draft's *public projection* with the stored published copy.
 *
 * The mock publishes exactly like `POST /sites/:id/publish`: public projection (private characters, posts and
 * collections removed), `retro-asset:<id>` rewritten to a public URL, stored as jsonb (keys reordered).
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const SITE = "site-1";
// The editor trusts `<API_URL>/api/assets`. Use this test project's server origin
// so the fixture stays accurate when a focused suite runs on a different port.
function publishedAssetBase() {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("publish-state tests require a Playwright baseURL");
  return `${new URL(baseURL).origin}/api/assets`;
}
const AVATAR_ASSET = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

/** A published character with an uploaded avatar, plus private content that must never reach the published copy. */
function draftWithPrivateContentAndAsset(): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: SITE });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  const document = migrated.document;
  const owner = document.entities.profiles[0];
  owner.visibility = "published";
  owner.avatar = createAssetReference(AVATAR_ASSET);
  const secret = { ...structuredClone(owner), id: "profile:secret", handle: "secret", displayName: "Secret Draft Character", visibility: "draft" as const, avatar: null };
  document.entities.profiles.push(secret);
  const firstPost = document.entities.posts[0];
  document.entities.posts.push({ ...structuredClone(firstPost), id: "post:secret", authorProfileId: secret.id, caption: "Secret draft post", visibility: "draft" });
  document.entities.collections = [{ kind: "collection", id: "collection:secret", siteId: SITE, ownerProfileId: secret.id, visibility: "draft", title: "Private collection", description: "", postIds: ["post:secret"] }];
  return document;
}

/** Same pipeline as the API's publish route, followed by a jsonb round-trip (keys come back reordered). */
function publishLikeApi(draft: unknown, assetBase = publishedAssetBase()): unknown {
  const projected = projectPublicSiteDocument(draft, SITE);
  if (!projected.ok) throw new Error("draft is not publishable");
  const urls = new Map(collectAssetReferences(projected.document).map((id) => [id, `${assetBase}/published/demo/assets/${id}.png`]));
  const rewritten = replaceAssetReferences(projected.document, urls);
  return JSON.parse(JSON.stringify(rewritten, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
}

type Backend = { saves: Array<{ document: SiteDocumentV2Input }>; publishes: () => number; published: () => any; draft: () => SiteDocumentV2Input };

async function openPublishedEditor(page: Page, options: { publishedAsV1?: boolean; assetBase?: string } = {}): Promise<Backend> {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  let draft = draftWithPrivateContentAndAsset();
  let published: unknown = options.publishedAsV1 ? igDocument() : publishLikeApi(draft, options.assetBase);
  if (options.publishedAsV1) {
    // an old publication: the v1 document the site had before migration; the draft is its v2 migration
    const migrated = migrateSiteDocumentV2(published, { siteId: SITE });
    if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
    migrated.document.entities.profiles[0].visibility = "published";
    draft = migrated.document;
  }
  let version = 2;
  let publishedVersion = 2;
  let publishCount = 0;
  const saves: Backend["saves"] = [];
  const asset = { id: AVATAR_ASSET, url: `/api/assets/draft/${AVATAR_ASSET}.png`, mimeType: "image/png", size: 100, kind: "image", name: "avatar.png", createdAt: "2026-10-15T00:00:00.000Z", storageScope: "draft_private" };
  const site = () => ({ id: SITE, username: "demo", site_name: "D", draft_document: draft, draft_version: version, published_document: published, published_version: publishedVersion, published_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: site() } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: options.publishedAsV1 ? [] : [asset] } }));
  await page.route("**/api/assets/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgo=", "base64") }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocumentV2Input };
    saves.push(body); draft = body.document; version += 1;
    return route.fulfill({ json: { version, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1/publish", (route) => {
    publishCount += 1; published = publishLikeApi(draft); publishedVersion += 1;
    return route.fulfill({ json: { publishedVersion, publishedAt: "2026-10-15T00:02:00.000Z", url: "/@demo", artifactStatus: "synced", cleanupWarnings: [] } });
  });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  return { saves, publishes: () => publishCount, published: () => published, draft: () => draft };
}

const republish = (page: Page) => page.getByRole("button", { name: "重新發布", exact: true });
const inSync = (page: Page, version = 2) => expect(page.getByText(`已發布 v${version}`, { exact: true }).first()).toBeVisible();
const changed = (page: Page) => expect(page.getByText("草稿有未發布的變更", { exact: true }).first()).toBeVisible();

async function addCustomField(page: Page, backend: Backend) {
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await win.getByRole("button", { name: "編輯個人檔案", exact: true }).click();
  await win.getByRole("button", { name: "展開角色設定" }).click();
  await win.getByRole("button", { name: "＋ 新增欄位" }).click();
  const panel = win.getByRole("tabpanel", { name: "角色資料", exact: true });
  await panel.getByPlaceholder("欄位名稱", { exact: true }).last().fill("世界");
  await panel.getByPlaceholder("內容", { exact: true }).last().fill("雪國");
  await expect.poll(() => backend.saves.at(-1)?.document.entities.profiles[0].customFields.some((field) => field.key === "世界")).toBe(true);
}

test("the real published copy (private content removed, assets rewritten, keys reordered) loads as in sync", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const backend = await openPublishedEditor(page);
  // the stored copy genuinely differs from the draft in the ways the API changes it
  const stored = JSON.stringify(backend.published());
  expect(stored).not.toContain("Secret Draft Character");
  expect(stored).not.toContain("retro-asset:");
  expect(JSON.stringify(backend.draft())).toContain("Secret Draft Character");
  await page.waitForTimeout(1500);
  await inSync(page);
  await expect(republish(page)).toBeDisabled();
  expect(backend.saves).toHaveLength(0);
});

test("a canonical-only edit is flagged, survives reload, and publishing returns to in-sync right away and after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const backend = await openPublishedEditor(page);
  await addCustomField(page, backend);
  await changed(page);
  await expect(republish(page)).toBeEnabled();

  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  await changed(page);
  await expect(republish(page)).toBeEnabled();

  await republish(page).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop" }).getByRole("button", { name: "確認發布" }).click();
  await expect.poll(() => backend.publishes()).toBe(1);
  expect(backend.published().entities.profiles.some((profile: { customFields: Array<{ key: string }> }) => profile.customFields.some((field) => field.key === "世界"))).toBe(true);
  expect(JSON.stringify(backend.published())).not.toContain("Secret Draft Character");
  await page.getByRole("dialog", { name: "發布完成" }).getByRole("button", { name: "完成" }).click();
  // immediately after publishing ...
  await inSync(page, 3);
  await expect(republish(page)).toBeDisabled();
  // ... and after reloading from the server's stored copy: the same answer
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  await inSync(page, 3);
  await expect(republish(page)).toBeDisabled();
});

test("an old v1 published copy with a v2 draft: unchanged is in sync, a canonical-only edit is still caught", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const backend = await openPublishedEditor(page, { publishedAsV1: true });
  await page.waitForTimeout(1500);
  await inSync(page);
  await expect(republish(page)).toBeDisabled();
  await addCustomField(page, backend);
  await changed(page);
  await expect(republish(page)).toBeEnabled();
});

test("a published copy whose asset URL comes from an untrusted origin is not treated as the same asset", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPublishedEditor(page, { assetBase: "https://untrusted.example/api/assets" });
  await changed(page);
  await expect(republish(page)).toBeEnabled();
});
