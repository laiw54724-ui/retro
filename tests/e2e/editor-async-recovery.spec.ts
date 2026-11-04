import { expect, test, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createAssetReference, createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { mockColors } from "./appearance-p2-fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});

for (const point of ["save", "migration", "undo"] as const) {
  test(`late ${point} response retains newer local edits, canonical data and undo`, async ({ page }) => {
    const site = await mockColors(page);
    await page.route("**/api/sites/site-1/assets", route => route.fulfill({ json: { assets: [{ id: "legacy-image", url: "https://example.test/legacy.png", mimeType: "image/png", size: 10, kind: "image", name: "Legacy image", createdAt: "2026-10-19T00:00:00Z", storageScope: "legacy_public", migrationRequired: true }] } }));
    let pending: Route | undefined;
    let migrations = 0;
    await page.route("**/api/sites/site-1/draft", route => {
      if (point === "save" && !pending) { pending = route; return; }
      return route.fulfill({ status: 409, json: { error: { code: "version_conflict" } } });
    });
    await page.route("**/api/sites/site-1/assets/migrate", route => { migrations++; if (point === "save") return route.fulfill({ json: { version: 3, document: site.saved(), migratedCount: 1, cleanupWarnings: [] } }); pending = route; });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/editor/site-1");
    const title = page.locator("#editor-right-panel").getByRole("textbox").first();
    if (point === "save") await title.fill("Submitted A");
    await page.getByRole("button", { name: "轉為私有素材", exact: true }).click();
    await expect.poll(() => !!pending).toBe(true);
    await title.fill("Newer local B");
    if (point === "undo") await page.getByRole("button", { name: "復原", exact: true }).click();
    const retainedTitle = point === "undo" ? "First.exe" : "Newer local B";
    if (point === "save") await pending!.fulfill({ json: { version: 2, updatedAt: "2026-10-26T00:00:00Z" } });
    else await pending!.fulfill({ json: { version: 2, document: site.saved(), migratedCount: 1, cleanupWarnings: [] } });
    const recovery = page.getByRole("alertdialog", { name: "版本衝突", exact: true });
    await expect(recovery).toBeVisible();
    await expect(title).toHaveValue(retainedTitle);
    const downloaded = page.waitForEvent("download");
    await recovery.getByRole("button", { name: "下載本機復原 JSON", exact: true }).click();
    const local = JSON.parse(await readFile((await (await downloaded).path())!, "utf8"));
    expect(local.windows[0].title).toBe(retainedTitle);
    expect(local.windows[0].appearance).toEqual(site.saved().windows[0].appearance);
    await recovery.getByRole("button", { name: "取消", exact: true }).click();
    if (point !== "undo") {
      await page.getByRole("button", { name: "復原", exact: true }).click();
      await expect(title).not.toHaveValue("Newer local B");
    }
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(title).toHaveValue("Newer local B");
    expect(migrations).toBe(point === "save" ? 0 : 1);
  });
}

for (const status of [500, 409]) {
  test(`asset inventory ${status} after successful publish never becomes a publish failure`, async ({ page }) => {
    await mockColors(page);
    let published = false, reads = 0, postPublishReads = 0;
    await page.route("**/api/sites/site-1/publish", route => { published = true; return route.fulfill({ json: { publishedVersion: 1, url: "/@demo", artifactStatus: "synced", retryable: false, cleanupWarnings: [] } }); });
    await page.route("**/api/sites/site-1/assets", route => {
      reads++;
      if (published && ++postPublishReads === 1) return route.fulfill({ status, json: { error: { code: status === 409 ? "version_conflict" : "request_failed" } } });
      return route.fulfill({ json: { assets: [] } });
    });
    await page.goto("/editor/site-1");
    await expect.poll(() => reads).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: "發布", exact: true }).click();
    await page.getByRole("button", { name: "確認發布", exact: true }).click();
    const success = page.getByRole("dialog", { name: "發布完成", exact: true });
    await expect(success).toBeVisible();
    await expect.poll(() => postPublishReads).toBe(1);
    await expect(page.getByRole("alertdialog", { name: "版本衝突", exact: true })).toHaveCount(0);
    await expect(success.getByRole("status")).toContainText("素材清單");
    await success.getByRole("button", { name: "重新盤點", exact: true }).click();
    await expect.poll(() => postPublishReads).toBe(2);
    await expect(success.getByRole("status").filter({ hasText: "素材清單" })).toHaveCount(0);
    await success.getByRole("button", { name: "完成", exact: true }).click();
    await expect(page.locator(".editor-message").filter({ hasText: /發布失敗|另一個分頁/ })).toHaveCount(0);
  });
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
test("upload completed during publish stays an unpublished change and keeps undo", async ({ page }) => {
  const source = createStarterDocument("Snapshot demo", "classic98", "blank");
  const about = makeWindow("about", 0);
  about.id = "about"; about.title = "About.exe"; about.defaultOpen = true;
  source.windows = [about];
  const migrated = migrateSiteDocumentV2(source, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  let draft = migrated.document, version = 1;
  let upload: Route | undefined, publish: Route | undefined;
  let submittedVersion = 0;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript(value => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Snapshot demo", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", route => {
    if (route.request().method() === "POST") { upload = route; return; }
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    return route.fulfill({ json: { assets: [] } });
  });
  await page.route("**/api/sites/site-1/draft", route => { draft = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version } }); });
  await page.route("**/api/sites/site-1/publish", route => { submittedVersion = route.request().postDataJSON().expectedVersion; publish = route; });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/editor/site-1");
  const card = page.getByRole("dialog", { name: "About.exe", exact: true });
  await card.locator(".about-avatar-toggle").click();
  await card.locator("input[type=file]").setInputFiles({ name: "held.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => !!upload).toBe(true);
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await page.getByRole("button", { name: "確認發布", exact: true }).click();
  await expect.poll(() => !!publish).toBe(true);
  expect(submittedVersion).toBe(1);
  const id = "00000000-0000-4000-8000-000000000001";
  await upload!.fulfill({ json: { asset: { id, url: createAssetReference(id), kind: "image", name: "held.png", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-26T00:00:00Z" } } });
  await expect.poll(() => draft.windows[0].type === "about" && draft.windows[0].content.avatar).toBe(createAssetReference(id));
  await publish!.fulfill({ json: { publishedVersion: 1, url: "/@demo", artifactStatus: "synced", retryable: false, cleanupWarnings: [] } });
  await page.getByRole("dialog", { name: "發布完成", exact: true }).getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".status-badge").filter({ hasText: "草稿有未發布的變更" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新發布", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(page.locator(".status-badge").filter({ hasText: "草稿有未發布的變更" })).toHaveCount(0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.locator(".status-badge").filter({ hasText: "草稿有未發布的變更" })).toBeVisible();
});
