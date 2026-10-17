import { expect, test, type Page } from "@playwright/test";
import type { VersionedSiteDocumentInput } from "@retrodesk/shared";
import { documentFixture, mockWindowsIconPack } from "./fixture";

async function openEditor(page: Page) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: VersionedSiteDocumentInput }> = [];
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  // v1 fixtures are migrated once on load. Wait for that canonical v2 draft
  // save before tests attempt to publish or make assertions about later saves.
  await expect.poll(() => saves.at(-1)?.document.schemaVersion).toBe(2);
  await expect(page.getByRole("status")).toHaveText("已儲存");
  return saves;
}

test("layout mode drags windows and icons with 8px snapping and Esc exits", async ({ page }) => {
  const saves = await openEditor(page);
  await page.locator(".icon-layer").click({ position: { x: 600, y: 440 } }); // click empty desktop → no selection
  await page.getByRole("button", { name: "▦ 進入桌面排版模式" }).click();
  const toolbar = page.getByRole("toolbar", { name: "排版模式" });
  await expect(toolbar).toBeVisible();
  await expect(page.locator(".grid-overlay")).toBeVisible();

  // drag the About window by its body (the whole window is a handle in layout mode)
  const veil = page.getByRole("dialog", { name: "About.exe" }).locator("xpath=ancestor::div[contains(@class,'canvas-window')]").locator(".layout-veil");
  const box = (await veil.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 53, box.y + box.height / 2 + 27, { steps: 5 });
  await page.mouse.up();

  // drag an icon
  const icon = page.locator(".deskicon").first();
  const ib = (await icon.boundingBox())!;
  await page.mouse.move(ib.x + 20, ib.y + 20);
  await page.mouse.down();
  await page.mouse.move(ib.x + 20 + 61, ib.y + 20 + 44, { steps: 5 });
  await page.mouse.up();

  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();

  await expect.poll(() => saves.at(-1)?.document.windows.find((w) => w.id === "about")?.layout.desktop.x).not.toBe(140);
  const about = saves.at(-1)!.document.windows.find((w) => w.id === "about")!.layout.desktop;
  expect(about.x % 8).toBe(0);
  expect(about.y % 8).toBe(0);
  expect(about.x).toBeGreaterThan(140);
  expect(about.iconX % 8).toBe(0);
  expect(about.iconY % 8).toBe(0);
});

test("layers tab hides a window and shows it again", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("tab", { name: "視窗" }).click();
  const dialog = page.getByRole("dialog", { name: "About.exe" });
  await page.locator(".layer").filter({ hasText: "About.exe" }).getByRole("button", { name: "隱藏" }).click();
  await expect(dialog).toBeHidden();
  await page.locator(".layer").filter({ hasText: "About.exe" }).getByRole("button", { name: "顯示" }).click();
  await expect(dialog).toBeVisible();
});

test("theme tab previews, cancels, and explicitly applies a preset before autosave", async ({ page }) => {
  const saves = await openEditor(page);
  await page.getByRole("tab", { name: "主題" }).click();
  await page.getByRole("button", { name: /Y2K 銀藍/ }).click();
  await expect(page.getByRole("button", { name: "套用主題" })).toBeEnabled();
  await page.getByRole("button", { name: "取消預覽" }).click();
  await expect(page.getByRole("button", { name: "套用主題" })).toBeDisabled();
  expect(saves.some((save) => save.document.theme.id === "y2k")).toBe(false);
  await page.getByRole("button", { name: /像素夜光/ }).click();
  await page.getByRole("button", { name: "套用主題" }).click();
  await page.getByLabel("視窗標題").fill("關於我");
  await expect.poll(() => saves.at(-1)?.document.theme.id).toBe("pixel");
  expect(saves.at(-1)!.document.windows.find((w) => w.id === "about")!.title).toBe("關於我");
});

test("visitor preview opens over the editor and closes", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "▶ 訪客預覽" }).click();
  const overlay = page.getByRole("dialog", { name: "訪客預覽" });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText("訪客模式")).toBeVisible();
  await overlay.getByRole("button", { name: "‹ 回到編輯器" }).click();
  await expect(overlay).toBeHidden();
});

test("publish reports artifact failure and retries without republishing", async ({ page }) => {
  await openEditor(page);
  let publishCalls = 0;
  let retryCalls = 0;
  await page.route("**/api/sites/site-1/publish", (route) => {
    publishCalls += 1;
    return route.fulfill({ json: { publishedVersion: 3, publishedAt: "2026-10-16T00:00:00.000Z", url: "/@demo", artifactStatus: "failed", retryable: true } });
  });
  await page.route("**/api/sites/site-1/publish/retry", (route) => {
    retryCalls += 1;
    return route.fulfill({ json: { publishedVersion: 3, publishedAt: "2026-10-16T00:00:00.000Z", url: "/@demo", artifactStatus: "synced", retryable: false } });
  });
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop" }).getByRole("button", { name: "確認發布" }).click();
  await expect(page.getByRole("dialog", { name: "發布完成" })).toContainText("CDN 檔案同步失敗");
  await page.getByRole("dialog", { name: "發布完成" }).getByRole("button", { name: "重試同步" }).click();
  await expect.poll(() => retryCalls).toBe(1);
  await expect(page.getByRole("dialog", { name: "發布完成" })).toContainText("公開檔案已同步完成");
  expect(publishCalls).toBe(1);
});

test("publish shows a synced artifact after the DB commit", async ({ page }) => {
  await openEditor(page);
  let publishCalls = 0;
  await page.route("**/api/sites/site-1/publish", (route) => {
    publishCalls += 1;
    return route.fulfill({ json: { publishedVersion: 3, publishedAt: "2026-10-16T00:00:00.000Z", url: "/@demo", artifactStatus: "synced", retryable: false } });
  });
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop" }).getByRole("button", { name: "確認發布" }).click();
  const success = page.getByRole("dialog", { name: "發布完成" });
  await expect(success).toContainText("公開檔案已同步完成");
  await expect(success.getByRole("button", { name: "重試同步" })).toHaveCount(0);
  expect(publishCalls).toBe(1);
});

test("one window can override, flatten and reset its title bar", async ({ page }) => {
  const saves = await openEditor(page);
  const dialog = page.getByRole("dialog", { name: "About.exe" });
  const titlebar = dialog.locator(".retro-titlebar");

  await page.getByRole("tab", { name: "版面" }).click();
  await page.getByLabel("自訂標題列").check();
  await page.getByLabel("標題起始色").fill("#112233");
  await page.getByLabel("標題結束色").fill("#445566");
  await expect(titlebar).toHaveCSS("background-image", /linear-gradient/);
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.id === "about")?.appearance?.titleFrom).toBe("#112233");

  await page.getByLabel("使用漸層").uncheck();
  await expect(titlebar).toHaveCSS("background-image", "none");
  await expect(titlebar).toHaveCSS("background-color", "rgb(17, 34, 51)");

  await page.getByRole("button", { name: "恢復主題設定" }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.id === "about")?.appearance).toBeUndefined();
  await expect(titlebar).toHaveCSS("background-image", /linear-gradient/);
});

test("Windows icon picker offers curated icons and searchable full library", async ({ page }) => {
  await mockWindowsIconPack(page);
  const saves = await openEditor(page);
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.getByText("Windows 精選")).toBeVisible();
  await page.getByLabel("搜尋 Windows 圖示").fill("computer");
  const result = page.getByRole("button", { name: /Windows 圖示 .*computer/i }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.id === "about")?.icon).toMatch(/^\/windows-icons\/[A-Za-z0-9._-]+\.(?:ico|png)$/);
});

test("clean release explains the optional Windows icon pack", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.getByText("未安裝 Windows 可選圖示包", { exact: false })).toBeVisible();
  await expect(page.getByLabel("搜尋 Windows 圖示")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "圖示 camera" })).toBeVisible();
});

test("desktop and mobile add surfaces share the registry modules", async ({ page }) => {
  const saves = await openEditor(page);
  const desktopLabels = await page.locator(".left-panel2 .add-card strong").allTextContents();
  expect(desktopLabels).toEqual(["文件視窗", "相簿視窗", "連結視窗", "名片／關於我", "復古 IG 個人頁", "音樂播放器", "Moodboard 畫板", "世界觀資料夾", "掃雷", "角色彈窗", "訪客留言簿"]);

  await page.getByRole("button", { name: "手機版" }).click();
  await page.locator(".m-toolbar").getByRole("button", { name: "新增" }).click();
  const mobileSheet = page.getByRole("dialog", { name: "新增視窗" });
  await expect(mobileSheet).toBeVisible();
  const mobileLabels = await mobileSheet.locator(".m-add strong").allTextContents();
  expect(mobileLabels).toEqual(desktopLabels);

  await mobileSheet.getByRole("button", { name: /文件視窗/ }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.some((window) => window.type === "document")).toBe(true);
});

test("left module catalog scrolls without shrinking or overlapping cards", async ({ page }) => {
  await openEditor(page);
  const panel = page.locator("#editor-left-panel .panel-scroll");
  const cards = panel.locator(".add-card");

  await expect.poll(() => cards.evaluateAll((elements) => elements.every((element) => element.scrollHeight <= element.clientHeight + 1))).toBe(true);
  await expect.poll(() => panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(panel.getByText("即將推出")).toBeInViewport();
});

test("selected window gets a non-blocking desktop focus scrim", async ({ page }) => {
  await openEditor(page);
  const canvas = page.locator(".desktop-canvas");
  const about = page.getByRole("dialog", { name: "About.exe" }).locator("xpath=ancestor::div[contains(@class,'canvas-window')]");
  const scrim = page.locator(".selection-scrim");

  await about.locator(".retro-titlebar").click();
  await expect(scrim).toBeVisible();
  await expect(about).toHaveClass(/selected/);
  expect(Number(await about.evaluate((element) => getComputedStyle(element).zIndex)))
    .toBeGreaterThan(Number(await scrim.evaluate((element) => getComputedStyle(element).zIndex)));
  await expect(scrim).toHaveCSS("pointer-events", "none");

  await canvas.locator(".icon-layer").click({ position: { x: 600, y: 440 } });
  await expect(scrim).toHaveCount(0);

  await page.getByRole("button", { name: "▦ 進入桌面排版模式" }).click();
  await expect(scrim).toHaveCount(0);
});

test("desktop sidebars collapse independently and remember their state", async ({ page }) => {
  await openEditor(page);
  const stage = page.locator(".editor-stage2");
  const initialWidth = (await stage.boundingBox())!.width;

  await page.getByRole("button", { name: "收合左側工具欄" }).click();
  await expect(page.locator(".left-panel2")).toBeHidden();
  await expect.poll(async () => (await stage.boundingBox())!.width).toBeGreaterThan(initialWidth);

  await page.getByRole("button", { name: "收合右側屬性欄" }).click();
  await expect(page.locator(".right-panel2")).toBeHidden();

  const restoreLeft = page.getByRole("button", { name: "展開左側工具欄" });
  await restoreLeft.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".left-panel2")).toBeVisible();

  await page.reload();
  await expect(page.locator(".left-panel2")).toBeVisible();
  await expect(page.locator(".right-panel2")).toBeHidden();
});
