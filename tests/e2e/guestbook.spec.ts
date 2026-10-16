import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const entryId = "11111111-1111-4111-8111-111111111111";

function guestbookDocument() {
  const guestbook = makeWindow("guestbook");
  guestbook.id = "guestbook";
  guestbook.title = "Guestbook.exe";
  guestbook.defaultOpen = true;
  guestbook.content.enabled = true;
  guestbook.layout.desktop = { ...guestbook.layout.desktop, x: 80, y: 40, w: 500, h: 600, z: 2 };
  return { ...structuredClone(documentFixture), windows: [guestbook] } as SiteDocument;
}

async function mockPublic(page: Page) {
  const document = guestbookDocument();
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  let submissions = 0;
  await page.route("**/api/public/sites/demo/guestbook", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { entries: [{ id: entryId, displayName: "Alice", body: "<script>只是文字</script>", status: "approved", createdAt: "2026-10-17T00:00:00.000Z" }] } });
    submissions += 1;
    if (submissions === 1) return route.fulfill({ status: 429, json: { error: { code: "rate_limited", message: "Too many" } } });
    const input = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { entry: { id: "pending", displayName: input.displayName, body: input.body, status: "pending", createdAt: "2026-10-17T00:01:00.000Z" } } });
  });
  return () => submissions;
}

test("visitor sees approved plain text and retry preserves a failed submission", async ({ page }) => {
  const submissions = await mockPublic(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo");
  const dialog = page.locator(".visitor-desktop").getByRole("dialog", { name: "Guestbook.exe" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("<script>只是文字</script>");
  await expect(dialog.locator("script")).toHaveCount(0);
  const name = dialog.getByRole("textbox", { name: "暱稱（不驗證身分）" });
  const body = dialog.getByRole("textbox", { name: "留言", exact: true });
  await name.fill("被被子");
  await body.fill("我的原創角色很好看");
  await dialog.getByRole("button", { name: "送出審核" }).click();
  await expect(dialog.getByRole("status")).toContainText("內容已保留");
  await expect(name).toHaveValue("被被子");
  await expect(body).toHaveValue("我的原創角色很好看");
  await dialog.getByRole("button", { name: "送出審核" }).click();
  await expect(dialog.getByRole("status")).toContainText("已送出待審");
  await expect(name).toHaveValue("");
  await expect(body).toHaveValue("");
  expect(submissions()).toBe(2);
});

test("guestbook remains usable without horizontal overflow on mobile", async ({ page }) => {
  await mockPublic(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "Guestbook.exe" }).click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Guestbook.exe" });
  await expect(dialog.getByText("Alice", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "送出審核" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("owner can enable submissions and operate the moderation queue", async ({ page }) => {
  const document = guestbookDocument();
  const guestbook = document.windows[0];
  if (guestbook.type !== "guestbook") throw new Error("guestbook fixture mismatch");
  guestbook.content.enabled = false;
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: document, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  const saves: any[] = [];
  let approvals = 0;
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saves.push(route.request().postDataJSON()); return route.fulfill({ json: { version: 2, updatedAt: "2026-10-17T00:01:00.000Z" } }); });
  await page.route("**/api/sites/site-1/guestbook", (route) => route.fulfill({ json: { entries: [{ id: entryId, displayName: "待審訪客", body: "請審核", status: "pending", createdAt: "2026-10-17T00:00:00.000Z", openReportCount: 1 }] } }));
  await page.route(`**/api/sites/site-1/guestbook/${entryId}`, (route) => { approvals += 1; return route.fulfill({ json: { entry: { id: entryId, displayName: "待審訪客", body: "請審核", status: "approved", createdAt: "2026-10-17T00:00:00.000Z" } } }); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const dialog = page.getByRole("dialog", { name: "Guestbook.exe" });
  await dialog.getByRole("checkbox", { name: "允許訪客送出待審留言" }).check();
  await expect.poll(() => saves.at(-1)?.document.windows.find((window: any) => window.type === "guestbook")?.content.enabled).toBe(true);
  await dialog.getByRole("button", { name: "核准" }).click();
  await expect.poll(() => approvals).toBe(1);
});
