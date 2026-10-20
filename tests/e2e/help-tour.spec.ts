import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

/**
 * Help and the optional focused tour (UX audit "help and focused tours"): opt-in only, skippable and replayable, and it
 * never clicks, saves or publishes anything. Desktop plus 320/390/430px.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function document(): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  migrated.document.entities.profiles[0].visibility = "published";
  return migrated.document;
}

async function openEditor(page: Page, width: number, role: "owner" | "editor" = "owner") {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: document(), draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: role };
  let saves = 0;
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saves += 1; return route.fulfill({ json: { version: 3, updatedAt: "2026-10-15T00:01:00.000Z" } }); });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.locator(".editor-topbar")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".canvas-window, .m-screen").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  return { saves: () => saves };
}

const helpButton = (page: Page) => page.getByRole("button", { name: "說明", exact: true });
const card = (page: Page) => page.locator(".tour-card");
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function expectCardClearOf(page: Page, target: Locator) {
  const cardBox = (await card(page).boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(cardBox.x, "card inside viewport (left)").toBeGreaterThanOrEqual(0);
  expect(cardBox.y, "card inside viewport (top)").toBeGreaterThanOrEqual(0);
  expect(cardBox.x + cardBox.width, "card inside viewport (right)").toBeLessThanOrEqual(viewport.width + 0.5);
  expect(cardBox.y + cardBox.height, "card inside viewport (bottom)").toBeLessThanOrEqual(viewport.height + 0.5);
  expect(overlap(cardBox, targetBox), "the card never covers the control it explains").toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1440, 320, 390, 430]) {
  test.describe(`${width}px`, () => {
    test(`publish tour: opt-in, two steps, back, skip always visible, done, replay, focus returns, zero writes`, async ({ page }) => {
      const backend = await openEditor(page, width);
      // nothing starts by itself
      await expect(card(page)).toHaveCount(0);
      await helpButton(page).click();
      const dialog = page.getByRole("dialog", { name: "你想了解什麼？" });
      await expect(dialog).toBeVisible();
      // every topic explains itself in one sentence without any tour
      await expect(dialog.getByText("草稿只有你自己看得到", { exact: false })).toBeVisible();
      await expect(dialog.getByText("刪除捷徑不會刪除它指向的原本內容")).toBeVisible();
      // explanation-only topic offers no tour
      await expect(dialog.locator('[data-help-topic="explorer"]').getByRole("button")).toHaveCount(0);

      await dialog.locator('[data-help-topic="publish"]').getByRole("button", { name: "開始導覽" }).click();
      await expect(dialog).toBeHidden();
      await expect(card(page)).toBeVisible();
      await expect(card(page)).toHaveAttribute("data-tour-step", "preview");
      await expect(card(page)).toContainText("第 1 步，共 2 步");
      await expectCardClearOf(page, page.locator('[data-help="preview"]'));
      await expect(card(page).getByRole("button", { name: "略過導覽" })).toBeVisible();
      await expect(card(page).getByRole("button", { name: "上一步" })).toBeDisabled();

      await card(page).getByRole("button", { name: "下一步" }).click();
      await expect(card(page)).toHaveAttribute("data-tour-step", "publish");
      await expect(card(page)).toContainText("第 2 步，共 2 步");
      await expectCardClearOf(page, page.locator('[data-help="publish"]'));
      await expect(card(page).getByRole("button", { name: "略過導覽" })).toBeVisible();
      await card(page).getByRole("button", { name: "上一步" }).click();
      await expect(card(page)).toHaveAttribute("data-tour-step", "preview");
      await card(page).getByRole("button", { name: "下一步" }).click();
      await card(page).getByRole("button", { name: "完成" }).click();
      await expect(card(page)).toHaveCount(0);
      await expect(helpButton(page)).toBeFocused();

      // replay
      await helpButton(page).click();
      await expect(page.getByRole("dialog", { name: "你想了解什麼？" }).getByRole("button", { name: "重新導覽" }).first()).toBeVisible();
      await page.getByRole("dialog", { name: "你想了解什麼？" }).locator('[data-help-topic="publish"]').getByRole("button", { name: "重新導覽" }).click();
      await expect(card(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(card(page)).toHaveCount(0);
      await expect(helpButton(page)).toBeFocused();

      // a tour never opens the preview, never publishes and never writes
      await expect(page.getByRole("dialog", { name: /發布 Retro Desktop|訪客預覽/ })).toHaveCount(0);
      await page.waitForTimeout(1200);
      expect(backend.saves()).toBe(0);
      await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
    });
  });
}

test("the publish step explains why when the person cannot publish", async ({ page }) => {
  await openEditor(page, 1440, "editor");
  await expect(page.locator('[data-help="publish"]')).toHaveCount(0);
  await helpButton(page).click();
  await page.getByRole("dialog", { name: "你想了解什麼？" }).locator('[data-help-topic="publish"]').getByRole("button", { name: "開始導覽" }).click();
  await card(page).getByRole("button", { name: "下一步" }).click();
  await expect(card(page)).toHaveAttribute("data-tour-status", "missing");
  await expect(card(page)).toContainText("你目前沒有發布權限");
  // no arrow points at nothing
  await expect(page.locator(".tour-ring")).toHaveCount(0);
  await card(page).getByRole("button", { name: "上一步" }).click();
  await expect(card(page)).toHaveAttribute("data-tour-status", "ok");
  await card(page).getByRole("button", { name: "略過導覽" }).click();
  await expect(card(page)).toHaveCount(0);
});

test("the Instagram topic says what is needed first, then follows the person's own clicks (desktop)", async ({ page }) => {
  const backend = await openEditor(page, 1440);
  // before the editor part exists on screen: explained, no tour offered
  await page.evaluate(() => { document.querySelector('[data-help="ig-tab-collections"]')?.setAttribute("data-help", "x"); });
  await helpButton(page).click();
  const dialog = page.getByRole("dialog", { name: "你想了解什麼？" });
  await expect(dialog.locator('[data-help-topic="instagram-organize"]').getByRole("note")).toContainText("請先開啟 Instagram 視窗並進入編輯");
  await expect(dialog.locator('[data-help-topic="instagram-organize"]').getByRole("button")).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('[data-help="x"]')?.setAttribute("data-help", "ig-tab-collections"); });
  await dialog.getByRole("button", { name: "關閉" }).last().click();

  await helpButton(page).click();
  await page.getByRole("dialog", { name: "你想了解什麼？" }).locator('[data-help-topic="instagram-organize"]').getByRole("button", { name: "開始導覽" }).click();
  await expect(card(page)).toHaveAttribute("data-tour-step", "tab");
  await expectCardClearOf(page, page.locator('[data-help="ig-tab-collections"]'));
  await card(page).getByRole("button", { name: "下一步" }).click();
  // the switch only exists once the person opens the tab themselves: the tour waits and explains, it does not click for them
  await expect(card(page)).toHaveAttribute("data-tour-step", "switch");
  await expect(card(page)).toContainText("請先點選上一步說明的分頁");
  await page.locator('[data-help="ig-tab-collections"]').click();
  await expect(card(page)).toHaveAttribute("data-tour-status", "ok");
  await expect(card(page)).toContainText("一次整理一種");
  await expectCardClearOf(page, page.locator('[data-help="ig-collection-switch"]'));
  await card(page).getByRole("button", { name: "下一步" }).click();
  await expect(card(page)).toHaveAttribute("data-tour-step", "preview");
  await card(page).getByRole("button", { name: "完成" }).click();
  await page.waitForTimeout(1000);
  expect(backend.saves()).toBe(0);
});

for (const width of [320, 390, 430]) {
  test(`phone: Escape ends the tour first (not the open app) at ${width}px`, async ({ page }) => {
    await openEditor(page, width);
    await page.getByRole("button", { name: "Instagram.exe", exact: true }).click();
    await page.getByRole("button", { name: "編輯內容", exact: true }).click();
    await helpButton(page).click();
    await page.getByRole("dialog", { name: "你想了解什麼？" }).locator('[data-help-topic="instagram-organize"]').getByRole("button", { name: "開始導覽" }).click();
    await expect(card(page)).toBeVisible();
    await expectCardClearOf(page, page.locator('[data-help="ig-tab-collections"]'));
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);
    // the app is still open: the first Escape belonged to the tour
    await expect(page.getByRole("button", { name: /‹ 桌面/ })).toBeVisible();
  });
}

test("reduced-motion and keyboard: the tour follows focus and Skip is reachable by Tab", async ({ page, browserName }) => {
  test.skip(browserName === "webkit" && process.platform === "darwin", "macOS WebKit/Safari does not Tab to buttons unless Full Keyboard Access is on; the Tab order is verified in Chromium and in Linux WebKit (CI)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openEditor(page, 1440);
  await helpButton(page).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab"); // focus is inside the dialog (first control: the topic's tour button)
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "你想了解什麼？" }).waitFor({ state: "hidden" }).catch(() => undefined);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("button", { name: "下一步" })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); // "Back" is disabled on step 1, so the previous stop is Skip
  await expect(card(page).getByRole("button", { name: "略過導覽" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card(page)).toHaveCount(0);
});

// Four languages (ja/ko are beta and only run against the preview build: `pnpm test:e2e:i18n-preview`).
const PREVIEW_LOCALES = process.env.VITE_I18N_PREVIEW_LOCALES === "true";
for (const locale of (PREVIEW_LOCALES ? ["en", "ja", "ko"] : ["en"]) as Array<"en" | "ja" | "ko">) {
  test(`help menu and tour are translated (${locale})`, async ({ page }) => {
    const copy = JSON.parse(readFileSync(join(__dirname, `../../apps/web/src/i18n/locales/${locale}/editor.json`), "utf8")).help as Record<string, any>;
    const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => String(values[key] ?? ""));
    await page.addInitScript((value) => localStorage.setItem("retrodesk:locale", value), locale);
    await openEditor(page, 390);
    await page.getByRole("button", { name: copy.button, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: copy.title });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(copy.topics.publish.help)).toBeVisible();
    await expect(dialog.getByText(copy.topics.explorer.help)).toBeVisible();
    await dialog.locator('[data-help-topic="publish"]').getByRole("button", { name: copy.start }).click();
    await expect(page.locator(".tour-card")).toContainText(fill(copy.step, { current: 1, total: 2 }));
    await expect(page.locator(".tour-card")).toContainText(copy.topics.publish.previewBody);
    await expect(page.locator(".tour-card").getByRole("button", { name: copy.skip })).toBeVisible();
    await page.locator(".tour-card").getByRole("button", { name: copy.next }).click();
    await expect(page.locator(".tour-card")).toContainText(copy.topics.publish.publishBody);
    await page.keyboard.press("Escape");
    await expect(page.locator(".tour-card")).toHaveCount(0);
  });
}
