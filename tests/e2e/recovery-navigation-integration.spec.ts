import { expect, test, type Page } from "@playwright/test";
import { createAssetReference, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const ORIGINAL = "https://assets.test/original.png";
const ASSET_ID = "11111111-2222-4333-8444-555555555555";
async function owner(page: Page, held: boolean) {
  const migration = migrateSiteDocumentV2(igDocument({ avatar: ORIGINAL, avatarUrl: ORIGINAL }), { siteId: "site-1" });
  if (!migration.ok || migration.version !== 2) throw new Error("integration fixture migration");
  let saved = migration.document;
  const explorer = makeWindow("explorer", 1);
  if (explorer.type !== "explorer") throw new Error("explorer fixture");
  explorer.id = "targets"; explorer.title = "Targets.exe"; explorer.defaultOpen = false;
  explorer.content.shortcuts = [{ id: "post", label: "Open exact post", parentId: null, order: 0, visibility: "published", target: { kind: "post", siteId: "site-1", id: saved.entities.posts[1].id } }];
  const links = makeWindow("links", 2);
  if (links.type !== "links") throw new Error("links fixture");
  links.id = "links"; links.title = "Links.exe"; links.defaultOpen = false;
  links.content.links = [{ ...links.content.links[0], id: "open-targets", label: "Open targets", target: "window", windowId: explorer.id }];
  saved.windows.push(explorer, links);
  const baseline = structuredClone(saved);
  let version = 1, uploads = 0, saves = 0, release: (() => void) | undefined;
  const auth = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), auth);
  await page.route("https://assets.test/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Cross-batch", draft_document: saved, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saves++; saved = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version } }); });
  await page.route("**/api/sites/site-1/assets**", async (route) => {
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets: [] } });
    uploads++;
    if (held) await new Promise<void>((resolve) => { release = resolve; });
    return route.fulfill({ json: { asset: { id: ASSET_ID, url: createAssetReference(ASSET_ID), name: "cross.png", kind: "image", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-19T00:00:00Z" } } });
  });
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("/editor/site-1");
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  return { win, baseline, saved: () => saved, saves: () => saves, uploads: () => uploads, release: () => { release?.(); release = undefined; } };
}
async function phonePreview(page: Page, width: number) {
  await page.getByRole("button", { name: /訪客預覽/ }).first().click();
  await page.setViewportSize({ width, height: 844 });
  const scope = page.locator(".preview-overlay");
  await expect(scope.locator(".m-screen")).toBeVisible();
  return scope;
}
async function roundTrip(page: Page, scope: ReturnType<Page["locator"]>, image = false) {
  await scope.locator(".m-icon").getByText("Links.exe", { exact: true }).click();
  const link = scope.getByRole("button", { name: "Open targets", exact: true });
  await link.focus(); await page.keyboard.press("Enter");
  const post = scope.getByRole("button", { name: "Open exact post", exact: true });
  await post.click();
  await expect(scope.locator(".ig-card")).toContainText("second sunset");
  if (image) await expect(scope.locator(".ig-card-head img").first()).toHaveAttribute("src", /^blob:/);
  else await expect(scope.locator(".ig-card-head img").first()).toHaveAttribute("src", ORIGINAL);
  await scope.locator(".m-back").click(); await expect(post).toBeFocused();
  await scope.locator(".m-back").click(); await expect(link).toBeFocused();
  await page.keyboard.press("Space"); await expect(post).toBeVisible();
  await page.keyboard.press("Escape"); await expect(link).toBeFocused();
}

test("cancelled avatar upload cannot change a Links preview snapshot or dirty history at 320px", async ({ page }) => {
  const state = await owner(page, true);
  try {
    await state.win.locator('.ig-profile-editor input[type="file"]').setInputFiles({ name: "cross.png", mimeType: "image/png", buffer: PNG });
    await expect.poll(state.uploads).toBe(1);
    const url = state.win.getByRole("textbox", { name: "頭像網址", exact: true });
    await url.fill("https:"); await url.press("Enter");
    await expect(url).toHaveAttribute("aria-invalid", "true");
    const scope = await phonePreview(page, 320);
    const response = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/sites/site-1/assets");
    state.release(); await (await response).finished();
    await roundTrip(page, scope);
    await scope.getByRole("button", { name: /回到編輯器/ }).click();
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.getByRole("button", { name: "桌面版", exact: true }).click();
    // Responsive editor remounts need not retain a module-local input buffer.
    await expect(state.win.getByRole("textbox", { name: "頭像網址", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
    // Observe one full autosave debounce after late transport and visitor actions.
    await page.waitForTimeout(1200);
    expect(state.saves()).toBe(0); expect(state.saved()).toEqual(state.baseline);
  } finally { state.release(); }
});

test("saved avatar recovery survives Links nested Back without extra writes at 390px", async ({ page }) => {
  const state = await owner(page, false);
  await state.win.locator('.ig-profile-editor input[type="file"]').setInputFiles({ name: "cross.png", mimeType: "image/png", buffer: PNG });
  await expect(state.win.locator('[data-upload-state="completed"]')).toBeVisible();
  await expect.poll(state.saves).toBe(1);
  expect(state.saved().entities.profiles[0].avatar).toBe(createAssetReference(ASSET_ID));
  const saved = structuredClone(state.saved());
  const scope = await phonePreview(page, 390);
  await roundTrip(page, scope, true);
  await scope.getByRole("button", { name: /回到編輯器/ }).click();
  await page.setViewportSize({ width: 1400, height: 950 });
  await expect(page.getByRole("button", { name: "復原", exact: true })).toBeEnabled();
  await page.waitForTimeout(1200);
  expect(state.saves()).toBe(1); expect(state.saved()).toEqual(saved);
});
