import { expect, test } from "@playwright/test";
import { migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const urls = ids.map((id) => `https://legacy.example/${id}.png`);

test("legacy asset warning identifies each asset and refreshes after v2 migration", async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const draft = structuredClone(documentFixture);
  draft.theme.wallImage = urls[0];
  draft.theme.pattern = "image";
  const about = draft.windows.find((window) => window.type === "about");
  if (!about || about.type !== "about") throw new Error("about fixture missing");
  about.content.avatar = urls[1];
  let inventory = ids.map((id, index) => ({ id, url: urls[index], mimeType: "image/png", size: 10, kind: "image", name: ["星星桌布", "角色頭像", "未使用舊圖"][index], createdAt: "2026-10-16T00:00:00.000Z", storageScope: "legacy_public", migrationStatus: "not_required", migrationRequired: true, publicCopyRemaining: false }));
  const migrated = migrateSiteDocumentV2(draft, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration fixture failed");
  const migratedDocument = JSON.parse(JSON.stringify(migrated.document).replaceAll(urls[0], `retro-asset:${ids[0]}`).replaceAll(urls[1], `retro-asset:${ids[1]}`));
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: draft, draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-16T00:00:00.000Z" };

  await page.route("**/api/sites/site-1/assets", (route) => route.fulfill({ json: { assets: inventory } }));
  await page.route("**/api/sites/site-1/assets/migrate", (route) => {
    inventory = inventory.map((asset) => ({ ...asset, url: `retro-asset:${asset.id}`, storageScope: "draft_private", migrationStatus: "pending", migrationRequired: true, publicCopyRemaining: true }));
    return route.fulfill({ json: { version: 3, document: migratedDocument, migratedCount: 3, cleanupWarnings: ids } });
  });
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 3, updatedAt: "2026-10-16T00:01:00.000Z" } }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));

  await page.goto("/editor/site-1");
  await expect(page.getByText("有 3 個舊素材仍是公開網址。")).toBeVisible();
  const warning = page.locator(".asset-migration-message");
  await expect(warning.getByText("星星桌布")).toBeVisible();
  await expect(warning.getByText("角色頭像")).toBeVisible();
  await expect(warning.getByText("未使用舊圖")).toBeVisible();
  await page.getByRole("button", { name: "查看是哪幾個" }).click();
  const dialog = page.getByRole("dialog", { name: "舊素材遷移明細" });
  await expect(dialog.getByText("星星桌布")).toBeVisible();
  await expect(dialog.getByText("桌面背景")).toBeVisible();
  await expect(dialog.getByText("角色頭像")).toBeVisible();
  await expect(dialog.getByText(/About.exe 的頭像/)).toBeVisible();
  await expect(dialog.getByText("未使用舊圖")).toBeVisible();
  await expect(dialog.getByText("草稿中沒有引用（可考慮刪除）")).toBeVisible();
  await expect(dialog.getByText(urls[2])).toBeVisible();

  await dialog.getByRole("button", { name: "轉為私有（3）" }).click();
  await expect(page.getByText("3 個舊公開副本因已發布版本仍在使用，暫時保留。")).toBeVisible();
  await expect(dialog.getByText("私有預覽已完成，舊公開副本待清理")).toHaveCount(3);
  await expect(dialog.getByText("尚未轉為私有")).toHaveCount(0);
});
