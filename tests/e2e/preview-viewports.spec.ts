import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

/**
 * R2 / Issue #69: the three preview entries (home sample, owner preview, collaborator draft viewer) shared no viewport
 * boundary. Below 768px global CSS hides `.visitor-desktop`, so a preview that defaulted to (or was switched to) the
 * simulated desktop was blank, and the mobile simulation drew a fake phone bezel and status bar on a real phone.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const PHONES = [320, 375, 390, 430, 767] as const;
const DESKTOPS = [768, 1280] as const;

async function signIn(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
}

async function mockSite(page: Page, role: "owner" | "viewer") {
  await signIn(page);
  const id = role === "owner" ? "site-1" : "site-viewer";
  const site = { id, username: "demo", site_name: "Demo", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: role };
  await page.route(`**/api/sites/${id}`, (route) => route.fulfill({ json: { site } }));
  await page.route(`**/api/sites/${id}/assets**`, (route) => route.fulfill({ json: { assets: [] } }));
  await page.route(`**/api/sites/${id}/draft`, (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
  return id;
}

type Entry = { name: string; open: (page: Page, width: number) => Promise<void>; root: string };
const entries: Entry[] = [
  {
    name: "home sample",
    root: ".preview-overlay",
    open: async (page) => { await page.goto("/"); await page.getByRole("button", { name: /開啟互動範例/ }).first().click(); await expect(page.locator(".preview-overlay")).toBeVisible(); }
  },
  {
    name: "owner preview",
    root: ".preview-overlay",
    open: async (page, width) => {
      const id = await mockSite(page, "owner");
      await page.goto(`/editor/${id}`);
      if (width >= 768) await page.getByRole("button", { name: /訪客預覽/ }).first().click();
      else { await page.locator(".m-tool", { hasText: "預覽" }).first().click(); }
      await expect(page.locator(".preview-overlay")).toBeVisible();
    }
  },
  {
    name: "collaborator viewer",
    root: ".draft-viewer-body",
    open: async (page) => { const id = await mockSite(page, "viewer"); await page.goto(`/editor/${id}`); await expect(page.locator(".draft-viewer-body")).toBeVisible(); }
  }
];

/** Something a person can actually see and use: a window icon or the mobile screen title, with a real size. */
async function expectVisibleContent(page: Page, root: string, label: string) {
  const box = await page.evaluate((selector) => {
    const scope = document.querySelector(selector);
    if (!scope) return { found: false, area: 0, text: "" };
    const target = scope.querySelector<HTMLElement>(".m-screen, .visitor-desktop");
    if (!target) return { found: false, area: 0, text: "" };
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return { found: style.display !== "none", area: rect.width * rect.height, text: (target.innerText ?? "").trim().slice(0, 40) };
  }, root);
  expect(box.found, `${label}: preview content is displayed`).toBe(true);
  expect(box.area, `${label}: preview content has size`).toBeGreaterThan(40_000);
  expect(box.text.length, `${label}: preview content has text`).toBeGreaterThan(0);
}

for (const entry of entries) {
  for (const width of PHONES) {
    test(`${entry.name} at ${width}px shows real content with no fake device chrome`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await entry.open(page, width);
      await expectVisibleContent(page, entry.root, `${entry.name} ${width}px initial`);
      await expect(page.locator(`${entry.root} .m-bezel, ${entry.root} .m-status`)).toHaveCount(0);
      // the preview fits the viewport (bottom edge reachable) and keeps its exit control visible
      const screenBottom = await page.evaluate((selector) => document.querySelector(`${selector} .m-screen`)?.getBoundingClientRect().bottom ?? 0, entry.root);
      expect(screenBottom, `${entry.name} ${width}px mobile screen ends inside the viewport`).toBeLessThanOrEqual(800 + 1);
      expect(screenBottom).toBeGreaterThan(300);
      // no horizontal page scroll
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      // a real phone has only one honest view; a device toggle must never be able to produce a blank screen
      const desktopButton = page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name: /桌面版/ });
      if (await desktopButton.count()) {
        await desktopButton.first().click();
        await expectVisibleContent(page, entry.root, `${entry.name} ${width}px after choosing desktop`);
      }
    });
  }

  for (const width of DESKTOPS) {
    test(`${entry.name} at ${width}px defaults to the desktop and can simulate a phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await entry.open(page, width);
      await expectVisibleContent(page, entry.root, `${entry.name} ${width}px desktop`);
      await expect(page.locator(`${entry.root} .visitor-desktop`)).toBeVisible();
      await page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name: /手機版/ }).first().click();
      await expectVisibleContent(page, entry.root, `${entry.name} ${width}px simulated phone`);
      await expect(page.locator(`${entry.root} .m-bezel`)).toBeVisible();
      await page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name: /桌面版/ }).first().click();
      await expect(page.locator(`${entry.root} .visitor-desktop`)).toBeVisible();
    });
  }
}

// Landscape: phones rotated below 768px wide are still phones; wider rotated phones may simulate either view.
for (const entry of entries) {
  for (const size of [{ width: 667, height: 375, phone: true }, { width: 844, height: 390, phone: false }]) {
    test(`${entry.name} in landscape ${size.width}x${size.height} is never blank`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await entry.open(page, size.width);
      await expectVisibleContent(page, entry.root, `${entry.name} landscape ${size.width}`);
      if (size.phone) await expect(page.locator(`${entry.root} .m-bezel, ${entry.root} .m-status`)).toHaveCount(0);
      else await expect(page.locator(`${entry.root} .visitor-desktop`)).toBeVisible();
    });
  }
}

/**
 * Rotation while an app is open. The boundary is the viewport *width* (< 768px = phone), so an 844px-wide landscape
 * phone leaves the phone layout and gets the desktop view (and its optional phone simulation). That is deliberate and
 * recorded in the PR: each renderer keeps its own open-window state, so rotating re-lays out the preview rather than
 * carrying the open app across. What must hold across a rotation: never blank, no media left playing by the renderer
 * that went away, the app the visitor opens next starts from a clean state, and the exit/back controls still work.
 */
async function installCountingMedia(page: Page) {
  await page.addInitScript(() => {
    const active = new Set<HTMLMediaElement>();
    (window as unknown as { __activeMedia: () => number }).__activeMedia = () => active.size;
    // there is no network for the sample URL; its real load failure must not race the fake playback
    const nativeAdd = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) { if (type === "error") return; nativeAdd.call(this, type, listener, options); };
    HTMLMediaElement.prototype.load = function () {};
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 90 });
    HTMLMediaElement.prototype.pause = function () { active.delete(this); this.dispatchEvent(new Event("pause")); };
    HTMLMediaElement.prototype.play = function () { active.add(this); this.dispatchEvent(new Event("loadedmetadata")); this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
    // an element removed from the page while playing must not keep counting as active
    const remove = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(child: T): T { if (child instanceof HTMLMediaElement) active.delete(child); return remove.call(this, child) as T; };
  });
}

function musicDraft() {
  const document = structuredClone(documentFixture) as unknown as { windows: Array<Record<string, unknown>> };
  document.windows = [{
    id: "music-1", type: "music", title: "Rotation Player", icon: "music", defaultOpen: true,
    layout: { desktop: { x: 60, y: 40, w: 390, h: 430, z: 1, iconX: 16, iconY: 18 }, mobile: { order: 0 } },
    content: { tracks: [{ id: "t1", title: "Theme", artist: "Me", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://media.example.com/theme.mp3" }, lyrics: "", rightsNote: "Original" }], playlist: { id: "pl", title: "List", trackIds: ["t1"] } }
  }];
  return document;
}

const activeMedia = (page: Page) => page.evaluate(() => (window as unknown as { __activeMedia: () => number }).__activeMedia());

async function openOwnerPreviewWithMusic(page: Page) {
  await installCountingMedia(page);
  await signIn(page);
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: musicDraft(), draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  let saves = 0;
  await page.route("**/api/sites/site-1/draft", (route) => { saves += 1; return route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/site-1");
  await page.locator(".m-tool", { hasText: "預覽" }).first().click();
  await expect(page.locator(".preview-overlay")).toBeVisible();
  return { saves: () => saves };
}

test("rotating 390 -> 844 -> 390 with a playing app open: never blank, media stops, state is clean, exit works", async ({ page }) => {
  const backend = await openOwnerPreviewWithMusic(page);
  const overlay = page.locator(".preview-overlay");
  // the v1 fixture is migrated on load and autosaved once; the preview itself must add no further writes
  await page.waitForTimeout(1500);
  const savesBeforePreviewUse = backend.saves();

  // open the app on the phone layout and start playback
  await overlay.getByRole("button", { name: "Rotation Player" }).click();
  await overlay.getByRole("button", { name: "播放", exact: true }).click();
  await expect(overlay.getByRole("button", { name: "暫停", exact: true })).toBeVisible();
  await expect.poll(() => activeMedia(page)).toBe(1);

  // rotate to landscape (844px wide = not a phone by the width rule): desktop view, never blank, phone renderer's media stopped
  await page.setViewportSize({ width: 844, height: 390 });
  await expectVisibleContent(page, ".preview-overlay", "after rotating to 844x390");
  await expect(overlay.locator(".visitor-desktop")).toBeVisible();
  await expect(overlay.locator(".m-bezel, .m-status")).toHaveCount(0);
  await expect.poll(() => activeMedia(page)).toBe(0);
  // the desktop renderer starts clean: its player is open by default but not playing
  await expect(overlay.getByRole("button", { name: "播放", exact: true })).toBeVisible();
  await expect(overlay.getByRole("button", { name: "暫停", exact: true })).toHaveCount(0);

  // optional phone simulation in landscape still works and shows the device frame
  await overlay.locator(".device-toggle").getByRole("button", { name: /手機版/ }).click();
  await expect(overlay.locator(".m-bezel")).toBeVisible();
  await overlay.getByRole("button", { name: "Rotation Player" }).click();
  await overlay.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => activeMedia(page)).toBe(1);

  // rotate back to portrait: plain mobile layout again, simulated frame gone, the previous playback stopped
  await page.setViewportSize({ width: 390, height: 844 });
  await expectVisibleContent(page, ".preview-overlay", "after rotating back to 390x844");
  await expect(overlay.locator(".m-bezel, .m-status")).toHaveCount(0);
  await expect(overlay.locator(".device-toggle")).toHaveCount(0);
  await expect.poll(() => activeMedia(page)).toBe(0);
  // no app is left open from before: the home grid is shown, and the app can be opened and played once, then Back stops it
  await expect(overlay.getByRole("button", { name: "Rotation Player" })).toBeVisible();
  await overlay.getByRole("button", { name: "Rotation Player" }).click();
  await overlay.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => activeMedia(page)).toBe(1);
  await overlay.getByRole("button", { name: /‹ 桌面/ }).click();
  await expect.poll(() => activeMedia(page)).toBe(0);
  await expect(overlay.getByRole("button", { name: "Rotation Player" })).toBeVisible();

  // exiting the preview stops everything too and writes nothing
  await overlay.getByRole("button", { name: "Rotation Player" }).click();
  await overlay.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => activeMedia(page)).toBe(1);
  await page.getByRole("button", { name: /回到編輯器/ }).click();
  await expect(page.locator(".preview-overlay")).toHaveCount(0);
  await expect.poll(() => activeMedia(page)).toBe(0);
  expect(backend.saves()).toBe(savesBeforePreviewUse);
});
