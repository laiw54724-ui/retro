import { expect, test, type Page } from "@playwright/test";

const session = {
  access_token: "a.b.c",
  refresh_token: "r",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "member-1", email: "member@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" }
};

const sites = [
  { id: "owned", username: "beibei", site_name: "Owned Desk", draft_version: 4, published_version: 3, published_at: "2026-10-16T09:00:00.000Z", updated_at: "2026-10-17T01:00:00.000Z", access_role: "owner" },
  { id: "shared", username: "oc-world", site_name: "Shared Desk", draft_version: 8, published_version: 6, published_at: "2026-10-15T09:00:00.000Z", updated_at: "2026-10-16T01:00:00.000Z", access_role: "editor" },
  { id: "viewer", username: "read-only", site_name: "Read Only Desk", draft_version: 2, published_version: null, published_at: null, updated_at: "2026-10-15T01:00:00.000Z", access_role: "viewer" }
];

async function signIn(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
}

test("authenticated users choose among owned and shared desktops", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/sites", (route) => route.fulfill({ json: { sites } }));

  await page.goto("/auth");

  await expect(page.getByRole("heading", { name: "我的桌面" })).toBeVisible();
  await expect(page.getByText("3 個桌面")).toBeVisible();
  await expect(page.getByRole("link", { name: /編輯 Owned Desk/ })).toHaveAttribute("href", "/editor/owned");
  await expect(page.getByRole("link", { name: /協作編輯 Shared Desk/ })).toHaveAttribute("href", "/editor/shared");
  await expect(page.getByRole("link", { name: /查看私人草稿 Read Only Desk/ })).toHaveAttribute("href", "/editor/viewer");
  await expect(page.getByText("擁有者", { exact: true })).toBeVisible();
  await expect(page.getByText("可編輯", { exact: true })).toBeVisible();
  await expect(page.getByText("只能查看", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "新增桌面" })).toHaveAttribute("href", "/onboarding");
});

test("empty inventory offers the first desktop action", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/sites", (route) => route.fulfill({ json: { sites: [] } }));
  await page.goto("/auth");

  await expect(page.getByRole("heading", { name: "我的桌面" })).toBeVisible();
  await expect(page.getByText("還沒有桌面")).toBeVisible();
  await expect(page.getByRole("link", { name: "建立第一個桌面" })).toHaveAttribute("href", "/onboarding");
});

test("inventory failure can be retried without signing out", async ({ page }) => {
  await signIn(page);
  let attempts = 0;
  await page.route("**/api/sites", (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 500, json: { error: { code: "db_error", message: "Could not load sites" } } });
    return route.fulfill({ json: { sites: [sites[0]] } });
  });
  await page.goto("/auth");

  await expect(page.getByRole("alert")).toContainText("Could not load sites");
  await page.getByRole("button", { name: "重試" }).click();
  await expect(page.getByRole("link", { name: /編輯 Owned Desk/ })).toBeVisible();
  await expect(page.getByText("member@example.com")).toBeVisible();
});

test("desktop hub fits a 320px viewport", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route("**/api/sites", (route) => route.fulfill({ json: { sites } }));
  await page.goto("/auth");

  await expect(page.getByRole("heading", { name: "我的桌面" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const add = page.getByRole("link", { name: "新增桌面" });
  expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
