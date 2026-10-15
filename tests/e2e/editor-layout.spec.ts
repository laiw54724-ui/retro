import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

async function openEditor(page: Page) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  const saves: Array<{ document: typeof documentFixture }> = [];
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
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

  await expect.poll(() => saves.length).toBeGreaterThan(0);
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

test("theme tab applies a preset and the right panel edits title and default-open", async ({ page }) => {
  const saves = await openEditor(page);
  await page.getByRole("tab", { name: "主題" }).click();
  await page.getByRole("button", { name: /午夜星空/ }).click();
  await page.getByLabel("視窗標題").fill("關於我");
  await expect.poll(() => saves.at(-1)?.document.theme.id).toBe("midnight");
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
  const saves = await openEditor(page);
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.getByText("Windows 精選")).toBeVisible();
  await page.getByLabel("搜尋 Windows 圖示").fill("computer");
  const result = page.getByRole("button", { name: /Windows 圖示 .*computer/i }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.id === "about")?.icon).toMatch(/^\/windows-icons\/[A-Za-z0-9._-]+\.(?:ico|png)$/);
});

test("desktop and mobile add surfaces share the registry modules", async ({ page }) => {
  const saves = await openEditor(page);
  const desktopLabels = await page.locator(".left-panel2 .add-card strong").allTextContents();
  expect(desktopLabels).toEqual(["文件視窗", "相簿視窗", "連結視窗", "名片／關於我", "復古 IG 個人頁"]);

  await page.getByRole("button", { name: "手機版" }).click();
  await page.locator(".m-toolbar").getByRole("button", { name: "新增" }).click();
  const mobileSheet = page.getByRole("dialog", { name: "新增視窗" });
  await expect(mobileSheet).toBeVisible();
  const mobileLabels = await mobileSheet.locator(".m-add strong").allTextContents();
  expect(mobileLabels).toEqual(desktopLabels);

  await mobileSheet.getByRole("button", { name: /文件視窗/ }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.some((window) => window.type === "document")).toBe(true);
});
