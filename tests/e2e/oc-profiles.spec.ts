import { expect, test, type Page } from "@playwright/test";
import { duplicateProfile, migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function ocDocument(): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  const first = migrated.document.entities.profiles[0];
  if (!first) throw new Error("fixture profile missing");
  first.displayName = "Retro User";
  first.visibility = "published";
  first.themeOverride = { accent: "#ff00aa", background: "#123456" };
  const duplicated = duplicateProfile(migrated.document, first.id, { siteId: "site-1", id: "profile:bei", handle: "bei" });
  if (!duplicated.ok) throw new Error("fixture duplication failed");
  duplicated.profile.displayName = "Bei Original";
  const second = duplicated.document.entities.profiles.find((profile) => profile.id === "profile:bei");
  if (!second) throw new Error("duplicated profile missing");
  second.displayName = "Bei Original";
  second.name = "Bei Original";
  second.visibility = "published";
  return duplicated.document;
}

function navigationDocument(): SiteDocumentV2Input {
  const document = ocDocument();
  const firstPost = document.entities.posts[0];
  if (!firstPost) throw new Error("fixture post missing");
  const publicPosts = Array.from({ length: 18 }, (_, index) => ({
    ...structuredClone(firstPost), id: `post:retro:${index}`, authorProfileId: "profile:ig", caption: `Retro archive ${index}`
  }));
  publicPosts.push({ ...structuredClone(firstPost), id: "post:bei:timeline", authorProfileId: "profile:bei", caption: "Bei timeline" });
  document.entities.posts = publicPosts;
  const hidden = duplicateProfile(document, "profile:bei", { siteId: "site-1", id: "profile:secret", handle: "secret" });
  if (!hidden.ok) throw new Error("hidden fixture duplication failed");
  const secret = hidden.document.entities.profiles.find((profile) => profile.id === "profile:secret");
  if (!secret) throw new Error("hidden fixture profile missing");
  secret.displayName = "Secret Draft Character";
  secret.name = "Secret Draft Character";
  secret.avatarUrl = "https://example.com/secret-avatar.png";
  secret.visibility = "draft";
  hidden.document.entities.posts.push({ ...structuredClone(firstPost), id: "post:secret:hidden", authorProfileId: secret.id, caption: "Secret draft post", visibility: "draft" });
  return hidden.document;
}

function twoWindowDocument(): SiteDocumentV2Input {
  const document = navigationDocument();
  const original = document.windows.find((window) => window.type === "instagram");
  if (!original || original.type !== "instagram") throw new Error("Instagram fixture missing");
  const second = structuredClone(original);
  second.id = "ig-two";
  second.title = "Other.exe";
  second.defaultOpen = false;
  second.layout.desktop = { ...second.layout.desktop, x: 520, y: 40, z: 2, iconX: 112, iconY: 18 };
  second.layout.mobile = { order: 1 };
  document.windows.push(second);
  return document;
}

async function mockEditor(page: Page, document = ocDocument()) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const saves: Array<{ document: SiteDocumentV2Input }> = [];
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: document, draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saves.push(route.request().postDataJSON()); return route.fulfill({ json: { version: 3, updatedAt: "2026-10-15T00:01:00.000Z" } }); });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  return saves;
}

async function mockPublic(page: Page, document = ocDocument()) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 2, published_at: "2026-10-15T00:00:00.000Z" } } }));
}

test("desktop OC editor switches, searches, duplicates, edits and safely retargets profiles", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const saves = await mockEditor(page);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const switcher = win.getByRole("region", { name: "角色切換器" });
  await expect(switcher).toBeVisible();

  await switcher.getByRole("button", { name: "＋ 新增角色" }).click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "oc-3")).toBe(true);
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.type === "instagram")?.content.profileRef.id).toBe(saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "oc-3")?.id);

  await switcher.getByLabel("搜尋角色").fill("Bei");
  await expect(switcher.getByRole("option")).toHaveCount(1);
  await switcher.getByRole("option").getByRole("button", { name: "Bei Original @bei" }).click();
  await expect(win.getByRole("textbox", { name: "Handle" })).toHaveValue("bei");
  await switcher.getByLabel("搜尋角色").fill("");
  await switcher.getByRole("button", { name: "複製 Bei Original" }).click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "bei-copy")).toBe(true);

  await win.getByRole("button", { name: "展開角色設定" }).click();
  await win.getByRole("button", { name: "＋ 新增欄位" }).click();
  await win.getByPlaceholder("欄位名稱").last().fill("世界");
  await win.getByPlaceholder("內容").last().fill("雪國");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "bei-copy")?.customFields.some((field) => field.key === "世界" && field.value === "雪國")).toBe(true);

  const deleteButton = win.getByRole("button", { name: "刪除並轉接" });
  await expect(deleteButton).toBeDisabled();
  await win.getByLabel(/此角色仍被視窗／貼文使用/).selectOption({ label: "Retro User" });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "bei-copy")).toBe(false);
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.type === "instagram")?.content.profileRef.id).toBe("profile:ig");
});

test("mobile OC editor exposes the same profile tools without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const saves = await mockEditor(page);
  await page.getByRole("button", { name: "手機版" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Instagram.exe" }).click();
  await page.getByRole("button", { name: "編輯此視窗" }).click();
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const switcher = win.getByRole("region", { name: "角色切換器" });
  await expect(switcher).toBeVisible();
  await switcher.getByLabel("搜尋角色").fill("Bei");
  await switcher.getByRole("button", { name: "Bei Original @bei" }).click();
  await win.getByRole("textbox", { name: "顯示名稱" }).fill("Bei Mobile");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "bei")?.displayName).toBe("Bei Mobile");

  await switcher.getByLabel("搜尋角色").fill("");
  await switcher.getByRole("button", { name: "＋ 新增角色" }).click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "oc-3")).toBe(true);
  await win.getByRole("button", { name: "展開角色設定" }).click();
  await win.getByRole("checkbox", { name: "自訂內容主題（只影響 IG 內容）" }).check();
  await win.getByLabel("IG 內容強調色").fill("#00ff00");
  await win.getByLabel("IG 內容背景色").fill("#102030");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "oc-3")?.themeOverride).toEqual({ accent: "#00ff00", background: "#102030" });

  const deleteButton = win.getByRole("button", { name: "刪除並轉接" });
  await expect(deleteButton).toBeDisabled();
  await win.getByLabel(/此角色仍被視窗／貼文使用/).selectOption({ label: "Bei Mobile" });
  await deleteButton.click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "oc-3")).toBe(false);
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.type === "instagram")?.content.profileRef.id).toBe("profile:bei");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [1280, 390]) {
  test(`published OC theme stays inside Instagram at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 800 });
    await mockPublic(page);
    await page.goto("/@demo");
    if (width < 500) await page.getByRole("button", { name: "Instagram.exe" }).click();
    const win = page.getByRole("dialog", { name: "Instagram.exe" });
    await expect(win.locator(".ig-frame")).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await expect(win.getByRole("button", { name: "+ Follow" })).toHaveCSS("background-color", "rgb(255, 0, 170)");
    const outerTitle = width < 500 ? page.locator(".m-titlebar") : win.locator(".retro-titlebar");
    await expect(outerTitle).not.toHaveCSS("background-color", "rgb(18, 52, 86)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("desktop visitor navigates OC directory and posts with layered back and scroll restore", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublic(page, navigationDocument());
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const scroll = win.locator(".ig-scroll");
  await expect(win.locator(".ig-title strong")).toHaveText("retro");
  await win.getByRole("button", { name: "+ Follow" }).click();
  await expect(win.getByRole("button", { name: "✓ Following" })).toBeVisible();
  await win.getByRole("button", { name: "開啟貼文：Retro archive 0" }).click();
  let card = win.locator(".ig-card");
  await card.getByRole("button", { name: "讚" }).click();
  await expect(card.getByRole("button", { name: "讚" })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "收藏" }).click();
  await expect(card.getByRole("button", { name: "收藏" })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "留言" }).click();
  await card.getByPlaceholder("以訪客身分留言……").fill("Only on Retro");
  await card.getByRole("button", { name: "發佈" }).click();
  await expect(card.getByText("Only on Retro")).toBeVisible();
  await win.getByRole("button", { name: "返回" }).click();
  await expect.poll(() => scroll.evaluate((node) => { node.scrollTop = 180; return node.scrollTop; })).toBeGreaterThan(100);

  // Invoke the already-visible profile control without Playwright auto-scrolling
  // it back to the top, so the navigation frame must preserve this offset.
  await win.getByRole("button", { name: /粉絲/ }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(win.getByRole("heading", { name: "此桌面的角色" })).toBeVisible();
  await expect(win.getByText("Secret Draft Character")).toHaveCount(0);
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("bei");
  await expect(win.getByRole("button", { name: "+ Follow" })).toBeVisible();
  await win.getByRole("button", { name: "開啟貼文：Bei timeline" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("貼文");
  card = win.locator(".ig-card");
  await expect(card.getByRole("button", { name: "讚" })).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByRole("button", { name: "收藏" })).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByText("Only on Retro")).toHaveCount(0);

  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("bei");
  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.getByRole("heading", { name: "此桌面的角色" })).toBeVisible();
  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("retro");
  await expect(win.getByRole("button", { name: "✓ Following" })).toBeVisible();
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);

  await win.getByRole("button", { name: /追蹤中/ }).click();
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  await win.getByRole("button", { name: "關閉" }).click();
  await page.locator(".visitor-icon").filter({ hasText: "Instagram.exe" }).click();
  await expect(page.getByRole("dialog", { name: "Instagram.exe" }).locator(".ig-title strong")).toHaveText("retro");
});

test("mobile visitor can browse the published OC directory without draft leakage or overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublic(page, navigationDocument());
  await page.goto("/@demo");
  await page.getByRole("button", { name: "Instagram.exe" }).click();
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const scroll = win.locator(".ig-scroll");
  await expect.poll(() => scroll.evaluate((node) => { node.scrollTop = 180; return node.scrollTop; })).toBeGreaterThan(100);
  await win.getByRole("button", { name: /粉絲/ }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(win.getByText("Secret Draft Character")).toHaveCount(0);
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  await win.getByRole("button", { name: "開啟貼文：Bei timeline" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("貼文");
  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("bei");
  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.getByRole("heading", { name: "此桌面的角色" })).toBeVisible();
  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("retro");
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("mobile visitor keeps Instagram interactions isolated per window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublic(page, twoWindowDocument());
  await page.goto("/@demo");

  await page.getByRole("button", { name: "Instagram.exe" }).click();
  let win = page.getByRole("dialog", { name: "Instagram.exe" });
  await win.getByRole("button", { name: "+ Follow" }).click();
  await expect(win.getByRole("button", { name: "✓ Following" })).toBeVisible();
  await page.getByRole("button", { name: "關閉" }).click();

  await page.getByRole("button", { name: "Other.exe" }).click();
  win = page.getByRole("dialog", { name: "Other.exe" });
  await expect(win.getByRole("button", { name: "+ Follow" })).toBeVisible();
  await win.getByRole("button", { name: "+ Follow" }).click();
  await expect(win.getByRole("button", { name: "✓ Following" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
