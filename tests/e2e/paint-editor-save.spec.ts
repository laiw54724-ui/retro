import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { makeWindow, migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

function pngBytes(body: Buffer) {
  const start = body.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (start < 0) throw new Error("Missing encoded PNG");
  let cursor = start + 8;
  while (cursor + 12 <= body.length) {
    const length = body.readUInt32BE(cursor), type = body.toString("ascii", cursor + 4, cursor + 8);
    cursor += 12 + length;
    if (type === "IEND") return body.subarray(start, cursor);
  }
  throw new Error("Incomplete PNG");
}
async function fixture(page: Page, width = 1440) {
  const about = makeWindow("about"); about.id = "about"; about.title = "Original.exe";
  const migrated = migrateSiteDocumentV2({ ...structuredClone(documentFixture), windows: [about] }, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture");
  const docs: Record<string, SiteDocumentV2Input> = { "site-1": migrated.document, "site-2": { ...structuredClone(migrated.document), siteName: "Beta" } };
  const original = structuredClone(docs["site-1"].windows[0]);
  const versions: Record<string, number> = { "site-1": 1, "site-2": 50 };
  const uploads: Buffer[] = [], writes: string[] = [], content = new Map<string, Buffer>();
  let held = false, fail = 0, pending: { route: Route; id: string; bytes: Buffer } | null = null;
  const complete = async (route: Route, id: string, bytes: Buffer) => {
    if (fail) { const status = fail; fail = 0; return route.fulfill({ status, json: { error: { code: "request_failed" } } }); }
    content.set(id, bytes);
    return route.fulfill({ json: { asset: { id, url: `retro-asset:${id}`, mimeType: "image/png", kind: "image", size: bytes.length, name: "Drawing" } } });
  };
  await page.addInitScript(() => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } }));
    const state = window as typeof window & { paintReceipts: number }; state.paintReceipts = 0;
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      if (String(args[0]).endsWith("/assets") && args[1]?.method === "POST") {
        const json = response.json.bind(response);
        response.json = async () => { const value = await json(); setTimeout(() => { state.paintReceipts++; }, 0); return value; };
      }
      return response;
    };
  });
  await page.route("**/api/sites**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sites") return route.fulfill({ json: { sites: Object.keys(docs).map((id) => ({ id, username: id === "site-1" ? "demo" : "beta", site_name: docs[id].siteName, draft_version: versions[id], published_version: null, access_role: "owner", updated_at: "2026-10-19T00:00:00Z" })) } });
    const id = path.split("/")[3];
    if (!docs[id]) return route.fulfill({ status: 404 });
    if (path.endsWith("/assets") && route.request().method() === "POST") {
      const bytes = pngBytes(route.request().postDataBuffer()!); uploads.push(bytes);
      const assetId = `11111111-1111-4111-8111-${String(uploads.length).padStart(12, "0")}`;
      if (held) { pending = { route, id: assetId, bytes }; return; }
      return complete(route, assetId, bytes);
    }
    if (path.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    if (path.endsWith("/content")) {
      const bytes = content.get(path.split("/")[5]);
      return bytes ? route.fulfill({ body: bytes, contentType: "image/png" }) : route.fulfill({ status: 404 });
    }
    if (path.endsWith("/draft")) { docs[id] = route.request().postDataJSON().document; writes.push(id); return route.fulfill({ json: { version: ++versions[id] } }); }
    return route.fulfill({ json: { site: { id, username: id === "site-1" ? "demo" : "beta", site_name: docs[id].siteName, draft_document: docs[id], draft_version: versions[id], published_document: null, published_version: null, access_role: "owner" } } });
  });
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/auth"); await page.locator('a[href="/editor/site-1"]').click();
  await page.getByRole("button", { name: "Paint", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Paint", exact: true });
  await expect(dialog.locator("canvas")).toBeVisible();
  return { dialog, docs, original, versions, uploads, writes, hold: () => { held = true; }, failNext: () => { fail = 500; }, pending: () => !!pending, release: async () => { if (!pending) throw new Error("no upload"); held = false; const item = pending; pending = null; await complete(item.route, item.id, item.bytes); } };
}
async function draw(page: Page, direction = "ArrowRight") {
  const canvas = page.getByRole("dialog", { name: "Paint", exact: true }).locator("canvas");
  await canvas.focus(); await canvas.press("Space"); await canvas.press(direction); await canvas.press("Space");
}
const saveName = "儲存 PNG 到新相簿";
const galleries = (doc: SiteDocumentV2Input) => doc.windows.filter((window) => window.type === "gallery");

test("formal entry saves a new PNG/Gallery, retains original, supports document undo and reload", async ({ page }, info) => {
  const state = await fixture(page); await draw(page);
  await page.waitForTimeout(750); expect(state.writes).toHaveLength(0);
  await state.dialog.getByLabel("作品名稱", { exact: true }).fill("My Paint");
  await page.screenshot({ path: info.outputPath("paint-editor-desktop.png"), fullPage: false });
  await state.dialog.getByRole("button", { name: saveName, exact: true }).click();
  await expect.poll(() => galleries(state.docs["site-1"]).length).toBe(1);
  expect(state.uploads).toHaveLength(1);
  expect(state.uploads[0].readUInt32BE(16)).toBe(640); expect(state.uploads[0].readUInt32BE(20)).toBe(480);
  expect(state.docs["site-1"].windows[0]).toEqual(state.original);
  await expect(state.dialog.getByRole("button", { name: saveName, exact: true })).toBeDisabled();
  await state.dialog.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect.poll(() => galleries(state.docs["site-1"]).length).toBe(0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect.poll(() => galleries(state.docs["site-1"]).length).toBe(1);
  await page.reload(); await expect(page.getByRole("dialog", { name: "My Paint", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "My Paint", exact: true }).locator("img").first()).toBeVisible();
});

test("failed upload preserves the canvas and Retry saves once; newer strokes stay dirty", async ({ page }) => {
  const state = await fixture(page); await draw(page); state.failNext();
  await state.dialog.getByRole("button", { name: saveName, exact: true }).click();
  await expect(state.dialog.getByRole("status")).toContainText("畫布仍保留");
  expect(galleries(state.docs["site-1"])).toHaveLength(0);
  state.hold();
  await state.dialog.getByRole("button", { name: saveName, exact: true }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(state.pending).toBe(true); expect(state.uploads).toHaveLength(2);
  await draw(page, "ArrowDown"); await state.release();
  await expect.poll(() => galleries(state.docs["site-1"]).length).toBe(1);
  await expect(state.dialog.getByRole("button", { name: saveName, exact: true })).toBeEnabled();
  expect(state.uploads).toHaveLength(2);
});

test("dirty Paint guards nested Back/Stay, Escape and native reload; late upload cannot follow B", async ({ page }) => {
  const state = await fixture(page); await draw(page);
  await page.goBack();
  const leave = page.getByRole("dialog", { name: "離開編輯器？", exact: true });
  await expect(leave).toBeVisible(); await page.keyboard.press("Escape");
  await expect(leave).toHaveCount(0); await expect(state.dialog).toBeVisible();
  let warned = 0;
  const dismiss = async (dialog: import("@playwright/test").Dialog) => { warned++; await dialog.dismiss(); };
  page.on("dialog", dismiss);
  await page.keyboard.press("Escape"); expect(warned).toBe(1); await expect(state.dialog).toBeVisible();
  await page.evaluate(() => window.location.reload()); await expect.poll(() => warned).toBe(2);
  page.off("dialog", dismiss);
  state.hold(); await state.dialog.getByRole("button", { name: saveName, exact: true }).click();
  await expect.poll(state.pending).toBe(true);
  await page.goBack(); await leave.getByRole("button", { name: "仍要離開", exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/); await page.locator('a[href="/editor/site-2"]').click();
  await state.release();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { paintReceipts: number }).paintReceipts)).toBe(1);
  expect(galleries(state.docs["site-2"])).toHaveLength(0); expect(state.versions["site-2"]).toBe(50);
  expect(state.writes).not.toContain("site-2");
});

for (const width of [320, 390]) test(`phone-visible draw/export/save at ${width}px`, async ({ page }, info) => {
  const state = await fixture(page, width); await draw(page);
  const download = page.waitForEvent("download");
  await state.dialog.getByRole("button", { name: "匯出 PNG", exact: true }).click();
  const pngPath = await (await download).path();
  if (!pngPath) throw new Error("PNG download has no local path");
  const png = await readFile(pngPath);
  expect(png.readUInt32BE(16)).toBe(640); expect(png.readUInt32BE(20)).toBe(480);
  await expect(state.dialog.getByRole("button", { name: saveName, exact: true })).toBeEnabled();
  const bounds = await state.dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(await state.dialog.locator("button, input, select").evaluateAll((controls, viewportWidth) => controls.every((control) => {
    const rect = control.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= viewportWidth;
  }), width)).toBe(true);
  await page.screenshot({ path: info.outputPath(`paint-editor-${width}.png`), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await state.dialog.getByRole("button", { name: saveName, exact: true }).click();
  await expect.poll(() => galleries(state.docs["site-1"]).length).toBe(1);
});

test("Paint command Undo never rewinds the editor document history", async ({ page }) => {
  const state = await fixture(page);
  await state.dialog.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByLabel("視窗標題", { exact: true }).fill("Keep this title");
  await expect.poll(() => state.docs["site-1"].windows[0].title).toBe("Keep this title");
  await page.getByRole("button", { name: "Paint", exact: true }).click();
  await draw(page); await state.dialog.locator("canvas").press("ControlOrMeta+z");
  await expect(state.dialog.getByRole("button", { name: saveName, exact: true })).toBeDisabled();
  await page.waitForTimeout(750);
  expect(state.docs["site-1"].windows[0].title).toBe("Keep this title");
  await draw(page);
  await page.goBack();
  const leave = page.getByRole("dialog", { name: "離開編輯器？", exact: true });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "保留並繼續編輯", exact: true }).press("ControlOrMeta+z");
  await page.waitForTimeout(750);
  expect(state.docs["site-1"].windows[0].title).toBe("Keep this title");
  await leave.getByRole("button", { name: "保留並繼續編輯", exact: true }).press("ControlOrMeta+y");
  await leave.getByRole("button", { name: "保留並繼續編輯", exact: true }).click();
  await expect(state.dialog.getByRole("button", { name: saveName, exact: true })).toBeEnabled();
});
