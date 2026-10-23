import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { makeGalleryImage, makeWindow, migrateSiteDocumentV2, normalizeDocument } from "../../packages/shared/src";
import { documentFixture } from "./fixture";

test.use({ hasTouch: true });

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
async function openEditor(page: Page, type: "document" | "gallery" | "about", width = 1280) {
  const win = makeWindow(type);
  win.id = type;
  win.title = `${type}.exe`;
  win.defaultOpen = true;
  win.layout.desktop = { ...win.layout.desktop, x: 10, y: 10, w: 460, h: 700 };
  if (win.type === "gallery") win.content.images = ["one", "two", "three"].map(id => makeGalleryImage({ id, title: id, src: `https://assets.test/${id}.png`, srcUrl: `https://assets.test/${id}.png` }));
  if (win.type === "document") win.content.blocks = [
    { id: "one", kind: "image", src: "https://assets.test/one.png", srcUrl: "https://assets.test/one.png", alt: "Original legacy caption" },
    { id: "two", kind: "text", text: "Keep this paragraph", bold: false, italic: false, align: "left" },
    { id: "three", kind: "image", src: null, srcUrl: "", alt: "", caption: "" }
  ];
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [win] }), { siteId: "site-1" });
  if (!migrated.ok) throw new Error("invalid inline fixture");
  let draft = migrated.document;
  let version = 1;
  await page.addInitScript(value => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", route => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", route => {
    draft = structuredClone(route.request().postDataJSON().document);
    return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:00:00Z" } });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: win.title, exact: true }).click();
    await enterContentEditor(page);
  }
  const editor = page.getByRole("dialog", { name: win.title, exact: true });
  await expect(editor.locator(`.${type === "document" ? "document" : type === "gallery" ? "gal" : "about"}-editor`)).toBeVisible();
  return { editor, saved: () => draft.windows[0] };
}

test("gallery composition confirmation does not insert and clear an unfinished URL", async ({ page }) => {
  const { editor } = await openEditor(page, "gallery");
  await editor.locator(".gal-editor-toolbar button[aria-expanded]").click();
  const input = editor.getByLabel("新增圖片網址", { exact: true });
  await input.fill("https://assets.test/composing.png");
  await input.dispatchEvent("compositionstart", { data: "" });
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229 });
  await expect(editor.locator(".gal-editor-thumb")).toHaveCount(3);
  await expect(input).toHaveValue("https://assets.test/composing.png");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: false, keyCode: 13 });
  await expect(editor.locator(".gal-editor-thumb")).toHaveCount(3);
  await input.dispatchEvent("compositionend", { data: "確定" });
  // Safari can expose the composition-confirmation Enter as keyCode 229.
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: false, keyCode: 229 });
  await expect(editor.locator(".gal-editor-thumb")).toHaveCount(3);
  await input.press("Enter");
  await expect(editor.locator(".gal-editor-thumb")).toHaveCount(4);
  await editor.locator(".gal-editor-toolbar button[aria-expanded]").click();
  await expect(input).toHaveValue("");
});

test("gallery deleting selected image keeps keyboard focus in its thumbnail list", async ({ page }) => {
  const { editor } = await openEditor(page, "gallery");
  // This fixture's 700px window exceeds the canvas below the wrapped shell.
  // Use the real view-state action; it must not resize the canonical window.
  const before=await page.evaluate(async()=>{const {useEditorStore}=await import('/src/features/editor/store.ts');const s=useEditorStore.getState();return {document:s.document,past:s.past.length};});
  await editor.getByRole("button",{name:"最大化",exact:true}).click();
  expect(await page.evaluate(async()=>{const {useEditorStore}=await import('/src/features/editor/store.ts');const s=useEditorStore.getState();return {document:s.document,past:s.past.length};})).toEqual(before);
  await editor.getByRole("button", { name: "選取圖片 2：two", exact: true }).click();
  await editor.getByRole("button", { name: "刪除圖片", exact: true }).click();
  await expect(editor.getByRole("button", { name: "選取圖片 2：three", exact: true })).toBeFocused();
  await expect(editor.getByLabel("圖片標題", { exact: true })).toHaveValue("three");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(editor.locator(".gal-editor-thumb")).toHaveCount(3);
  await expect(editor.getByLabel("圖片標題", { exact: true })).toHaveValue("three");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(editor.locator(".gal-editor-thumb")).toHaveCount(2);
  await editor.getByRole("button", { name: "刪除圖片", exact: true }).click();
  await expect(editor.locator('[data-image-id="one"]')).toBeFocused();
  await editor.getByRole("button", { name: "刪除圖片", exact: true }).click();
  await expect(editor.locator(".gal-editor-toolbar button[aria-expanded]")).toBeFocused();
});

test("document deleting selected block keeps keyboard focus on the next block", async ({ page }) => {
  const { editor } = await openEditor(page, "document");
  await editor.locator('[data-block-id="one"] img').click();
  await expect(editor.getByLabel("圖片網址", { exact: true })).toBeVisible();
  await editor.locator('.doc-block[data-active="true"]').getByRole("button", { name: "刪除區塊", exact: true }).click();
  await expect(editor.locator('[data-block-id="two"] [data-primary]')).toBeFocused();
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(editor.locator('[data-block-id="one"]')).toBeVisible();
  await expect(editor.getByLabel("段落", { exact: true })).toHaveValue("Keep this paragraph");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(editor.locator('[data-block-id="one"]')).toHaveCount(0);
  await editor.locator('.doc-block[data-active="true"]').getByRole("button", { name: "刪除區塊", exact: true }).click();
  await expect(editor.locator('[data-block-id="three"]')).toBeFocused();
  await editor.locator('.doc-block[data-active="true"]').getByRole("button", { name: "刪除區塊", exact: true }).click();
  await expect(editor.locator(".doc-append")).toBeFocused();
});

for (const width of [320, 390, 430]) {
  test(`gallery normal taps preserve source/caption/alt and reload at ${width}px`, async ({ page }, testInfo) => {
    const site = await openEditor(page, "gallery", width);
    const { editor } = site;
    await editor.locator('[data-image-id="two"]').tap();
    const source = editor.getByLabel("圖片網址", { exact: true });
    await source.fill("https://assets.test/edited-second.png");
    await editor.locator('[data-image-id="three"]').tap();
    await editor.locator('[data-image-id="two"]').tap();
    await expect(source).toHaveValue("https://assets.test/edited-second.png");
    const caption = "Caption".repeat(80);
    const alt = "Description".repeat(20);
    await editor.getByLabel("圖說", { exact: true }).fill(caption);
    await editor.getByLabel("替代文字", { exact: true }).fill(alt);
    await expect.poll(() => { const win = site.saved(); return win.type === "gallery" ? win.content.images[1] : null; }).toMatchObject({ src: "https://assets.test/edited-second.png", caption, alt });
    await expect(editor.getByLabel("替代文字", { exact: true })).toHaveValue(alt);
    await assertFits(page, editor.locator(".gal-editor"));
    await capture(page, `gallery-${width}.png`, testInfo);
    await page.reload();
    await reopenMobile(page, "gallery.exe");
    await editor.locator('[data-image-id="two"]').tap();
    await expect(source).toHaveValue("https://assets.test/edited-second.png");
    await expect(editor.getByLabel("圖說", { exact: true })).toHaveValue(caption);
    await expect(editor.getByLabel("替代文字", { exact: true })).toHaveValue(alt);
    await editor.getByRole("button", { name: "刪除圖片", exact: true }).tap();
    await expect(editor.locator('[data-image-id="three"]')).toBeFocused();
  });

  test(`document normal taps retain legacy caption and paragraph through save/reload at ${width}px`, async ({ page }, testInfo) => {
    const site = await openEditor(page, "document", width);
    const { editor } = site;
    const image = editor.locator('[data-block-id="one"]');
    await image.locator("img").tap();
    await image.getByLabel("圖片網址", { exact: true }).fill("https://assets.test/replaced.png");
    const paragraph = editor.getByLabel("段落", { exact: true });
    await paragraph.tap();
    const text = "文字與長段落".repeat(100);
    await paragraph.fill(text);
    await image.locator("img").tap();
    await expect(image.getByLabel("圖片網址", { exact: true })).toHaveValue("https://assets.test/replaced.png");
    await image.getByLabel("替代文字", { exact: true }).fill("Independent description");
    await expect(image.getByLabel("圖說", { exact: true })).toHaveValue("Original legacy caption");
    await expect.poll(() => { const win = site.saved(); return win.type === "document" ? win.content.blocks[0] : null; }).toMatchObject({ src: "https://assets.test/replaced.png", caption: "Original legacy caption", alt: "Independent description" });
    await assertFits(page, editor.locator(".document-editor"));
    await capture(page, `document-${width}.png`, testInfo);
    await page.reload();
    await reopenMobile(page, "document.exe");
    await expect(paragraph).toHaveValue(text);
    await image.locator("img").tap();
    await expect(image.getByLabel("圖說", { exact: true })).toHaveValue("Original legacy caption");
    await expect(image.getByLabel("替代文字", { exact: true })).toHaveValue("Independent description");
    await editor.locator('.doc-block[data-active="true"]').getByRole("button", { name: "刪除區塊", exact: true }).tap();
    await expect(editor.locator('[data-block-id="two"] [data-primary]')).toBeFocused();
  });

  test(`About text and custom fields retain focus and persist at ${width}px`, async ({ page }, testInfo) => {
    const site = await openEditor(page, "about", width);
    const { editor } = site;
    const nickname = editor.getByLabel("暱稱", { exact: true });
    await nickname.tap();
    await nickname.fill("LongNickname".repeat(12));
    await expect(nickname).toBeFocused();
    await editor.getByLabel("簡介", { exact: true }).fill("About text\n".repeat(40));
    await editor.getByLabel("＋ 新增欄位", { exact: true }).fill("新欄位");
    await editor.getByLabel("＋ 新增欄位", { exact: true }).press("Enter");
    const key = editor.getByLabel("欄位名稱", { exact: true }).last();
    await key.fill("自訂欄位".repeat(20));
    await expect(key).toBeFocused();
    await editor.getByLabel("欄位內容", { exact: true }).last().fill("LongValue".repeat(50));
    await expect.poll(() => { const win = site.saved(); return win.type === "about" ? win.content.fields.at(-1)?.value : null; }).toBe("LongValue".repeat(50));
    await assertFits(page, editor.locator(".about-editor"));
    await capture(page, `about-${width}.png`, testInfo);
    await page.reload();
    await reopenMobile(page, "about.exe");
    await expect(nickname).toHaveValue("LongNickname".repeat(12));
    await expect(editor.getByLabel("簡介", { exact: true })).toHaveValue("About text\n".repeat(40));
    await expect(editor.getByLabel("欄位名稱", { exact: true }).last()).toHaveValue("自訂欄位".repeat(20));
    await expect(editor.getByLabel("欄位內容", { exact: true }).last()).toHaveValue("LongValue".repeat(50));
  });
}

async function reopenMobile(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await enterContentEditor(page);
}
async function assertFits(page: Page, root: import("@playwright/test").Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => root.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}
async function capture(page: Page, name: string, testInfo: import("@playwright/test").TestInfo) {
  const dir = process.env.INLINE_EDITOR_SCREENSHOTS;
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: dir ? `${dir}/${name}` : testInfo.outputPath(name), fullPage: true });
}


test("gallery caption and alt Undo/Redo preserve the selected image", async ({ page }) => {
  const site = await openEditor(page, "gallery");
  const editor = site.editor;
  await editor.locator('[data-image-id="two"]').click();
  await editor.getByLabel("圖說", { exact: true }).fill("Visible caption");
  await editor.getByLabel("替代文字", { exact: true }).fill("Independent description");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(editor.getByLabel("替代文字", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("圖說", { exact: true })).toHaveValue("Visible caption");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(editor.getByLabel("替代文字", { exact: true })).toHaveValue("Independent description");
  await expect.poll(() => { const win = site.saved(); return win.type === "gallery" ? win.content.images[1].alt : null; }).toBe("Independent description");
});
