import { expect, test, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createAssetReference, makeGalleryImage, makeWindow, migrateSiteDocumentV2,
  normalizeDocument, projectPublicSiteDocument, replaceAssetReferences
} from "../../packages/shared/src";
import { documentFixture } from "./fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const pickedFile = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

function fixture(long = false, legacyAlt = false) {
  const gallery = makeWindow("gallery");
  if (gallery.type !== "gallery") throw new Error("gallery fixture");
  gallery.id = "gallery-a";
  gallery.title = "Gallery A";
  gallery.defaultOpen = true;
  gallery.layout.desktop = { ...gallery.layout.desktop, x: 10, y: 10, w: 390, h: 680, z: 3 };
  gallery.content.images = long ? [
    makeGalleryImage({ id: "broken", title: "LongImageTitle".repeat(14), caption: "LongVisibleCaption".repeat(45), alt: legacyAlt ? undefined : "DetailedImageDescription".repeat(12), src: "https://assets.test/broken.png", href: "https://example.com/" + "destination".repeat(100) }),
    makeGalleryImage({ id: "empty", title: "沒有圖片", src: null })
  ] : [];
  const other = structuredClone(gallery);
  other.id = "gallery-b";
  other.title = "Gallery B";
  other.defaultOpen = false;
  other.layout.desktop = { ...other.layout.desktop, x: 415, z: 2 };
  other.content.images = [makeGalleryImage({ id: "other-image", title: "Other gallery data", caption: "Keep me", src: "https://assets.test/other.png" })];
  const about = makeWindow("about");
  about.id = "about";
  about.title = "About.exe";
  about.defaultOpen = false;
  const doc = makeWindow("document");
  if (doc.type !== "document") throw new Error("document fixture");
  doc.id = "document";
  doc.title = "Document.exe";
  doc.defaultOpen = false;
  doc.content.blocks = [
    { id: "image-one", kind: "image", src: null, srcUrl: "", alt: "first image", caption: "A caption" },
    { id: "image-two", kind: "image", src: null, srcUrl: "", alt: "second image", caption: "Another caption" }
  ];
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [gallery, other, about, doc] }), { siteId: "site-1" });
  if (!migrated.ok) throw new Error("media fixture migration failed");
  return migrated.document;
}

async function mockMedia(page: Page, { long = false, legacyAlt = false, width = 1440, failOnce = "", hold = "" } = {}) {
  let draft = fixture(long, legacyAlt);
  let published = structuredClone(draft);
  let version = 1;
  let protectedFailure = false;
  const calls: string[] = [];
  const assets: Array<{ id: string; url: string; kind: string; name: string }> = [];
  const held = new Map<string, () => void>();
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", (route) => route.request().url().includes("broken")
    ? route.fulfill({ status: 404, body: "missing" })
    : route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: version, published_document: published, published_version: 1, published_at: "2026-10-17T00:00:00Z", access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    draft = structuredClone(route.request().postDataJSON().document);
    version++;
    return route.fulfill({ json: { version, updatedAt: "2026-10-17T00:01:00Z" } });
  });
  await page.route("**/api/sites/site-1/assets**", async (route: Route) => {
    if (route.request().url().endsWith("/content")) return protectedFailure
      ? route.fulfill({ status: 403, body: "unavailable" })
      : route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets } });
    const body = route.request().postDataBuffer()?.toString() ?? "";
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? "unknown";
    calls.push(name);
    if (name === hold) await new Promise<void>((resolve) => held.set(name, resolve));
    if (name === failOnce && calls.filter((value) => value === name).length === 1) {
      return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    }
    const id = randomUUID();
    const asset = { id, url: createAssetReference(id), kind: body.includes("\r\nicon\r\n") ? "icon" : "image", name, mimeType: "image/png", size: PNG.length, createdAt: "2026-10-17T00:00:00Z" };
    assets.push(asset);
    return route.fulfill({ json: { asset } });
  });
  await page.route("**/api/public/sites/demo", (route) => {
    const projected = projectPublicSiteDocument(published, "site-1");
    if (!projected.ok) throw new Error("invalid public fixture");
    const publicDocument = replaceAssetReferences(projected.document, new Map(assets.map((asset) => [asset.id, `https://assets.test/${asset.id}.png`])));
    return route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: publicDocument, published_version: version, published_at: "2026-10-17T00:01:00Z" } } });
  });
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: "Gallery A", exact: true }).click();
    await page.getByRole("button", { name: "編輯內容" }).click();
  }
  const gallery = page.getByRole("dialog", { name: "Gallery A", exact: true });
  await expect(gallery.locator(".gal-editor")).toBeVisible();
  return {
    gallery, calls, assets, saved: () => draft,
    failProtected: () => { protectedFailure = true; },
    release: (name: string) => { const resolve = held.get(name); if (!resolve) throw new Error("request not held"); held.delete(name); resolve(); },
    publishSaved: () => { published = structuredClone(draft); },
    images: (id = "gallery-a") => {
      const window = draft.windows.find((window) => window.id === id);
      if (window?.type !== "gallery") throw new Error("missing gallery");
      return window.content.images;
    }
  };
}

test("five-file batch keeps four successes, retries only the failure in its selected order, and survives history/reload/public", async ({ page }, testInfo) => {
  const site = await mockMedia(page, { failOnce: "2.png", hold: "1.png" });
  const { gallery } = site;
  await gallery.getByLabel("上傳圖片（可多選）", { exact: true }).setInputFiles([1, 2, 3, 4, 5].map((id) => pickedFile(`${id}.png`)));
  await expect(gallery.locator('[data-upload-state="uploading"]')).toHaveCount(1);
  await expect(gallery.locator('[data-upload-state="queued"]')).toHaveCount(4);
  await expect(gallery.getByRole("progressbar")).toHaveCount(0);
  site.release("1.png");
  await expect(gallery.locator('[data-upload-state="completed"]')).toHaveCount(4);
  await expect(gallery.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await expect(gallery.getByRole("button", { name: /^選取圖片/ })).toHaveCount(4);
  await gallery.getByRole("button", { name: "選取圖片 2：3", exact: true }).click();
  await gallery.getByLabel("圖說", { exact: true }).fill("成功項的說明保留");
  await gallery.getByLabel("替代文字", { exact: true }).fill("獨立替代文字");
  await expect.poll(() => site.images().map((image) => image.title)).toEqual(["1", "3", "4", "5"]);
  await expect.poll(() => site.images()[1].alt).toBe("獨立替代文字");
  const preserved = structuredClone(site.images());
  await gallery.getByRole("button", { name: "重試 2.png", exact: true }).click();
  await expect(gallery.locator('[data-upload-state="completed"]')).toHaveCount(5);
  expect(site.calls).toEqual(["1.png", "2.png", "3.png", "4.png", "5.png", "2.png"]);
  await expect.poll(() => site.images().map((image) => image.title)).toEqual(["1", "2", "3", "4", "5"]);
  expect(site.images().filter((image) => image.title !== "2")).toEqual(preserved);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(gallery.getByRole("button", { name: /^選取圖片/ })).toHaveCount(4);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect.poll(() => site.images().length).toBe(5);
  expect(site.images().every((image) => image.src?.startsWith("retro-asset:"))).toBe(true);
  await page.reload();
  await expect(gallery.getByRole("button", { name: /^選取圖片/ })).toHaveCount(5);
  await expect(gallery.getByRole("region", { name: "上傳任務" })).toHaveCount(0);
  await expect(gallery.locator(".gal-editor-thumb img")).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath("gallery-editor.png") });
  site.publishSaved();
  await page.goto("/@demo");
  const publicGallery = page.locator(".visitor-desktop").getByRole("dialog", { name: "Gallery A", exact: true });
  await expect(publicGallery.locator(".gal-item")).toHaveCount(5);
  await expect(publicGallery.locator(".gal-item").nth(2).locator("img")).toHaveAttribute("alt", "獨立替代文字");
  await publicGallery.getByRole("button", { name: "放大 3", exact: true }).click();
  const lightbox = page.getByRole("dialog", { name: "圖片檢視" });
  await expect(lightbox).toContainText("成功項的說明保留");
  await expect(lightbox.locator("img")).toHaveAttribute("alt", "獨立替代文字");
});

test("switching to another gallery does not redirect a late upload or overwrite its data", async ({ page }) => {
  const site = await mockMedia(page, { hold: "late.png" });
  await site.gallery.getByLabel("上傳圖片（可多選）", { exact: true }).setInputFiles(pickedFile("late.png"));
  await expect.poll(() => site.calls).toEqual(["late.png"]);
  await page.locator(".task-items").getByRole("button", { name: "Gallery B", exact: true }).click();
  const other = page.getByRole("dialog", { name: "Gallery B", exact: true });
  await other.getByLabel("圖說", { exact: true }).fill("Edited in the other window");
  site.release("late.png");
  await expect.poll(() => site.images().length).toBe(1);
  await expect.poll(() => site.images("gallery-b")[0].caption).toBe("Edited in the other window");
  expect(site.images("gallery-b")).toHaveLength(1);
  expect(site.images("gallery-b")[0].src).toBe("https://assets.test/other.png");
});

test("undo while upload is in flight discards its late result without replaying the undone edit", async ({ page }) => {
  const site = await mockMedia(page, { hold: "late.png" });
  await site.gallery.getByRole("button", { name: "4 欄", exact: true }).click();
  await site.gallery.getByLabel("上傳圖片（可多選）", { exact: true }).setInputFiles(pickedFile("late.png"));
  await expect.poll(() => site.calls).toEqual(["late.png"]);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  site.release("late.png");
  await expect(site.gallery.locator('[data-upload-state="failed"]')).toContainText("復原");
  await expect(site.gallery.getByRole("button", { name: "重試 late.png", exact: true })).toHaveCount(0);
  await expect(site.gallery.getByRole("button", { name: /^選取圖片/ })).toHaveCount(0);
  expect(site.images()).toHaveLength(0);
});

test("window icon upload changes only its original window after explicit preview and apply", async ({ page }) => {
  const site = await mockMedia(page, { hold: "icon.png" });
  const originalOtherIcon = site.saved().windows.find((window) => window.id === "gallery-b")!.icon;
  await page.getByRole("tab", { name: "圖示", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "屬性面板" });
  await inspector.getByRole("button", { name: "更換圖示…", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await dialog.getByLabel("上傳單張…", { exact: true }).setInputFiles(pickedFile("icon.png"));
  await expect.poll(() => site.calls).toEqual(["icon.png"]);
  site.release("icon.png");
  await expect(dialog.locator('[data-upload-state="completed"]')).toHaveCount(1);
  await expect(dialog.getByText("已上傳並選取圖示，按「套用」後生效", { exact: true })).toBeVisible();
  expect(site.saved().windows.find((window) => window.id === "gallery-a")!.icon).not.toMatch(/^retro-asset:/);
  await dialog.getByRole("button", { name: "套用", exact: true }).click();
  await expect.poll(() => site.saved().windows.find((window) => window.id === "gallery-a")?.icon).toMatch(/^retro-asset:/);

  await page.locator(".task-items").getByRole("button", { name: "Gallery B", exact: true }).click();
  await inspector.getByRole("button", { name: "更換圖示…", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await dialog.getByRole("button", { name: "資料夾（內建）", exact: true }).click();
  await dialog.getByRole("button", { name: "套用", exact: true }).click();
  await expect.poll(() => site.saved().windows.find((window) => window.id === "gallery-b")?.icon).toBe("folder");
  expect(site.saved().windows.find((window) => window.id === "gallery-b")?.icon).not.toBe(originalOtherIcon);
  expect(site.saved().windows.find((window) => window.id === "gallery-a")?.icon).toMatch(/^retro-asset:/);
});

test("closing the icon picker discards an in-flight result before another window is selected", async ({ page }) => {
  const site = await mockMedia(page, { hold: "icon.png" });
  const originalA = site.saved().windows.find((window) => window.id === "gallery-a")!.icon;
  const originalB = site.saved().windows.find((window) => window.id === "gallery-b")!.icon;
  await page.getByRole("tab", { name: "圖示", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "屬性面板" });
  await inspector.getByRole("button", { name: "更換圖示…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await dialog.getByLabel("上傳單張…", { exact: true }).setInputFiles(pickedFile("icon.png"));
  await expect.poll(() => site.calls).toEqual(["icon.png"]);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.locator(".task-items").getByRole("button", { name: "Gallery B", exact: true }).click();
  site.release("icon.png");
  await expect.poll(() => site.assets.length).toBe(1);
  expect(site.saved().windows.find((window) => window.id === "gallery-a")?.icon).toBe(originalA);
  expect(site.saved().windows.find((window) => window.id === "gallery-b")?.icon).toBe(originalB);
});

test("retrying an earlier image cannot unmount the currently edited image URL", async ({ page }) => {
  const site = await mockMedia(page, { failOnce: "1.png", hold: "1.png" });
  await site.gallery.getByLabel("上傳圖片（可多選）", { exact: true }).setInputFiles([pickedFile("1.png"), pickedFile("2.png")]);
  await expect.poll(() => site.calls).toEqual(["1.png"]);
  site.release("1.png");
  await expect(site.gallery.locator('[data-upload-state="completed"]')).toHaveCount(1);
  await site.gallery.getByRole("button", { name: "重試 1.png", exact: true }).click();
  await expect.poll(() => site.calls).toEqual(["1.png", "2.png", "1.png"]);
  const source = site.gallery.getByLabel("圖片網址", { exact: true });
  await source.fill("https://assets.test/edited-second.png");
  site.release("1.png");
  await expect(site.gallery.locator('[data-upload-state="completed"]')).toHaveCount(2);
  await expect(source).toBeFocused();
  await expect(source).toHaveValue("https://assets.test/edited-second.png");
  await expect(site.gallery.getByLabel("圖片標題", { exact: true })).toHaveValue("2");
  await source.press("Tab");
  await expect.poll(() => site.images().map((image) => image.title)).toEqual(["1", "2"]);
  await expect.poll(() => site.images()[1].src).toBe("https://assets.test/edited-second.png");
  expect(site.images()[0].src).toMatch(/^retro-asset:/);
});

test("a legacy long caption stays intact when alt is edited, marked decorative, reset and reloaded", async ({ page }) => {
  const site = await mockMedia(page, { long: true, legacyAlt: true });
  const caption = site.images()[0].caption;
  expect(caption.length).toBeGreaterThan(300);
  const alt = site.gallery.getByLabel("替代文字", { exact: true });
  await expect(alt).toHaveValue("");
  await expect(alt).toHaveAttribute("placeholder", "目前沿用圖說或標題；輸入可獨立設定");
  await alt.fill("A separate image description");
  await expect.poll(() => site.images()[0].alt).toBe("A separate image description");
  expect(site.images()[0].caption).toBe(caption);
  await site.gallery.getByRole("button", { name: "設為裝飾圖片", exact: true }).click();
  await expect.poll(() => site.images()[0].alt).toBe("");
  await site.gallery.getByRole("button", { name: "沿用圖說或標題", exact: true }).click();
  await expect.poll(() => site.images()[0].alt).toBeUndefined();
  await page.reload();
  await expect(alt).toHaveValue("");
  await expect(site.gallery.getByLabel("圖說", { exact: true })).toHaveValue(caption);
});

test("document image uploads merge into their original block while another block is edited", async ({ page }) => {
  const site = await mockMedia(page, { hold: "document.png" });
  await page.locator(".task-items").getByRole("button", { name: "Document.exe", exact: true }).click();
  const doc = page.getByRole("dialog", { name: "Document.exe", exact: true });
  const first = doc.getByRole("group", { name: "圖片區塊 1", exact: true });
  const second = doc.getByRole("group", { name: "圖片區塊 2", exact: true });
  await first.focus();
  await first.getByLabel("上傳圖片…", { exact: true }).setInputFiles(pickedFile("document.png"));
  await expect.poll(() => site.calls).toEqual(["document.png"]);
  await second.focus();
  await second.getByLabel("圖說", { exact: true }).fill("The other block keeps its edited caption");
  site.release("document.png");
  await expect(first.locator("img")).toHaveAttribute("alt", "first image");
  await expect(second.getByLabel("圖說", { exact: true })).toHaveValue("The other block keeps its edited caption");
  await expect.poll(() => {
    const saved = site.saved().windows.find((window) => window.id === "document");
    return saved?.type === "document" ? saved.content.blocks : [];
  }).toEqual([
    expect.objectContaining({ id: "image-one", src: expect.stringMatching(/^retro-asset:/), caption: "A caption", alt: "first image" }),
    expect.objectContaining({ id: "image-two", src: null, caption: "The other block keeps its edited caption", alt: "second image" })
  ]);
});

test("avatar upload preserves newer name edits and reloads its protected preview; unavailable media reports a failure", async ({ page }) => {
  const site = await mockMedia(page, { hold: "avatar.png" });
  await page.locator(".task-items").getByRole("button", { name: "About.exe", exact: true }).click();
  const about = page.getByRole("dialog", { name: "About.exe", exact: true });
  await about.getByLabel("上傳頭像", { exact: true }).setInputFiles(pickedFile("avatar.png"));
  await expect.poll(() => site.calls).toEqual(["avatar.png"]);
  await about.getByLabel("暱稱", { exact: true }).fill("New name during upload");
  await page.locator(".task-items").getByRole("button", { name: "Gallery B", exact: true }).click();
  site.release("avatar.png");
  await expect.poll(() => {
    const saved = site.saved().windows.find((window) => window.id === "about");
    return saved?.type === "about" ? saved.content.avatar : null;
  }).toMatch(/^retro-asset:/);
  await page.reload();
  await page.locator(".task-items").getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(about.getByLabel("暱稱", { exact: true })).toHaveValue("New name during upload");
  await expect(about.getByRole("img", { name: "頭像預覽", exact: true })).toHaveAttribute("src", /^blob:/);
  site.failProtected();
  await page.reload();
  await page.locator(".task-items").getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(about.getByRole("alert")).toContainText("頭像無法載入");
});

test("failed protected gallery image requests show a clear error after reload", async ({ page }) => {
  const site = await mockMedia(page);
  await site.gallery.getByLabel("上傳圖片（可多選）", { exact: true }).setInputFiles(pickedFile("protected.png"));
  await expect.poll(() => site.images().length).toBe(1);
  site.failProtected();
  await page.reload();
  await expect(site.gallery.locator(".gal-editor-list").getByRole("alert")).toContainText("無法載入");
});

test("explicitly reselecting the current icon supersedes a pending upload", async ({ page }) => {
  const site = await mockMedia(page, { hold: "icon.png" });
  const originalIcon = site.saved().windows.find((window) => window.id === "gallery-a")!.icon;
  await page.getByRole("tab", { name: "圖示", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "屬性面板" });
  await inspector.getByRole("button", { name: "更換圖示…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await dialog.getByLabel("上傳單張…", { exact: true }).setInputFiles(pickedFile("icon.png"));
  await expect.poll(() => site.calls).toEqual(["icon.png"]);
  await dialog.locator(`.ilib-grid [data-icon="${originalIcon}"]`).click();
  await expect(dialog.locator('[data-upload-state="failed"]')).toContainText("已選擇其他圖示");
  site.release("icon.png");
  await expect.poll(() => site.assets.length).toBe(1);
  await expect(dialog.getByRole("button", { name: "套用", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(site.saved().windows.find((window) => window.id === "gallery-a")!.icon).toBe(originalIcon);
});

for (const width of [320, 375, 430]) {
  test(`gallery thumbnails, one-image properties, broken images and long task names fit ${width}px`, async ({ page }, testInfo) => {
    const name = "long-file-name-".repeat(12) + ".png";
    const site = await mockMedia(page, { long: true, width, failOnce: name });
    await expect(site.gallery.locator(".gal-editor-list").getByRole("alert")).toContainText("無法載入");
    await expect(site.gallery.getByLabel("圖片標題", { exact: true })).toHaveCount(1);
    await expect(site.gallery.getByLabel("圖說", { exact: true })).toHaveCount(1);
    await site.gallery.getByLabel("上傳圖片（可多選）", { exact: true }).setInputFiles(pickedFile(name));
    await expect(site.gallery.locator('[data-upload-state="failed"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => site.gallery.locator(".gal-editor").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(site.gallery.getByLabel("替代文字", { exact: true })).toHaveAttribute("maxlength", "300");
    if (width === 375) await page.screenshot({ path: testInfo.outputPath("gallery-mobile.png") });
    site.publishSaved();
    await page.goto("/@demo");
    await page.getByRole("button", { name: "Gallery A", exact: true }).click();
    const publicGallery = page.getByRole("dialog", { name: "Gallery A", exact: true });
    await expect(publicGallery.getByRole("alert")).toContainText("無法載入");
    await expect(publicGallery.getByRole("textbox")).toHaveCount(0);
    await expect.poll(() => publicGallery.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });
}
