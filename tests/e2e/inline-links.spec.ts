import { expect, test, type Page } from "@playwright/test";
import { createStarterDocument, makeLink, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";

async function fixture(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "inline@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } })));
  const legacy = createStarterDocument("Inline links", "classic98", "blank");
  const links = makeWindow("links"); links.id = "links"; links.title = "Links.exe"; links.defaultOpen = true;
  links.layout.desktop = { ...links.layout.desktop, x: 40, y: 30, w: 400, h: 600 };
  links.content.links = Array.from({ length: 10 }, (_, index) => makeLink({ id: `link-${index}`, label: `Link ${index}`, url: `https://example.com/${"long-path/".repeat(20)}` }));
  const about = makeWindow("about"); about.id = "about"; about.title = "About.exe"; about.defaultOpen = false;
  legacy.windows = [links, about];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "inline" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  let document = migrated.document, version = 1;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/draft")) { document = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-22T00:00:00Z" } }); }
    if (url.pathname === "/api/sites/inline") return route.fulfill({ json: { site: { id: "inline", username: "inline", site_name: document.siteName, draft_document: document, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } });
    if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.goto("/editor/inline");
  if (width < 768) {
    await page.locator(".m-icon").getByText("Links.exe", { exact: true }).click();
    await page.locator(".m-edit-toggle").click();
  } else {
    await page.getByRole("dialog", { name: "Links.exe", exact: true }).getByLabel("貼上網址，自動做成按鈕").click();
  }
  return { editor: page.locator(".links-editor"), saved: () => document };
}

for (const width of [1440, 320, 375, 390, 430]) {
  test(`inline links paste, panels, sorting and viewport at ${width}px`, async ({ page }) => {
    const { editor } = await fixture(page, width);
    const paste = editor.getByLabel("貼上網址，自動做成按鈕");
    await paste.fill("instagram.com/mochi");
    await expect(editor.getByText("會建立：Instagram 按鈕（之後都能改）")).toBeVisible();
    await paste.press("Enter");
    const added = editor.locator(".link-editor-card").last();
    await expect(added.getByLabel("按鈕文字", { exact: true })).toHaveValue("Instagram");
    await expect(added.locator(".link-tile")).toHaveCSS("background-color", "rgb(194, 24, 91)");
    await added.getByLabel("按鈕文字", { exact: true }).press("Alt+ArrowUp");
    await expect(editor.locator(".link-editor-card").nth(9).getByLabel("按鈕文字", { exact: true })).toHaveValue("Instagram");
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await expect(added.getByLabel("按鈕文字", { exact: true })).toHaveValue("Instagram");
    const first = editor.locator(".link-editor-card").first();
    await first.getByRole("button", { name: "設定連結 Link 0", exact: true }).click();
    const url = first.getByLabel("連結網址", { exact: true });
    await url.fill("javascript:alert(1)");
    await expect(first.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(first.getByRole("button", { name: "設定連結 Link 0", exact: true })).toBeFocused();
    await first.getByRole("button", { name: "設定連結 Link 0", exact: true }).click();
    await expect(url).toHaveValue(/^https:\/\/example.com/);
    await first.getByRole("radio", { name: "打開我桌面上的視窗" }).check();
    await first.getByRole("button", { name: "About.exe", exact: true }).click();
    await first.getByRole("button", { name: "完成", exact: true }).click();
    await expect(first.getByText("開啟視窗：About.exe", { exact: true })).toBeVisible();
    await first.getByRole("button", { name: "換顏色", exact: true }).click();
    await expect(first.locator(".link-colors")).toBeVisible();
    await first.getByRole("button", { name: "選擇圖示", exact: true }).click();
    await expect(first.locator(".link-colors")).toHaveCount(0);
    await expect(first.locator(".link-icon-grid")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(() => editor.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await editor.locator(".link-editor-list").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(paste).toBeInViewport({ ratio: 1 });
    await expect(editor.getByRole("button", { name: "＋ 空白按鈕", exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath(`links-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("composition does not add a link and rejected input stays local", async ({ page }) => {
  const { editor } = await fixture(page);
  const paste = editor.getByLabel("貼上網址，自動做成按鈕");
  await paste.fill("example.com");
  await paste.dispatchEvent("compositionstart");
  await paste.press("Enter");
  await expect(editor.locator(".link-editor-card")).toHaveCount(10);
  await paste.dispatchEvent("compositionend");
  await paste.fill("not a URL"); await paste.press("Enter");
  await expect(editor.getByRole("alert")).toContainText("這看起來不像網址");
  await expect(editor.locator(".link-editor-card")).toHaveCount(10);
});

test("slow inline icon upload cannot overwrite a full-library choice", async ({ page }) => {
  const { editor, saved } = await fixture(page);
  let release!: () => void;
  let started = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/sites/inline/assets", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets: [] } });
    started = true; await held;
    return route.fulfill({ json: { asset: { id: "11111111-1111-4111-8111-111111111111", url: "retro-asset:11111111-1111-4111-8111-111111111111", name: "slow.png", kind: "icon", mimeType: "image/png", size: 68 } } });
  });
  const card = editor.locator(".link-editor-card").first();
  await card.getByRole("button", { name: "選擇圖示", exact: true }).click();
  await card.locator('input[type="file"]').setInputFiles({ name: "slow.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64") });
  await expect.poll(() => started).toBe(true);
  await card.getByRole("button", { name: "完整圖庫…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示", exact: true });
  await dialog.getByLabel("搜尋圖示").fill("music");
  await dialog.locator('[data-icon="pixelarticons:music"]').click();
  release();
  await expect(editor.locator('[data-upload-state="failed"]')).toBeAttached();
  await dialog.getByRole("button", { name: "套用", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => {
    const win = saved().windows.find(win => win.id === "links");
    return win?.type === "links" ? win.content.links[0].icon : null;
  }).toBe("pixelarticons:music");
});

test("dragging uses insertion order and short mobile viewport keeps focused controls reachable", async ({ page }) => {
  const { editor } = await fixture(page, 375);
  const first = editor.locator('[data-link-id="link-0"]');
  const second = editor.locator('[data-link-id="link-1"]');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await first.locator(".link-drag").dispatchEvent("dragstart", { dataTransfer: transfer });
  const box = await second.boundingBox();
  await second.dispatchEvent("dragover", { dataTransfer: transfer, clientY: box!.y + box!.height - 1 });
  await second.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(editor.locator(".link-editor-card").nth(1)).toHaveAttribute("data-link-id", "link-0");
  await page.setViewportSize({ width: 375, height: 520 });
  await editor.locator(".link-editor-card").last().locator(".link-destination-trigger").click();
  const url = editor.getByLabel("連結網址", { exact: true });
  await url.fill("https://example.com/draft");
  await expect(url).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Escape");
  await expect(editor.locator(".link-editor-card").last().locator(".link-destination-trigger")).toBeFocused();
});

test("a hidden invalid URL draft is not committed when selecting a window", async ({ page }) => {
  const { editor, saved } = await fixture(page);
  const card = editor.locator(".link-editor-card").first();
  await card.locator(".link-destination-trigger").click();
  await card.getByLabel("連結網址", { exact: true }).fill("javascript:alert(1)");
  await card.getByRole("radio", { name: "打開我桌面上的視窗" }).check();
  await card.getByRole("button", { name: "About.exe", exact: true }).click();
  await card.getByRole("button", { name: "完成", exact: true }).click();
  await expect.poll(() => {
    const win = saved().windows.find(win => win.id === "links");
    return win?.type === "links" && win.content.links[0].target === "window" && win.content.links[0].url.startsWith("https://example.com/");
  }).toBe(true);
});

test("library portal shortcuts cannot reorder background links", async ({ page }) => {
  const { editor } = await fixture(page);
  const card = editor.locator(".link-editor-card").first();
  await card.getByRole("button", { name: "選擇圖示", exact: true }).click();
  await card.getByRole("button", { name: "完整圖庫…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示", exact: true });
  await dialog.getByLabel("搜尋圖示").press("Alt+ArrowDown");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editor.locator(".link-editor-card").first()).toHaveAttribute("data-link-id", "link-0");
});

test("direct mobile blank add keeps Escape inside the editor and back discards target drafts", async ({ page }) => {
  const { editor, saved } = await fixture(page, 375);
  await editor.getByRole("button", { name: "＋ 空白按鈕", exact: true }).click();
  const field = editor.getByLabel("連結網址", { exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(field).toHaveCount(0);
  const first = editor.locator(".link-editor-card").first();
  await first.locator(".link-destination-trigger").click();
  await field.fill("https://example.com/unsubmitted");
  await page.locator(".m-back").click();
  await page.locator(".m-icon").getByText("About.exe", { exact: true }).click();
  await page.locator(".m-back").click();
  await page.locator(".m-icon").getByText("Links.exe", { exact: true }).click();
  await page.locator(".m-edit-toggle").click();
  await first.locator(".link-destination-trigger").click();
  await expect(field).not.toHaveValue("https://example.com/unsubmitted");
  const win = saved().windows.find(win => win.id === "links");
  expect(win?.type === "links" && win.content.links[0].url).not.toBe("https://example.com/unsubmitted");
});

test("touch users can reorder from the grip without native drag support", async ({ page }) => {
  const { editor } = await fixture(page, 320);
  const first = editor.locator('[data-link-id="link-0"]');
  await first.locator(".link-drag").click();
  await first.getByRole("button", { name: "下移", exact: true }).click();
  await expect(editor.locator(".link-editor-card").nth(1)).toHaveAttribute("data-link-id", "link-0");
  await first.getByRole("button", { name: "上移", exact: true }).click();
  await expect(editor.locator(".link-editor-card").first()).toHaveAttribute("data-link-id", "link-0");
});
