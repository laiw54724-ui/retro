import { expect, test } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";
import zh from "../../apps/web/src/i18n/locales/zh-Hant/modules.json";
import en from "../../apps/web/src/i18n/locales/en/modules.json";
import ja from "../../apps/web/src/i18n/locales/ja/modules.json";
import ko from "../../apps/web/src/i18n/locales/ko/modules.json";
import zhIg from "../../apps/web/src/i18n/locales/zh-Hant/instagram.json";
import enIg from "../../apps/web/src/i18n/locales/en/instagram.json";
import jaIg from "../../apps/web/src/i18n/locales/ja/instagram.json";
import koIg from "../../apps/web/src/i18n/locales/ko/instagram.json";
const catalogs = { "zh-Hant": zh, en, ja, ko };
const igCatalogs = { "zh-Hant": zhIg, en: enIg, ja: jaIg, ko: koIg };

for (const locale of Object.keys(catalogs) as Array<keyof typeof catalogs>) for (const width of [1440, 320]) {
  test(`compiled gap editors use ${locale} at ${width}px`, async ({ page }) => {
    const text = catalogs[locale], igText = igCatalogs[locale];
    await page.setViewportSize({ width, height: 950 });
    await page.addInitScript(locale => {
      localStorage.setItem("retrodesk:locale", locale);
      localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } }));
    }, locale);
    const legacy = createStarterDocument("Gap editors", "classic98", "blank");
    legacy.windows = (["instagram", "character-dialog", "guestbook"] as const).map((type, index) => {
      const win = makeWindow(type, index); win.id = type; win.title = `${type}.exe`; win.defaultOpen = true;
      win.layout.desktop = { ...win.layout.desktop, x: 20, y: 20, w: 500, h: 600 };
      return win;
    });
    const result = migrateSiteDocumentV2(legacy, { siteId: "compiled-gaps" });
    if (!result.ok) throw new Error("fixture migration");
    const document = result.document; let writes = 0;
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/guestbook")) return route.fulfill({ json: { entries: [{ id: "00000000-0000-4000-8000-000000000001", displayName: "Pending visitor", body: "A synthetic moderation card", status: "pending", createdAt: "2026-01-01T00:00:00Z", openReportCount: 0 }] } });
      if (url.pathname.endsWith("/draft")) { writes++; return route.fulfill({ json: { version: writes + 1 } }); }
      if (url.pathname === "/api/sites/compiled-gaps") return route.fulfill({ json: { site: { id: "compiled-gaps", username: "fixture", site_name: "Gap editors", draft_document: document, draft_version: 1, published_document: null, published_version: null, access_role: "owner" } } });
      return route.fulfill({ json: { assets: [] } });
    });
    await page.goto("/editor/compiled-gaps");
    for (const type of ["instagram", "character-dialog", "guestbook"]) {
      if (width < 768) {
        await page.locator(".m-icon").getByText(`${type}.exe`, { exact: true }).click();
        await expect(page.locator(".m-window-settings")).toBeVisible();
      } else {
        await page.locator(".start-btn").click();
        await page.getByRole("menuitem", { name: `${type}.exe`, exact: true }).click();
      }
      const win = page.getByRole("dialog", { name: `${type}.exe`, exact: true });
      if (type === "instagram") {
        const app = win.getByRole("region", { name: igText.inlineApp.authoringApp, exact: true });
        await expect(app.locator(".ig-app")).toBeVisible();
        await app.getByRole("button", { name: igText.inlineApp.editProfile, exact: true }).click();
        await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
        await win.getByRole("button", { name: igText.inlineApp.backToApp, exact: true }).click();
        await app.locator(".ig-nav4").getByRole("button", {name:igText.editorFlow.newPost,exact:true}).click();
        const composer=win.getByRole("region",{name:igText.composer.newPost,exact:true});
        await expect(composer.getByRole("button",{name:igText.composer.next,exact:true})).toBeDisabled();
        await composer.getByRole("textbox",{name:igText.canonicalPostEditor.imageUrl,exact:true}).fill("https://example.test/local-compose.png");
        await composer.getByRole("button",{name:igText.composer.add,exact:true}).click();
        await composer.getByRole("button",{name:igText.composer.next,exact:true}).click();
        await expect(composer.getByRole("textbox",{name:igText.canonicalPostEditor.postContent,exact:true})).toBeVisible();
        await expect(composer).not.toContainText("composer.");
        await page.screenshot({path:test.info().outputPath(`${locale}-${width}-composer.png`)});
        await composer.getByRole("button",{name:igText.composer.cancel,exact:true}).click();
        await expect(app.locator(".ig-app")).toBeVisible();
      } else if (type === "character-dialog") {
        await expect(win.getByRole("textbox", { name: text.characterDialog.characterName, exact: true })).toBeVisible();
        await expect(win.getByRole("textbox", { name: text.characterDialog.message, exact: true })).toBeVisible();
        await expect(win.locator(".editing-status")).toContainText(text.characterDialog.manualHint);
        await win.getByRole("button", { name: text.characterDialog.imageTools, exact: true }).click();
        await expect(win.getByRole("textbox", { name: text.document.imageUrl, exact: true })).toBeVisible();
        await win.getByRole("button", { name: text.characterDialog.imageTools, exact: true }).click();
      } else {
        await expect(win.locator(".editing-status")).toContainText(text.guestbook.queue.keyboardHint);
        await expect(win.getByRole("tab").first()).toHaveAttribute("aria-selected","true");
        await expect(win.locator("article").getByRole("button", { name: text.guestbook.hide, exact: true })).toBeVisible();
      }
      expect(await win.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: test.info().outputPath(`${locale}-${width}-${type}.png`) });
      if (width < 768) await page.locator(".m-back").click();
    }
  });
}
