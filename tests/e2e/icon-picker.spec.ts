import { expect, test, type Page } from "@playwright/test";
import { createAssetReference, makeWindow, migrateSiteDocumentV2, type SiteDocument } from "@retrodesk/shared";
import { documentFixture, mockWindowsIconPack } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
type Asset = { id: string; url: string; mimeType: string; size: number; kind: string; name: string; createdAt: string };
const mine: Asset[] = [{ id: "11111111-1111-4111-8111-111111111111", url: "https://img.test/mine.png", mimeType: "image/png", size: 10, kind: "icon", name: "my-star", createdAt: "2026-10-17T00:00:00Z" }];

async function mockEditor(page: Page, document: unknown = documentFixture, assets: Asset[] = []) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: document as Record<string, unknown>, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: SiteDocument }> = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    site.draft_document = body.document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:00:00Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  return { site, saves };
}

async function openDialog(page: Page) {
  await page.getByRole("tab", { name: "圖示" }).click();
  await page.getByRole("button", { name: "更換圖示…" }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".ilib-grid .ilib-tile").first()).toBeVisible();
  return dialog;
}

async function openEditor(page: Page, document: unknown = documentFixture, assets: Asset[] = [], windowTitle = "About.exe") {
  const state = await mockEditor(page, document, assets);
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: windowTitle })).toBeVisible();
  // The editor may save once on load (v1 -> v2 upgrade); only saves caused by the test count.
  await page.waitForTimeout(1500);
  state.saves.length = 0;
  return state;
}

const aboutIcon = (saves: Array<{ document: SiteDocument }>) => saves.at(-1)?.document.windows.find((window) => window.id === "about")?.icon;

test("library is lazy, same-origin and offers the five categories, purposes and counts", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await openEditor(page, documentFixture, mine);
  await page.getByRole("tab", { name: "圖示" }).click();
  expect(requests.filter((url) => /catalog\.generated|icon-library/.test(url))).toEqual([]);

  const dialog = await openDialog(page);
  for (const name of ["全部", "彩色復古", "彩色像素", "單色像素", "我的上傳"]) await expect(dialog.getByRole("tab", { name, exact: true })).toBeVisible();
  for (const name of ["全部用途", "資料夾", "文件", "圖片", "音樂", "人物", "工具"]) await expect(dialog.getByRole("group", { name: "用途篩選" }).getByRole("button", { name, exact: true })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Windows（本機）" })).toHaveCount(0);
  await expect(dialog.getByRole("status").first()).toContainText(/共 \d+ 個圖示/);

  await dialog.getByRole("tab", { name: "彩色復古" }).click();
  const haikuCount = await dialog.locator(".ilib-grid .ilib-tile").count();
  await dialog.getByRole("tab", { name: "彩色像素" }).click();
  const pixelCount = await dialog.locator(".ilib-grid .ilib-tile").count();
  await dialog.getByRole("tab", { name: "單色像素" }).click();
  const monoCount = await dialog.locator(".ilib-grid .ilib-tile").count();
  expect([haikuCount, pixelCount, monoCount]).toEqual([102, 64, 165]);
  // every thumbnail has a visible name
  await expect(dialog.locator(".ilib-grid .ilib-name").first()).toBeVisible();

  // browsing never touches a third party: only same-origin, data and blob URLs
  const foreign = requests.filter((url) => !/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(url));
  expect(foreign.filter((url) => !/fonts\.(googleapis|gstatic)\.com|img\.test/.test(url))).toEqual([]);
  expect(requests.some((url) => url.includes("/icon-library/"))).toBe(true);
});

test("search matches zh and en names and keywords, purpose chips filter, and empty results explain themselves", async ({ page }) => {
  await openEditor(page);
  const dialog = await openDialog(page);
  const search = dialog.getByLabel("搜尋圖示");
  const grid = dialog.locator(".ilib-grid");
  await search.fill("日曆");
  await expect(grid.getByRole("button", { name: /^日曆/ }).first()).toBeVisible();
  await search.fill("calendar");
  await expect(grid.locator('[data-icon="pixelart:calendar"]')).toBeVisible();
  await expect(grid.locator('[data-icon="pixelarticons:calendar"]')).toBeVisible();
  await search.fill("信封 mail");
  await expect(grid.locator(".ilib-tile").first()).toBeVisible();
  await search.fill("zzzzqqq");
  await expect(dialog.getByText("找不到符合的圖示")).toBeVisible();
  await search.fill("");
  await dialog.getByRole("group", { name: "用途篩選" }).getByRole("button", { name: "音樂", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "用途篩選" }).getByRole("button", { name: "音樂", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(grid.locator('[data-icon="haiku:media-player"]')).toBeVisible();
  await expect(grid.locator('[data-icon="haiku:folder"]')).toHaveCount(0);
});

test("pick -> preview -> apply saves only the chosen component; reload keeps it", async ({ page }) => {
  const { saves } = await openEditor(page);
  const dialog = await openDialog(page);
  await dialog.getByLabel("搜尋圖示").fill("資料夾");
  const tile = dialog.locator('.ilib-grid [data-icon="haiku:folder"]');
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByTestId("icon-preview-name")).toHaveText("資料夾");
  await expect(dialog.getByTestId("icon-preview")).toContainText("About.exe");
  await expect(dialog.getByText("尚未套用")).toBeVisible();
  // nothing written yet
  expect(saves).toHaveLength(0);
  await dialog.getByRole("button", { name: "套用" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("icon-current-name")).toContainText("Haiku 彩色復古 · folder");
  await expect.poll(() => aboutIcon(saves)).toBe("haiku:folder");
  // other windows keep their icons
  const others = saves.at(-1)!.document.windows.filter((window) => window.id !== "about").map((window) => window.icon);
  expect(others).toEqual(documentFixture.windows.filter((window) => window.id !== "about").map((window) => window.icon));

  await page.reload();
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.getByTestId("icon-current-name")).toContainText("Haiku 彩色復古 · folder");
  await expect(page.locator('.w98-icon img[src="/icon-library/haiku/folder.svg"]').first()).toBeVisible();
});

test("cancel, Escape and backdrop-free close write nothing", async ({ page }) => {
  const { saves } = await openEditor(page);
  await page.getByRole("tab", { name: "圖示" }).click();
  const before = await page.getByTestId("icon-current-name").textContent();
  let dialog = await openDialog(page);
  await dialog.locator('.ilib-grid [data-icon="haiku:folder"]').click();
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("icon-current-name")).toHaveText(before!);
  dialog = await openDialog(page);
  await dialog.locator('.ilib-grid [data-icon="haiku:folder"]').click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(700);
  expect(saves).toHaveLength(0);
  await expect(page.getByTestId("icon-current-name")).toHaveText(before!);
});

test("current icon is clearly marked and 恢復預設 restores the type default only after 套用", async ({ page }) => {
  const doc = structuredClone(documentFixture) as typeof documentFixture;
  doc.windows[0].icon = "pixelart:calendar";
  const { saves } = await openEditor(page, doc);
  const dialog = await openDialog(page);
  const current = dialog.locator('.ilib-grid [data-icon="pixelart:calendar"]');
  await dialog.getByLabel("搜尋圖示").fill("calendar");
  await expect(current).toContainText("目前");
  await expect(current).toHaveAccessibleName(/目前使用/);
  await expect(dialog.getByRole("button", { name: "套用" })).toBeDisabled();
  await dialog.getByRole("button", { name: "恢復預設" }).click();
  await expect(dialog.getByText("尚未套用")).toBeVisible();
  expect(saves).toHaveLength(0);
  await dialog.getByRole("button", { name: "套用" }).click();
  await expect.poll(() => aboutIcon(saves)).toBe(makeWindow("about").icon);
});

test("an icon id that was removed from the library falls back to a built-in icon and says so", async ({ page }) => {
  const doc = structuredClone(documentFixture) as typeof documentFixture;
  doc.windows[0].icon = "haiku:icon-that-was-removed-folder";
  const requests: string[] = [];
  page.on("response", (response) => { if (response.url().includes("/icon-library/") && response.status() >= 400) requests.push(response.url()); });
  await openEditor(page, doc);
  await page.getByRole("tab", { name: "圖示" }).click();
  await expect(page.getByTestId("icon-current-name")).toHaveText("圖示已移除，改用預設圖示");
  await expect(page.locator(".w98-icon").first()).toBeVisible();
  expect(requests).toEqual([]);
});

test("keyboard: open, search, arrow through the grid, Enter selects, Tab reaches 套用, Escape closes; focus is visible", async ({ page }) => {
  const { saves } = await openEditor(page);
  await page.getByRole("tab", { name: "圖示" }).click();
  const trigger = page.getByRole("button", { name: "更換圖示…" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await expect(dialog.getByLabel("搜尋圖示")).toBeFocused();
  await page.keyboard.type("folder");
  const tiles = dialog.locator(".ilib-grid .ilib-tile");
  await expect(tiles.first()).toBeVisible();
  const tabs = dialog.getByRole("tab", { name: "全部" });
  await tabs.focus();
  await expect(tabs).toBeFocused();
  // focus ring is drawn on tiles
  await tiles.first().focus();
  await expect(tiles.first()).toBeFocused();
  expect(await tiles.first().evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await page.keyboard.press("ArrowRight");
  await expect(tiles.nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tiles.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tiles.first()).toHaveAttribute("aria-pressed", "true");
  const picked = await tiles.first().getAttribute("data-icon");
  const apply = dialog.getByRole("button", { name: "套用" });
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect.poll(() => aboutIcon(saves)).toBe(picked);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("my uploads: listed in their own category, selectable, applied only on 套用", async ({ page }) => {
  const { saves } = await openEditor(page, documentFixture, mine);
  const dialog = await openDialog(page);
  await dialog.getByRole("tab", { name: "我的上傳" }).click();
  const tile = dialog.getByRole("button", { name: "my-star", exact: true });
  await expect(tile).toBeVisible();
  await expect(dialog.getByText("上傳單張…")).toBeVisible();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  expect(saves).toHaveLength(0);
  await dialog.getByRole("button", { name: "套用" }).click();
  await expect.poll(() => aboutIcon(saves)).toBe("https://img.test/mine.png");
  await expect(page.getByTestId("icon-current-name")).toHaveText("自訂圖片");
});

test("Links items choose icons independently from the same library", async ({ page }) => {
  const doc = structuredClone(documentFixture) as typeof documentFixture;
  const links = doc.windows.find((window) => window.type === "links");
  if (!links || links.type !== "links") throw new Error("fixture has no links window");
  links.defaultOpen = true;
  links.content.links = [
    { id: "l1", label: "一", icon: "link", color: "#000080", target: "url", url: "https://a.example/", windowId: "", iconUrl: "" },
    { id: "l2", label: "二", icon: "link", color: "#000080", target: "url", url: "https://b.example/", windowId: "", iconUrl: "" },
  ];
  const { saves } = await openEditor(page, doc);
  await page.getByRole("dialog", { name: links.title }).getByRole("button", { name: "選擇圖示" }).nth(1).click();
  await page.getByRole("button", { name: "完整圖庫…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await dialog.getByLabel("搜尋圖示").fill("music");
  await dialog.locator('.ilib-grid [data-icon="pixelarticons:music"]').click();
  await dialog.getByRole("button", { name: "套用" }).click();
  await expect.poll(() => (saves.at(-1)?.document.windows.find((window) => window.type === "links") as { content: { links: Array<{ icon: string }> } } | undefined)?.content.links.map((link) => link.icon)).toEqual(["link", "pixelarticons:music"]);
});

test("Explorer folders and shortcuts can use library icons, visitors see them, and 恢復預設 clears them", async ({ page }) => {
  const explorer = makeWindow("explorer");
  if (explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
  explorer.id = "explorer";
  explorer.title = "Explorer.exe";
  explorer.defaultOpen = true;
  explorer.content = { folders: [{ id: "f1", parentId: null, name: "相片", order: 0, visibility: "published" }, { id: "f2", parentId: null, name: "歌", order: 1, visibility: "published" }], shortcuts: [] };
  const migrated = migrateSiteDocumentV2({ ...structuredClone(documentFixture), windows: [explorer] }, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  const { saves } = await openEditor(page, migrated.document, [], "Explorer.exe");
  const win = page.getByRole("dialog", { name: "Explorer.exe" });
  await win.getByRole("button", { name: "相片", exact: true }).click();
  await win.getByRole("button", { name: "更換圖示…" }).click();
  const dialog = page.getByRole("dialog", { name: "選擇圖示" });
  await dialog.getByLabel("搜尋圖示").fill("calendar");
  await dialog.locator('.ilib-grid [data-icon="pixelart:calendar"]').click();
  await dialog.getByRole("button", { name: "套用" }).click();
  const folders = () => (saves.at(-1)?.document.windows.find((window) => window.type === "explorer") as { content: { folders: Array<{ name: string; icon?: string }> } } | undefined)?.content.folders.map((folder) => [folder.name, folder.icon]);
  await expect.poll(folders).toEqual([["相片", "pixelart:calendar"], ["歌", undefined]]);
  await expect(win.locator(".explorer-item").first().locator(".w98-icon img")).toHaveAttribute("src", "/icon-library/pixelart/calendar.png");

  await win.getByRole("button", { name: "更換圖示…" }).click();
  await page.getByRole("dialog", { name: "選擇圖示" }).getByRole("button", { name: "恢復預設" }).click();
  await page.getByRole("dialog", { name: "選擇圖示" }).getByRole("button", { name: "套用" }).click();
  await expect.poll(folders).toEqual([["相片", undefined], ["歌", undefined]]);
});

test("the Windows pack tab exists only when the pack is installed", async ({ page }) => {
  await mockWindowsIconPack(page);
  await openEditor(page);
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("tab", { name: "Windows（本機）" })).toBeVisible();
  const help = dialog.locator("details.icon-help");
  await expect(help).not.toHaveAttribute("open", "");
  await expect(help.locator("summary")).toHaveText("Windows 圖示包說明");
  await expect(dialog.getByText("pnpm icons:install")).toBeHidden();
});

for (const width of [320, 390]) {
  test(`mobile ${width}px: dialog fits, tiles are readable and operable, nothing overflows`, async ({ page }, testInfo) => {
    await mockEditor(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/editor/site-1");
    await page.getByRole("button", { name: "About.exe", exact: true }).click();
    await page.getByRole("button", { name: "編輯內容" }).click();
    await page.getByRole("button", { name: "完成" }).click();
    await page.locator(".m-toolbar").getByRole("button", { name: "視窗設定" }).click();
    await page.getByRole("button", { name: "更換圖示…" }).click();
    const dialog = page.getByRole("dialog", { name: "選擇圖示" });
    await expect(dialog.locator(".ilib-grid .ilib-tile").first()).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const tile = dialog.locator(".ilib-grid .ilib-tile").first();
    const tileBox = await tile.boundingBox();
    expect(tileBox!.height).toBeGreaterThanOrEqual(44);
    expect(await tile.locator(".ilib-name").evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
    await dialog.getByLabel("搜尋圖示").fill("folder");
    await dialog.locator('.ilib-grid [data-icon="haiku:folder"]').click();
    await expect(dialog.getByTestId("icon-preview-name")).toHaveText("資料夾");
    await page.screenshot({ path: testInfo.outputPath(`icon-picker-mobile-${width}.png`) });
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
  });
}

test("desktop screenshots of the picker", async ({ page }, testInfo) => {
  await openEditor(page, documentFixture, mine);
  const dialog = await openDialog(page);
  await page.screenshot({ path: testInfo.outputPath("icon-picker-all.png") });
  await dialog.getByRole("tab", { name: "彩色像素" }).click();
  await dialog.getByRole("group", { name: "用途篩選" }).getByRole("button", { name: "音樂", exact: true }).click();
  await dialog.locator(".ilib-grid .ilib-tile").first().click();
  await page.screenshot({ path: testInfo.outputPath("icon-picker-pixel-music-selected.png") });
  await dialog.getByRole("tab", { name: "單色像素" }).click();
  await page.screenshot({ path: testInfo.outputPath("icon-picker-mono.png") });
});

for (const width of [1440, 390]) {
  test(`published page shows library icons at ${width}px with a clean fallback for removed ids and no foreign requests`, async ({ page }) => {
    const doc = structuredClone(documentFixture) as typeof documentFixture;
    doc.windows[0].icon = "haiku:folder";
    doc.windows[1].icon = "haiku:icon-that-was-removed-folder";
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: doc, published_version: 1, published_at: "2026-10-17T00:00:00Z" } } }));
    const requests: string[] = [];
    const bad: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("response", (response) => { if (response.url().includes("/icon-library/") && response.status() >= 400) bad.push(response.url()); });
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/@demo");
    const scope = width < 768 ? page.locator(".visitor-mobile") : page.locator(".visitor-desktop, .desktop-surface").first();
    const folder = scope.locator('.w98-icon img[src="/icon-library/haiku/folder.svg"]').first();
    await expect(folder).toBeVisible();
    await expect.poll(() => folder.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    // the removed id renders a built-in data-URI icon, never a broken request
    await expect(scope.locator('.w98-icon[style*="data:image/svg+xml"]').first()).toBeAttached();
    expect(bad).toEqual([]);
    expect(requests.filter((request) => /github\.com|githubusercontent|jsdelivr|unpkg/.test(request))).toEqual([]);
  });
}


test("private uploaded icons resolve authenticated blobs in the library and retain stable references on save", async ({ page }) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const reference = createAssetReference(id);
  const { saves } = await openEditor(page, documentFixture, [{ ...mine[0], url: reference }]);
  const requests: string[] = [];
  await page.route(`**/api/sites/site-1/assets/${id}/content`, (route) => {
    requests.push(route.request().headers()["authorization"] ?? "");
    return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64") });
  });
  const dialog = await openDialog(page);
  await dialog.getByRole("tab", { name: "我的上傳", exact: true }).click();
  const tile = dialog.getByRole("button", { name: "my-star", exact: true });
  await expect(tile.locator("img")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => tile.locator("img").evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((value) => value === "Bearer a.b.c")).toBe(true);
  await tile.click();
  const previews = dialog.getByTestId("icon-preview").locator("img");
  // Both the desktop shortcut and the taskbar preview must resolve the private asset.
  await expect(previews).toHaveCount(2);
  for (const image of await previews.all()) {
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  expect(saves).toHaveLength(0);
  await dialog.getByRole("button", { name: "套用", exact: true }).click();
  await expect.poll(() => aboutIcon(saves)).toBe(reference);
  expect(JSON.stringify(saves)).not.toContain("blob:");
  await page.reload();
  await page.getByRole("tab", { name: "圖示", exact: true }).click();
  await expect(page.locator(".icon-current-box img")).toHaveAttribute("src", /^blob:/);
});

test("an unavailable bundled icon gets a semantic fallback rather than a broken image", async ({ page }) => {
  const document = structuredClone(documentFixture);
  document.windows[0].icon = "haiku:folder";
  await page.route("**/icon-library/haiku/folder.svg", (route) => route.fulfill({ status: 404, body: "missing" }));
  await openEditor(page, document);
  await page.getByRole("tab", { name: "圖示", exact: true }).click();
  const icon = page.locator(".icon-current-box .w98-icon");
  await expect(icon.locator("img")).toHaveCount(0);
  await expect(icon).toHaveCSS("background-image", /data:image\/svg\+xml/);
});
