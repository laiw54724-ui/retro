import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAssetReference, duplicateProfile, migrateSiteDocumentV2 } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
async function open(page: Page, width = 1400) {
  const migrated = migrateSiteDocumentV2(igDocument({ avatar: "https://assets.test/original.png", avatarUrl: "https://assets.test/original.png", highlights: [{ id: "h1", title: "Trip", src: "https://assets.test/frame.png", srcUrl: "https://assets.test/frame.png" }] }), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const duplicated = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: "site-1", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("fixture");
  let saved = duplicated.document; let version = 1;
  const calls: string[] = []; const assets: Array<{ id: string; url: string; name: string; kind: string }> = [];
  const held = new Map<string, () => void>();
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "D", draft_document: saved, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.route("**/api/sites/site-1/assets**", async (route) => {
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets } });
    const name = /filename="([^"]+)"/.exec(route.request().postDataBuffer()?.toString() ?? "")?.[1] ?? "unknown";
    calls.push(name);
    if (name.startsWith("held")) await new Promise<void>((resolve) => held.set(name, resolve));
    if (name === "retry.png" && calls.filter((item) => item === name).length === 1) return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    const id = randomUUID(); const asset = { id, url: createAssetReference(id), name, kind: "image", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-19T00:00:00Z" }; assets.push(asset);
    return route.fulfill({ json: { asset } });
  });
  await page.setViewportSize({ width, height: 950 }); await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯內容" }).click(); }
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  return { win, calls, assets, saved: () => saved, profile: (id = "profile:ig") => saved.entities.profiles.find((p) => p.id === id)!, release: (name: string) => { const done = held.get(name); if (!done) throw new Error("not held"); held.delete(name); done(); } };
}
const avatar = (win: ReturnType<Page["locator"]>) => win.getByRole("textbox", { name: "頭像網址", exact: true });
const picker = (win: ReturnType<Page["locator"]>) => win.locator('.ig-profile-editor input[type="file"]');

test("URL typing cancels an older upload before blur; invalid input stays local and can be corrected", async ({ page }) => {
  const s = await open(page); await expect(s.win.locator(".ig-profile-editor label.image-source-label")).toHaveText("頭像網址");
  await picker(s.win).setInputFiles(file("held-url.png")); await expect.poll(() => s.calls.length).toBe(1);
  await avatar(s.win).fill("https:"); s.release("held-url.png");
  await expect.poll(() => s.assets.length).toBe(1);
  await expect(avatar(s.win)).toHaveValue("https:");
  await expect(s.win.getByRole("button", { name: "取消上傳", exact: true })).toHaveCount(0);
  expect(s.profile().avatar).toBe("https://assets.test/original.png");
  await avatar(s.win).press("Enter"); await expect(avatar(s.win)).toHaveAttribute("aria-invalid", "true");
  await avatar(s.win).fill("https://assets.test/new.png"); await avatar(s.win).press("Enter");
  await expect.poll(() => s.profile().avatar).toBe("https://assets.test/new.png");
  await page.reload(); await expect(avatar(s.win)).toHaveValue("https://assets.test/new.png");
});

test("repeated file choice supersedes old work; failure retries only once and remove persists", async ({ page }) => {
  const s = await open(page);
  await picker(s.win).setInputFiles(file("held-old.png")); await expect.poll(() => s.calls.length).toBe(1);
  await picker(s.win).setInputFiles(file("retry.png"));
  const retry = s.win.getByRole("button", { name: "重試 retry.png", exact: true }); await expect(retry).toBeVisible();
  expect(s.profile().avatar).toBe("https://assets.test/original.png");
  await retry.click(); await expect.poll(() => s.profile().avatar).toMatch(/^retro-asset:/);
  const firstSuccess = s.profile().avatar;
  await picker(s.win).setInputFiles(file("retry.png")); await expect.poll(() => s.calls.filter((n) => n === "retry.png").length).toBe(3);
  await expect.poll(() => s.profile().avatar).not.toBe(firstSuccess);
  const latest = s.profile().avatar; s.release("held-old.png"); await expect.poll(() => s.assets.length).toBe(3);
  expect(s.profile().avatar).toBe(latest);
  await s.win.getByRole("button", { name: "移除頭像", exact: true }).click(); await expect.poll(() => s.profile().avatar).toBeNull();
  await page.reload(); await expect(avatar(s.win)).toHaveValue(""); await expect(s.win.getByRole("button", { name: "移除頭像", exact: true })).toHaveCount(0);
});

test("explicit cancellation keeps the source and does not offer stale retry", async ({ page }) => {
  const s = await open(page); await picker(s.win).setInputFiles(file("held-cancel.png")); await expect.poll(() => s.calls.length).toBe(1);
  await s.win.getByRole("button", { name: "取消上傳", exact: true }).click(); s.release("held-cancel.png");
  await expect.poll(() => s.assets.length).toBe(1);
  await expect(s.win.locator('[data-upload-state="failed"]')).toContainText("取消上傳");
  await expect(s.win.getByRole("button", { name: /重試/ })).toHaveCount(0);
  await expect(avatar(s.win)).toHaveValue("https://assets.test/original.png");
});

test("switching OC during upload retains original ownership and subsequent text edits", async ({ page }) => {
  const s = await open(page); await picker(s.win).setInputFiles(file("held-profile.png")); await expect.poll(() => s.calls.length).toBe(1);
  const name = s.win.getByRole("textbox", { name: "顯示名稱", exact: true }); await name.fill("New name"); await name.press("Enter");
  const select = s.win.getByRole("region", { name: "角色切換器" }).locator("select").first(); await select.selectOption("other");
  s.release("held-profile.png"); await expect.poll(() => s.profile().avatar).toMatch(/^retro-asset:/);
  expect(s.profile().displayName).toBe("New name"); expect(s.profile("other").avatar).toBe("https://assets.test/original.png");
  await expect(avatar(s.win)).toHaveValue("https://assets.test/original.png");
  await select.selectOption("profile:ig"); await expect(s.win.locator('[data-upload-state="completed"]')).toBeVisible();
});

for (const width of [320, 390]) test(`visible sources and highlight replacement preserve identity and metadata at ${width}px`, async ({ page }, testInfo) => {
  const s = await open(page, width);
  await expect(s.win.locator(".ig-profile-editor label.image-source-label")).toHaveText("頭像網址");
  await avatar(s.win).fill("https://assets.test/phone.png"); await avatar(s.win).press("Enter");
  await expect.poll(() => s.profile().avatar).toBe("https://assets.test/phone.png");
  await page.screenshot({ path: testInfo.outputPath(`avatar-${width}.png`) });
  await s.win.getByRole("tab", { name: "貼文", exact: true }).click();
  await expect(s.win.getByText("新貼文圖片網址", { exact: true })).toBeVisible();
  const newPostUrl = s.win.getByRole("textbox", { name: "新貼文圖片網址", exact: true });
  expect((await newPostUrl.boundingBox())!.width).toBeGreaterThan(140);
  await page.screenshot({ path: testInfo.outputPath(`post-fields-${width}.png`) });
  await s.win.getByRole("tab", { name: "精選／合集", exact: true }).click();
  const url = s.win.getByRole("textbox", { name: "精選第 1 頁圖片網址", exact: true });
  const before = structuredClone(s.saved().entities.highlights![0].frames[0]);
  await expect(url).toBeVisible();
  await url.fill("https:"); await url.press("Enter"); await expect(url).toHaveAttribute("aria-invalid", "true");
  expect(s.saved().entities.highlights![0].frames[0]).toEqual(before);
  await url.fill("https://assets.test/replacement.png"); await url.press("Enter");
  await expect.poll(() => s.saved().entities.highlights![0].frames[0].src).toBe("https://assets.test/replacement.png");
  expect(s.saved().entities.highlights![0].frames[0]).toEqual({ ...before, src: "https://assets.test/replacement.png", srcUrl: "https://assets.test/replacement.png" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`image-fields-${width}.png`) });
});
