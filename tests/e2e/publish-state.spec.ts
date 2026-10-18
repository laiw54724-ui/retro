import { expect, test, type Page } from "@playwright/test";
import { migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

/**
 * R1 / Issue #41: the editor decided "has unpublished changes" by comparing the lossy legacy render projection, so a
 * canonical-only edit (custom fields, pronouns, world tags, ...) was saved but still labelled "published" and could not
 * be republished. The decision now compares the canonical v2 snapshot.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function publishedFixture(): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  migrated.document.entities.profiles[0].visibility = "published";
  return migrated.document;
}

type Backend = { saves: Array<{ document: SiteDocumentV2Input }>; publishes: () => number; published: () => SiteDocumentV2Input };

async function openPublishedEditor(page: Page, options: { reorderKeys?: boolean } = {}): Promise<Backend> {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const document = publishedFixture();
  // Postgres jsonb stores keys in its own order; the published copy must not look "changed" because of that.
  const reordered = options.reorderKeys ? reverseKeys(document) : structuredClone(document);
  let draft: SiteDocumentV2Input = document;
  let published: SiteDocumentV2Input = reordered as SiteDocumentV2Input;
  let version = 2;
  let publishedVersion = 2;
  let publishCount = 0;
  const saves: Backend["saves"] = [];
  const site = () => ({ id: "site-1", username: "demo", site_name: "D", draft_document: draft, draft_version: version, published_document: published, published_version: publishedVersion, published_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: site() } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocumentV2Input };
    saves.push(body); draft = body.document; version += 1;
    return route.fulfill({ json: { version, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1/publish", (route) => {
    publishCount += 1; published = reverseKeys(draft) as SiteDocumentV2Input; publishedVersion += 1;
    return route.fulfill({ json: { publishedVersion, publishedAt: "2026-10-15T00:02:00.000Z", url: "/@demo", artifactStatus: "synced", cleanupWarnings: [] } });
  });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  return { saves, publishes: () => publishCount, published: () => published };
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]));
  return value;
}

const republish = (page: Page) => page.getByRole("button", { name: "重新發布", exact: true });
const inSync = (page: Page, version = 2) => expect(page.getByText(`已發布 v${version}`, { exact: true }).first()).toBeVisible();
const changed = (page: Page) => expect(page.getByText("草稿有未發布的變更", { exact: true }).first()).toBeVisible();

test("a freshly loaded published draft is in sync and cannot be republished", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPublishedEditor(page);
  await inSync(page);
  await expect(republish(page)).toBeDisabled();
});

test("key order differences in the stored published copy never look like an edit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const backend = await openPublishedEditor(page, { reorderKeys: true });
  await page.waitForTimeout(1500);
  await inSync(page);
  await expect(republish(page)).toBeDisabled();
  expect(backend.saves).toHaveLength(0);
});

test("a canonical-only edit (custom field) marks the draft as changed, survives reload and republishes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const backend = await openPublishedEditor(page);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await win.getByRole("button", { name: "展開角色設定" }).click();
  await win.getByRole("button", { name: "＋ 新增欄位" }).click();
  const panel = win.getByRole("tabpanel", { name: "角色資料", exact: true });
  await panel.getByPlaceholder("欄位名稱", { exact: true }).last().fill("世界");
  await panel.getByPlaceholder("內容", { exact: true }).last().fill("雪國");
  await expect.poll(() => backend.saves.at(-1)?.document.entities.profiles[0].customFields.some((field) => field.key === "世界")).toBe(true);

  await changed(page);
  await expect(republish(page)).toBeEnabled();

  // the saved draft still differs from the published copy after a reload
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  await changed(page);
  await expect(republish(page)).toBeEnabled();

  await republish(page).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop" }).getByRole("button", { name: "確認發布" }).click();
  await expect.poll(() => backend.publishes()).toBe(1);
  expect(backend.published().entities.profiles[0].customFields.some((field) => field.key === "世界" && field.value === "雪國")).toBe(true);
  await page.getByRole("dialog", { name: "發布完成" }).getByRole("button", { name: "完成" }).click();
  await inSync(page, 3);
  await expect(republish(page)).toBeDisabled();
});
