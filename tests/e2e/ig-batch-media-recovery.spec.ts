import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAssetReference, duplicateProfile, migrateSiteDocumentV2 } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
async function open(page: Page, width = 1400) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const duplicated = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: "site-1", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("fixture duplicate");
  let saved = duplicated.document; let version = 1;
  const calls: string[] = []; const assets: Array<{ id: string; url: string; name: string; kind: string }> = []; const held = new Map<string, () => void>();
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "D", draft_document: saved, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.route("**/api/sites/site-1/assets**", async (route) => {
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets } });
    const name = /filename="([^"]+)"/.exec(route.request().postDataBuffer()?.toString() ?? "")?.[1] ?? "unknown"; calls.push(name);
    if (name.startsWith("held")) await new Promise<void>((resolve) => held.set(name, resolve));
    if (name.startsWith("fail") && calls.filter((item) => item === name).length === 1) return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    const id = randomUUID(); const asset = { id, url: createAssetReference(id), name, kind: "image", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-19T00:00:00Z" }; assets.push(asset);
    return route.fulfill({ json: { asset } });
  });
  await page.setViewportSize({ width, height: 950 }); await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await enterContentEditor(page); }
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await win.getByRole("button", { name: "編輯個人檔案", exact: true }).click();
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  await win.getByRole("tab", { name: "貼文", exact: true }).click();
  const posts = win.locator(".ig-canonical-posts");
  return { win, posts, calls, assets, saved: () => saved, post: (title: string) => saved.entities.posts.find((post) => post.title === title)!, src: (name: string) => assets.find((asset) => asset.name === name)!.url,
    release: (name: string) => { const done = held.get(name); if (!done) throw new Error("not held"); held.delete(name); done(); } };
}
const newPostPicker = (posts: ReturnType<Page["locator"]>) => ({
  async setInputFiles(files: ReturnType<typeof file> | ReturnType<typeof file>[]) {
    const back = posts.getByRole("button", { name: "← 返回貼文", exact: true });
    if (await back.isVisible()) await back.click();
    await posts.getByRole("button", { name: "新增貼文", exact: true }).click();
    const post = posts.locator("article:visible");
    await post.getByLabel("標題", { exact: true }).fill((Array.isArray(files) ? files[0] : files).name.replace(/\.[^.]+$/, ""));
    await post.locator('input[type="file"]').setInputFiles(files);
  }
});

test("partial post batch keeps successes and newer edits; retry fills selection order without resurrecting removed media", async ({ page }) => {
  const s = await open(page); await newPostPicker(s.posts).setInputFiles(["a.png", "fail-b.png", "held-c.png", "d.png", "e.png"].map(file));
  await expect.poll(() => s.calls.includes("held-c.png")).toBe(true);
  const post = s.posts.locator("article").last();
  await post.getByLabel("標題", { exact: true }).fill("Edited during upload");
  s.release("held-c.png"); await expect.poll(() => s.post("Edited during upload")?.media?.length).toBe(4);
  const beforeIds = s.post("Edited during upload").media!.map((item) => item.id);
  await post.getByRole("button", { name: "刪除圖片 1", exact: true }).click();
  const url = post.getByRole("textbox", { name: "圖片 1 網址", exact: true }); await url.fill("https://assets.test/newer.png"); await url.press("Enter");
  await post.getByRole("textbox", { name: "圖片 1 替代文字", exact: true }).fill("newer alt");
  await post.getByRole("button", { name: "重試 fail-b.png", exact: true }).click();
  await expect.poll(() => s.post("Edited during upload").media?.length).toBe(4);
  await expect.poll(() => s.post("Edited during upload").media![0].src).toBe(s.src("fail-b.png"));
  const media = s.post("Edited during upload").media!;
  expect(media.map((item) => item.src)).toEqual([s.src("fail-b.png"), "https://assets.test/newer.png", s.src("d.png"), s.src("e.png")]);
  expect(media[1]).toMatchObject({ id: beforeIds[1], alt: "newer alt" }); expect(media.some((item) => item.id === beforeIds[0])).toBe(false);
  expect(s.calls).toEqual(["a.png", "fail-b.png", "held-c.png", "d.png", "e.png", "fail-b.png"]);
  await page.reload(); await s.win.getByRole("button", { name: "編輯個人檔案", exact: true }).click(); await s.win.getByRole("tab", { name: "貼文", exact: true }).click(); await expect(s.posts.locator("[data-ig-edit]").filter({ hasText: "Edited during upload" })).toBeVisible();
  expect(s.post("Edited during upload").media).toEqual(media);
});

test("cancel queued and hung files individually, keep the successful sibling and ignore late completion", async ({ page }) => {
  const s = await open(page); await newPostPicker(s.posts).setInputFiles(["held-cancel.png", "queued.png", "ok.png"].map(file));
  await expect.poll(() => s.calls).toEqual(["held-cancel.png"]);
  const post = s.posts.locator("article").last();
  await post.getByRole("button", { name: "取消 queued.png", exact: true }).click();
  await post.getByRole("button", { name: "取消 held-cancel.png", exact: true }).click();
  await expect.poll(() => s.post("held-cancel")?.media?.length).toBe(1);
  s.release("held-cancel.png"); await expect.poll(() => s.assets.length).toBe(2);
  expect(s.calls).toEqual(["held-cancel.png", "ok.png"]); expect(s.post("held-cancel").media![0].src).toBe(s.src("ok.png"));
  await expect(post.getByRole("button", { name: /重試/ })).toHaveCount(0);
  await expect(post.locator('[data-upload-state="failed"]')).toHaveCount(2);
});

test("reselecting the same file creates independent drafts; deleting an uploading draft prevents resurrection", async ({ page }) => {
  const s = await open(page); const initial = s.saved().entities.posts.length;
  await newPostPicker(s.posts).setInputFiles(file("same.png")); await expect.poll(() => s.saved().entities.posts.length).toBe(initial + 1);
  await newPostPicker(s.posts).setInputFiles(file("same.png")); await expect.poll(() => s.calls.filter((name) => name === "same.png").length).toBe(2);
  await expect.poll(() => s.saved().entities.posts.filter((post) => post.title === "same" && post.media?.length === 1).length).toBe(2);
  await newPostPicker(s.posts).setInputFiles(file("held-delete.png")); await expect.poll(() => s.calls.includes("held-delete.png")).toBe(true);
  await s.posts.locator("article").last().getByRole("button", { name: /^刪除貼文：/ }).click();
  s.release("held-delete.png"); await expect.poll(() => s.assets.length).toBe(3);
  await expect.poll(() => s.saved().entities.posts.length).toBe(initial + 2);
  expect(s.saved().entities.posts.some((post) => post.title === "held-delete")).toBe(false);
});

for (const width of [320, 390]) test(`highlight batch retry preserves page edits and task controls at ${width}px`, async ({ page }, testInfo) => {
  const s = await open(page, width); await s.win.getByRole("tab", { name: "精選／合集", exact: true }).click();
  const highlight = s.win.locator(".ig-canonical-highlights article").first();
  await highlight.locator("[data-ig-edit]").click();
  const h = () => s.saved().entities.highlights!.find((entry) => entry.ownerProfileId === "profile:ig" && entry.title === "Trip")!;
  const before = structuredClone(h().frames); const pageNumber = before.length + 1;
  await highlight.locator('input[type="file"]').setInputFiles(["first.png", "fail-page.png", "third.png"].map(file));
  await expect(highlight.getByRole("button", { name: "重試 fail-page.png", exact: true })).toBeVisible();
  await expect.poll(() => h().frames.length).toBe(before.length + 2);
  await expect(highlight.getByRole("button", { name: "取消 fail-page.png", exact: true })).toBeVisible();
  await highlight.locator(".media-upload-tasks").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`highlight-retry-${width}.png`) });
  await highlight.getByRole("textbox", { name: `精選第 ${pageNumber} 頁替代文字`, exact: true }).fill("new alt");
  const url = highlight.getByRole("textbox", { name: `精選第 ${pageNumber} 頁圖片網址`, exact: true }); await url.fill("https://assets.test/replaced.png"); await url.press("Enter");
  await highlight.getByRole("button", { name: "重試 fail-page.png", exact: true }).click();
  await expect.poll(() => h().frames.length).toBe(before.length + 3);
  expect(h().frames.slice(0, before.length)).toEqual(before);
  expect(h().frames.slice(before.length).map((frame) => frame.src)).toEqual(["https://assets.test/replaced.png", s.src("fail-page.png"), s.src("third.png")]);
  expect(h().frames[before.length].alt).toBe("new alt");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await highlight.locator(".media-upload-tasks").scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`highlight-tasks-${width}.png`) });
});

test("switching OC keeps an uploading post with its original author and preserves other-profile edits", async ({ page }) => {
  const s = await open(page); await newPostPicker(s.posts).setInputFiles(file("held-owner.png")); await expect.poll(() => s.calls.length).toBe(1);
  const switcher = s.win.getByRole("region", { name: "角色切換器" }).locator("select").first(); await switcher.selectOption("other");
  await s.win.getByRole("tab", { name: "角色資料", exact: true }).click();
  const name = s.win.getByRole("textbox", { name: "顯示名稱", exact: true }); await name.fill("Other edited"); await name.press("Enter");
  s.release("held-owner.png"); await expect.poll(() => s.post("held-owner")?.media?.length).toBe(1);
  expect(s.post("held-owner").authorProfileId).toBe("profile:ig");
  expect(s.saved().entities.profiles.find((profile) => profile.id === "other")?.displayName).toBe("Other edited");
  await expect(s.win.getByText("held-owner.png", { exact: true })).toHaveCount(0);
});
