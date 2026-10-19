import { expect, test, type Page } from "@playwright/test";
import { duplicateProfile, makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";
const SITE = "site-1";
const auth = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
function fixture(noHost = false) {
  const migrated = migrateSiteDocumentV2(igDocument({ name: "Public Character" }), { siteId: SITE });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const copy = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: SITE, id: "profile:private", handle: "private" });
  if (!copy.ok) throw new Error("fixture");
  const doc = copy.document;
  const publicId = doc.entities.profiles[0].id;
  const privateProfile = doc.entities.profiles.find((profile) => profile.id === "profile:private")!;
  privateProfile.visibility = "draft"; privateProfile.displayName = "PRIVATE CHARACTER"; privateProfile.name = "PRIVATE CHARACTER";
  doc.entities.profiles.push({ ...structuredClone(doc.entities.profiles[0]), id: "profile:author", handle: "author", displayName: "Post Author", name: "Post Author", visibility: "published" });
  const exactPost = doc.entities.posts[1]; exactPost.caption = "EXACT POST CONTENT"; exactPost.authorProfileId = "profile:author";
  const explorer = makeWindow("explorer", 1);
  if (explorer.type !== "explorer") throw new Error("fixture");
  explorer.id = "explorer"; explorer.title = "Targets.exe"; explorer.defaultOpen = true;
  explorer.layout.desktop = { ...explorer.layout.desktop, x: 20, y: 30, w: 440, h: 560 };
  explorer.content.shortcuts = [
    { id: "profile", label: "Open character", parentId: null, order: 0, visibility: "published", target: { kind: "profile", siteId: SITE, id: publicId } },
    { id: "post", label: "Open exact post", parentId: null, order: 1, visibility: "published", target: { kind: "post", siteId: SITE, id: exactPost.id } },
    { id: "private", label: "PRIVATE SHORTCUT", parentId: null, order: 2, visibility: "published", target: { kind: "profile", siteId: SITE, id: privateProfile.id } }
  ];
  for (const window of doc.windows) { window.defaultOpen = false; window.layout.desktop = { ...window.layout.desktop, x: 520, y: 30, w: 420, h: 690 }; }
  if (noHost) doc.windows = [];
  doc.windows.push(explorer);
  const links = makeWindow("links", 2); links.id = "links"; links.title = "Links.exe"; links.defaultOpen = false; doc.windows.push(links);
  return doc;
}
async function publicPage(page: Page, noHost = false, nested = false) {
  const doc = fixture(noHost);
  if (nested) { const explorer = doc.windows.find((window) => window.type === "explorer")!; if (explorer.type === "explorer") { explorer.content.folders = [{ id: "posts", parentId: null, name: "Posts", order: 0, visibility: "published" }]; explorer.content.shortcuts.find((shortcut) => shortcut.id === "post")!.parentId = "posts"; } }
  const projection = projectPublicSiteDocument(doc, SITE);
  if (!projection.ok) throw new Error("projection");
  const requests: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") requests.push(request.url()); });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Nav", published_document: projection.document, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
  await page.goto("/@demo"); return requests;
}
async function owner(page: Page, width: number) {
  const doc = fixture(true); let writes = 0;
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), auth);
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: SITE, username: "demo", site_name: "Nav", draft_document: doc, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-19T00:00:00Z", access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { writes++; return route.fulfill({ json: { version: 2, updatedAt: "2026-10-19T00:01:00Z" } }); });
  await page.setViewportSize({ width, height: 844 }); await page.goto("/editor/site-1");
  if (width < 768) await page.locator(".m-tool", { hasText: "預覽" }).first().click(); else await page.getByRole("button", { name: /訪客預覽/ }).first().click();
  return () => writes;
}
const overlay = (page: Page) => page.locator(".preview-overlay");
const targetWindow = (page: Page) => page.getByRole("dialog", { name: "Targets.exe", exact: true });
async function openExplorerOnPhone(page: Page) { const scope = await overlay(page).count() ? overlay(page) : page.locator(".visitor-page"); await scope.locator(".m-icon").getByText("Targets.exe", { exact: true }).click(); }
for (const width of [320, 390, 430]) {
  test(`public ${width}px exact post uses temporary viewer; Back restores trigger; no private target or writes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 }); const requests = await publicPage(page, true, width === 390);
    await openExplorerOnPhone(page);
    if (width === 390) await targetWindow(page).getByRole("button", { name: "Posts", exact: true }).click();
    expect(await page.locator(".visitor-page").textContent()).not.toContain("PRIVATE");
    const trigger = targetWindow(page).getByRole("button", { name: "Open exact post", exact: true }); await trigger.click();
    await expect(page.locator(".ig-card")).toContainText("EXACT POST CONTENT");
    await expect(page.locator(".ig-card-head strong").first()).toHaveText("author");
    await expect(page).toHaveURL(/\/@demo$/);
    await page.screenshot({ path: info.outputPath(`post-${width}.png`) });
    await page.locator(".m-back").click(); await expect(trigger).toBeFocused();
    await trigger.click(); await expect(page.locator(".ig-card")).toContainText("EXACT POST CONTENT");
    expect(requests).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
test("desktop restores a minimized host and repeated post activation relocates its local route", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await publicPage(page);
  await targetWindow(page).getByRole("button", { name: "Open character", exact: true }).click();
  const ig = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await expect(ig.locator(".ig-app")).toContainText("Public Character");
  await ig.getByRole("button", { name: "最小化", exact: true }).click(); await expect(ig).toHaveCount(0);
  await targetWindow(page).getByRole("button", { name: "Open exact post", exact: true }).click();
  await expect(ig.locator(".ig-card")).toContainText("EXACT POST CONTENT");
  await expect(ig.locator(".ig-card-head strong").first()).toHaveText("author");
  await ig.getByRole("button", { name: "個人", exact: true }).click();
  await targetWindow(page).getByRole("button", { name: "Open exact post", exact: true }).click();
  await expect(ig.locator(".ig-card")).toContainText("EXACT POST CONTENT");
  await expect(page.locator(".visitor-window")).toHaveCount(2);
});
test("owner draft can navigate private refs; publishable excludes them and visitor use never saves", async ({ page }) => {
  const writes = await owner(page, 390);
  await openExplorerOnPhone(page); await expect(overlay(page)).not.toContainText("PRIVATE");
  await overlay(page).getByRole("button", { name: "目前草稿", exact: true }).click();
  await targetWindow(page).getByRole("button", { name: "PRIVATE SHORTCUT", exact: true }).click();
  await expect(overlay(page).locator(".ig-app")).toContainText("PRIVATE CHARACTER");
  await overlay(page).getByRole("button", { name: "發布後的樣子", exact: true }).click();
  expect(await overlay(page).textContent()).not.toContain("PRIVATE");
  await page.waitForTimeout(1200); expect(writes()).toBe(0);
});


test("desktop owner action creates no undo entry or autosave and transient viewers disappear on reopen", async ({ page }) => {
  const writes = await owner(page, 1280);
  await overlay(page).getByRole("dialog", { name: "Targets.exe", exact: true }).getByRole("button", { name: "Open exact post", exact: true }).click();
  await expect(overlay(page).locator(".ig-card")).toContainText("EXACT POST CONTENT");
  await overlay(page).getByRole("button", { name: /回到編輯器/ }).click();
  await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
  await page.waitForTimeout(1200); expect(writes()).toBe(0);
  await page.getByRole("button", { name: /訪客預覽/ }).first().click();
  await expect(overlay(page).locator(".ig-app")).toHaveCount(0);
});


test("320px shared Links picker stages unsafe URL/cancel without a save; keyboard Apply keeps legacy fields", async ({ page }, info) => {
  const writes = await owner(page, 320);
  await overlay(page).getByRole("button", { name: /回到編輯器/ }).click();
  await page.locator(".m-icon").getByText("Links.exe", { exact: true }).click();
  const links = page.getByRole("dialog", { name: "Links.exe", exact: true });
  await links.locator("..").getByRole("button", { name: "編輯此視窗", exact: true }).click();
  await links.getByRole("button", { name: /^設定連結/ }).click();
  await links.getByRole("button", { name: "選擇目的地…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "目的地", exact: true });
  await picker.getByLabel("連結網址", { exact: true }).fill("javascript:alert(1)");
  await expect(picker.getByRole("button", { name: "套用", exact: true })).toBeDisabled();
  await picker.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForTimeout(1200); expect(writes()).toBe(0);
  await links.getByRole("button", { name: "選擇目的地…", exact: true }).click();
  await picker.getByRole("button", { name: "站內視窗", exact: true }).click();
  await picker.getByRole("searchbox").fill("Targets");
  await picker.getByRole("option", { name: /Targets.exe/ }).focus(); await page.keyboard.press("Space");
  await page.screenshot({ path: info.outputPath("picker-320.png") });
  await picker.getByRole("button", { name: "套用", exact: true }).click();
  await expect(links).toContainText("開啟視窗：Targets.exe");
  await expect.poll(writes).toBe(1);
});
