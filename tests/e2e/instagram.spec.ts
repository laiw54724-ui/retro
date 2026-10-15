import { expect, test, type Page } from "@playwright/test";
import { igDocument } from "./ig-fixture";

async function openEditor(page: Page, profile: Record<string, unknown> = {}) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: igDocument(profile), draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  const saves: Array<{ document: {
    schemaVersion: number;
    windows: Array<{ content: { skin?: string } }>;
    entities?: { profiles: Array<{ handle?: string; username: string }> };
  } }> = [];
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saves.push(route.request().postDataJSON()); return route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/editor/site-1");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await expect(win).toBeVisible();
  return { win, saves };
}

test("edit tab changes the profile and the preview tab reflects it", async ({ page }) => {
  const { win, saves } = await openEditor(page);
  await expect(win.getByRole("tab", { name: "✎ 編輯內容" })).toHaveAttribute("aria-selected", "true");
  await win.getByLabel("帳號", { exact: true }).fill("newname");
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("newname");
  await expect.poll(() => saves.at(-1)?.document.entities?.profiles[0]?.handle).toBe("newname");
});

test("preview: navigation, follow, double-tap like, carousel, comment, save, stories and menu", async ({ page }) => {
  const { win } = await openEditor(page);
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();

  // follow bumps the follower count
  await expect(win.locator(".ig-counts3")).toContainText("100");
  await win.getByRole("button", { name: "+ Follow" }).click();
  await expect(win.locator(".ig-counts3")).toContainText("101");
  await expect(win.getByRole("button", { name: "✓ Following" })).toBeVisible();

  // home feed
  await win.getByRole("button", { name: "首頁" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("Instagram");
  const first = win.locator(".ig-card").first();

  // carousel
  await expect(first.locator(".ig-count")).toHaveText("1/3");
  await first.getByRole("button", { name: "下一張" }).click();
  await expect(first.locator(".ig-count")).toHaveText("2/3");

  // double-tap like increments count
  await expect(first.getByText("10 個讚")).toBeVisible();
  await first.locator(".ig-media").dblclick();
  await expect(first.getByText("11 個讚")).toBeVisible();

  // comment as visitor
  await first.getByRole("button", { name: "留言" }).click();
  await first.getByPlaceholder("以訪客身分留言……").fill("hello world");
  await first.getByRole("button", { name: "發佈" }).click();
  await expect(first.getByText("hello world")).toBeVisible();
  await expect(first.getByText("你（訪客）")).toBeVisible();

  // save → saved screen
  await first.getByRole("button", { name: "收藏" }).click();
  await win.getByRole("button", { name: "已收藏" }).first().click();
  await expect(win.locator(".ig-title strong")).toHaveText("已收藏");
  await expect(win.locator(".ig-cell")).toHaveCount(1);

  // explore search
  await win.getByRole("button", { name: "探索" }).click();
  await win.getByLabel("搜尋貼文").fill("sunset");
  await expect(win.locator(".ig-cell")).toHaveCount(1);
  await win.getByLabel("搜尋貼文").fill("zzzz");
  await expect(win.getByText("找不到相符的貼文")).toBeVisible();

  // menu on a post
  await win.getByRole("button", { name: "首頁" }).click();
  await win.locator(".ig-card").first().getByRole("button", { name: "更多選項" }).click();
  await expect(win.getByRole("menu")).toBeVisible();
  await win.getByRole("menuitem", { name: "取消", exact: true }).click();
  await expect(win.getByRole("menu")).toBeHidden();

  // stories
  await win.getByRole("button", { name: "個人" }).click();
  await win.getByRole("button", { name: "觀看精選動態" }).click();
  const story = win.getByRole("dialog", { name: "精選動態" });
  await expect(story).toBeVisible();
  await expect(story.locator(".ig-story-title")).toHaveText("Trip");
  await story.getByRole("button", { name: "下一則" }).click();
  await expect(story.locator(".ig-story-title")).toHaveText("Food");
  await story.getByRole("button", { name: "關閉" }).click();
  await expect(story).toBeHidden();
});

test("turning off comments and likes hides those controls for visitors", async ({ page }) => {
  const { win } = await openEditor(page, { allowComments: false, allowLikes: false });
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();
  await win.getByRole("button", { name: "首頁" }).click();
  const first = win.locator(".ig-card").first();
  await expect(first.getByRole("button", { name: "留言" })).toHaveCount(0);
  await expect(first.getByRole("button", { name: "讚" })).toHaveCount(0);
  await expect(first.getByText("nice")).toHaveCount(0);
  await first.locator(".ig-media").dblclick();
  await expect(first.getByText("10 個讚")).toBeVisible();
});

test("desktop Instagram window owns wheel and keyboard scrolling", async ({ page }) => {
  const { win } = await openEditor(page);
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();
  await win.getByRole("button", { name: "首頁" }).click();

  const scroll = win.locator(".ig-scroll");
  await expect.poll(() => scroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await scroll.hover();
  await page.mouse.wheel(0, 480);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await scroll.evaluate((node) => { node.scrollTop = 0; });
  await scroll.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await win.getByRole("button", { name: "已收藏" }).click();
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBe(0);
});

test("Win98 keeps window chrome square and OC media circular", async ({ page }) => {
  const { win } = await openEditor(page);
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();
  await expect(win.locator(".ig-app")).toHaveClass(/ig-skin-win98/);

  await expect(win.locator(".ig-avatar").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".ig-avatar-ring").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".ig-hl-ring").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".ig-hl-in").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".retro-titlebar")).toHaveCSS("border-radius", "0px");
});

test("legacy Instagram defaults to Win98 and can switch to Modern", async ({ page }) => {
  const { win, saves } = await openEditor(page);
  await expect(win.getByRole("button", { name: "Win98" })).toHaveAttribute("aria-pressed", "true");
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();
  await expect(win.locator(".ig-app")).toHaveClass(/ig-skin-win98/);
  await expect(win.locator(".ig-title strong")).toHaveCSS("font-family", /Cubic 11/);

  await win.getByRole("button", { name: "現代" }).click();
  await expect(win.locator(".ig-app")).toHaveClass(/ig-skin-modern/);
  await expect.poll(() => saves.at(-1)?.document.windows[0]?.content.skin).toBe("modern");
});
