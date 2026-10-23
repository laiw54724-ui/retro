import { expect, test } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";
import zh from "../../apps/web/src/i18n/locales/zh-Hant/modules.json";
import en from "../../apps/web/src/i18n/locales/en/modules.json";
import ja from "../../apps/web/src/i18n/locales/ja/modules.json";
import ko from "../../apps/web/src/i18n/locales/ko/modules.json";

const catalogs = { "zh-Hant": zh, en, ja, ko };
for (const locale of Object.keys(catalogs) as Array<keyof typeof catalogs>) for (const width of [1440, 320]) {
  test(`compiled integrated editors use production ${locale} catalogs at ${width}px`, async ({ page }) => {
    const text = catalogs[locale];
    await page.setViewportSize({ width, height: 950 });
    await page.addInitScript(locale => {
      localStorage.setItem("retrodesk:locale", locale);
      localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } }));
    }, locale);
    const legacy = createStarterDocument("Integrated", "classic98", "blank");
    legacy.windows = (["about", "gallery", "document", "links"] as const).map(type => {
      const win = makeWindow(type); win.id = type; win.title = `${type}.exe`; win.defaultOpen = true;
      win.layout.desktop = { ...win.layout.desktop, x: 20, y: 20, w: 500, h: 600 };
      return win;
    });
    const result = migrateSiteDocumentV2(legacy, { siteId: "integrated" });
    if (!result.ok) throw new Error("Invalid fixture");
    let document = result.document, version = 1;
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/draft")) { document = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version } }); }
      if (url.pathname === "/api/sites/integrated") return route.fulfill({ json: { site: { id: "integrated", username: "fixture", site_name: "Integrated", draft_document: document, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } });
      return route.fulfill({ json: { assets: [] } });
    });
    await page.goto("/editor/integrated");
    for (const type of ["about", "gallery", "document", "links"]) {
      if (width < 768) { await page.locator(".m-icon").getByText(`${type}.exe`, { exact: true }).click(); await page.locator(".m-edit-toggle").click(); }
      else await page.locator(".task-items").getByRole("button", { name: `${type}.exe`, exact: true }).click();
      const win = page.getByRole("dialog", { name: `${type}.exe`, exact: true });
      if (type === "about") {
        const social = win.getByPlaceholder(text.about.inline.pasteSocial, { exact: true });
        await social.fill("https://example.com/local-draft");
        await expect(social).toHaveValue("https://example.com/local-draft");
        await expect(win.getByPlaceholder(text.about.inline.addField, { exact: true })).toBeVisible();
      } else if (type === "gallery") {
        await win.getByRole("button", { name: text.gallery.inline.pasteUrls, exact: true }).click();
        await expect(win.getByPlaceholder(text.gallery.inline.urlsPlaceholder, { exact: true })).toBeVisible();
      } else if (type === "document") {
        await expect(win.getByLabel(text.document.inline.paragraphStyle, { exact: true })).toBeVisible();
        await win.getByRole("button", { name: text.document.inline.insert, exact: true }).click();
        await expect(win.getByRole("menu")).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        await expect(win.getByLabel(text.links.inline.pasteLabel, { exact: true })).toBeVisible();
      }
      expect(await win.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: test.info().outputPath(`${locale}-${width}-${type}.png`) });
      if (width < 768) await page.locator(".m-back").click();
    }
    // Local social/URL drafts and opening menus must never issue canonical saves.
    expect(version).toBe(1);
  });
}
