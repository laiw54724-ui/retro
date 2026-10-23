import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAssetReference, makeWindow, migrateSiteDocumentV2, normalizeDocument, projectPublicSiteDocument } from "../../packages/shared/src";
import { documentFixture } from "./fixture";
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
async function open(page: Page, { width = 1280, hold = "", failOnce = "", long = false, cap = false, windowWidth = 560, multiline = false } = {}) {
  const about = makeWindow("about");
  about.id = "about"; about.title = "About.exe"; about.defaultOpen = true;
  about.layout.desktop = { ...about.layout.desktop, x: 20, y: 20, w: windowWidth, h: 580, z: 2 };
  about.content.nickname = "Demo User";
  about.content.fields = [{ id: "first", key: "Role", value: long ? "LongCustomField".repeat(25) : "Creator" }];
  about.content.socials = long ? [{ id: "social", label: "LongSocialName".repeat(7), url: `https://example.com/${"portfolio".repeat(80)}` }] : [];
  if (cap) { about.content.fields = Array.from({ length: 50 }, (_, i) => ({ id: `f${i}`, key: `Key ${i}`, value: "Value" })); about.content.socials = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, label: `Social ${i}`, url: "https://example.com" })); }
  if (multiline) { about.content.fields[0].value = "Line 1\nLine 2"; about.content.quote = "Quote 1\nQuote 2"; about.content.banner = "Banner 1\nBanner 2"; }
  const second = structuredClone(about); second.id = "second"; second.title = "Second.exe"; second.layout.desktop = { ...about.layout.desktop, x: 600, z: 1 };
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [about, second] }), { siteId: "site-1" });
  if (!migrated.ok) throw new Error("migration");
  let draft = migrated.document, version = 1;
  const calls: string[] = [];
  let release = () => {};
  await page.addInitScript(value => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", route => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", route => { draft = structuredClone(route.request().postDataJSON().document); return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-22T00:00:00Z" } }); });
  await page.route("**/api/sites/site-1/assets**", async route => {
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets: [] } });
    const name = /filename="([^"]+)"/.exec(route.request().postDataBuffer()?.toString() ?? "")?.[1] ?? "unknown";
    calls.push(name);
    if (name === hold) await new Promise<void>(resolve => { release = resolve; });
    if (name === failOnce && calls.filter(value => value === name).length === 1) return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    const id = randomUUID();
    return route.fulfill({ json: { asset: { id, url: createAssetReference(id), kind: "image", name, mimeType: "image/png", size: PNG.length, createdAt: "2026-10-22T00:00:00Z" } } });
  });
  await page.setViewportSize({ width, height: 900 }); await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "About.exe", exact: true }).click(); await enterContentEditor(page); }
  const editor = page.getByRole("dialog", { name: "About.exe", exact: true });
  await expect(editor.locator(".about-editor")).toBeVisible();
  return { editor, calls, document: () => draft, release: () => release(), saved: (id = "about") => { const window = draft.windows.find(w => w.id === id); if (window?.type !== "about") throw new Error("missing about"); return window.content; } };
}

test("direct editing, social paste, field focus/reorder/delete/undo and canonical reload", async ({ page }, info) => {
  const site = await open(page); const { editor } = site;
  await expect(editor.locator("details")).toHaveCount(0);
  await editor.getByLabel("暱稱", { exact: true }).fill("New nickname");
  await editor.getByLabel("簡介", { exact: true }).fill("First line\nSecond line");
  const add = editor.getByLabel("＋ 新增欄位", { exact: true });
  await add.fill("Birthday"); await add.press("Enter");
  await expect(editor.getByLabel("欄位內容", { exact: true }).last()).toBeFocused();
  await page.keyboard.type("April 1"); await page.keyboard.press("Enter"); await expect(add).toBeFocused();
  await editor.getByLabel("欄位名稱", { exact: true }).last().press("Alt+ArrowUp");
  await expect(editor.getByLabel("欄位名稱", { exact: true }).first()).toHaveValue("Birthday");
  await editor.getByRole("button", { name: "刪除欄位", exact: true }).first().click(); await expect(add).toBeFocused();
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(editor.getByLabel("欄位名稱", { exact: true })).toHaveCount(2);
  const social = editor.getByLabel("＋ 新增社群", { exact: true });
  await social.fill("instagram.com/artist"); await social.press("Enter");
  await expect(editor.getByLabel("社群名稱", { exact: true })).toHaveValue("Instagram");
  await editor.getByLabel("社群名稱", { exact: true }).focus();
  await expect(editor.getByLabel("社群網址", { exact: true })).toHaveValue("https://instagram.com/artist");
  await expect.poll(() => site.saved().socials[0]?.url).toBe("https://instagram.com/artist");
  await expect.poll(() => site.saved().fields[0].value).toBe("April 1");
  await editor.screenshot({ path: info.outputPath("desktop.png") });
  await page.reload(); await expect(editor.getByLabel("暱稱", { exact: true })).toHaveValue("New nickname");
  await expect(editor.getByLabel("欄位內容", { exact: true }).first()).toHaveValue("April 1");
  const projected = projectPublicSiteDocument(site.document(), "site-1");
  if (!projected.ok) throw new Error("public projection");
  await page.route("**/api/public/sites/demo", route => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: projected.document, published_version: 1, published_at: "2026-10-22T00:00:00Z" } } }));
  await page.goto("/@demo");
  const publicCard = page.locator(".visitor-desktop").getByRole("dialog", { name: "About.exe", exact: true });
  await expect(publicCard.getByText("Birthday: April 1", { exact: true })).toBeVisible();
  await expect(publicCard.getByRole("link", { name: "Instagram", exact: true })).toHaveAttribute("href", "https://instagram.com/artist");
  await expect(publicCard.getByRole("textbox")).toHaveCount(0);
});

test("avatar URL Escape returns focus without committing a draft; invalid socials stay actionable", async ({ page }) => {
  const { editor, saved } = await open(page);
  await editor.locator(".about-avatar-toggle").click();
  const input = editor.getByLabel("頭像網址", { exact: true });
  await input.fill("https://assets.test/cancelled.png"); await input.press("Escape");
  await expect(editor.locator(".about-avatar-toggle")).toBeFocused(); await expect(input).toHaveCount(0);
  await editor.getByLabel("暱稱", { exact: true }).fill("Escape sentinel");
  await expect.poll(() => saved().nickname).toBe("Escape sentinel"); expect(saved().avatar).toBeNull();
  for (const cancel of ["close", "toggle"]) {
    await editor.locator(".about-avatar-toggle").click();
    await input.fill(`https://assets.test/${cancel}.png`);
    if (cancel === "close") await editor.locator(".about-avatar-panel").getByRole("button", { name: /^(取消|關閉)$/, exact: true }).click();
    else await editor.locator(".about-avatar-toggle").click();
    await expect(editor.locator(".about-avatar-toggle")).toBeFocused();
    await editor.getByLabel("暱稱", { exact: true }).fill(`${cancel} sentinel`);
    await expect.poll(() => saved().nickname).toBe(`${cancel} sentinel`);
    expect(saved().avatar).toBeNull();
  }
  await editor.locator(".about-avatar-toggle").click();
  await input.fill("https://assets.test/committed.png"); await input.press("Enter");
  await expect.poll(() => saved().avatar).toBe("https://assets.test/committed.png");
  await input.press("Escape");
  await editor.getByLabel("＋ 新增社群", { exact: true }).fill("javascript:alert(1)"); await page.keyboard.press("Enter");
  await expect(editor.locator(".about-inline-error")).toBeVisible();
  await expect(editor.getByLabel("社群名稱", { exact: true })).toHaveCount(0);
});

for (const width of [320, 375, 390, 430]) test(`mobile ${width}px stays contained with focus, panel, Done and return`, async ({ page }, info) => {
  const { editor } = await open(page, { width, long: true });
  await editor.getByLabel("社群名稱", { exact: true }).focus();
  await expect(editor.getByLabel("社群網址", { exact: true })).toBeVisible();
  await editor.locator(".about-avatar-toggle").click();
  await editor.getByLabel("頭像網址", { exact: true }).fill("https://assets.test/avatar.png"); await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
  await expect(editor.locator(".about-avatar-toggle")).toBeFocused();
  await editor.getByLabel("暱稱", { exact: true }).fill("LongNickname".repeat(10));
  await editor.getByLabel("橫幅文字", { exact: true }).fill("LongBanner".repeat(30));
  for (const surface of [editor.locator(".about-editor"), editor.locator(".m-win-body")]) expect(await surface.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await editor.locator(".m-win-body").evaluate(el => { el.scrollTop = 0; });
  const avatar = editor.getByRole("img", { name: "頭像預覽", exact: true });
  await expect(avatar).toBeVisible();
  await expect.poll(() => avatar.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath(`mobile-${width}.png`) });
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(editor.locator(".about-view")).toBeVisible();
  await editor.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "About.exe", exact: true }).click();
  await enterContentEditor(page);
  await expect(editor.getByLabel("暱稱", { exact: true })).toHaveValue("LongNickname".repeat(10));
});

test("pending upload preserves newer text and targets original window after switching", async ({ page }) => {
  const site = await open(page, { hold: "held.png" });
  await site.editor.locator(".about-avatar-toggle").click();
  await site.editor.locator('input[type=file]').setInputFiles({ name: "held.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => site.calls).toEqual(["held.png"]);
  await site.editor.getByLabel("暱稱", { exact: true }).fill("Typed while uploading");
  await page.locator(".task-items").getByRole("button", { name: "Second.exe", exact: true }).click();
  site.release();
  await expect.poll(() => site.saved().avatar).toMatch(/^retro-asset:/);
  expect(site.saved().nickname).toBe("Typed while uploading"); expect(site.saved("second").avatar).toBeNull();
});

test("new avatar URL cancels a delayed upload, and failed upload can retry", async ({ page }) => {
  const site = await open(page, { hold: "held.png", failOnce: "retry.png" }); const { editor } = site;
  await editor.locator(".about-avatar-toggle").click(); await editor.locator('input[type=file]').setInputFiles({ name: "held.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => site.calls).toEqual(["held.png"]);
  await editor.locator(".about-avatar-toggle").click();
  await editor.getByLabel("頭像網址", { exact: true }).fill("https://assets.test/new.png"); await page.keyboard.press("Enter");
  site.release(); await expect.poll(() => site.saved().avatar).toBe("https://assets.test/new.png");
  await editor.locator('input[type=file]').setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: PNG });
  await expect(editor.locator('[data-upload-state=failed]').filter({ hasText: "retry.png" })).toBeVisible();
  await editor.getByRole("button", { name: /重試.*retry.png/ }).click();
  await expect.poll(() => site.saved().avatar).toMatch(/^retro-asset:/);
  expect(site.calls.filter(x => x === "retry.png")).toHaveLength(2);
});


test("composition confirmation does not add social or field until committed", async ({ page }) => {
  const { editor } = await open(page);
  for (const [label, value, target, count] of [["＋ 新增社群", "ME@EXAMPLE.COM", ".about-social-name", 0], ["＋ 新增欄位", "Birthday", ".about-field-key", 1]] as const) {
    const input = editor.getByLabel(label, { exact: true }); await input.fill(value);
    await input.dispatchEvent("compositionstart");
    await input.dispatchEvent("keydown", { key: "Enter", keyCode: 13, isComposing: false });
    await expect(editor.locator(target)).toHaveCount(count);
    await input.dispatchEvent("compositionend");
    await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229, isComposing: false });
    await expect(editor.locator(target)).toHaveCount(count);
    await input.press("Enter"); await expect(editor.locator(target)).toHaveCount(count + 1);
  }
});

test("deleting at field/social limits restores focus after enabling add inputs", async ({ page }) => {
  const { editor } = await open(page, { cap: true });
  const field = editor.getByLabel("＋ 新增欄位", { exact: true });
  const social = editor.getByLabel("＋ 新增社群", { exact: true });
  await expect(field).toBeDisabled(); await expect(social).toBeDisabled();
  await editor.getByRole("button", { name: "刪除欄位", exact: true }).last().click(); await expect(field).toBeFocused();
  await editor.getByLabel("社群名稱", { exact: true }).last().focus();
  await editor.getByRole("button", { name: "刪除社群", exact: true }).last().click(); await expect(social).toBeFocused();
});

test("narrow desktop crop and field drag stay contained", async ({ page }, info) => {
  const { editor } = await open(page, { windowWidth: 340 });
  await editor.locator(".about-avatar-toggle").click();
  await editor.getByLabel("頭像網址", { exact: true }).fill("https://assets.test/avatar.png"); await page.keyboard.press("Enter");
  await editor.getByRole("button", { name: "調整位置", exact: true }).click();
  await expect(editor.locator(".crop-frame")).toBeVisible();
  expect(await editor.locator(".about-avatar-panel").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const avatar = editor.getByRole("img", { name: "頭像預覽", exact: true });
  await expect(avatar).toBeVisible();
  await expect.poll(() => avatar.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await editor.screenshot({ path: info.outputPath("narrow-crop.png") });
  await editor.locator(".about-avatar-panel").getByRole("button", { name: /^(取消|關閉)$/, exact: true }).click();
  const add = editor.getByLabel("＋ 新增欄位", { exact: true }); await add.fill("Second"); await add.press("Enter");
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await editor.locator('[data-field-id="first"] .about-drag').dispatchEvent("dragstart", { dataTransfer: transfer });
  await editor.locator(".about-field-add").dispatchEvent("dragover", { dataTransfer: transfer });
  await editor.locator(".about-field-add").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(editor.getByLabel("欄位名稱", { exact: true }).last()).toHaveValue("Role");
});


test("integrated catalog supplies translated controls without missing-key errors", async ({ page }) => {
  const { editor } = await open(page);
  await expect(editor.locator(".about-add-social")).toHaveAttribute("placeholder", "＋ 貼社群網址");
  await expect(editor.locator(".about-editor")).not.toContainText("發生錯誤");
  await editor.locator(".about-avatar-toggle").click();
  await expect(editor.locator(".about-avatar-panel").getByRole("button", { name: "關閉", exact: true })).toBeVisible();
});


test("avatar drops reject non-images and oversized files without starting uploads", async ({ page }) => {
  const site = await open(page);
  for (const [name, type, size] of [["note.txt", "text/plain", 10], ["large.png", "image/png", 8 * 1024 * 1024 + 1]] as const) {
    const transfer = await page.evaluateHandle(({ name, type, size }) => {
      const data = new DataTransfer(); data.items.add(new File([new Uint8Array(size)], name, { type })); return data;
    }, { name, type, size });
    await site.editor.locator(".about-avatar-drop").dispatchEvent("drop", { dataTransfer: transfer });
    await expect(site.editor.locator(".about-inline-error")).toBeVisible();
    expect(site.calls).toHaveLength(0);
    await site.editor.locator(".about-inline-error button").click();
  }
});

test("existing multiline card content survives inline editing", async ({ page }) => {
  const site = await open(page, { multiline: true });
  for (const [label, value] of [["欄位內容", "Line 1\nLine 2"], ["引言", "Quote 1\nQuote 2"], ["橫幅文字", "Banner 1\nBanner 2"]]) {
    const field = site.editor.getByLabel(label, { exact: true });
    await expect(field).toHaveValue(value);
    await field.focus();
    await field.evaluate(element => { const input = element as HTMLTextAreaElement; input.setSelectionRange(input.value.length, input.value.length); });
    await page.keyboard.insertText("!");
    await expect(field).toHaveValue(value + "!");
  }
  await expect.poll(() => site.saved().fields[0].value).toBe("Line 1\nLine 2!");
  await expect.poll(() => site.saved().quote).toBe("Quote 1\nQuote 2!");
  await expect.poll(() => site.saved().banner).toBe("Banner 1\nBanner 2!");
  await page.reload();
  await expect(site.editor.getByLabel("欄位內容", { exact: true })).toHaveValue("Line 1\nLine 2!");
  await expect(site.editor.getByLabel("引言", { exact: true })).toHaveValue("Quote 1\nQuote 2!");
  await expect(site.editor.getByLabel("橫幅文字", { exact: true })).toHaveValue("Banner 1\nBanner 2!");
});
test("opening avatar then immediate Escape closes only its panel", async ({ page }) => {
  const { editor } = await open(page, { width: 375 });
  await editor.locator(".about-avatar-toggle").click();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(editor.locator(".about-avatar-panel")).toHaveCount(0);
  await expect(editor.locator(".about-avatar-toggle")).toBeFocused();
});
