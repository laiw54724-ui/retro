import { expect, test, type Page } from "@playwright/test";
import { migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

/**
 * Findings of the independent review of the UX candidate, each as a regression test:
 *  1. notices never cover controls or each other (they were position:fixed and stacked/covered the top bar),
 *  2. no modal — including the hand-rolled ones that cannot make #root inert — lets Ctrl/Cmd+Z change the document,
 *  3. the help tour steps aside for a modal and its card keeps every other top bar control usable,
 *  4. phone title-bar controls are real 44px targets.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function openEditor(page: Page, width: number) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  const document: SiteDocumentV2Input = migrated.document;
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: document, draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 3, updatedAt: "2026-10-15T00:01:00.000Z" } }));
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.locator(".editor-topbar")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".canvas-window, .m-screen").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
}

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;

for (const width of [320, 390, 430, 768, 1280]) {
  test(`all notices at once cover nothing and each other at ${width}px`, async ({ page }) => {
    await openEditor(page, width);
    // the real classes and roles, in the real place (right after the top bar), so the real CSS decides the layout
    await page.evaluate(() => {
      const bar = document.querySelector(".editor-topbar")!;
      const make = (className: string, role: string, text: string) => { const el = document.createElement("div"); el.className = className; el.setAttribute("role", role); el.setAttribute("data-injected-notice", ""); el.innerHTML = `<span>${text}</span><button type="button">動作</button>`; return el; };
      const notices = [
        make("editor-message", "alert", "目前本機草稿 JSON 已複製，可以先備份後再重新載入。"),
        make("editor-message", "status", "偵測到文件需要更新，已暫停自動儲存。"),
        make("editor-message asset-migration-message", "status", "有 1 個舊素材仍是公開網址。"),
        make("editor-message conflict-notice", "status", "偵測到另一個分頁或裝置有更新，已停止自動儲存以避免覆蓋。")
      ];
      let anchor: Element = bar;
      for (const notice of notices) { anchor.after(notice); anchor = notice; }
    });
    const rects = async (selector: string): Promise<Rect[]> => (await page.locator(selector).all()).flatMap((el) => []).concat(await page.evaluate((sel) => Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed").map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }).filter((r) => r.width > 0 && r.height > 0), selector) as never);
    const notices = await rects("[data-injected-notice]");
    expect(notices).toHaveLength(4);
    for (let i = 0; i < notices.length; i += 1) for (let j = i + 1; j < notices.length; j += 1) expect(overlaps(notices[i], notices[j]), `notice ${i} overlaps notice ${j}`).toBe(false);
    const controls = [...(await rects(".editor-topbar button, .editor-topbar a, .editor-topbar select")), ...(await rects(".m-toolbar button"))];
    for (const notice of notices) for (const control of controls) expect(overlaps(notice, control), `a notice covers a control at ${Math.round(control.x)},${Math.round(control.y)}`).toBe(false);
    // the editor itself is still there and usable below the notices
    const stage = await rects(".canvas-window, .m-screen");
    expect(stage.length).toBeGreaterThan(0);
    expect(stage[0].height).toBeGreaterThan(150);
  });
}

test("a hand-rolled dialog (Export/Import) lets neither Ctrl+Z nor Cmd+Z change the document behind it", async ({ page }) => {
  await openEditor(page, 1280);
  // a real document edit that creates a history entry: add a window from the left panel
  await page.locator(".add-card, .module-card").first().click();
  await page.waitForTimeout(300);
  const undo = page.getByRole("button", { name: "復原", exact: true });
  await expect(undo).toBeEnabled();
  await page.getByRole("button", { name: "匯出／匯入", exact: true }).click();
  const dialog = page.locator('[aria-modal="true"]').first();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  await expect(undo).toBeEnabled(); // nothing was undone behind the dialog
  await expect(page.getByRole("button", { name: "重做", exact: true })).toBeDisabled();
  await page.keyboard.press("Meta+z");
  await page.waitForTimeout(250);
  await expect(page.getByRole("button", { name: "重做", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: /關閉|取消/ }).first().click();
  await expect(dialog).toBeHidden();
  // an undo behind the dialog would have made Redo available
  await expect(page.getByRole("button", { name: "重做", exact: true })).toBeDisabled();
  await expect(undo).toBeEnabled();
});

for (const width of [320, 390]) {
  test(`the tour card steps aside for a modal and never covers other top bar controls at ${width}px`, async ({ page }) => {
    await openEditor(page, width);
    await page.getByRole("button", { name: "說明", exact: true }).click();
    await page.getByRole("dialog", { name: "你想了解什麼？" }).locator('[data-help-topic="publish"]').getByRole("button", { name: "開始導覽" }).click();
    const card = page.locator(".tour-card");
    await expect(card).toBeVisible();
    // the explained control and the other controls the person may still need: all clear of the card
    const cardBox = (await card.boundingBox())!;
    for (const control of await page.locator(".editor-topbar button, .editor-topbar a, .m-toolbar button").all()) {
      const box = await control.boundingBox();
      if (!box) continue;
      expect(overlaps(cardBox, box), `tour card covers a control at ${Math.round(box.x)},${Math.round(box.y)}`).toBe(false);
    }
    // a modal opened while the tour is up owns the screen: the card and ring hide until it closes
    await page.getByRole("button", { name: "說明", exact: true }).click({ force: false }).catch(() => undefined);
    const modal = page.getByRole("dialog", { name: "你想了解什麼？" });
    if (await modal.count()) {
      await expect(card).toBeHidden();
      await expect(page.locator(".tour-ring")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(modal).toBeHidden();
      await expect(card).toBeVisible();
    }
  });
}

test("the tour card exposes its explanation to assistive technology", async ({ page }) => {
  await openEditor(page, 1280);
  await page.getByRole("button", { name: "說明", exact: true }).click();
  await page.getByRole("dialog", { name: "你想了解什麼？" }).locator('[data-help-topic="publish"]').getByRole("button", { name: "開始導覽" }).click();
  const next = page.locator(".tour-card").getByRole("button", { name: "下一步" });
  await expect(next).toBeFocused();
  const describedBy = await next.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText("預覽");
});

test("phone app title-bar controls are real 44px targets", async ({ page }) => {
  await openEditor(page, 390);
  await page.getByRole("button", { name: "Instagram.exe", exact: true }).click();
  for (const control of [page.getByRole("button", { name: /‹ 桌面/ }), page.getByRole("button", { name: "關閉", exact: true })]) {
    const box = (await control.first().boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    expect(box.width).toBeGreaterThanOrEqual(43.5);
  }
});
