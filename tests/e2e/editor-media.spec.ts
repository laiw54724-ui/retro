import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const DRIVE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

async function openEditor(page: Page) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  const saves: unknown[] = [];
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.route("https://drive.google.com/thumbnail**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  return saves;
}

test("clearing a field pauses autosave quietly without an error popup", async ({ page }) => {
  const saves = await openEditor(page);
  await page.getByLabel("視窗標題").fill("");
  await page.waitForTimeout(1200);
  await expect(page.locator(".editor-message")).toHaveCount(0);
  await expect(page.locator(".save-text")).toContainText("有欄位未完成");
  expect(saves).toHaveLength(0);

  await page.getByLabel("視窗標題").fill("About.exe");
  await expect.poll(() => saves.length).toBeGreaterThan(0);
});

test("pasting a Google Drive link previews it and the avatar can be repositioned inline", async ({ page }) => {
  await openEditor(page);
  const about = page.getByRole("dialog", { name: "About.exe" });
  const field = about.getByLabel("頭像網址");
  await field.fill(`https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`);
  await field.press("Enter");

  const avatar = about.locator(".about-avatar img");
  await expect(avatar).toHaveAttribute("src", `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w2000`);

  await about.getByRole("button", { name: "調整位置" }).click();
  await about.locator(".crop-zoom input").fill("2");
  await expect(about.locator(".about-avatar img")).toHaveCSS("transform", /matrix\(2, 0, 0, 2/);
});

test("rejects non-https avatar links with a visible reason", async ({ page }) => {
  await openEditor(page);
  const about = page.getByRole("dialog", { name: "About.exe" });
  const field = about.getByLabel("頭像網址");
  await field.fill("javascript:alert(1)");
  await field.press("Enter");
  await expect(about.getByRole("alert")).toContainText("https");
  await expect(about.locator(".about-avatar img")).toHaveCount(0);
});

test("picks sourced Windows icons on desktop and mobile and preserves legacy PNGs", async ({ page }) => {
  const saves = await openEditor(page);
  let draft = structuredClone(documentFixture);
  await page.unroute("**/api/sites/site-1");
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" } } }));
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.getByText("來源：trapd00r/win95-winxp_icons")).toBeVisible();
  const search = page.getByLabel("搜尋 Windows 圖示");
  await expect(search).toHaveAttribute("placeholder", /[0-9,]+/);
  await search.fill("computer");
  const result = page.locator(".win98-icon-grid button").first();
  await expect(result).toBeVisible();
  await result.click();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  draft = (saves.at(-1) as { document: typeof draft }).document;
  const selectedPath = draft.windows[0].icon;
  expect(selectedPath).toMatch(/^\/windows-icons\/[A-Za-z0-9._-]+\.(?:ico|png)$/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.locator(".icon-picker").getByRole("button", { pressed: true })).toHaveCount(1);

  const legacy = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/win98-icons/computer_2_cool-4.png";
    await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); });
    return { src: image.src, naturalWidth: image.naturalWidth };
  });
  expect(legacy.src).toContain("/win98-icons/computer_2_cool-4.png");
  expect(legacy.naturalWidth).toBe(48);

  await page.getByRole("button", { name: "手機版" }).click();
  await page.getByRole("button", { name: "About.exe" }).click();
  await page.getByRole("button", { name: "編輯此視窗" }).click();
  await page.getByRole("button", { name: "完成編輯" }).click();
  await page.locator(".m-toolbar").getByRole("button", { name: "編輯" }).click();
  await expect(page.getByLabel("搜尋 Windows 圖示")).toBeVisible();
  await expect(page.getByText("來源：trapd00r/win95-winxp_icons")).toBeVisible();
});
