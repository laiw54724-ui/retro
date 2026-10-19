import { expect, test, type Page } from "@playwright/test";
import { duplicateProfile, migrateSiteDocumentV2, type SiteDocumentV2Input } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

async function openEditor(page: Page, width = 1400) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const duplicated = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: "site-1", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("duplicate fixture");
  let saved: SiteDocumentV2Input = duplicated.document;
  saved.entities.profiles[0].customFields = [{ key: "Role", value: "Writer" }];
  saved.entities.profiles[0].worldTags = ["First"];
  saved.entities.profiles[0].otherFollowerCount = 12;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  let saves = 0;
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "D", draft_document: saved, draft_version: saves + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; saves++; return route.fulfill({ json: { version: saves + 1, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯此視窗" }).click(); }
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  return { win, saved: () => saved, profile: () => saved.entities.profiles[0], saves: () => saves };
}


for (const width of [1400, 320, 390, 430]) test(`list-first posts, focused editing and preview return at ${width}px`, async ({ page }, testInfo) => {
  const s = await openEditor(page, width); const { win } = s;
  const initial = structuredClone(s.saved());
  await expect(win.getByRole("combobox", { name: "此視窗入口角色", exact: true })).toBeVisible();
  await win.getByRole("tab", { name: "貼文", exact: true }).click();
  const posts = win.locator(".ig-canonical-posts");
  const first = posts.locator('[data-ig-edit]').first();
  await expect(first).toBeInViewport();
  await expect(posts.getByRole("button", { name: "新增貼文", exact: true })).toBeVisible();
  await expect(posts.getByRole("combobox", { name: "依狀態篩選貼文" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`posts-list-${width}.png`) });
  await first.click();
  await expect(posts.getByRole("button", { name: "← 返回貼文", exact: true })).toBeFocused();
  await expect(posts.locator("article:visible")).toHaveCount(1);
  await expect(posts.getByLabel("標題", { exact: true })).toBeVisible();
  const url = posts.getByRole("textbox", { name: "圖片 1 網址", exact: true });
  await url.fill("https:"); await url.press("Enter");
  await expect(url).toHaveAttribute("aria-invalid", "true");
  const scroll = win.locator(".ig-edit-scroll");
  const before = await scroll.evaluate((node) => node.scrollTop);
  await win.getByRole("tab", { name: "▶ 預覽互動", exact: true }).click();
  await win.getByRole("button", { name: "← 返回編輯", exact: true }).click();
  await expect(url).toHaveValue("https:"); await expect(url).toBeFocused();
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(before);
  await posts.getByRole("button", { name: "← 返回貼文", exact: true }).click();
  await expect(first).toBeFocused(); await first.click();
  await expect(url).toHaveValue("https:");
  await page.screenshot({ path: testInfo.outputPath(`post-editor-${width}.png`) });
  expect(s.saved()).toEqual(initial); expect(s.saves()).toBe(0);
  expect(await page.evaluate(async () => {
    const path = "/src/features/editor/store.ts";
    const { useEditorStore } = await import(path);
    return useEditorStore.getState().past.length;
  })).toBe(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Done editing retains invalid identity input, cancellation is explicit, reload starts clean", async ({ page }, testInfo) => {
  const s = await openEditor(page, 390); const { win } = s;
  const handle = win.getByRole("textbox", { name: "Handle", exact: true });
  await handle.fill(""); await handle.press("Enter");
  await expect(handle).toHaveAttribute("aria-invalid", "true");
  await win.getByRole("button", { name: "完成編輯", exact: true }).click();
  await win.getByRole("button", { name: "編輯此視窗", exact: true }).click();
  await expect(handle).toHaveValue(""); await expect(handle).toHaveAttribute("aria-invalid", "true");
  expect(s.profile().handle).toBe("retro"); expect(s.saves()).toBe(0);
  await expect(win.locator("[data-ig-pending-drafts]")).toContainText("尚未儲存");
  await page.screenshot({ path: testInfo.outputPath("retained-draft-390.png") });
  await win.getByRole("button", { name: "取消編輯Handle", exact: true }).click();
  await expect(handle).toHaveValue("retro");
  await expect(win.locator("[data-ig-pending-drafts]")).toBeHidden();
  await handle.fill("other"); await handle.press("Enter");
  await win.getByRole("button", { name: "完成編輯", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯此視窗" }).click();
  await expect(handle).toHaveValue("retro");
});

test("highlights and collections retain task selection, search and unfinished URL across the two-way switch", async ({ page }, testInfo) => {
  const s = await openEditor(page, 320); const { win } = s;
  await win.getByRole("tab", { name: "精選／合集", exact: true }).click();
  const highlights = win.locator(".ig-canonical-highlights");
  const collections = win.locator(".ig-canonical-collections");
  await expect(highlights).toBeVisible(); await expect(collections).toBeHidden();
  const search = highlights.getByRole("searchbox"); await search.fill("Trip");
  await highlights.locator('[data-ig-edit]').first().click();
  const url = highlights.getByRole("textbox", { name: "精選第 1 頁圖片網址", exact: true });
  await url.fill("https:"); await url.press("Enter");
  await win.getByRole("button", { name: "貼文合集", exact: true }).click();
  await expect(highlights).toBeHidden(); await expect(collections).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("collections-320.png") });
  await win.getByRole("button", { name: "精選動態", exact: true }).click();
  await expect(url).toHaveValue("https:"); await expect(url).toHaveAttribute("aria-invalid", "true");
  await highlights.getByRole("button", { name: "← 返回精選", exact: true }).click();
  await expect(search).toHaveValue("Trip");
  expect(s.saves()).toBe(0);
});

test("unfinished source URLs, pending additions and custom-field names survive Done editing", async ({ page }) => {
  const s = await openEditor(page, 390); const { win } = s;
  const leaveAndReturn = async () => {
    await win.getByRole("button", { name: "完成編輯", exact: true }).click();
    await win.getByRole("button", { name: "編輯此視窗", exact: true }).click();
  };
  const avatar = win.getByRole("textbox", { name: "頭像網址", exact: true });
  await avatar.fill("https:"); await avatar.press("Enter");
  await leaveAndReturn(); await expect(avatar).toHaveValue("https:");
  await expect(avatar).toHaveAttribute("aria-invalid", "true");
  await win.getByRole("button", { name: "取消編輯頭像網址", exact: true }).click();
  await expect(avatar).toHaveValue("");
  await win.getByRole("button", { name: "展開角色設定", exact: true }).click();
  const fieldName = win.getByRole("textbox", { name: "欄位名稱", exact: true });
  await fieldName.fill(""); await fieldName.press("Enter");
  await leaveAndReturn();
  await win.getByRole("button", { name: "展開角色設定", exact: true }).click();
  await expect(fieldName).toHaveValue(""); await expect(fieldName).toHaveAttribute("aria-invalid", "true");
  await win.getByRole("tab", { name: "貼文", exact: true }).click();
  const posts = win.locator(".ig-canonical-posts"); await posts.locator('[data-ig-edit]').first().click();
  const source = posts.getByRole("textbox", { name: "圖片 1 網址", exact: true });
  const pending = posts.getByRole("textbox", { name: "新增輪播圖片網址", exact: true });
  await source.fill("https:"); await source.press("Enter");
  await pending.fill("https://assets.test/pending.png");
  await leaveAndReturn();
  await win.getByRole("tab", { name: "貼文", exact: true }).click();
  await posts.locator('[data-ig-edit]').first().click();
  await expect(source).toHaveValue("https:"); await expect(source).toHaveAttribute("aria-invalid", "true");
  await expect(pending).toHaveValue("https://assets.test/pending.png");
  expect(s.saves()).toBe(0);
});

test.describe("touch controls", () => {
  test.use({ hasTouch: true });
  for (const width of [320, 390, 430]) test(`phone reorder/delete controls have 44px hit areas and work at ${width}px`, async ({ page }, testInfo) => {
    const s = await openEditor(page, width); const { win } = s;
    const checkTargets = async (scope: ReturnType<Page["locator"]>) => {
      const buttons = scope.locator("button.mini-btn:visible");
      expect(await buttons.count()).toBeGreaterThan(0);
      expect(await scope.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44); expect(box?.height).toBeGreaterThanOrEqual(44);
        await expect(button).toHaveAttribute("aria-label", /.+/);
        const name = await button.getAttribute("aria-label");
        expect(name).toMatch(/：|\d|Trip|Food/);
      }
    };
    await win.getByRole("tab", { name: "貼文", exact: true }).tap();
    const posts = win.locator(".ig-canonical-posts");
    await expect(posts.locator('[data-ig-edit]').first()).toBeInViewport({ ratio: 1 });
    await checkTargets(posts);
    for (const tab of await win.getByRole("tablist", { name: "OC 編輯分組" }).getByRole("tab").all()) {
      const box = await tab.boundingBox(); expect(box?.width).toBeGreaterThanOrEqual(44); expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await posts.getByRole("button", { name: /^貼文往後：/ }).first().tap();
    await expect(posts.locator('[data-ig-edit]').first()).toContainText("p2");
    await posts.locator('[data-ig-edit]').filter({ hasText: "p1" }).tap();
    await checkTargets(posts);
    const before = s.saved().entities.posts.find((post) => post.title === "p1")!.media!.map((item) => item.id);
    await posts.getByRole("button", { name: "圖片 1 往後", exact: true }).tap();
    await expect.poll(() => s.saved().entities.posts.find((post) => post.title === "p1")!.media![1].id).toBe(before[0]);
    await posts.getByRole("button", { name: "刪除圖片 3", exact: true }).tap();
    await expect.poll(() => s.saved().entities.posts.find((post) => post.title === "p1")!.media!.length).toBe(2);
    await win.getByRole("tab", { name: "精選／合集", exact: true }).tap();
    const highlights = win.locator(".ig-canonical-highlights");
    await checkTargets(highlights);
    await highlights.getByRole("button", { name: /^精選往後：/ }).first().tap();
    await expect(highlights.locator('[data-ig-edit]').first()).toContainText("Food");
    await highlights.locator('[data-ig-edit]').filter({ hasText: "Trip" }).tap();
    await checkTargets(highlights);
    await highlights.getByRole("button", { name: "刪除精選第 1 頁", exact: true }).tap();
    await expect.poll(() => s.saved().entities.highlights!.find((entry) => entry.ownerProfileId === "profile:ig" && entry.title === "Trip")!.frames.length).toBe(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`touch-controls-${width}.png`) });
  });

});
