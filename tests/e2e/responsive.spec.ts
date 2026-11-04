import { expect, test, type Page } from "@playwright/test";
import { migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";
import { igDocument } from "./ig-fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function mockEditor(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
}

async function mockPublicSite(page: Page) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({
    json: {
      site: {
        username: "demo",
        site_name: "Demo Desk",
        published_document: documentFixture,
        published_version: 1,
        published_at: "2026-10-15T00:00:00.000Z"
      }
    }
  }));
}

function longContentDocument(innerWidth: 360 | 480 | 720 = 480): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("large fixture migration failed");
  const document = migrated.document;
  const profile = document.entities.profiles[0];
  const template = document.entities.posts[0];
  const instagram = document.windows.find((window) => window.type === "instagram");
  if (!profile || !template || !instagram || instagram.type !== "instagram") throw new Error("large fixture content missing");
  profile.visibility = "published";
  instagram.layout.desktop.w = innerWidth;
  instagram.layout.desktop.h = 720;

  const collectionIds = ["collection:sketches", "collection:stories", "collection:finished"];
  const posts = Array.from({ length: 60 }, (_, index) => {
    const collectionId = collectionIds[index % collectionIds.length];
    const src = `https://assets.test/oc-${index + 1}.png`;
    return {
      ...structuredClone(template),
      id: `post:large:${index + 1}`,
      title: `第 ${index + 1} 幅長篇角色作品標題`,
      caption: `這是第 ${index + 1} 篇角色世界觀長中文說明，記錄雪國、城市、旅程與角色之間的故事。`.repeat(3),
      visibility: "published" as const,
      pinned: index < 3,
      src,
      srcUrl: src,
      extra: [],
      media: [{
        id: `media:large:${index + 1}`,
        src,
        srcUrl: src,
        alt: `第 ${index + 1} 幅角色作品`,
        aspectRatio: [0.75, 1, 1.5, 2][index % 4],
      }],
      collectionIds: [collectionId],
    };
  });
  const draft = {
    ...structuredClone(posts[0]),
    id: "post:large:draft",
    title: "不應公開的草稿作品",
    caption: "PRIVATE_DRAFT_CONTENT",
    visibility: "draft" as const,
    pinned: false,
    collectionIds: ["collection:draft"],
  };
  document.entities.posts = [...posts, draft];
  document.entities.collections = collectionIds.map((id, collectionIndex) => ({
    kind: "collection" as const,
    id,
    siteId: "site-1",
    ownerProfileId: profile.id,
    visibility: "published" as const,
    title: ["草圖集", "故事集", "完成作品"][collectionIndex],
    description: `第 ${collectionIndex + 1} 組長中文作品合集`,
    postIds: posts.filter((_, index) => index % collectionIds.length === collectionIndex).map((post) => post.id),
  }));
  document.entities.collections.push({
    kind: "collection",
    id: "collection:draft",
    siteId: "site-1",
    ownerProfileId: profile.id,
    visibility: "draft",
    title: "私密合集",
    description: "PRIVATE_COLLECTION_CONTENT",
    postIds: [draft.id],
  });
  return document;
}

async function mockLargePublicSite(page: Page, document: SiteDocumentV2Input) {
  await page.route("https://assets.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><rect width='320' height='240' fill='#ccd8ef'/></svg>",
  }));
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({
    json: {
      site: {
        username: "demo",
        site_name: "Large OC Desk",
        published_document: document,
        published_version: 2,
        published_at: "2026-10-16T00:00:00.000Z",
      },
    },
  }));
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function expectLargeInstagramFits(page: Page) {
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const cells = win.getByRole("button", { name: /^開啟貼文：/ });
  await expect(cells).toHaveCount(60);
  await expect(win.getByRole("button", { name: /PRIVATE_DRAFT_CONTENT/ })).toHaveCount(0);
  await expect(win.getByText("PRIVATE_COLLECTION_CONTENT")).toHaveCount(0);
  await expect(win.locator(".ig-cell img[loading='lazy']")).toHaveCount(60);
  const scroll = win.locator(".ig-scroll");
  await scroll.focus();
  await scroll.press("End");
  await expect.poll(() => scroll.evaluate((node) => Math.ceil(node.scrollTop + node.clientHeight - node.scrollHeight))).toBeGreaterThanOrEqual(-1);
  await expect.poll(() => scroll.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
}

for (const width of [320, 375, 390, 430]) {
  test(`60-post OC profile remains scrollable and contained on ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockLargePublicSite(page, longContentDocument());
    await page.goto("/@demo");
    await page.getByRole("button", { name: "Instagram.exe" }).click();
    await expectLargeInstagramFits(page);
  });
}

for (const innerWidth of [360, 480, 720] as const) {
  test(`60-post OC profile remains scrollable in a ${innerWidth}px desktop window`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockLargePublicSite(page, longContentDocument(innerWidth));
    await page.goto("/@demo");
    const win = page.getByRole("dialog", { name: "Instagram.exe" });
    await expect(win).toHaveCSS("width", `${innerWidth}px`);
    await expectLargeInstagramFits(page);
  });
}

for (const width of [320, 375, 390, 430]) {
  test(`phone editor is a single mobile surface at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockEditor(page);
    await page.goto("/editor/site-1");

    await expect(page.locator(".left-panel2")).toBeHidden();
    await expect(page.locator(".right-panel2")).toBeHidden();
    await expect(page.locator(".sidebar-toggle-rail")).toBeHidden();
    await expect(page.locator(".editor-stage2 .m-screen")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "手機編輯工具" })).toBeVisible();
    await expect(page.locator(".editor-topbar .brand")).toHaveCSS("font-family", /Cubic 11/);
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`landing has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /把你的小宇宙/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`auth, onboarding and public routes fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/auth");
    await expect(page.getByRole("button", { name: "使用 Google 繼續" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await mockEditor(page);
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "幫你的桌面取個網址" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await mockPublicSite(page);
    await page.goto("/@demo");
    await expect(width <= 767 ? page.locator(".visitor-mobile") : page.locator(".visitor-desktop")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [768, 1024, 1440]) {
  test(`desktop editor shell fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockEditor(page);
    await page.goto("/editor/site-1");

    await expect(page.locator(".left-panel2")).toBeVisible();
    await expect(page.getByRole("button", { name: "收合左側工具欄" })).toBeVisible();
    if (width < 1024) {
      await expect(page.locator(".right-panel2")).toBeHidden();
      await expect(page.getByRole("button", { name: "收合右側屬性欄" })).toBeHidden();
    } else {
      await expect(page.locator(".right-panel2")).toBeVisible();
      await expect(page.getByRole("button", { name: "收合右側屬性欄" })).toBeVisible();
    }
    await expect(page.locator(".editor-stage2 .desktop-canvas")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
