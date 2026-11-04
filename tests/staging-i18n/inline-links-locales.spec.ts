import { expect, test } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";

const labels = {
  "zh-Hant": { paste: "貼上網址，自動做成按鈕", preview: "會建立：Instagram 按鈕（之後都能改）", blank: "＋ 空白按鈕" },
  en: { paste: "Paste a URL to make a button", preview: "Will create: Instagram button (editable later)", blank: "＋ Blank button" },
  ja: { paste: "URLを貼り付けてボタンを作成", preview: "作成：Instagram ボタン（後から変更できます）", blank: "＋ 空のボタン" },
  ko: { paste: "URL을 붙여넣어 버튼 만들기", preview: "만들 버튼: Instagram (나중에 수정 가능)", blank: "＋ 빈 버튼" },
};

for (const locale of Object.keys(labels) as Array<keyof typeof labels>) for (const width of [1440, 320]) {
  test(`compiled inline links ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(locale => {
      localStorage.setItem("retrodesk:locale", locale);
      localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } }));
    }, locale);
    const legacy = createStarterDocument("Inline links", "classic98", "blank");
    const links = makeWindow("links"); links.id = "links"; links.title = "Links.exe"; links.defaultOpen = true; links.content.links = [];
    legacy.windows = [links];
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "compiled-links" });
    if (!migrated.ok) throw new Error("Invalid fixture");
    let document = migrated.document, version = 1;
    await page.route("**/api/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/draft")) { document = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version } }); }
      if (url.pathname === "/api/sites/compiled-links") return route.fulfill({ json: { site: { id: "compiled-links", username: "fixture", site_name: "Fixture", draft_document: document, draft_version: version, published_document: null, published_version: null, access_role: "owner" } } });
      return route.fulfill({ json: { assets: [] } });
    });
    await page.goto("/editor/compiled-links");
    if (width < 768) { await page.locator(".m-icon").click(); await expect(page.locator(".m-window-settings")).toBeVisible(); await expect(page.locator(".m-edit-toggle")).toHaveCount(0); }
    const editor = page.locator(".links-editor");
    const paste = editor.getByLabel(labels[locale].paste, { exact: true });
    await paste.fill("instagram.com/mochi");
    await expect(editor.getByText(labels[locale].preview, { exact: true })).toBeVisible();
    await paste.press("Enter");
    await expect(editor.locator(".link-input")).toHaveValue("Instagram");
    await expect(editor.getByRole("button", { name: labels[locale].blank, exact: true })).toBeVisible();
    await expect.poll(() => editor.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath(`compiled-links-${locale}-${width}.png`) });
  });
}
