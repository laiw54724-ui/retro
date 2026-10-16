import { expect, test, type Page } from "@playwright/test";
import { createRetroExport, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "owner-1", email: "owner@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function transferPackage() {
  const migrated = migrateSiteDocumentV2(documentFixture, { siteId: "site-transfer" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("v2 fixture migration failed");
  const about = migrated.document.windows.find((window) => window.type === "about");
  if (!about || about.type !== "about") throw new Error("about fixture missing");
  about.content.avatar = "retro-asset:11111111-1111-4111-8111-111111111111";
  const result = createRetroExport({ scope: "owner-backup", siteId: "site-transfer", username: "demo", siteName: "Demo Desk", document: migrated.document, exportedAt: "2026-10-17T00:00:00.000Z" });
  if (!result.ok) throw new Error("export fixture failed");
  return { document: migrated.document, value: result.value };
}

async function signedInOwner(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const fixture = transferPackage();
  const site = { id: "site-transfer", username: "demo", site_name: "Demo Desk", draft_document: fixture.document, draft_version: 3, published_document: fixture.document, published_version: 2, published_at: "2026-10-17T00:00:00.000Z", updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-transfer", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-transfer/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-transfer/draft", (route) => route.fulfill({ json: { version: 4, updatedAt: "2026-10-17T00:01:00.000Z" } }));
  return fixture;
}

test("owner exports, previews missing media, and imports a new desktop copy", async ({ page }) => {
  const fixture = await signedInOwner(page);
  const digest = "a".repeat(64);
  let confirmed: { url: string; body: unknown } | null = null;
  await page.route("**/api/sites/site-transfer/export?scope=draft", (route) => route.fulfill({
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="retro-demo-private-backup.json"' },
    body: JSON.stringify(fixture.value),
  }));
  await page.route("**/api/imports/preview", (route) => route.fulfill({ json: {
    preview: { siteName: "Demo Desk", sourceUsername: "demo", scope: "owner-backup", schemaVersion: 2, windowCount: fixture.document.windows.length, profileCount: fixture.document.entities.profiles.length, postCount: 0, mediaCount: fixture.value.mediaManifest.items.length, missingMedia: fixture.value.mediaManifest.missing },
    digest,
  } }));
  await page.route("**/api/imports/confirm?**", (route) => {
    confirmed = { url: route.request().url(), body: route.request().postDataJSON() };
    return route.fulfill({ status: 201, json: { site: { id: "new-site", username: "demo-copy", site_name: "Demo Desk 複本", draft_version: 1 }, missingMedia: fixture.value.mediaManifest.missing } });
  });
  await page.route("**/api/sites/new-site", (route) => route.fulfill({ status: 404, json: { error: { code: "not_found", message: "not found" } } }));

  await page.goto("/editor/site-transfer");
  await page.getByRole("button", { name: "匯出／匯入" }).click();
  const dialog = page.getByRole("dialog", { name: "匯出／匯入桌面" });
  await expect(dialog.getByText("@demo")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "匯出私人草稿備份" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("retro-demo-private-backup.json");

  await dialog.getByLabel("選擇 Retro JSON").setInputFiles({ name: "retro-demo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture.value)) });
  await expect(dialog.getByRole("status")).toContainText("個私有媒體未附檔");
  await expect(dialog.getByRole("button", { name: "建立新桌面副本" })).toBeDisabled();
  await dialog.getByLabel("我了解並仍要建立副本").check();
  await dialog.getByRole("button", { name: "建立新桌面副本" }).click();

  await expect(page).toHaveURL(/\/editor\/new-site$/);
  expect(confirmed).not.toBeNull();
  const requestUrl = new URL(confirmed!.url);
  expect(requestUrl.searchParams.get("digest")).toBe(digest);
  expect(requestUrl.searchParams.get("allowMissingMedia")).toBe("true");
  expect(confirmed!.body).toEqual(fixture.value);
});

test("transfer rejects ZIP locally and remains usable at 320px", async ({ page }) => {
  await signedInOwner(page);
  let previewCalls = 0;
  await page.route("**/api/imports/preview", (route) => { previewCalls += 1; return route.abort(); });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/editor/site-transfer");
  await page.getByRole("button", { name: "匯出／匯入" }).click();
  const dialog = page.getByRole("dialog", { name: "匯出／匯入桌面" });
  await dialog.getByLabel("選擇 Retro JSON").setInputFiles({ name: "unsafe.zip", mimeType: "application/zip", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]) });
  await expect(dialog.getByRole("alert")).toContainText("ZIP／可執行檔不會解壓或執行");
  expect(previewCalls).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
