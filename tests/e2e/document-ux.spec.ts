import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, normalizeDocument, projectPublicSiteDocument, type SiteDocumentV2Input } from "../../packages/shared/src";
import { documentFixture } from "./fixture";

const SESSION = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const LEGACY_CAPTION = "舊版圖片下方的圖說";

function documentWithBlocks(long = false): SiteDocumentV2Input {
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
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [documentWindow] }), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Document fixture migration failed");
  return migrated.document;
}

async function openDocument(page: Page, options: { width?: number; long?: boolean } = {}) {
  const width = options.width ?? 1280;
  let draft = documentWithBlocks(options.long);
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
    await page.getByRole("button", { name: "編輯內容" }).click();
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
  await paragraph.press("Tab");
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
  await list.press("Tab");
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
  await dialog.getByRole("button", { name: "新增標題", exact: true }).click();
  const blocks = dialog.locator(".doc-block");
  await expect(blocks).toHaveCount(8);
  const newId = await blocks.last().getAttribute("data-block-id");
  expect(newId).toBeTruthy();
  const added = dialog.locator(`.doc-block[data-block-id="${newId}"]`);
  await added.getByLabel("標題", { exact: true }).fill("新的內容標題");
  await added.getByRole("button", { name: "上移", exact: true }).click();
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

for (const width of [320, 375, 430]) {
  test(`long document content and active controls fit ${width}px editor and public pages`, async ({ page }) => {
    const { dialog } = await openDocument(page, { width, long: true });
    const editor = dialog.locator(".document-editor");
    await expectContained(page, editor);
    await dialog.locator('[data-block-id="text"]').focus();
    await expect(dialog.getByRole("group", { name: "段落格式", exact: true })).toBeVisible();
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
