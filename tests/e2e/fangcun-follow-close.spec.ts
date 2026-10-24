import { expect, test, type Page } from "@playwright/test";
import { duplicateProfile, migrateSiteDocumentV2 } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

// Local synthetic owner fixture only; no live login or user work is accessed.
async function fixture(page: Page, width = 1440, legacyFollowers = "0") {
  const migrated = migrateSiteDocumentV2(igDocument({ followers: legacyFollowers, following: "0" }), { siteId: "fangcun" });
  if (!migrated.ok) throw new Error("fixture migration");
  const duplicated = duplicateProfile(migrated.document, "profile:ig", { siteId: "fangcun", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("fixture actor");
  let document = duplicated.document, version = 1, saves = 0, fail = false;
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem("retrodesk:locale", "zh-Hant");
    localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } }));
  });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/draft")) {
      saves++;
      if (fail) return route.fulfill({ status: 500, json: { error: { code: "request_failed" } } });
      document = route.request().postDataJSON().document;
      return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-24T00:00:00Z" } });
    }
    if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    if (url.pathname === "/api/sites/fangcun") return route.fulfill({ json: { site: { id: "fangcun", username: "fixture", site_name: "Fangcun QA", draft_document: document, draft_version: version, published_document: null, published_version: null, access_role: "owner" } } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.goto("/editor/fangcun");
  const open = async () => {
    if (width < 768) await page.getByRole("button", { name: "Instagram.exe", exact: true }).click();
    const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
    const app = win.getByRole("region", { name: "Instagram 角色編輯視窗" });
    await expect(app).toBeVisible();
    return { win, app };
  };
  return { ...await open(), open, saved: () => document, saves: () => saves, fail: (value: boolean) => { fail = value; } };
}

async function viewAsOther(app: ReturnType<Page["locator"]>) {
  await app.getByRole("combobox", { name: "以角色操作", exact: true }).selectOption("other");
  await app.getByRole("button", { name: "所有角色", exact: true }).click();
  await app.getByRole("button", { name: /@retro$/ }).click();
}

for (const width of [1440, 320, 375, 390, 430]) test(`actor follow counts update, toggle, undo and survive reload at ${width}px`, async ({ page }) => {
  const state = await fixture(page, width);
  await viewAsOther(state.app);
  const followers = state.app.locator(".ig-stat-button").nth(0);
  await expect(followers).toHaveText("0粉絲");
  await state.app.getByRole("button", { name: "追蹤", exact: true }).click();
  await expect(followers).toHaveText("1粉絲");
  await expect.poll(() => state.saved().entities.followEdges?.length).toBe(1);
  await state.app.getByRole("button", { name: "追蹤中", exact: true }).click();
  await expect(followers).toHaveText("0粉絲");
  await expect.poll(() => state.saved().entities.followEdges?.length).toBe(0);
  // Repeated activation toggles the same edge, never duplicates it.
  await state.app.locator(".ig-follow-btn").click({ clickCount: 3 });
  await expect(followers).toHaveText("1粉絲");
  await expect.poll(() => state.saved().entities.followEdges?.length).toBe(1);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(followers).toHaveText("0粉絲");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(followers).toHaveText("1粉絲");
  await expect.poll(() => state.saved().entities.followEdges?.length).toBe(1);
  expect(state.saved().entities.profiles[0].otherFollowerCount).toBeNull();
  expect(state.saved().entities.profiles[0].legacyFollowersLabel).toBe("0");
  await page.reload(); const { app } = await state.open();
  await expect(app.locator(".ig-stat-button").nth(0)).toHaveText("1粉絲");
  // The actor's following side uses the same named edge after reload.
  await app.getByRole("combobox", { name: "以角色操作", exact: true }).selectOption("other");
  await expect(app.locator(".ig-stat-button").nth(1)).toHaveText("1追蹤中");
  await page.screenshot({ path: test.info().outputPath(`follow-${width}.png`) });
});

for (const legacy of ["100", "1.2K"]) test(`actor counts preserve legacy label ${legacy} and show only the named addition`, async ({ page }) => {
  const state = await fixture(page, 390, legacy);
  await viewAsOther(state.app);
  const followers = state.app.locator(".ig-stat-button").nth(0);
  await expect(followers).toHaveText(`${legacy}粉絲`);
  await state.app.getByRole("button", { name: "追蹤", exact: true }).click();
  await expect(followers).toHaveText(`${legacy} + 1粉絲`);
  await expect.poll(() => state.saved().entities.followEdges?.length).toBe(1);
  expect(state.saved().entities.profiles[0].legacyFollowersLabel).toBe(legacy);
  expect(state.saved().entities.profiles[0].otherFollowerCount).toBeNull();
  await state.app.getByRole("button", { name: "追蹤中", exact: true }).click();
  await expect(followers).toHaveText(`${legacy}粉絲`);
});

test("failed follow save retains accurate draft count and retry persists once", async ({ page }) => {
  const state = await fixture(page, 390);
  await viewAsOther(state.app); state.fail(true);
  await state.app.getByRole("button", { name: "追蹤", exact: true }).click();
  await expect(state.app.locator(".ig-stat-button").nth(0)).toHaveText("1粉絲");
  await expect(page.locator(".save-text")).toHaveText("儲存失敗");
  expect(state.saved().entities.followEdges).toHaveLength(0);
  state.fail(false);
  await page.getByRole("button", { name: "重試儲存", exact: true }).click();
  await expect(page.locator(".save-text")).toHaveText("已儲存");
  expect(state.saved().entities.followEdges).toHaveLength(1);
  expect(state.saves()).toBe(2);
});

test("follow counts and close work across all four interface languages", async ({ page }) => {
  const state = await fixture(page);
  await viewAsOther(state.app);
  const app = state.win.locator(".ig-app");
  for (const locale of ["zh-Hant", "en", "ja", "ko"]) {
    await page.getByTestId("language-switcher").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const follow = app.locator(".ig-follow-btn");
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await follow.click();
    await expect(follow).toHaveAttribute("aria-pressed", "true");
    await expect(app.locator(".ig-stat-button strong").first()).toHaveText("1");
    await expect.poll(() => state.saved().entities.followEdges?.length).toBe(1);
    await page.screenshot({ path: test.info().outputPath(`follower-${locale}.png`) });
    await follow.click();
    await expect(app.locator(".ig-stat-button strong").first()).toHaveText("0");
    await expect.poll(() => state.saved().entities.followEdges?.length).toBe(0);
  }
  const initial = structuredClone(state.saved());
  await state.win.locator(".titlebar-controls button").last().click();
  await expect(state.win).toHaveCount(0);
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await expect(page.locator(".deskicon")).toBeFocused();
  expect(state.saved()).toEqual(initial);
});

test("close and minimize remove selected floating tools and scrim without editing the document", async ({ page }) => {
  const state = await fixture(page);
  const icon = page.locator(".deskicon");
  await icon.click();
  const toolbar = page.getByRole("toolbar", { name: "已選取元件操作", exact: true });
  await expect(toolbar).toBeVisible();
  await expect(page.locator(".selection-scrim")).toHaveCount(1);
  const initial = structuredClone(state.saved());
  await state.win.locator(".titlebar-controls").getByRole("button", { name: "關閉", exact: true }).click();
  await expect(state.win).toHaveCount(0);
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator(".selection-scrim")).toHaveCount(0);
  await expect(icon).toBeFocused();
  await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
  expect(state.saved()).toEqual(initial); expect(state.saves()).toBe(0);
  await page.screenshot({ path: test.info().outputPath("closed-window.png") });
  await icon.press("Enter");
  await expect(state.win).toBeVisible(); await expect(toolbar).toBeVisible();
  await state.win.locator(".titlebar-controls").getByRole("button", { name: "最小化", exact: true }).click();
  await expect(state.win).toHaveCount(0); await expect(toolbar).toHaveCount(0);
  await expect(page.locator(".selection-scrim")).toHaveCount(0); await expect(icon).toBeFocused();
  await icon.press("Enter"); await expect(state.win).toBeVisible(); await expect(toolbar).toBeVisible();
  expect(state.saved()).toEqual(initial); expect(state.saves()).toBe(0);
  await page.screenshot({ path: test.info().outputPath("reopened-window.png") });
});
