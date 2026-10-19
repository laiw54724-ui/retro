import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function openEditor(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const legacy = createStarterDocument("Modal demo", "classic98", "blank");
  const notes = makeWindow("document", 0);
  notes.id = "notes"; notes.title = "Notes.exe"; notes.defaultOpen = false;
  legacy.windows = [notes];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  let draft = migrated.document;
  let version = 1;
  let publishes = 0;
  let releasePublish: (() => void) | undefined;
  const pendingPublish = new Promise<void>((resolve) => { releasePublish = resolve; });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Modal demo", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-19T00:00:00Z", access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    draft = route.request().postDataJSON().document; version += 1;
    return route.fulfill({ json: { version, updatedAt: "2026-10-19T00:01:00Z" } });
  });
  await page.route("**/api/sites/site-1/publish", async (route) => {
    publishes += 1;
    await pendingPublish;
    await route.fulfill({ json: { publishedVersion: 1, publishedAt: "2026-10-19T00:02:00Z", url: "/@demo", artifactStatus: "synced", cleanupWarnings: [] } });
  });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("button", { name: "發布", exact: true })).toBeEnabled();
  return { publishes: () => publishes, finishPublish: () => releasePublish?.() };
}

const editTrigger = (page: Page) => page.locator(".m-toolbar").getByRole("button", { name: "編輯", exact: true });
const editDialog = (page: Page) => page.getByRole("dialog", { name: "編輯視窗", exact: true });
const publishDialog = (page: Page) => page.getByRole("dialog", { name: "發布 Retro Desktop", exact: true });

async function expectFocusInside(dialog: Locator) {
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
}

async function expectTabWrap(page: Page, dialog: Locator) {
  const controls = dialog.locator("button:enabled, a[href], input:enabled, select:enabled, textarea:enabled, [tabindex='0']").filter({ visible: true });
  await controls.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
}

test("phone Edit Window Escape dismisses the panel without closing the app", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await page.locator(".m-icon").getByText("Notes.exe").click();
  await editTrigger(page).click();
  await expect(editDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editDialog(page)).toBeHidden();
  await expect(page.locator(".m-win-body")).toBeVisible();
  await expect(editTrigger(page)).toBeFocused();
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
});

for (const width of [320, 390, 430, 1280]) {
  test(`publish preflight focuses, traps, cancels and fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const backend = await openEditor(page);
    const opener = page.getByRole("button", { name: "發布", exact: true });
    await opener.click();
    const dialog = publishDialog(page);
    await expectFocusInside(dialog);
    await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await page.screenshot({ path: test.info().outputPath("publish-preflight.png") });
    await expectTabWrap(page, dialog);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 320) {
      const body = dialog.locator(".modal-body");
      await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    }
    if (width < 768) {
      for (const control of [dialog.getByRole("button", { name: "關閉", exact: true }), dialog.getByRole("button", { name: "取消", exact: true }), dialog.getByRole("button", { name: "確認發布", exact: true })]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    await opener.click();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(backend.publishes()).toBe(0);
  });
}

for (const width of [320, 390, 430]) {
  test(`phone Edit Window contains focus and scrolls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await openEditor(page);
    await page.locator(".m-icon").getByText("Notes.exe").click();
    await editTrigger(page).click();
    const dialog = editDialog(page);
    await expectFocusInside(dialog);
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await page.screenshot({ path: test.info().outputPath("edit-window.png") });
    await expectTabWrap(page, dialog);
    const body = dialog.locator(".m-sheet-body");
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const close = dialog.getByRole("button", { name: "關閉", exact: true });
    const button = (await close.boundingBox())!;
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(editTrigger(page)).toBeFocused();
    await expect(page.locator(".m-win-body")).toBeVisible();
  });
}

test("nested icon picker Escape returns to the edit panel before returning to the app", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await page.locator(".m-icon").getByText("Notes.exe").click();
  await editTrigger(page).click();
  const dialog = editDialog(page);
  const opener = dialog.getByRole("button", { name: "更換圖示…", exact: true });
  await opener.click();
  const picker = page.locator(".modal-card").filter({ has: page.locator(".ilib-grid") });
  await expect(picker).toBeVisible();
  await expectFocusInside(picker);
  await expectTabWrap(page, picker);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(editTrigger(page)).toBeFocused();
  await expect(page.locator(".m-win-body")).toBeVisible();
});

test("pending publish cannot be dismissed or submitted twice", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await openEditor(page);
  await page.getByRole("button", { name: "發布", exact: true }).click();
  const dialog = publishDialog(page);
  await dialog.getByRole("button", { name: "確認發布", exact: true }).click();
  await expect.poll(backend.publishes).toBe(1);
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "關閉", exact: true })).toBeDisabled();
  await page.keyboard.press("Tab");
  await expectFocusInside(dialog);
  await page.keyboard.press("Escape");
  await page.mouse.click(2, 2);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  expect(backend.publishes()).toBe(1);
  backend.finishPublish();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("dialog", { name: "發布完成", exact: true })).toBeVisible();
});

test.describe("phone touch dismissal", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });
  test("Add sheet and publish preflight dismiss through ordinary taps", async ({ page }) => {
    const backend = await openEditor(page);
    const add = page.locator(".m-toolbar").getByRole("button", { name: "新增", exact: true });
    await add.tap();
    const sheet = page.locator(".m-sheet");
    await expectFocusInside(sheet);
    await sheet.getByRole("button", { name: "關閉", exact: true }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    await page.getByRole("button", { name: "發布", exact: true }).tap();
    await publishDialog(page).getByRole("button", { name: "取消", exact: true }).tap();
    await expect(publishDialog(page)).toBeHidden();
    expect(backend.publishes()).toBe(0);
  });
});
