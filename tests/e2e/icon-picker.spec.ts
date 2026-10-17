import { expect, test, type Page } from "@playwright/test";
import { documentFixture, mockWindowsIconPack } from "./fixture";

async function openIconTab(page: Page, assets: Array<{ id: string; url: string; mimeType: string; size: number; kind: string; name: string; createdAt: string }> = []) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  await page.getByRole("tab", { name: "圖示" }).click();
  return page.locator(".icon-picker");
}

const mine = [{ id: "11111111-1111-4111-8111-111111111111", url: "https://img.test/mine.png", mimeType: "image/png", size: 10, kind: "icon", name: "my-star", createdAt: "2026-10-17T00:00:00Z" }];

test("without the Windows pack the main area shows built-in and my icons first; command and licence text stay in a collapsed help", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const picker = await openIconTab(page, mine);

  // clear, default content
  await expect(picker.getByRole("region", { name: "內建圖示" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "圖示 camera" })).toBeVisible();
  const mineSection = picker.getByRole("region", { name: "我的圖示" });
  await expect(mineSection).toBeVisible();
  await expect(mineSection.getByRole("button", { name: "my-star", exact: true })).toBeVisible();
  await expect(mineSection.getByText("上傳單張…")).toBeVisible();
  await expect(picker.getByLabel("搜尋 Windows 圖示")).toHaveCount(0);

  // nothing about commands or licences in the working area until the help is opened
  const help = picker.locator("details.icon-help");
  await expect(help).not.toHaveAttribute("open", "");
  await expect(picker.getByText("pnpm icons:install")).toBeHidden();
  await expect(picker.getByText("不代表取得公開使用權")).toBeHidden();
  await expect(help.locator("summary")).toContainText("未安裝 Windows 可選圖示包");

  // order: built-in, mine, then the help footer
  const order = await picker.evaluate((node) => [...node.children].map((child) => (child as HTMLElement).getAttribute("aria-label") ?? child.className));
  expect(order.indexOf("內建圖示")).toBeLessThan(order.indexOf("我的圖示"));
  expect(order.indexOf("我的圖示")).toBeLessThan(order.findIndex((entry) => entry.includes("icon-help")));

  await help.locator("summary").click();
  await expect(picker.getByText("pnpm icons:install -- --acknowledge-third-party-rights")).toBeVisible();
  await expect(picker.getByText("不代表取得公開使用權")).toBeVisible();
  await expect(picker.getByText("Retro 也不會自動下載或安裝")).toBeVisible();

  // the picker never tries to fetch or install the pack by itself
  expect(requests.filter((url) => /github\.com|raw\.githubusercontent|\/windows-icons\/(?!\.retro-icon-pack\.json)/.test(url))).toEqual([]);
});

test("selecting a built-in or my icon works and marks exactly one pressed", async ({ page }) => {
  const picker = await openIconTab(page, mine);
  await picker.getByRole("button", { name: "圖示 camera" }).click();
  await expect(picker.getByRole("button", { pressed: true })).toHaveCount(1);
  await expect(picker.getByRole("button", { name: "圖示 camera" })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "my-star", exact: true }).click();
  await expect(picker.getByRole("button", { name: "my-star", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { pressed: true })).toHaveCount(1);
});

test("with the pack installed the Windows icons come after my icons, with a compact attribution and the help still collapsed", async ({ page }) => {
  await mockWindowsIconPack(page);
  const picker = await openIconTab(page, mine);
  await expect(picker.getByLabel("搜尋 Windows 圖示")).toBeVisible();
  await expect(picker.getByText("Windows 精選")).toBeVisible();
  await expect(picker.locator(".icon-attribution")).toContainText("來源：trapd00r/win95-winxp_icons");
  await expect(picker.locator(".icon-attribution")).toContainText("權利屬各原權利人");
  const help = picker.locator("details.icon-help");
  await expect(help).not.toHaveAttribute("open", "");
  await expect(help.locator("summary")).toHaveText("Windows 圖示包說明");
  const order = await picker.evaluate((node) => [...node.children].map((child) => (child as HTMLElement).getAttribute("aria-label") ?? child.className));
  expect(order.indexOf("我的圖示")).toBeLessThan(order.indexOf("Windows 圖示"));
  await help.locator("summary").click();
  // installed: no "not installed" instruction, but the rights warning remains
  await expect(picker.getByText("pnpm icons:install")).toHaveCount(0);
  await expect(picker.getByText("不代表取得公開使用權")).toBeVisible();
});
