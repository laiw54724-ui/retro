import { expect, test, type Page } from "@playwright/test";
import { migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const privateMessage = "private backend detail: db.internal/table";
const session = {
  access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800,
  expires_in: 3600, token_type: "bearer",
  user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" }
};

test.use({ locale: "zh-TW" });

async function openEditor(page: Page, getSite?: (reads: number, site: object) => { status?: number; json: object }) {
  const migrated = migrateSiteDocumentV2(documentFixture, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Fixture migration failed");
  const site = {
    id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: migrated.document,
    draft_version: 2, published_document: null, published_version: null, published_at: null,
    updated_at: "2026-10-17T00:00:00Z", access_role: "owner"
  };
  let reads = 0;
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", (route) => {
    reads += 1;
    return route.fulfill(getSite ? getSite(reads, site) : { json: { site } });
  });
  await page.goto("/editor/site-1");
  await expect(page.getByLabel("視窗標題")).toBeVisible();
  return site;
}

async function switchToEnglish(page: Page) {
  // A conflict dialog can cover the visible switcher, so change only the UI locale in place.
  expect(await page.evaluate(async () => {
    const { changeLocale } = await import("/src/i18n/index.ts");
    return changeLocale("en");
  })).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

test("autosave conflict and failed reload stay localized while the local draft remains available", async ({ page }) => {
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({
    status: 409, json: { error: { code: "version_conflict", message: privateMessage } }
  }));
  let failReload = false;
  await openEditor(page, (_reads, site) => {
    return !failReload ? { json: { site } } : {
      status: 429, json: { error: { code: "rate_limited", message: privateMessage } }
    };
  });
  await page.getByLabel("視窗標題").fill("My local draft");
  const conflict = page.getByRole("alertdialog", { name: "版本衝突" });
  await expect(conflict).toBeVisible();
  const notice = page.locator(".editor-message[role='alert']");
  await expect(notice).toContainText("偵測到另一個分頁或裝置有更新");
  await switchToEnglish(page);
  await expect(notice).toContainText("An update from another tab or device was detected");
  await expect(page.getByLabel("Window title")).toHaveValue("My local draft");
  failReload = true;
  await page.getByRole("alertdialog", { name: "Version conflict" }).getByRole("button", { name: "Reload the cloud version" }).click();
  await expect(notice).toContainText("Too many requests. Please wait and try again.");
  await expect(notice).not.toContainText(privateMessage);
  await expect(page.getByRole("alertdialog", { name: "Version conflict" }).getByRole("button", { name: "Copy local JSON" })).toBeVisible();
  await expect(page.getByLabel("Window title")).toHaveValue("My local draft");
});

test("asset migration, re-scan, and deletion hide backend details and keep the authored filename", async ({ page }) => {
  const asset = {
    id: "unused-asset", url: "https://assets.test/unused.png", mimeType: "image/png", size: 20,
    kind: "image", name: "作者圖片", createdAt: "2026-10-17T00:00:00Z", storageScope: "legacy_public"
  };
  let assetReads = 0;
  await page.route("**/api/sites/site-1/assets", (route) => {
    assetReads += 1;
    return route.fulfill(assetReads === 1 ? { json: { assets: [asset] } } : {
      status: 429, json: { error: { code: "rate_limited", message: privateMessage } }
    });
  });
  await page.route("**/api/sites/site-1/assets/migrate", (route) => route.fulfill({
    status: 500, json: { error: { code: "private_code", message: privateMessage, details: { assetId: asset.id } } }
  }));
  await page.route("**/api/sites/site-1/assets/unused-asset", (route) => route.fulfill({
    status: 500, json: { error: { code: "private_code", message: privateMessage } }
  }));
  await openEditor(page);
  await page.getByRole("button", { name: "轉為私有素材" }).click();
  const notice = page.locator(".editor-message[role='alert']");
  await expect(notice).toContainText("素材遷移失敗（作者圖片）");
  await expect(notice).not.toContainText(privateMessage);
  await switchToEnglish(page);
  await expect(notice).toContainText("Asset migration failed (作者圖片)");
  const inventory = page.getByRole("dialog", { name: "Legacy asset migration details" });
  await inventory.getByRole("button", { name: "Re-scan" }).click();
  await expect(notice).toContainText("Too many requests. Please wait and try again.");
  page.once("dialog", (dialog) => void dialog.accept());
  await inventory.getByRole("button", { name: "Delete unused asset" }).click();
  await expect(notice).toContainText("Failed to delete the asset");
  await expect(notice).not.toContainText(privateMessage);
});

test("sync retry failure uses a safe fallback without removing the retry action", async ({ page }) => {
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/publish", (route) => route.fulfill({ json: {
    publishedVersion: 3, publishedAt: "2026-10-17T00:00:00Z", url: "/@demo", artifactStatus: "failed", retryable: true
  } }));
  await page.route("**/api/sites/site-1/publish/retry", (route) => route.fulfill({
    status: 500, json: { error: { code: "private_code", message: privateMessage } }
  }));
  await openEditor(page);
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop" }).getByRole("button", { name: "確認發布" }).click();
  const success = page.getByRole("dialog", { name: "發布完成" });
  await success.getByRole("button", { name: "重試同步" }).click();
  const notice = page.locator(".editor-message[role='alert']");
  await expect(notice).toContainText("同步重試失敗");
  await expect(notice).not.toContainText(privateMessage);
  await switchToEnglish(page);
  await expect(notice).toContainText("Sync retry failed");
  await expect(page.getByRole("dialog", { name: "Published" }).getByRole("button", { name: "Retry sync" })).toBeEnabled();
});
