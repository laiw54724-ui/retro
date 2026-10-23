import { enterContentEditor } from "./content-entry.fixture";
import { expect, test } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";

// Cross-source contract: numeric commits (#134), mobile history (#133),
// and topmost settings/preflight modal focus (#130) share one author session.
for (const width of [320, 390, 430]) {
  test.describe(`combined UX ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true });
    test("numeric commit survives settings sheet; history and publish cancellation retain it", async ({ page }) => {
      const legacy = createStarterDocument("Combined UX", "classic98", "blank");
      const game = makeWindow("minesweeper", 0);
      game.id = "mines";
      legacy.windows = [game];
      const result = migrateSiteDocumentV2(legacy, { siteId: "combined" });
      if (!result.ok) throw new Error("Invalid integration fixture");
      let draft = result.document;
      let version = 1;
      let saves = 0;
      let publishes = 0;
      await page.addInitScript(() => localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "ux-owner", email: "ux@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } })));
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1") return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
        if (url.pathname.endsWith("/draft")) {
          const payload = route.request().postDataJSON();
          expect(payload.expectedVersion).toBe(version);
          draft = payload.document;
          saves++;
          return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:01:00Z" } });
        }
        if (url.pathname.endsWith("/publish")) { publishes++; return route.abort(); }
        if (url.pathname === "/api/sites/combined") return route.fulfill({ json: { site: { id: "combined", username: "combined", site_name: "Combined UX", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-19T00:00:00Z", access_role: "owner" } } });
        return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
      });
      await page.goto("/editor/combined");
      await page.getByRole("button", { name: "Minesweeper.exe", exact: true }).tap();
      await enterContentEditor(page);
      const rows = page.getByRole("spinbutton", { name: "列", exact: true });
      const status = page.locator(".save-text");
      await rows.fill("10");
      await rows.press("Enter");
      await expect(status).toHaveText("已儲存");
      await expect.poll(() => saves).toBe(1);
      const edit = page.locator(".m-toolbar").getByRole("button", { name: "視窗設定", exact: true });
      await edit.tap();
      const sheet = page.getByRole("dialog", { name: "視窗設定", exact: true });
      await expect(sheet).toBeVisible();
      await expect(page.locator("#root")).toHaveAttribute("inert", "");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(edit).toBeFocused();
      await expect(rows).toHaveValue("10");
      await page.getByRole("button", { name: "復原", exact: true }).tap();
      await expect(rows).toHaveValue("8");
      await page.getByRole("button", { name: "重做", exact: true }).tap();
      await expect(rows).toHaveValue("10");
      await expect(status).toHaveText("已儲存");
      const publish = page.getByRole("button", { name: "發布", exact: true });
      await publish.tap();
      const preflight = page.getByRole("dialog", { name: "發布 Retro Desktop", exact: true });
      await expect(preflight.getByRole("button", { name: "取消", exact: true })).toBeFocused();
      // Inert blocks pointer/focus access; document-level history must also stay paused.
      await page.keyboard.press("Control+z");
      await expect(page.locator(".minesweeper-settings input").first()).toHaveValue("10");
      await page.keyboard.press("Meta+z");
      await expect(page.locator(".minesweeper-settings input").first()).toHaveValue("10");
      await page.keyboard.press("Escape");
      await expect(preflight).toBeHidden();
      await expect(publish).toBeFocused();
      await expect(rows).toHaveValue("10");
      await expect(status).toHaveText("已儲存");
      expect(draft.windows[0].content).toMatchObject({ rows: 10 });
      expect(publishes).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: test.info().outputPath("combined-history-modal.png") });
    });
  });
}
