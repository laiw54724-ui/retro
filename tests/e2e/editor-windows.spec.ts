import { expect, test } from "@playwright/test";
import { migrateSiteDocumentV2 } from "../../packages/shared/src/site-versioning";
import { documentFixture } from "./fixture";

test("editor window controls minimize, close, maximize and restore without changing the document", async ({ page }) => {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  // Start with canonical v2 and the selected window already on top. Migration
  // and intentional editor z-order saves are not window-control mutations.
  const document = structuredClone(documentFixture);
  document.windows[0].layout.desktop.z = Math.max(...document.windows.map((window) => window.layout.desktop.z)) + 1;
  const migrated = migrateSiteDocumentV2(document, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("Window-control fixture migration failed");
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: migrated.document, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  let writes = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/sites/site-1") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes++;
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-17T00:00:00Z" } }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/editor/site-1");

  const dialog = page.getByRole("dialog", { name: "About.exe" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".taskbar-clock")).toHaveText(/^\d{2}:\d{2}$/);

  await dialog.getByRole("button", { name: "最小化" }).click();
  await expect(dialog).toBeHidden();
  await page.locator(".taskbar2").getByRole("button", { name: "About.exe" }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "最大化" }).click();
  await expect(dialog.getByRole("button", { name: "還原" })).toBeVisible();
  await dialog.getByRole("button", { name: "還原" }).click();

  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toBeHidden();
  await page.locator(".deskicon").filter({ hasText: "About.exe" }).click();
  await expect(dialog).toBeVisible();

  await page.waitForTimeout(1500);
  expect(writes).toBe(0);
});
