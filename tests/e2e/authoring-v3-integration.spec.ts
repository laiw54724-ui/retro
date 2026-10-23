import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAssetReference, duplicateProfile, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

async function fixture(page: Page, width: number) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "combined" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Invalid fixture");
  const duplicated = duplicateProfile(migrated.document, "profile:ig", { siteId: "combined", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("Invalid profile fixture");
  let saved = duplicated.document, version = 1;
  const second = makeWindow("document"); second.id = "notes"; second.title = "Notes.exe";
  saved.windows.push(second);
  let release: (() => void) | undefined;
  let uploads = 0;
  const assetId = randomUUID(), assetRef = createAssetReference(assetId);
  await page.addInitScript(() => {
    localStorage.setItem("retrodesk:locale", "zh-Hant");
    localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } }));
  });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/draft")) {
      saved = route.request().postDataJSON().document;
      return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-22T00:00:00Z" } });
    }
    if (url.pathname.endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (url.pathname.endsWith("/assets")) {
      if (route.request().method() !== "POST") return route.fulfill({ json: { assets: [] } });
      uploads++;
      await new Promise<void>(resolve => { release = resolve; });
      return route.fulfill({ json: { asset: { id: assetId, url: assetRef, name: "held.png", kind: "image", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-22T00:00:00Z" } } });
    }
    if (url.pathname === "/api/sites/combined") return route.fulfill({ json: { site: { id: "combined", username: "demo", site_name: "Combined", draft_document: saved, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/editor/combined");
  const enter = async () => {
    await page.getByRole("button", { name: "Instagram.exe", exact: true }).click();
    await enterContentEditor(page);
  };
  await enter();
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  const posts = win.locator(".ig-canonical-posts");
  await win.getByRole("button", { name: "管理貼文", exact: true }).click();
  await posts.locator("[data-ig-edit]").filter({ hasText: "p1" }).click();
  return { win, posts, enter, saved: () => saved, uploads: () => uploads, assetRef,
    release: () => { release?.(); release = undefined; } };
}

for (const width of [320, 375, 390, 430]) test(`combined IG draft survives phone Done, Back, preview and short viewport at ${width}px`, async ({ page }) => {
  const s = await fixture(page, width);
  const pending = s.posts.getByRole("textbox", { name: "新增輪播圖片網址", exact: true });
  await pending.fill("https:");
  await s.posts.getByRole("textbox", { name: "貼文內容", exact: true }).fill("Combined caption");
  await pending.focus();
  await page.addStyleTag({ content: ":root { --m-safe-bottom: 34px; }" });
  await page.setViewportSize({ width, height: 420 });
  // No test scroll: the mobile resize handler must reveal the focused IG field.
  await expect(pending).toBeFocused();
  try { await expect(pending).toBeInViewport({ ratio: 1 }); }
  catch (error) {
    const ancestors = await pending.evaluate(element => {
      const values = [];
      for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        values.push({ className: node.className, rect: node.getBoundingClientRect().toJSON(), clientHeight: node.clientHeight, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, overflow: css.overflow, scrollPadding: css.scrollPaddingBlock });
      }
      return values;
    });
    await test.info().attach("clipping-ancestors", { body: JSON.stringify(ancestors, null, 2), contentType: "application/json" });
    throw error;
  }
  const field = (await pending.boundingBox())!, scroll = (await s.win.locator(".ig-edit-scroll").boundingBox())!;
  expect(field.y).toBeGreaterThanOrEqual(scroll.y);
  expect(field.y + field.height).toBeLessThanOrEqual(scroll.y + scroll.height);
  for (const control of [page.locator(".m-window-settings"), page.locator(".m-back"), page.getByRole("button", { name: "發布", exact: true })]) await expect(control).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath(`combined-ig-short-${width}.png`) });
  await page.setViewportSize({ width, height: 844 });
  await s.posts.getByRole("button", { name: "完成編輯", exact: true }).click();
  const item = s.posts.locator("[data-ig-edit]").filter({ hasText: "p1" });
  await expect(item).toBeFocused();
  await item.click();
  await enterContentEditor(page);
  await expect(page.locator(".save-text")).toHaveText("有欄位未完成，暫不儲存");
  await enterContentEditor(page);
  await s.win.getByRole("button", { name: "管理貼文", exact: true }).click();
  await item.click();
  await expect(pending).toHaveValue("https:");
  await s.win.getByRole("tab", { name: "▶ 預覽互動", exact: true }).click();
  await s.win.getByRole("button", { name: "← 返回編輯", exact: true }).click();
  await expect(pending).toHaveValue("https:");
  const settings = page.getByRole("button", { name: "視窗設定", exact: true });
  await settings.click(); await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(pending).toHaveValue("https:");
  await page.locator(".m-back").click();
  await expect(page.getByRole("button", { name: "Instagram.exe", exact: true })).toBeFocused();
  await s.enter();
  await s.win.getByRole("button", { name: "管理貼文", exact: true }).click();
  await s.posts.locator("[data-ig-edit]").filter({ hasText: "p1" }).click();
  await expect(pending).toHaveValue("https:");
  await expect(s.posts.getByRole("textbox", { name: "貼文內容", exact: true })).toHaveValue("Combined caption");
  await expect.poll(() => s.saved().entities.posts.find(post => post.title === "p1")?.caption).toBe("Combined caption");
});

for (const width of [320, 390]) for (const action of ["window", "profile"] as const) test(`combined delayed replacement stays with its original post after ${action} change at ${width}px`, async ({ page }) => {
  const s = await fixture(page, width);
  const original = structuredClone(s.saved().entities.posts.find(post => post.title === "p1")!);
  const others = structuredClone(s.saved().entities.posts.filter(post => post.authorProfileId === "other"));
  await s.posts.getByLabel("替換圖片 1", { exact: true }).setInputFiles({ name: "held.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(s.uploads).toBe(1);
  expect(s.saved().entities.posts.find(post => post.id === original.id)?.media).toEqual(original.media);
  try {
    if (action === "window") {
      await page.locator(".m-back").click();
      await page.getByRole("button", { name: "Notes.exe", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Notes.exe", exact: true })).toBeVisible();
    } else {
      await s.win.getByRole("region", { name: "角色切換器" }).locator("select").first().selectOption("other");
      await expect(s.win.getByText("held.png", { exact: true })).toBeHidden();
    }
    s.release();
    await expect.poll(() => s.saved().entities.posts.find(post => post.id === original.id)?.media?.[0].src).toBe(s.assetRef);
    expect(s.saved().entities.posts.find(post => post.id === original.id)?.media?.[0].id).toBe(original.media![0].id);
    expect(s.saved().entities.posts.filter(post => post.authorProfileId === "other")).toEqual(others);
    expect(s.saved().entities.posts.filter(post => post.media?.some(media => media.src === s.assetRef))).toHaveLength(1);
    if (action === "window") {
      await page.locator(".m-back").click(); await s.enter();
      await s.win.getByRole("button", { name: "管理貼文", exact: true }).click();
      await s.posts.locator("[data-ig-edit]").filter({ hasText: "p1" }).click();
    }
    else await s.win.getByRole("region", { name: "角色切換器" }).locator("select").first().selectOption("profile:ig");
    await expect(s.posts.getByLabel("替換圖片 1", { exact: true })).toBeAttached();
  } finally { s.release(); }
});
