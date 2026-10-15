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
