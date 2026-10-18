import { expect, test, type Page } from "@playwright/test";
import { duplicateProfile, makeGalleryImage, makeWindow, migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { igDocument } from "./ig-fixture";

/**
 * R3 / #41 + #69: previews get their data from one adapter with explicit sources — sample, current draft, what publishing
 * would produce, and the stored published snapshot — and never write anything.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const SITE = "site-1";
const ACCENT = "#ff00aa";

/** Retro (published, themed) + Bei (published in the draft) + Secret (draft character with a post) + a gallery window. */
function draftDocument(): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: SITE });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  const base = migrated.document;
  const retro = base.entities.profiles[0];
  retro.displayName = "Retro User"; retro.visibility = "published"; retro.themeOverride = { accent: ACCENT, background: "#123456" };
  const withBei = duplicateProfile(base, retro.id, { siteId: SITE, id: "profile:bei", handle: "bei" });
  if (!withBei.ok) throw new Error("duplicate failed");
  const withSecret = duplicateProfile(withBei.document, retro.id, { siteId: SITE, id: "profile:secret", handle: "secret" });
  if (!withSecret.ok) throw new Error("duplicate failed");
  const document = withSecret.document;
  const profile = (id: string) => document.entities.profiles.find((item) => item.id === id)!;
  profile("profile:bei").displayName = "Bei Original"; profile("profile:bei").name = "Bei Original"; profile("profile:bei").visibility = "published";
  profile("profile:secret").displayName = "Secret Draft Character"; profile("profile:secret").name = "Secret Draft Character"; profile("profile:secret").visibility = "draft";
  const template = document.entities.posts[0];
  document.entities.posts.push(
    { ...structuredClone(template), id: "post:bei:timeline", authorProfileId: "profile:bei", caption: "Bei timeline", visibility: "published" },
    { ...structuredClone(template), id: "post:secret:hidden", authorProfileId: "profile:secret", caption: "Secret draft post", visibility: "draft" }
  );
  const gallery = makeWindow("gallery", document.windows.length);
  if (gallery.type !== "gallery") throw new Error("gallery fixture");
  gallery.id = "gallery"; gallery.title = "Photos.exe"; gallery.defaultOpen = false;
  gallery.content.images = [makeGalleryImage({ title: "First", src: "https://assets.test/g.png", srcUrl: "https://assets.test/g.png" })];
  document.windows.push(gallery);
  return document;
}

/** The snapshot that is online: Bei was not yet public when it was published. */
function publishedSnapshot(): SiteDocumentV2Input {
  const stored = JSON.parse(JSON.stringify(draftDocument())) as SiteDocumentV2Input;
  stored.entities.profiles.find((item) => item.id === "profile:bei")!.visibility = "draft";
  return stored;
}

type Backend = { saves: () => number; copied: () => string[] };

async function openEditor(page: Page, options: { published?: SiteDocumentV2Input | null; width?: number } = {}): Promise<Backend> {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.addInitScript(() => {
    (window as unknown as { __copied: string[] }).__copied = [];
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (text: string) => { (window as unknown as { __copied: string[] }).__copied.push(text); return Promise.resolve(); } } });
  });
  await page.route("https://assets.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgo=", "base64") }));
  const published = options.published ?? null;
  const site = { id: SITE, username: "demo", site_name: "Demo", draft_document: draftDocument(), draft_version: 2, published_document: published, published_version: published ? 2 : null, published_at: published ? "2026-10-15T00:00:00.000Z" : null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  let saves = 0;
  await page.route(`**/api/sites/${SITE}`, (route) => route.fulfill({ json: { site } }));
  await page.route(`**/api/sites/${SITE}/assets**`, (route) => route.fulfill({ json: { assets: [] } }));
  await page.route(`**/api/sites/${SITE}/draft`, (route) => { saves += 1; return route.fulfill({ json: { version: 3, updatedAt: "2026-10-15T00:01:00.000Z" } }); });
  await page.setViewportSize({ width: options.width ?? 1440, height: 900 });
  await page.goto(`/editor/${SITE}`);
  await expect(page.locator(".editor-topbar")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".canvas-window, .m-screen").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  return { saves: () => saves, copied: () => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied) as unknown as string[] };
}

const previewButton = (page: Page) => page.getByRole("button", { name: /訪客預覽/ }).first();
const overlay = (page: Page) => page.locator(".preview-overlay");
const label = (page: Page) => overlay(page).getByTestId("preview-label");

async function openDirectory(win: ReturnType<Page["locator"]>) {
  await win.getByRole("button", { name: "所有角色" }).evaluate((button) => (button as HTMLButtonElement).click());
}

test("editor preview defaults to 'after publishing', says it is not online, and can switch to the current draft", async ({ page }) => {
  await openEditor(page);
  await previewButton(page).click();
  await expect(overlay(page)).toHaveAttribute("data-preview-source", "publishable");
  await expect(label(page)).toContainText("尚未發布");
  await expect(overlay(page).getByRole("button", { name: "發布後的樣子", exact: true })).toHaveAttribute("aria-pressed", "true");
  const win = overlay(page).getByRole("dialog", { name: "Instagram.exe" });
  await openDirectory(win);
  // what publishing would produce: both public characters, never the private one (not even in the DOM)
  await expect(win.getByRole("button", { name: "Bei Original @bei" })).toBeVisible();
  await expect(overlay(page).getByText("Secret Draft Character")).toHaveCount(0);
  expect(await overlay(page).evaluate((node) => node.textContent ?? "")).not.toContain("Secret");

  // the working draft shows what an authorised viewer of the draft sees, and says so
  await overlay(page).getByRole("button", { name: "目前草稿", exact: true }).click();
  await expect(overlay(page)).toHaveAttribute("data-preview-source", "draft");
  await expect(label(page)).toContainText("目前草稿");
  // switching the source keeps the visitor's place (the character list), now showing the private character too
  const draftWin = overlay(page).getByRole("dialog", { name: "Instagram.exe" });
  await expect(draftWin.getByText("Secret Draft Character")).toBeVisible();
});

test("the character theme the author chose survives in the preview", async ({ page }) => {
  await openEditor(page);
  await previewButton(page).click();
  const accent = await overlay(page).locator(".ig-app, .ig").first().evaluate((node) => getComputedStyle(node).getPropertyValue("--ig-profile-accent").trim());
  expect(accent.toLowerCase()).toBe(ACCENT);
});

test("a published site with newer draft changes says so; sharing works only for what is in the stored snapshot", async ({ page, baseURL }) => {
  const backend = await openEditor(page, { published: publishedSnapshot() });
  await previewButton(page).click();
  await expect(label(page)).toContainText("有未發布的變更");
  const win = overlay(page).getByRole("dialog", { name: "Instagram.exe" });

  // Bei is public after publishing but is not online yet: no share link may point at it
  await openDirectory(win);
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  await win.getByRole("button", { name: "分享個人檔案" }).click();
  await expect(win.getByText("這個角色尚未公開發布，發布後才能分享。")).toBeVisible();
  expect(await backend.copied()).toEqual([]);

  // Retro exists in the stored snapshot: its link is the real, reachable URL of this environment
  await win.getByRole("button", { name: "返回" }).click();
  await win.getByRole("button", { name: "返回" }).click();
  await win.getByRole("button", { name: "分享個人檔案" }).click();
  await expect.poll(async () => (await backend.copied()).length).toBe(1);
  const [link] = await backend.copied();
  expect(link.startsWith(`${new URL(baseURL ?? page.url()).origin}/@demo/oc/`)).toBe(true);
});

test("a never-published site never offers a share link and the top bar shows this environment's address", async ({ page }) => {
  await openEditor(page);
  await expect(page.locator(".site-url")).toHaveText(/^127\.0\.0\.1:\d+\/@demo$/);
  await expect(page.locator(".site-url")).not.toContainText("retrodesk.me");
  await previewButton(page).click();
  const win = overlay(page).getByRole("dialog", { name: "Instagram.exe" });
  await win.getByRole("button", { name: "分享個人檔案" }).click();
  await expect(win.getByText("發布後才能分享")).toBeVisible();
});

test("the home page example is read-only: no published claim, no fake URL, returns to the samples", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const opener = page.getByRole("button", { name: /開啟互動範例/ }).first();
  await opener.click();
  await expect(overlay(page)).toHaveAttribute("data-preview-source", "sample");
  await expect(label(page)).toContainText("範例");
  await expect(label(page)).toContainText("唯讀");
  expect(await overlay(page).evaluate((node) => node.textContent ?? "")).not.toMatch(/已發布|retrodesk\.me|demo-/);
  await expect(overlay(page).getByRole("button", { name: "發布後的樣子" })).toHaveCount(0);
  await expect(overlay(page).getByRole("button", { name: "‹ 返回範例" })).toBeFocused();
  await overlay(page).getByRole("button", { name: "‹ 返回範例" }).click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("Escape closes the top layer first (lightbox, story, open phone app), then the preview, and focus returns", async ({ page }) => {
  await openEditor(page);
  const opener = previewButton(page);
  await opener.focus();
  await opener.click();

  // lightbox over the preview: first Escape closes only the lightbox
  const gallery = overlay(page).getByRole("button", { name: "Photos.exe" });
  await gallery.click();
  await overlay(page).getByRole("dialog", { name: "Photos.exe" }).getByRole("button", { name: /放大/ }).first().click();
  await expect(page.getByRole("dialog", { name: /First|圖片|放大/ }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toBeVisible();
  await expect(page.locator(".lightbox, [role=dialog][aria-modal=true]:not(.preview-overlay)")).toHaveCount(0);

  // an IG highlight story is a dialog too
  const ig = overlay(page).getByRole("dialog", { name: "Instagram.exe" });
  await ig.locator(".ig-highlight, .ig-hl").first().click();
  await expect(ig.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ig.getByRole("dialog")).toHaveCount(0);
  await expect(overlay(page)).toBeVisible();

  // nothing left on top: Escape closes the preview and focus goes back to the button that opened it
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("on a phone Escape leaves the open app first, then the preview", async ({ page }) => {
  await openEditor(page, { width: 390 });
  await page.locator(".m-tool", { hasText: "預覽" }).first().click();
  await expect(overlay(page)).toBeVisible();
  await overlay(page).getByRole("button", { name: "Instagram.exe" }).click();
  await expect(overlay(page).getByRole("button", { name: /‹ 桌面/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page).getByRole("button", { name: /‹ 桌面/ })).toHaveCount(0);
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
});

test("browser Back closes the preview without leaving the editor, and a later Back still works", async ({ page }) => {
  await openEditor(page);
  const editorUrl = page.url();
  await previewButton(page).click();
  await expect(overlay(page)).toBeVisible();
  await page.goBack();
  await expect(overlay(page)).toHaveCount(0);
  expect(page.url()).toBe(editorUrl);
  await expect(previewButton(page)).toBeVisible();
  // closing with the button leaves no stray entry behind: reopening and closing repeatedly never leaves the page
  for (let i = 0; i < 2; i += 1) {
    await previewButton(page).click();
    await overlay(page).getByRole("button", { name: /回到編輯器/ }).click();
    await expect(overlay(page)).toHaveCount(0);
    await page.waitForTimeout(100);
    expect(page.url()).toBe(editorUrl);
  }
});

test("using the preview never changes the draft: no autosave, no undo entry, nothing selected behind it", async ({ page }) => {
  const backend = await openEditor(page);
  const undo = page.getByRole("button", { name: "復原", exact: true });
  await expect(undo).toBeDisabled();
  const before = backend.saves();
  await previewButton(page).click();
  const win = overlay(page).getByRole("dialog", { name: "Instagram.exe" });
  await openDirectory(win);
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  await win.getByRole("button", { name: "+ Follow" }).click();
  await overlay(page).getByRole("button", { name: "目前草稿", exact: true }).click();
  await overlay(page).getByRole("button", { name: "手機版" }).click();
  await page.waitForTimeout(1500);
  // the phone simulation has the app open: Escape leaves it first, the next Escape closes the preview
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(backend.saves()).toBe(before);
  await expect(undo).toBeDisabled();
});

test("the collaborator viewer shows only the draft it is authorised for, from the same model", async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: SITE, username: "demo", site_name: "Demo", draft_document: draftDocument(), draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "viewer" };
  await page.route(`**/api/sites/${SITE}`, (route) => route.fulfill({ json: { site } }));
  await page.route(`**/api/sites/${SITE}/assets**`, (route) => route.fulfill({ json: { assets: [] } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/editor/${SITE}`);
  await expect(page.getByText("私人草稿 · 只能查看")).toBeVisible();
  const win = page.locator(".draft-viewer-body").getByRole("dialog", { name: "Instagram.exe" });
  await openDirectory(win);
  await expect(win.getByText("Secret Draft Character")).toBeVisible();
});

test("after-publishing preview and the real public page show the same characters, theme and navigation for the same content", async ({ page }) => {
  // same content online as in the draft: the public path reads the stored snapshot, the preview reads the draft's projection
  const online = JSON.parse(JSON.stringify(draftDocument())) as SiteDocumentV2Input;
  await openEditor(page, { published: online });
  await previewButton(page).click();
  const previewWin = overlay(page).getByRole("dialog", { name: "Instagram.exe" });
  const previewAccent = await previewWin.locator(".ig-app, .ig").first().evaluate((node) => getComputedStyle(node).getPropertyValue("--ig-profile-accent").trim());
  await openDirectory(previewWin);
  const previewNames = await previewWin.locator("[class*=ig-dir], .ig-scroll").first().innerText();

  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { id: SITE, username: "demo", site_name: "Demo", published_document: online, published_version: 2, published_at: "2026-10-15T00:00:00.000Z" } } }));
  await page.goto("/@demo");
  const publicWin = page.locator(".visitor-desktop").getByRole("dialog", { name: "Instagram.exe" });
  await expect(publicWin).toBeVisible();
  const publicAccent = await publicWin.locator(".ig-app, .ig").first().evaluate((node) => getComputedStyle(node).getPropertyValue("--ig-profile-accent").trim());
  await openDirectory(publicWin);
  const publicNames = await publicWin.locator("[class*=ig-dir], .ig-scroll").first().innerText();

  expect(previewAccent.toLowerCase()).toBe(ACCENT);
  expect(publicAccent.toLowerCase()).toBe(previewAccent.toLowerCase());
  expect(previewNames).toBe(publicNames);
  expect(publicNames).toContain("Bei Original");
  expect(publicNames).not.toContain("Secret");
});

// Four languages. ja/ko are beta and only enabled in preview builds (see `pnpm test:e2e:i18n-preview`).
const PREVIEW_LOCALES = process.env.VITE_I18N_PREVIEW_LOCALES === "true";
for (const locale of (PREVIEW_LOCALES ? ["en", "ja", "ko"] : ["en"]) as Array<"en" | "ja" | "ko">) {
  const copy = JSON.parse(readFileSync(join(__dirname, `../../apps/web/src/i18n/locales/${locale}/editor.json`), "utf8")).visitorPreview as Record<string, string>;
  const shared = JSON.parse(readFileSync(join(__dirname, `../../apps/web/src/i18n/locales/${locale}/editor.json`), "utf8")) as { shell: Record<string, string> };

  test(`preview labels and source toggle are translated (${locale})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("retrodesk:locale", value), locale);
    const states: Array<[string | null, string]> = [[null, copy.notPublishedYet], [JSON.stringify(publishedSnapshot()), copy.hasUnpublishedChanges]];
    for (const [published, expected] of states) {
      await openEditor(page, { published: published ? (JSON.parse(published) as SiteDocumentV2Input) : null });
      await page.getByRole("button", { name: new RegExp(shared.shell.preview) }).first().click();
      await expect(label(page)).toHaveText(expected);
      await expect(overlay(page).getByRole("button", { name: copy.showPublishable, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(overlay(page).getByRole("button", { name: copy.showDraft, exact: true })).toBeVisible();
      await overlay(page).getByRole("button", { name: copy.showDraft, exact: true }).click();
      await expect(label(page)).toHaveText(copy.draftLabel);
      await page.keyboard.press("Escape");
      await expect(overlay(page)).toHaveCount(0);
    }
  });

  test(`home sample is labelled read-only (${locale})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("retrodesk:locale", value), locale);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.locator(".example-card").first().click();
    await expect(label(page)).toHaveText(copy.sampleReadOnly);
    await expect(overlay(page).getByRole("button", { name: copy.backToSamples })).toBeVisible();
  });
}
