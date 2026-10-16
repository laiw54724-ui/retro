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

function presentationDocument(): SiteDocumentV2Input {
  const document = ocDocument();
  const profile = document.entities.profiles.find((item) => item.id === "profile:ig");
  const pinned = document.entities.posts.find((post) => post.authorProfileId === "profile:ig");
  if (!profile || !pinned) throw new Error("presentation fixture missing");
  profile.visibility = "published";
  pinned.visibility = "published";
  pinned.title = "Pinned snow";
  pinned.caption = "Pinned snow caption";
  pinned.pinned = true;
  pinned.collectionIds = ["collection:snow"];
  pinned.src = "https://assets.test/pinned.png";
  pinned.srcUrl = pinned.src;
  pinned.media[0] = { ...pinned.media[0], src: pinned.src, srcUrl: pinned.src, alt: "Wide pinned artwork", aspectRatio: 2, crop: { x: 24, y: 68, zoom: 1.75 } };
  const regular = {
    ...structuredClone(pinned),
    id: "post:ig:regular",
    title: "Regular work",
    caption: "Regular work caption",
    pinned: false,
    media: pinned.media.map((media) => ({ ...media, id: `${media.id}:regular`, aspectRatio: 0.75 })),
    collectionIds: ["collection:snow"],
  };
  const draft = {
    ...structuredClone(pinned),
    id: "post:ig:draft",
    title: "Private draft work",
    caption: "Private draft caption",
    visibility: "draft" as const,
    pinned: false,
    collectionIds: ["collection:secret"],
  };
  document.entities.posts = [pinned, regular, draft, ...document.entities.posts.filter((post) => post.authorProfileId !== "profile:ig")];
  document.entities.collections = [
    {
      kind: "collection",
      id: "collection:snow",
      siteId: "site-1",
      ownerProfileId: "profile:ig",
      visibility: "published",
      title: "Snow collection",
      description: "Two public works",
      postIds: [regular.id, pinned.id, draft.id],
    },
    {
      kind: "collection",
      id: "collection:secret",
      siteId: "site-1",
      ownerProfileId: "profile:ig",
      visibility: "draft",
      title: "Secret collection",
      description: "Hidden collection",
      postIds: [draft.id],
    },
  ];
  return document;
}

function noPublicCollectionPostsDocument(): SiteDocumentV2Input {
  const document = presentationDocument();
  const draftPost = document.entities.posts.find((post) => post.id === "post:ig:draft");
  if (!draftPost) throw new Error("draft fixture missing");
  document.entities.collections = [{
    kind: "collection",
    id: "collection:empty-public",
    siteId: "site-1",
    ownerProfileId: "profile:ig",
    visibility: "published",
    title: "No public works",
    description: "Contains only a draft",
    postIds: [draftPost.id],
  }];
  return document;
}

async function mockEditor(page: Page, document = ocDocument()) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const saves: Array<{ document: SiteDocumentV2Input }> = [];
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: document, draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocumentV2Input };
    saves.push(body);
    site.draft_document = body.document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();
  return saves;
}

async function mockPublic(page: Page, document = ocDocument()) {
  await page.route("https://assets.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><rect width='320' height='240' fill='#ccd8ef'/></svg>",
  }));
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 2, published_at: "2026-10-15T00:00:00.000Z" } } }));
}

test("author configures fictional follows, named likes and actor comments with autosave", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saves = await mockEditor(page);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const social = win.getByRole("group", { name: "角色互動" });
  await social.getByLabel("搜尋互動角色").fill("Bei");
  const following = social.locator("section").filter({ hasText: "追蹤中名單" });
  await following.getByRole("checkbox").check();
  await social.getByRole("button", { name: /其他粉絲數.*舊顯示：100/ }).click();
  await social.getByRole("spinbutton", { name: "其他粉絲數" }).fill("12");

  const postToggle = win.locator(".ig-canonical-posts .ig-post-toggle").first();
  if (await postToggle.getAttribute("aria-expanded") !== "true") await postToggle.click();
  const post = win.getByRole("group", { name: "角色世界觀互動" }).first();
  await post.scrollIntoViewIfNeeded();
  await post.getByRole("checkbox", { name: /Bei Original/ }).check();
  await post.getByRole("spinbutton", { name: "其他虛構喜歡人數" }).fill("8");
  await post.getByRole("button", { name: "＋ 角色留言" }).click();
  await post.getByRole("textbox", { name: "留言 1 內容" }).fill("世界觀留言");

  await expect.poll(() => saves.at(-1)?.document.entities.followEdges?.length).toBe(1);
  const saved = saves.at(-1)?.document;
  expect(saved?.entities.followEdges?.[0]).toMatchObject({ fromProfileId: "profile:ig", toProfileId: "profile:bei" });
  expect(saved?.entities.profiles.find((profile) => profile.id === "profile:ig")?.otherFollowerCount).toBe(12);
  expect(saved?.entities.posts[0].namedLikerIds).toContain("profile:bei");
  expect(saved?.entities.posts[0].otherLikeCount).toBe(8);
  expect(saved?.entities.posts[0].actorComments[0]).toMatchObject({ authorKind: "profile", text: "世界觀留言" });

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Instagram.exe" });
  const reloadedSocial = reloaded.getByRole("group", { name: "角色互動" });
  await reloadedSocial.getByLabel("搜尋互動角色").fill("Bei");
  await expect(reloadedSocial.locator("section").filter({ hasText: "追蹤中名單" }).getByRole("checkbox")).toBeChecked();
  await expect(reloadedSocial.getByRole("spinbutton", { name: "其他粉絲數" })).toHaveValue("12");
});

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

test("canonical post media edits autosave and survive reload", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const canonicalHighlight = document.entities.highlights.find(
    (highlight) => highlight.ownerProfileId === "profile:ig",
  );
  if (!canonicalHighlight) throw new Error("fixture highlight missing");
  canonicalHighlight.coverAlt = "雪地旅程封面";
  canonicalHighlight.frames[0].alt = "雪地旅程封面";
  canonicalHighlight.frames.push({
    id: `${canonicalHighlight.id}:frame:2`,
    src: "https://example.com/highlight-2.png",
    srcUrl: "https://example.com/highlight-2.png",
    alt: "旅程第二幕",
    text: "抵達雪國",
  });
  const saves = await mockEditor(page, document);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const postToggle = win.getByRole("button", { name: /p1/ });
  if (await postToggle.getAttribute("aria-expanded") !== "true") await postToggle.click();
  await win.getByRole("textbox", { name: "標題", exact: true }).fill("OC archive");
  await win.getByRole("textbox", { name: "世界觀日期" }).fill("霜月 12 日");
  await win.getByRole("textbox", { name: "圖片 1 替代文字" }).fill("角色站在雪地裡");
  await win.getByRole("slider", { name: "圖片 1 水平裁切" }).fill("24");
  await win.getByRole("slider", { name: "圖片 1 垂直裁切" }).fill("68");
  await win.getByRole("slider", { name: "圖片 1 縮放" }).fill("1.75");
  await win.getByRole("textbox", { name: "新增輪播圖片網址" }).fill("https://example.com/four.png");
  await win.locator(".ig-canonical-posts").getByRole("button", { name: "加入", exact: true }).click();
  await expect(win.getByRole("textbox", { name: "圖片 4 替代文字" })).toBeVisible();
  await win.getByRole("textbox", { name: "圖片 4 替代文字" }).fill("第四張作品");
  await win.getByRole("button", { name: "圖片 4 往前" }).click();

  // Exercise the legacy projection editor after canonical post/media edits.
  // Reconciliation must preserve fields which that form cannot represent.
  await win.getByRole("textbox", { name: "帳號" }).fill("retro_archive");
  await win.getByRole("textbox", { name: "精選標題" }).first().fill("雪國旅程");
  const highlightEditor = win.locator(".ig-canonical-highlights");
  await highlightEditor.getByRole("textbox", { name: "新增精選頁圖片網址" }).fill("https://example.com/highlight-3.png");
  await highlightEditor.getByRole("button", { name: "加入", exact: true }).click();
  await highlightEditor.getByRole("textbox", { name: "精選第 3 頁替代文字" }).fill("旅程第三幕");

  await expect.poll(() => saves.at(-1)?.document.entities.posts.find((post) => post.id === "post:ig:p1")?.title).toBe("OC archive");
  const saved = saves.at(-1)?.document.entities.posts.find((post) => post.id === "post:ig:p1");
  expect(saved?.worldDateLabel).toBe("霜月 12 日");
  expect(saved?.media[0].crop).toEqual({ x: 24, y: 68, zoom: 1.75 });
  expect(saved?.media).toHaveLength(4);
  expect(saved?.media[2].src).toBe("https://example.com/four.png");
  expect(saved?.media[2].alt).toBe("第四張作品");
  expect(saved?.src).toBe(saved?.media[0].src);
  expect(saved?.extra.map((item) => item.id)).toEqual(saved?.media.slice(1).map((item) => item.id));
  const savedHighlight = saves.at(-1)?.document.entities.highlights.find(
    (highlight) => highlight.id === canonicalHighlight.id,
  );
  expect(savedHighlight?.title).toBe("雪國旅程");
  expect(savedHighlight?.coverAlt).toBe("雪地旅程封面");
  expect(savedHighlight?.frames).toHaveLength(3);
  expect(savedHighlight?.frames[1]).toMatchObject({
    src: "https://example.com/highlight-2.png",
    alt: "旅程第二幕",
    text: "抵達雪國",
  });
  expect(savedHighlight?.frames[2]).toMatchObject({ src: "https://example.com/highlight-3.png", alt: "旅程第三幕" });

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Instagram.exe" });
  const reloadedToggle = reloaded.getByRole("button", { name: /OC archive/ });
  if (await reloadedToggle.getAttribute("aria-expanded") !== "true") await reloadedToggle.click();
  await expect(reloaded.getByRole("textbox", { name: "世界觀日期" })).toHaveValue("霜月 12 日");
  await expect(reloaded.getByRole("textbox", { name: "圖片 3 替代文字" })).toHaveValue("第四張作品");
  await expect(reloaded.getByRole("slider", { name: "圖片 1 水平裁切" })).toHaveValue("24");
  await expect(reloaded.getByRole("slider", { name: "圖片 1 垂直裁切" })).toHaveValue("68");
  await expect(reloaded.getByRole("slider", { name: "圖片 1 縮放" })).toHaveValue("1.75");
  await expect(reloaded.getByRole("textbox", { name: "帳號" })).toHaveValue("retro-archive");
  await expect(reloaded.getByRole("textbox", { name: "精選標題" }).first()).toHaveValue("雪國旅程");
  await expect(reloaded.getByRole("textbox", { name: "精選第 3 頁替代文字" })).toHaveValue("旅程第三幕");
});

test("collection authoring autosaves ordered post membership and survives reload", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const firstPost = document.entities.posts.find((post) => post.authorProfileId === "profile:ig");
  if (!firstPost) throw new Error("fixture post missing");
  document.entities.posts.push({
    ...structuredClone(firstPost),
    id: "post:ig:second",
    title: "Second work",
    caption: "Second work caption",
    collectionIds: [],
  });
  const saves = await mockEditor(page, document);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });

  await win.getByRole("button", { name: "＋ 新增合集" }).click();
  await win.getByRole("textbox", { name: "合集標題" }).fill("雪國作品集");
  await win.getByRole("textbox", { name: "合集說明" }).fill("角色在雪國旅行的作品");
  await win.getByRole("checkbox", { name: "公開合集" }).check();
  await win.getByRole("checkbox", { name: "收錄 Second work" }).check();
  await win.getByRole("checkbox", { name: "收錄 p1" }).check();
  await win.getByRole("button", { name: "合集貼文 p1 往前" }).click();

  await expect.poll(() => saves.at(-1)?.document.entities.collections[0]?.title).toBe("雪國作品集");
  const savedCollection = saves.at(-1)?.document.entities.collections[0];
  expect(savedCollection).toMatchObject({
    description: "角色在雪國旅行的作品",
    visibility: "published",
    postIds: ["post:ig:p1", "post:ig:second"],
  });
  expect(saves.at(-1)?.document.entities.posts.find((post) => post.id === "post:ig:p1")?.collectionIds).toContain(savedCollection?.id);
  expect(saves.at(-1)?.document.entities.posts.find((post) => post.id === "post:ig:second")?.collectionIds).toContain(savedCollection?.id);

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Instagram.exe" });
  await expect(reloaded.getByRole("textbox", { name: "合集標題" })).toHaveValue("雪國作品集");
  await expect(reloaded.getByRole("textbox", { name: "合集說明" })).toHaveValue("角色在雪國旅行的作品");
  await expect(reloaded.getByRole("checkbox", { name: "公開合集" })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: "收錄 p1" })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: "收錄 Second work" })).toBeChecked();
  await expect(reloaded.locator(".ig-collection-post-row").filter({ hasText: "p1" })).toHaveAttribute("data-order", "1");
  await expect(reloaded.locator(".ig-collection-post-row").filter({ hasText: "Second work" })).toHaveAttribute("data-order", "2");
});

for (const width of [1280, 390]) {
  test(`published pinned posts, collections and natural-ratio details work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 800 });
    await mockPublic(page, presentationDocument());
    await page.goto("/@demo");
    if (width < 500) await page.getByRole("button", { name: "Instagram.exe" }).click();
    const win = page.getByRole("dialog", { name: "Instagram.exe" });

    await expect(win.getByRole("heading", { name: "置頂作品" })).toBeVisible();
    const pinnedCell = win.locator(".ig-pinned").getByRole("button", { name: "開啟貼文：Pinned snow caption" });
    await expect(pinnedCell).toBeVisible();
    await expect(pinnedCell.locator("img")).toHaveCSS("object-position", "24% 68%");
    await expect(pinnedCell.locator("img")).not.toHaveCSS("transform", "none");
    await expect(win.getByRole("button", { name: "開啟貼文：Private draft caption" })).toHaveCount(0);
    await expect(win.getByRole("tab", { name: "合集" })).toBeVisible();
    await win.getByRole("tab", { name: "合集" }).click();
    await expect(win.getByText("Secret collection")).toHaveCount(0);
    await win.getByRole("button", { name: "開啟合集：Snow collection" }).click();
    await expect(win.locator(".ig-title strong")).toHaveText("Snow collection");
    const collectionPosts = win.locator(".ig-collection-view .ig-cell");
    await expect(collectionPosts).toHaveCount(2);
    await expect(collectionPosts.nth(0)).toHaveAttribute("aria-label", "開啟貼文：Regular work caption");
    await expect(collectionPosts.nth(1)).toHaveAttribute("aria-label", "開啟貼文：Pinned snow caption");
    await collectionPosts.nth(1).click();
    const detail = win.locator(".ig-media.detail");
    await expect(detail).toBeVisible();
    const box = await detail.boundingBox();
    expect(box && box.width / box.height).toBeGreaterThan(1.95);
    expect(box && box.width / box.height).toBeLessThan(2.05);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("collections tab stays hidden when published collections contain no public posts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublic(page, noPublicCollectionPostsDocument());
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await expect(win.getByRole("tab", { name: "合集" })).toHaveCount(0);
  await expect(win.getByText("No public works")).toHaveCount(0);
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

test("published multi-page highlight pauses, supports keyboard navigation and restores scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const document = navigationDocument();
  const highlight = document.entities.highlights.find((item) => item.ownerProfileId === "profile:ig");
  if (!highlight) throw new Error("fixture highlight missing");
  highlight.visibility = "published";
  highlight.frames[0].alt = "第一頁雪景";
  highlight.frames[0].text = "旅程開始";
  highlight.frames.push({ id: `${highlight.id}:frame:2`, src: "https://example.com/highlight-2.png", srcUrl: "https://example.com/highlight-2.png", alt: "第二頁夜景", text: "抵達雪國" });
  await mockPublic(page, document);
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const scroll = win.locator(".ig-scroll");
  await expect.poll(() => scroll.evaluate((node) => { node.scrollTop = 120; return node.scrollTop; })).toBeGreaterThan(0);
  await win.getByRole("button", { name: highlight.title }).evaluate((button) => (button as HTMLButtonElement).click());
  const viewer = win.getByRole("dialog", { name: "精選動態" });
  await expect(viewer.getByText(`${highlight.title} · 1/2`)).toBeVisible();
  await viewer.getByRole("button", { name: "暫停播放" }).click();
  await expect(viewer.getByRole("button", { name: "繼續播放" })).toBeVisible();
  await viewer.press("ArrowRight");
  await expect(viewer.getByText("抵達雪國")).toBeVisible();
  await expect(viewer.getByText(`${highlight.title} · 2/2`)).toBeVisible();
  await viewer.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

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

test("single-profile legacy visitor stats do not open an empty directory", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublic(page, igDocument());
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await expect(win.getByText("粉絲", { exact: true })).toBeVisible();
  await expect(win.getByRole("button", { name: /粉絲/ })).toHaveCount(0);
  await expect(win.getByRole("heading", { name: "此桌面的角色" })).toHaveCount(0);
});
