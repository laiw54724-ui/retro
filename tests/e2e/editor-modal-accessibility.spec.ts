import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function openEditor(page: Page, options: { publishError?: "version_conflict" | "request_failed" } = {}) {
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
  let reads = 0;
  let saves = 0;
  let releasePublish: (() => void) | undefined;
  const pendingPublish = new Promise<void>((resolve) => { releasePublish = resolve; });
  await page.route("**/api/sites/site-1", (route) => {
    reads += 1;
    return route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Modal demo", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-19T00:00:00Z", access_role: "owner" } } });
  });
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    draft = route.request().postDataJSON().document; version += 1;
    saves += 1;
    return route.fulfill({ json: { version, updatedAt: "2026-10-19T00:01:00Z" } });
  });
  await page.route("**/api/sites/site-1/publish", async (route) => {
    publishes += 1;
    await pendingPublish;
    if (options.publishError) return route.fulfill({ status: options.publishError === "version_conflict" ? 409 : 500, json: { error: { code: options.publishError, message: "Synthetic publish failure" } } });
    await route.fulfill({ json: { publishedVersion: 1, publishedAt: "2026-10-19T00:02:00Z", url: "/@demo", artifactStatus: "synced", cleanupWarnings: [] } });
  });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("button", { name: "發布", exact: true })).toBeEnabled();
  return { publishes: () => publishes, finishPublish: () => releasePublish?.(), reads: () => reads, saves: () => saves, draft: () => draft, setRemoteTitle: (title: string) => { draft = structuredClone(draft); draft.windows[0].title = title; version += 1; } };
}

const editTrigger = (page: Page) => page.locator(".m-window-settings");
const editDialog = (page: Page) => page.getByRole("dialog", { name: "視窗設定", exact: true });
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
    await dialog.locator("summary").filter({hasText:"更多視窗設定"}).click();
    const body = dialog.locator(".editing-sheet-body");
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

for (const width of [390, 1280]) {
  test(`publish 409 recovery remains actionable and preserves local data at ${width}px`, async ({ page, context, browserName }) => {
    test.skip(browserName === "webkit", "Playwright WebKit has no clipboard-read/write permission, so copying the local JSON cannot be verified there");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 844 });
    const backend = await openEditor(page, { publishError: "version_conflict" });
    const before = structuredClone(backend.draft());
    const opener = page.getByRole("button", { name: "發布", exact: true });
    await opener.click();
    await publishDialog(page).getByRole("button", { name: "確認發布", exact: true }).click();
    backend.finishPublish();
    const recovery = page.getByRole("alertdialog", { name: "版本衝突", exact: true });
    await expect(recovery).toBeVisible();
    await expect(publishDialog(page)).toBeHidden();
    await expectFocusInside(recovery);
    await expectTabWrap(page, recovery);
    await page.screenshot({ path: test.info().outputPath("publish-conflict-recovery.png") });
    await recovery.getByRole("button", { name: "複製本機 JSON", exact: true }).click();
    expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(before);
    await recovery.getByRole("button", { name: "取消", exact: true }).click();
    await expect(recovery).toBeHidden();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    await expect(opener).toBeFocused();
    expect((await page.getByRole("button", { name: "版本衝突", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const notice = page.locator(".conflict-notice");
    expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await notice.boundingBox())!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath("publish-conflict-paused.png") });
    expect(backend.draft()).toEqual(before);
    if (width === 390) {
      // An edit after cancel remains local: dismissing recovery must not clear the conflict pause.
      await page.locator(".m-icon").getByText("Notes.exe").click();
      const title=page.getByRole("dialog",{name:"Notes.exe",exact:true}).getByRole("textbox",{name:"視窗標題",exact:true});
      await title.fill("Retained local Notes.exe");await title.press("Enter");
      await editTrigger(page).click();
      await editDialog(page).getByRole("button", { name: "關閉", exact: true }).click();
      await page.waitForTimeout(800);
      expect(backend.saves()).toBe(0);
    }
    await page.getByRole("button", { name: "版本衝突", exact: true }).click();
    await expectFocusInside(recovery);
    if (width === 390) {
      await recovery.getByRole("button", { name: "複製本機 JSON", exact: true }).click();
      expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).windows[0].title).toBe("Retained local Notes.exe");
    }
    await page.keyboard.press("Escape");
    await expect(recovery).toBeHidden();
    await expect(page.getByRole("button", { name: "版本衝突", exact: true })).toBeFocused();
    // The "JSON copied" notice that is still showing must not cover any top bar control (it did on the Linux CI layout).
    const toast = page.locator(".editor-message[role='alert']");
    if (await toast.count()) {
      const toastBox = (await toast.first().boundingBox())!;
      for (const control of await page.locator(".editor-topbar button, .editor-topbar a").all()) {
        const box = await control.boundingBox();
        if (!box) continue;
        const overlaps = toastBox.x < box.x + box.width && toastBox.x + toastBox.width > box.x && toastBox.y < box.y + box.height && toastBox.y + toastBox.height > box.y;
        expect(overlaps, `notice covers top bar control at ${Math.round(box.x)},${Math.round(box.y)}`).toBe(false);
      }
    }
    // Publish reopens recovery rather than resubmitting the stale expected version.
    await opener.click();
    await expect(recovery).toBeVisible();
    expect(backend.publishes()).toBe(1);
    backend.setRemoteTitle("Cloud Notes.exe");
    await recovery.getByRole("button", { name: "重新載入雲端版本", exact: true }).click();
    await expect(recovery).toBeHidden();
    await expect.poll(backend.reads).toBeGreaterThan(1);
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    await expect(page.getByRole("button", { name: "Cloud Notes.exe", exact: true }).first()).toBeVisible();
    expect(backend.saves()).toBe(0);
  });
}

test("ordinary publish error keeps preflight dismissible without discarding the draft", async ({ page }) => {
  const backend = await openEditor(page, { publishError: "request_failed" });
  const before = structuredClone(backend.draft());
  const opener = page.getByRole("button", { name: "發布", exact: true });
  await opener.click();
  await publishDialog(page).getByRole("button", { name: "確認發布", exact: true }).click();
  backend.finishPublish();
  await expect(publishDialog(page).getByRole("button", { name: "取消", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(publishDialog(page)).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  expect(backend.draft()).toEqual(before);
  expect(backend.saves()).toBe(0);
});
