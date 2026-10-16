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

test("editor can save drafts but cannot publish, migrate, or manage collaborators", async ({ page }) => {
  await signIn(page);
  const saves: unknown[] = [];
  const site = { id: "site-editor", username: "shared", site_name: "Shared Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-16T00:00:00.000Z", access_role: "editor" };
  await page.route("**/api/sites/site-editor", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-editor/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-editor/draft", (route) => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { version: saves.length + 1, updatedAt: "2026-10-16T00:01:00.000Z" } });
  });

  await page.goto("/editor/site-editor");
  await expect(page.getByText("編輯者 · 只有擁有者可以發布")).toBeVisible();
  await page.getByLabel("視窗標題").fill("Shared About");
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "發布", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "協作者" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /轉為私有/ })).toHaveCount(0);
});

test("editor exits authoring after access is removed on the next save", async ({ page }) => {
  await signIn(page);
  const site = { id: "site-removed", username: "removed", site_name: "Removed Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-16T00:00:00.000Z", access_role: "editor" };
  await page.route("**/api/sites/site-removed", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-removed/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-removed/draft", (route) => route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Site not found" } } }));

  await page.goto("/editor/site-removed");
  await page.getByLabel("視窗標題").fill("This will not save");
  await expect(page).toHaveURL(/\/auth\?notice=/);
  await expect(page.getByRole("status")).toContainText("你已失去這個桌面的編輯權限");
  await expect(page.getByRole("button", { name: "前往我的桌面" })).toBeVisible();
});

test("owner creates and revokes invitations, then updates and removes a member", async ({ page, context }) => {
  await signIn(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const site = { id: "site-owner", username: "owned", site_name: "Owned Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-16T00:00:00.000Z", access_role: "owner" };
  let members = [{ user_id: "user-2", email: "friend@example.com", role: "editor", created_at: "2026-10-16T00:00:00.000Z", updated_at: "2026-10-16T00:00:00.000Z" }];
  let invites = [{ id: "invite-1", email: "pending@example.com", role: "viewer", expires_at: "2099-10-17T00:00:00.000Z", accepted_at: null, revoked_at: null, created_at: "2026-10-16T00:00:00.000Z" }];
  const createdToken = "b".repeat(43);
  await page.route("**/api/sites/site-owner", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-owner/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-owner/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-16T00:01:00.000Z" } }));
  await page.route("**/api/sites/site-owner/members/**", (route) => {
    if (route.request().method() === "PUT") members = members.map((member) => ({ ...member, role: route.request().postDataJSON().role }));
    if (route.request().method() === "DELETE") members = [];
    return route.fulfill({ status: route.request().method() === "DELETE" ? 204 : 200, body: route.request().method() === "DELETE" ? "" : JSON.stringify({ ok: true }), contentType: "application/json" });
  });
  await page.route("**/api/sites/site-owner/members", (route) => route.fulfill({ json: { members } }));
  await page.route("**/api/sites/site-owner/invites/invite-1", (route) => {
    invites = invites.map((invite) => invite.id === "invite-1" ? { ...invite, revoked_at: "2026-10-16T01:00:00.000Z" } : invite);
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/sites/site-owner/invites", (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      const invite = { id: "invite-2", site_id: "site-owner", email: input.email, role: input.role, expires_at: "2099-10-18T00:00:00.000Z", created_at: "2026-10-16T01:00:00.000Z" };
      invites = [{ ...invite, accepted_at: null, revoked_at: null }, ...invites];
      return route.fulfill({ status: 201, json: { invite, token: createdToken } });
    }
    return route.fulfill({ json: { invites } });
  });

  await page.goto("/editor/site-owner");
  const opener = page.getByRole("button", { name: "協作者" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "協作者" });
  await expect(dialog.getByText("friend@example.com", { exact: true })).toBeVisible();
  await expect(dialog.getByText("pending@example.com", { exact: true })).toBeVisible();

  await dialog.getByLabel("邀請電子郵件").fill("new@example.com");
  await dialog.getByRole("button", { name: "建立邀請" }).click();
  const link = dialog.getByLabel("一次性邀請連結");
  await expect(link).toHaveValue(new RegExp(`/invite#token=${createdToken}$`));
  await dialog.getByRole("button", { name: "複製邀請連結" }).click();
  await expect(dialog.getByRole("status")).toContainText("已複製");

  await dialog.getByRole("button", { name: "撤銷 pending@example.com 的邀請" }).click();
  await expect(dialog.locator(".invite-list li").filter({ hasText: "pending@example.com" }).getByText("已撤銷", { exact: true })).toBeVisible();
  await dialog.getByLabel("friend@example.com 的權限").selectOption("viewer");
  await expect(dialog.getByLabel("friend@example.com 的權限")).toHaveValue("viewer");
  await dialog.getByRole("button", { name: "移除 friend@example.com" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "移除協作者" });
  await confirmation.getByRole("button", { name: "確認移除" }).click();
  await expect(dialog.getByText("目前只有你可以存取這個桌面")).toBeVisible();

  await dialog.getByRole("button", { name: "關閉協作者" }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("collaboration manager remains usable at 320px", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 640 });
  const site = { id: "site-mobile-owner", username: "owned", site_name: "Owned Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-16T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-mobile-owner", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-mobile-owner/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-mobile-owner/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-16T00:01:00.000Z" } }));
  await page.route("**/api/sites/site-mobile-owner/members", (route) => route.fulfill({ json: { members: [] } }));
  await page.route("**/api/sites/site-mobile-owner/invites", (route) => route.fulfill({ json: { invites: [] } }));
  await page.goto("/editor/site-mobile-owner");
  await page.getByRole("button", { name: "協作者" }).click();
  await expect(page.getByRole("dialog", { name: "協作者" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
