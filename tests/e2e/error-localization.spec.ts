import { expect, test, type Page } from "@playwright/test";
import { migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const rawMessage = "private server detail: db.internal/table";
const session = {
  access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800,
  expires_in: 3600, token_type: "bearer",
  user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" }
};

test.use({ locale: "zh-TW" });

async function openEditor(page: Page) {
  const migrated = migrateSiteDocumentV2(documentFixture, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Fixture migration failed");
  const site = {
    id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: migrated.document,
    draft_version: 2, published_document: null, published_version: null, published_at: null,
    updated_at: "2026-10-17T00:00:00Z", access_role: "owner"
  };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.goto("/editor/site-1");
  await expect(page.getByLabel("視窗標題")).toBeVisible();
}

test("save errors use stable codes, change language, and retain the edited draft", async ({ page }) => {
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({
    status: 429, json: { error: { code: "rate_limited", message: rawMessage } }
  }));
  await openEditor(page);
  const title = page.getByLabel("視窗標題");
  await title.fill("My untranslated title");
  const alert = page.locator(".editor-message[role='alert']");
  await expect(alert).toContainText("操作太頻繁，請稍候再試。");
  await expect(alert).not.toContainText(rawMessage);
  await page.locator(".editor-topbar").getByTestId("language-switcher").selectOption("en");
  await expect(alert).toContainText("Too many requests. Please wait and try again.");
  await expect(page.getByLabel("Window title")).toHaveValue("My untranslated title");
  // Retry belongs to the save controls in the top bar, not the error notice.
  await expect(page.locator(".editor-topbar").getByRole("button", { name: "Retry save" })).toBeVisible();
});

test("publish unknown errors use a safe fallback and keep the publish action available", async ({ page }) => {
  await page.route("**/api/sites/site-1/publish", (route) => route.fulfill({
    status: 500, json: { error: { code: "private_database_code", message: rawMessage } }
  }));
  await openEditor(page);
  await page.getByRole("button", { name: "發布", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "發布 Retro Desktop" });
  await dialog.getByRole("button", { name: "確認發布" }).click();
  const alert = page.locator(".editor-message[role='alert']");
  await expect(alert).toContainText("發布失敗");
  await expect(alert).not.toContainText(rawMessage);
  await page.locator(".editor-topbar").getByTestId("language-switcher").selectOption("en");
  await expect(alert).toContainText("Publishing failed");
  await expect(page.getByRole("dialog", { name: "Publish Retro Desktop" }).getByRole("button", { name: "Confirm and publish" })).toBeEnabled();
});

test("publish conflicts keep the local-draft recovery actions", async ({ page }) => {
  await page.route("**/api/sites/site-1/publish", (route) => route.fulfill({
    status: 409, json: { error: { code: "version_conflict", message: rawMessage } }
  }));
  await openEditor(page);
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop" }).getByRole("button", { name: "確認發布" }).click();
  const conflict = page.getByRole("alertdialog", { name: "版本衝突" });
  await expect(conflict).toBeVisible();
  await expect(conflict).not.toContainText(rawMessage);
  await expect(conflict.getByRole("button", { name: "複製本機 JSON" })).toBeVisible();
  await expect(conflict.getByRole("button", { name: "重新載入雲端版本" })).toBeVisible();
});

test("collaboration errors translate without clearing the invitation address", async ({ page }) => {
  await page.route("**/api/sites/site-1/members", (route) => route.fulfill({ json: { members: [] } }));
  await page.route("**/api/sites/site-1/invites", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 429, json: { error: { code: "rate_limited", message: rawMessage } } })
    : route.fulfill({ json: { invites: [] } }));
  await openEditor(page);
  await page.getByRole("button", { name: "協作者" }).click();
  const dialog = page.getByRole("dialog", { name: "協作者" });
  const email = dialog.getByLabel("邀請電子郵件");
  await email.fill("friend@example.com");
  await dialog.getByRole("button", { name: "建立邀請" }).click();
  await expect(dialog.getByRole("alert")).toContainText("操作太頻繁，請稍候再試。");
  await expect(dialog.getByRole("alert")).not.toContainText(rawMessage);
  await page.locator(".editor-topbar").getByTestId("language-switcher").selectOption("en");
  const englishDialog = page.getByRole("dialog", { name: "Collaborators" });
  await expect(englishDialog.getByRole("alert")).toContainText("Too many requests. Please wait and try again.");
  await expect(englishDialog.getByLabel("Invitation email")).toHaveValue("friend@example.com");
});
