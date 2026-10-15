import { expect, test } from "@playwright/test";
import { documentFixture } from "./fixture";

test("editor window controls minimize, close, maximize and restore without changing the document", async ({ page }) => {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  let writes = 0;
  await page.route("**/api/sites/site-1", async (route) => {
    if (route.request().method() !== "GET") writes++;
    await route.fulfill({ json: { site } });
  });
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
