import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, normalizeDocument, projectPublicSiteDocument, type SiteDocumentV2Input } from "../../packages/shared/src";
import { documentFixture } from "./fixture";

const SESSION = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const LEGACY_CAPTION = "舊版圖片下方的圖說";

function documentWithBlocks(long = false, compact = false): SiteDocumentV2Input {
  const documentWindow = makeWindow("document");
  if (documentWindow.type !== "document") throw new Error("Expected document window");
  documentWindow.id = "document-1";
  documentWindow.title = "Document.exe";
  documentWindow.layout.desktop = { ...documentWindow.layout.desktop, x: 40, y: 24, w: 480, h: 650 };
  documentWindow.content.blocks = [
    { id: "heading", kind: "heading", text: long ? "Heading".repeat(70) : "文件標題" },
    { id: "text", kind: "text", text: long ? "LongUnbrokenParagraph".repeat(80) : "可直接編輯的段落", bold: false, italic: false, align: "left" },
    { id: "image", kind: "image", src: "https://assets.test/document.png", srcUrl: "", alt: long ? "圖片替代文字".repeat(40) : LEGACY_CAPTION },
    { id: "button", kind: "button", text: long ? "Button".repeat(30) : "開啟網站", url: "https://example.com/" + (long ? "destination".repeat(80) : "button") },
    { id: "link", kind: "link", text: long ? "Link".repeat(120) : "網站連結", url: "https://example.com/" + (long ? "destination".repeat(80) : "link") },
    { id: "list", kind: "list", text: long ? "ListItem".repeat(80) : "第一項\n第二項" },
    { id: "divider", kind: "divider" }
  ];
  if (compact) documentWindow.content.blocks = documentWindow.content.blocks.filter(block => ["heading", "text", "divider"].includes(block.id));
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [documentWindow, { ...structuredClone(documentWindow), id: "document-2", title: "Other document", defaultOpen: false }] }), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Document fixture migration failed");
  return migrated.document;
}

async function openDocument(page: Page, options: { width?: number; long?: boolean; compact?: boolean } = {}) {
  const width = options.width ?? 1280;
  let draft = documentWithBlocks(options.long, options.compact);
  let version = 1;
  const saves: SiteDocumentV2Input[] = [];
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), SESSION);
  await page.route("https://assets.test/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='#c5d8ed'/></svg>" }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    draft = structuredClone(route.request().postDataJSON().document as SiteDocumentV2Input);
    saves.push(draft);
    version++;
    return route.fulfill({ json: { version, updatedAt: "2026-10-17T00:01:00.000Z" } });
  });
  await page.route("**/api/public/sites/demo", (route) => {
    const publicDocument = projectPublicSiteDocument(draft, "site-1");
    if (!publicDocument.ok) throw new Error("Document public projection failed");
    return route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: publicDocument.document, published_version: version, published_at: "2026-10-17T00:01:00.000Z" } } });
  });
  await page.goto("/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: "Document.exe", exact: true }).click();
    await enterContentEditor(page);
  }
  const dialog = page.getByRole("dialog", { name: "Document.exe", exact: true });
  await expect(dialog.locator(".document-editor")).toBeVisible();
  return { dialog, saves, getDraft: () => draft };
}

async function expectContained(page: Page, surface: Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => surface.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

test("document advanced fields follow the selected block, including keyboard-selected images and dividers", async ({ page }) => {
  const { dialog } = await openDocument(page);
  await expect(dialog.getByLabel("圖片網址", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("按鈕網址", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("連結網址", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("段落", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("標題", { exact: true })).toHaveAttribute("maxlength", "500");

  const paragraph = dialog.getByLabel("段落", { exact: true });
  await paragraph.focus();
  await dialog.locator('[data-block-id="image"]').focus();
  const image = dialog.getByRole("group", { name: "圖片區塊 3", exact: true });
  await expect(image).toBeFocused();
  await expect(image.getByRole("group", { name: "圖片設定" })).toBeVisible();
  await expect(image.getByLabel("圖說", { exact: true })).toHaveAttribute("maxlength", "300");
  await expect(image.getByLabel("替代文字", { exact: true })).toHaveAttribute("maxlength", "300");
  await expect(image.getByLabel("圖片網址", { exact: true })).toHaveAttribute("maxlength", "2048");

  // Selecting a different block must let the URL field commit on blur before
  // its active-only settings unmount.
  await image.getByLabel("圖片網址", { exact: true }).fill("https://assets.test/changed.png");
  await dialog.getByLabel("連結文字", { exact: true }).click();
  await expect(image.locator("img")).toHaveAttribute("src", "https://assets.test/changed.png");

  await dialog.getByLabel("連結文字", { exact: true }).focus();
  await expect(dialog.getByLabel("連結網址", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("圖片網址", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("按鈕網址", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("連結網址", { exact: true }).fill("javascript:alert(1)");
  await expect(dialog.getByRole("alert")).toContainText("完整的");
  await dialog.getByLabel("連結網址", { exact: true }).fill("https://example.com/new");
  await expect(dialog.getByRole("alert")).toHaveCount(0);

  await dialog.getByLabel("按鈕文字", { exact: true }).focus();
  await expect(dialog.getByLabel("按鈕網址", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("連結網址", { exact: true })).toHaveCount(0);
  const list = dialog.getByLabel("清單，每行一項", { exact: true });
  await list.focus();
  await dialog.locator('[data-block-id="divider"]').focus();
  const divider = dialog.getByRole("group", { name: "分隔線區塊 7", exact: true });
  await expect(divider).toBeFocused();
  await expect(divider.getByRole("button", { name: "刪除區塊", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("按鈕網址", { exact: true })).toHaveCount(0);
});

test("document captions and alt remain independent through undo, reload and public projection", async ({ page }) => {
  const { dialog, getDraft } = await openDocument(page);
  const image = dialog.locator('[data-block-id="image"]');
  await expect(image.locator("figcaption")).toHaveText(LEGACY_CAPTION);
  await image.focus();
  await image.getByLabel("替代文字", { exact: true }).fill("藍色背景上的角色插畫");
  await expect(image.locator("figcaption")).toHaveText(LEGACY_CAPTION);
  await expect(image.locator("img")).toHaveAttribute("alt", "藍色背景上的角色插畫");
  await image.getByLabel("圖說", { exact: true }).fill("");
  await expect(image.locator("figcaption")).toHaveCount(0);

  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(image.getByLabel("圖說", { exact: true })).toHaveValue(LEGACY_CAPTION);
  await expect(image.getByLabel("替代文字", { exact: true })).toHaveValue("藍色背景上的角色插畫");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(image.getByLabel("替代文字", { exact: true })).toHaveValue(LEGACY_CAPTION);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(image.locator("figcaption")).toHaveCount(0);

  await expect.poll(() => {
    const document = getDraft().windows.find((window) => window.id === "document-1");
    return document?.type === "document" ? document.content.blocks.find((block) => block.id === "image") : null;
  }).toMatchObject({ caption: "", alt: "藍色背景上的角色插畫" });
  await page.reload();
  await expect(dialog.locator(".document-editor")).toBeVisible();
  await expect(image.locator("figcaption")).toHaveCount(0);
  await image.focus();
  await expect(image.getByLabel("圖說", { exact: true })).toHaveValue("");
  await expect(image.getByLabel("替代文字", { exact: true })).toHaveValue("藍色背景上的角色插畫");

  await page.goto("/@demo");
  const publicDocument = page.getByRole("dialog", { name: "Document.exe", exact: true });
  await expect(publicDocument.locator(".document-view img")).toHaveAttribute("alt", "藍色背景上的角色插畫");
  await expect(publicDocument.locator("figcaption")).toHaveCount(0);
  await expect(publicDocument.getByRole("link", { name: "開啟網站" })).toHaveAttribute("href", "https://example.com/button");
  await expect(publicDocument.getByRole("link", { name: "網站連結" })).toHaveAttribute("href", "https://example.com/link");
});

test("document add, reorder and remove each remain undoable", async ({ page }) => {
  const { dialog } = await openDocument(page);
  await dialog.getByRole("button", { name: "插入", exact: true }).click();
  await dialog.getByRole("menuitem", { name: "標題", exact: true }).click();
  const blocks = dialog.locator(".doc-block");
  await expect(blocks).toHaveCount(8);
  const newId = await blocks.last().getAttribute("data-block-id");
  expect(newId).toBeTruthy();
  const added = dialog.locator(`.doc-block[data-block-id="${newId}"]`);
  await added.getByLabel("標題", { exact: true }).fill("新的內容標題");
  await added.getByLabel("標題", { exact: true }).press("Alt+ArrowUp");
  await expect(blocks.nth(6)).toHaveAttribute("data-block-id", newId!);
  await added.getByRole("button", { name: "刪除區塊", exact: true }).click();
  await expect(blocks).toHaveCount(7);

  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(blocks).toHaveCount(8);
  await expect(blocks.nth(6)).toHaveAttribute("data-block-id", newId!);
  await expect(added.getByLabel("標題", { exact: true })).toHaveValue("新的內容標題");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(blocks.last()).toHaveAttribute("data-block-id", newId!);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(blocks).toHaveCount(7);
});

for (const width of [320, 375, 390, 430]) {
  test(`long document content and active controls fit ${width}px editor and public pages`, async ({ page }) => {
    const { dialog } = await openDocument(page, { width, long: true });
    const editor = dialog.locator(".document-editor");
    await expectContained(page, editor);
    await dialog.locator('[data-block-id="text"]').focus();
    await expect(dialog.getByRole("toolbar", { name: "段落格式", exact: true })).toBeVisible();
    await expectContained(page, editor);
    await dialog.locator('[data-block-id="image"]').focus();
    await expect(dialog.getByLabel("替代文字", { exact: true })).toBeVisible();
    await expectContained(page, editor);
    await dialog.getByLabel("按鈕文字", { exact: true }).focus();
    await expect(dialog.getByLabel("按鈕網址", { exact: true })).toBeVisible();
    await expectContained(page, editor);
    await dialog.getByLabel("連結文字", { exact: true }).focus();
    await expect(dialog.getByLabel("連結網址", { exact: true })).toBeVisible();
    await expectContained(page, editor);

    await page.getByRole("button", { name: "完成" }).click();
    await expectContained(page, dialog.locator(".document-view"));
    await page.goto("/@demo");
    await page.getByRole("button", { name: "Document.exe", exact: true }).click();
    const publicView = page.getByRole("dialog", { name: "Document.exe", exact: true }).locator(".document-view");
    await expect(publicView).toBeVisible();
    await expectContained(page, publicView);
  });
}

for (const width of [1280, 320, 375, 390, 430]) {
  test(`inline paper keeps toolbar visible and controls usable at ${width}px`, async ({ page }, testInfo) => {
    const { dialog } = await openDocument(page, { width });
    const paragraph = dialog.getByLabel("段落", { exact: true });
    await paragraph.focus();
    await expect(dialog.getByRole("toolbar")).toBeVisible();
    if (width < 768) {
      await expect(paragraph).toHaveCSS("font-size", "15px");
      expect((await paragraph.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const button of await dialog.getByRole("toolbar").getByRole("button").all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await dialog.getByRole("button", { name: "粗體", exact: true }).click();
    await expect(paragraph).toBeFocused();
    await expect(paragraph).toHaveCSS("font-weight", "700");
    await paragraph.press("Control+i");
    await expect(paragraph).toHaveCSS("font-style", "italic");
    await paragraph.fill("Long paragraph\n".repeat(40));
    await dialog.locator(".doc-page").evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect.poll(() => dialog.locator(".doc-page").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.locator(".doc-status")).toBeInViewport();
    expect(await dialog.locator(".retro-window-body, .m-win-body").evaluate((node) => node.scrollTop)).toBe(0);
    await expect(dialog.getByRole("toolbar")).toBeInViewport();
    await paragraph.fill("可直接編輯的段落");
    await dialog.locator(".doc-page").evaluate((node) => node.scrollTo(0, 0));
    await expectContained(page, dialog.locator(".document-editor"));
    await page.screenshot({ path: testInfo.outputPath(`document-${width}.png`) });
  });
}

test("split selection, slash menu cancellation, conversion, empty deletion and append preserve focus and history", async ({ page }) => {
  const { dialog } = await openDocument(page);
  const paragraph = dialog.getByLabel("段落", { exact: true }).first();
  await paragraph.fill("beforeSELECTafter");
  await paragraph.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(6, 12));
  await paragraph.press("Enter");
  const paragraphs = dialog.getByLabel("段落", { exact: true });
  await expect(paragraphs.nth(0)).toHaveValue("before");
  await expect(paragraphs.nth(1)).toHaveValue("after");
  await expect(paragraphs.nth(1)).toBeFocused();
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(paragraph).toHaveValue("beforeSELECTafter");
  await paragraph.fill("");
  await paragraph.press("/");
  await expect(dialog.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(paragraph).toBeFocused();
  await expect(dialog.getByRole("menu")).toHaveCount(0);
  await paragraph.press("/");
  await dialog.getByRole("menuitem", { name: "清單", exact: true }).click();
  const list = dialog.getByLabel("清單，每行一項", { exact: true }).first();
  await expect(list).toBeFocused();
  await list.press("Backspace");
  await expect(dialog.getByLabel("標題", { exact: true })).toBeFocused();
  await dialog.locator(".doc-append").click();
  const last = dialog.getByLabel("段落", { exact: true }).last();
  await expect(last).toBeFocused();
  await dialog.locator(".doc-append").click();
  await expect(last).toBeFocused();
  await last.press("/");
  await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
});

test("undo while slash menu is open cannot erase restored text", async ({ page }) => {
  const { dialog } = await openDocument(page);
  const paragraph = dialog.getByLabel("段落", { exact: true });
  await paragraph.fill("");
  await paragraph.press("/");
  await page.keyboard.press("Control+z");
  await expect(paragraph).toHaveValue("可直接編輯的段落");
  if (await dialog.getByRole("menu").isVisible()) await dialog.getByRole("menuitem", { name: "圖片", exact: true }).click();
  await expect(paragraph).toHaveValue("可直接編輯的段落");
});

test("IME Enter is ignored and conversion limits keep long text intact", async ({ page }) => {
  const { dialog } = await openDocument(page);
  const paragraph = dialog.getByLabel("段落", { exact: true });
  await paragraph.focus();
  await paragraph.dispatchEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229 });
  await expect(dialog.locator(".doc-block")).toHaveCount(7);
  await paragraph.fill("x".repeat(501));
  await dialog.getByLabel("段落樣式", { exact: true }).selectOption("heading");
  await expect(dialog.locator(".doc-error")).toBeVisible();
  await expect(paragraph).toHaveValue("x".repeat(501));
  await dialog.locator(".doc-error").getByRole("button", { name: "關閉" }).click();
  await expect(dialog.locator(".doc-error")).toHaveCount(0);
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
async function uploads(page: Page, failOnce = false) {
  let release: (() => void) | undefined;
  let calls = 0;
  await page.route("**/api/sites/site-1/assets**", async (route) => {
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets: [] } });
    calls++;
    if (failOnce && calls === 1) return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    await new Promise<void>((resolve) => { release = resolve; });
    const id = `00000000-0000-4000-8000-${String(calls).padStart(12, "0")}`;
    return route.fulfill({ json: { asset: { id, url: `retro-asset:${id}`, name: "held.png", kind: "image", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-22T00:00:00Z" } } });
  });
  return { calls: () => calls, release: () => release?.() };
}

async function dropImages(page: Page, target: Locator, count = 1) {
  const transfer = await page.evaluateHandle(({ bytes, count }) => {
    const data = new DataTransfer();
    for (let index = 0; index < count; index++) data.items.add(new File([new Uint8Array(bytes)], `${index}.png`, { type: "image/png" }));
    return data;
  }, { bytes: Array.from(PNG), count });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
}

test("dropped image placeholders retain order, retry and newer URL protection", async ({ page }) => {
  const { dialog, getDraft } = await openDocument(page);
  const queue = await uploads(page, true);
  await dropImages(page, dialog.locator(".doc-append"), 2);
  await expect(dialog.locator(".doc-block")).toHaveCount(9);
  await expect(dialog.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await expect.poll(queue.calls).toBe(2);
  queue.release();
  await expect(dialog.locator('[data-upload-state="completed"]')).toHaveCount(1);
  const first = dialog.locator(".doc-block").nth(7);
  const second = dialog.locator(".doc-block").nth(8);
  await first.focus();
  await first.getByLabel("圖說", { exact: true }).fill("Reserved caption");
  await dialog.getByRole("button", { name: "重試 0.png", exact: true }).click();
  await expect.poll(queue.calls).toBe(3);
  await first.getByLabel("圖片網址", { exact: true }).fill("https://assets.test/newer.png");
  await first.getByLabel("圖片網址", { exact: true }).press("Enter");
  queue.release();
  await expect(first.locator("img")).toHaveAttribute("src", "https://assets.test/newer.png");
  await expect(second.locator("img")).toBeVisible();
  await expect.poll(() => {
    const win = getDraft().windows.find((item) => item.id === "document-1");
    return win?.type === "document" ? win.content.blocks.slice(-2) : [];
  }).toMatchObject([{ src: "https://assets.test/newer.png", caption: "Reserved caption" }, { src: expect.stringMatching(/^retro-asset:/) }]);
});

test("dropping multiple files into an empty image fills it and adds remaining files", async ({ page }) => {
  const { dialog } = await openDocument(page);
  const queue = await uploads(page);
  const image = dialog.locator('[data-block-id="image"]');
  await image.focus();
  await image.getByRole("button", { name: "移除圖片", exact: true }).click();
  await dropImages(page, image.locator(".doc-image-drop"), 2);
  await expect(dialog.locator(".doc-block")).toHaveCount(8);
  await expect.poll(queue.calls).toBe(1);
  queue.release();
  await expect.poll(queue.calls).toBe(2);
  queue.release();
  await expect(dialog.locator('[data-upload-state="completed"]')).toHaveCount(2);
  await expect(image.locator("img")).toBeVisible();
  await expect(dialog.locator(".doc-block").nth(3).locator("img")).toBeVisible();
});

test("late upload stays in its original window and never steals another window's focus", async ({ page }) => {
  const { dialog, getDraft } = await openDocument(page);
  const queue = await uploads(page);
  const image = dialog.locator('[data-block-id="image"]');
  await image.focus();
  await image.getByLabel("更換圖片…", { exact: true }).setInputFiles({ name: "held.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(queue.calls).toBe(1);
  await page.locator(".task-items").getByRole("button", { name: "Other document", exact: true }).click();
  const other = page.getByRole("dialog", { name: "Other document", exact: true });
  const paragraph = other.getByLabel("段落", { exact: true });
  await paragraph.fill("Keep this focus and text");
  queue.release();
  await expect.poll(() => {
    const win = getDraft().windows.find((item) => item.id === "document-1");
    return win?.type === "document" ? win.content.blocks.find((block) => block.kind === "image") : null;
  }).toMatchObject({ src: expect.stringMatching(/^retro-asset:/), alt: LEGACY_CAPTION });
  await expect(paragraph).toBeFocused();
  await expect(paragraph).toHaveValue("Keep this focus and text");
  await expect(other.locator('[data-block-id="image"] img')).toHaveAttribute("src", "https://assets.test/document.png");
});

test("drag sorting and invalid file drop do not mutate neighboring blocks", async ({ page }) => {
  const { dialog } = await openDocument(page, { compact: true });
  const handle = dialog.locator('[data-block-id="heading"] .doc-drag-handle');
  const source = await handle.boundingBox(), target = await dialog.locator(".doc-block").last().boundingBox();
  if (!source || !target) throw new Error("drag targets unavailable");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 18, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 4, { steps: 12 });
  await page.mouse.up();
  await expect(dialog.locator(".doc-block").last()).toHaveAttribute("data-block-id", "heading");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(dialog.locator(".doc-block").first()).toHaveAttribute("data-block-id", "heading");
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer(); data.items.add(new File(["test"], "test.txt", { type: "text/plain" })); return data;
  });
  await dialog.locator(".doc-append").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog.locator(".doc-error")).toContainText("只能拖曳圖片");
  await expect(dialog.locator(".doc-block")).toHaveCount(3);
  await transfer.dispose();
});
