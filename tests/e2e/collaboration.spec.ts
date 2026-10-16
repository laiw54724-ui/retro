import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

const token = "a".repeat(43);
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "member-1", email: "member@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function signIn(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
}

test("invite fragment is captured, removed, and preserved through Google OAuth", async ({ page }) => {
  let authorizeUrl = "";
  await page.route("**/auth/v1/authorize**", async (route) => {
    authorizeUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html>ok</html>" });
  });

  await page.goto(`/invite#token=${token}`);
  await expect(page).toHaveURL(/\/invite$/);
  expect(await page.evaluate(() => sessionStorage.getItem("retrodesk.pending-invite"))).toBe(token);
  const inviteUrl = page.url();
  await page.getByRole("button", { name: "使用 Google 登入並繼續" }).click();
  await expect.poll(() => authorizeUrl).not.toBe("");
  expect(new URL(authorizeUrl).searchParams.get("redirect_to")).toBe(inviteUrl);
});

test("signed-in recipient explicitly accepts then opens the shared site", async ({ page }) => {
  await signIn(page);
  let postedToken = "";
  await page.route("**/api/invites/accept", async (route) => {
    postedToken = route.request().postDataJSON().token;
    await route.fulfill({ json: { membership: { site_id: "site-shared", role: "editor" } } });
  });

  await page.goto(`/invite#token=${token}`);
  await expect(page.getByText("目前登入：")).toContainText("member@example.com");
  await page.getByRole("button", { name: "接受邀請" }).click();
  await expect(page.getByText("邀請已接受，現在可以開啟共享桌面。")).toBeVisible();
  expect(postedToken).toBe(token);
  expect(await page.evaluate(() => sessionStorage.getItem("retrodesk.pending-invite"))).toBeNull();
});

test("terminal invite failure clears the secret and explains account mismatch", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/invites/accept", (route) => route.fulfill({
    status: 403,
    json: { error: { code: "invite_email_mismatch", message: "Sign in with the email address that received this invitation" } }
  }));

  await page.goto(`/invite#token=${token}`);
  await page.getByRole("button", { name: "接受邀請" }).click();
  await expect(page.getByRole("alert")).toContainText("目前登入的 Google 帳號不是收到邀請的帳號");
  expect(await page.evaluate(() => sessionStorage.getItem("retrodesk.pending-invite"))).toBeNull();
  await expect(page.getByRole("button", { name: "重試接受" })).toHaveCount(0);
});

test("invite states fit a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/invite#token=${token}`);
  await expect(page.getByRole("button", { name: "使用 Google 登入並繼續" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("viewer opens a private draft reader without mounting authoring behavior", async ({ page }) => {
  await signIn(page);
  let draftWrites = 0;
  const site = { id: "site-viewer", username: "private", site_name: "Private Desk", draft_document: documentFixture, draft_version: 4, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-16T00:00:00.000Z", access_role: "viewer" };
  await page.route("**/api/sites/site-viewer", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-viewer/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-viewer/draft", (route) => { draftWrites += 1; return route.fulfill({ status: 403, json: { error: { code: "forbidden", message: "forbidden" } } }); });

  await page.goto("/editor/site-viewer");
  await expect(page.getByText("私人草稿 · 只能查看")).toBeVisible();
  await expect(page.getByRole("button", { name: "桌面版" })).toBeVisible();
  await page.getByRole("button", { name: "手機版" }).click();
  await expect(page.locator(".draft-viewer-phone .m-screen")).toBeVisible();
  await expect(page.getByRole("button", { name: "發布", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "協作者" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "主題" })).toHaveCount(0);
  expect(draftWrites).toBe(0);
});
