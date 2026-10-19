import { expect, test, type Locator, type Page } from "@playwright/test";
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

function socialPublicDocument(): SiteDocumentV2Input {
  const document = ocDocument();
  const retro = document.entities.profiles.find((profile) => profile.id === "profile:ig")!;
  const bei = document.entities.profiles.find((profile) => profile.id === "profile:bei")!;
  retro.otherFollowerCount = 2;
  retro.otherFollowingCount = 0;
  document.entities.followEdges = [{ kind: "follow", id: "follow:bei-retro", siteId: "site-1", fromProfileId: bei.id, toProfileId: retro.id }];
  const post = document.entities.posts.find((item) => item.authorProfileId === retro.id)!;
  post.namedLikerIds = [bei.id];
  post.otherLikeCount = 3;
  post.actorComments = [{ id: "comment:bei", authorKind: "profile", authorProfileId: bei.id, text: "具名角色留言" }];
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
  const site = { id: "site-1", username: "demo", site_name: "D", draft_document: document, draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
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

async function openEditorGroup(win: Locator, name: "角色資料" | "貼文" | "精選／合集" | "互動" | "外觀") {
  await win.getByRole("tablist", { name: "OC 編輯分組" }).getByRole("tab", { name, exact: true }).click();
  await expect(win.getByRole("tabpanel", { name, exact: true })).toBeVisible();
}

async function expandDetails(scope: Locator, name: string) {
  const summary = scope.locator("summary").filter({ hasText: name }).first();
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
}

test("author configures fictional follows, named likes and actor comments with autosave", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saves = await mockEditor(page);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await openEditorGroup(win, "互動");
  const social = win.getByRole("group", { name: "角色互動" });
  await social.getByLabel("搜尋互動角色").fill("Bei");
  const following = social.locator("section").filter({ hasText: "追蹤中名單" });
  const followsBei = following.getByRole("checkbox");
  await followsBei.check();
  await expect.poll(() => saves.at(-1)?.document.entities.followEdges?.length).toBe(1);
  await page.getByRole("button", { name: "復原" }).click();
  await expect(followsBei).not.toBeChecked();
  await page.getByRole("button", { name: "重做" }).click();
  await expect(followsBei).toBeChecked();
  await expect.poll(() => saves.at(-1)?.document.entities.followEdges?.length).toBe(1);
  await social.getByRole("button", { name: /其他粉絲數.*舊顯示：100/ }).click();
  await social.getByRole("spinbutton", { name: "其他粉絲數" }).fill("12");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.id === "profile:ig")?.otherFollowerCount).toBe(12);

  await openEditorGroup(win, "貼文");
  const postToggle = win.locator(".ig-canonical-posts .ig-post-toggle").first();
  if (await postToggle.getAttribute("aria-expanded") !== "true") await postToggle.click();
  await expandDetails(win.locator(".ig-canonical-posts"), "角色互動（喜歡與留言）");
  const post = win.getByRole("group", { name: "角色世界觀互動" }).first();
  await post.scrollIntoViewIfNeeded();
  await post.getByRole("checkbox", { name: /Bei Original/ }).check();
  await post.getByRole("spinbutton", { name: "其他虛構喜歡人數" }).fill("8");
  await post.getByRole("button", { name: "＋ 角色留言" }).click();
  await post.getByRole("textbox", { name: "留言 1 內容" }).fill("世界觀留言");
  await post.getByRole("button", { name: "＋ 純文字留言" }).click();
  await post.getByRole("textbox", { name: "留言 2 舊作者名稱" }).fill("舊角色名");
  await post.getByRole("textbox", { name: "留言 2 內容" }).fill("舊格式留言");
  await post.getByRole("button", { name: "留言 2 往前" }).click();

  await expect.poll(() => {
    const current = saves.at(-1)?.document;
    return current ? {
      followEdges: current.entities.followEdges?.length,
      otherFollowerCount: current.entities.profiles.find((item) => item.id === "profile:ig")?.otherFollowerCount,
      namedLikerIds: current.entities.posts[0]?.namedLikerIds,
      otherLikeCount: current.entities.posts[0]?.otherLikeCount,
      comments: current.entities.posts[0]?.actorComments?.map((comment) => comment.text),
    } : null;
  }).toEqual({ followEdges: 1, otherFollowerCount: 12, namedLikerIds: ["profile:bei"], otherLikeCount: 8, comments: ["舊格式留言", "世界觀留言"] });
  const saved = saves.at(-1)?.document;
  expect(saved?.entities.followEdges?.[0]).toMatchObject({ fromProfileId: "profile:ig", toProfileId: "profile:bei" });
  expect(saved?.entities.profiles.find((profile) => profile.id === "profile:ig")?.otherFollowerCount).toBe(12);
  expect(saved?.entities.posts[0].namedLikerIds).toContain("profile:bei");
  expect(saved?.entities.posts[0].otherLikeCount).toBe(8);
  expect(saved?.entities.posts[0].actorComments).toEqual([
    expect.objectContaining({ authorKind: "legacy", legacyAuthorText: "舊角色名", text: "舊格式留言" }),
    expect.objectContaining({ authorKind: "profile", text: "世界觀留言" }),
  ]);

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Instagram.exe" });
  await openEditorGroup(reloaded, "互動");
  const reloadedSocial = reloaded.getByRole("group", { name: "角色互動" });
  await reloadedSocial.getByLabel("搜尋互動角色").fill("Bei");
  await expect(reloadedSocial.locator("section").filter({ hasText: "追蹤中名單" }).getByRole("checkbox")).toBeChecked();
  await expect(reloadedSocial.getByRole("spinbutton", { name: "其他粉絲數" })).toHaveValue("12");
  await openEditorGroup(reloaded, "貼文");
  const reloadedPostToggle = reloaded.locator(".ig-canonical-posts .ig-post-toggle").first();
  if (await reloadedPostToggle.getAttribute("aria-expanded") !== "true") await reloadedPostToggle.click();
  await expandDetails(reloaded.locator(".ig-canonical-posts"), "角色互動（喜歡與留言）");
  await expect(reloaded.getByRole("textbox", { name: "留言 1 舊作者名稱" })).toHaveValue("舊角色名");
});

test("visitor browses truthful fictional people lists and nested actor navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const document = socialPublicDocument();
  await mockPublic(page, document);
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await expect(win.getByText("角色世界觀內容")).toBeVisible();
  const followerStat = win.getByRole("button", { name: /3\s*粉絲/ });
  await followerStat.click();
  await expect(win.getByRole("button", { name: /Bei Original @bei/ })).toBeVisible();
  await expect(win.getByText("另有 2 位虛構角色（未設定名單）")).toBeVisible();
  await win.getByRole("button", { name: /Bei Original @bei/ }).click();
  await expect(win.getByText("Bei Original", { exact: true })).toBeVisible();
  await win.getByRole("button", { name: "返回" }).click();
  await win.getByRole("button", { name: "返回" }).click();
  const follow = win.getByRole("button", { name: /Follow（僅本次瀏覽）/ });
  await follow.click();
  await expect(win.getByRole("button", { name: /3\s*粉絲/ })).toBeVisible();
  const cell = win.getByRole("button", { name: /^開啟貼文：/ }).first();
  await cell.click();
  await expect(win.getByText("具名角色留言")).toBeVisible();
  await win.getByRole("button", { name: "Bei Original", exact: true }).click();
  await expect(win.getByText("Bei Original", { exact: true })).toBeVisible();
  await win.getByRole("button", { name: "返回" }).click();
  await win.getByRole("button", { name: "4 個讚" }).click();
  await expect(win.getByRole("button", { name: /Bei Original @bei/ })).toBeVisible();
  await win.getByRole("button", { name: /Bei Original @bei/ }).click();
  await expect(win.getByText("Bei Original", { exact: true })).toBeVisible();
  await win.getByRole("button", { name: "返回" }).click();
  await expect(win.getByText("另有 3 位虛構角色（未設定名單）")).toBeVisible();
  await expect(win.getByText("PRIVATE SOCIAL ACTOR")).toHaveCount(0);
  await expect(win.getByText("PRIVATE SOCIAL COMMENT")).toHaveCount(0);
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

  await expandDetails(switcher, "尋找與管理角色");
  await switcher.getByLabel("搜尋角色").fill("Bei");
  await expect(switcher.getByRole("button", { name: "Bei Original @bei", exact: true })).toBeVisible();
  await expect(switcher.getByRole("button", { name: "Retro User @retro", exact: true })).toHaveCount(0);
  await switcher.getByRole("button", { name: "Bei Original @bei", exact: true }).click();
  await expect(win.getByRole("textbox", { name: "Handle" })).toHaveValue("bei");
  await expandDetails(switcher, "尋找與管理角色");
  await switcher.getByLabel("搜尋角色").fill("");
  await switcher.getByRole("button", { name: "複製 Bei Original" }).click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "bei-copy")).toBe(true);

  await win.getByRole("button", { name: "展開角色設定" }).click();
  await win.getByRole("button", { name: "＋ 新增欄位" }).click();
  const profilePanel = win.getByRole("tabpanel", { name: "角色資料", exact: true });
  await profilePanel.getByPlaceholder("欄位名稱", { exact: true }).last().fill("世界");
  await profilePanel.getByPlaceholder("內容", { exact: true }).last().fill("雪國");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "bei-copy")?.customFields.some((field) => field.key === "世界" && field.value === "雪國")).toBe(true);

  await expandDetails(win, "角色管理");
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
  await expandDetails(switcher, "尋找與管理角色");
  await switcher.getByLabel("搜尋角色").fill("Bei");
  await switcher.getByRole("button", { name: "Bei Original @bei" }).click();
  await win.getByRole("textbox", { name: "顯示名稱" }).fill("Bei Mobile");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "bei")?.displayName).toBe("Bei Mobile");

  await expandDetails(switcher, "尋找與管理角色");
  await switcher.getByLabel("搜尋角色").fill("");
  await switcher.getByRole("button", { name: "＋ 新增角色" }).click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "oc-3")).toBe(true);
  await openEditorGroup(win, "外觀");
  await win.getByRole("checkbox", { name: "自訂內容主題（只影響 IG 內容）" }).check();
  await win.getByLabel("IG 內容強調色").fill("#00ff00");
  await win.getByLabel("IG 內容背景色").fill("#102030");
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.find((profile) => profile.handle === "oc-3")?.themeOverride).toEqual({ accent: "#00ff00", background: "#102030" });

  await openEditorGroup(win, "角色資料");
  await expandDetails(win, "角色管理");
  const deleteButton = win.getByRole("button", { name: "刪除並轉接" });
  await expect(deleteButton).toBeDisabled();
  await win.getByLabel(/此角色仍被視窗／貼文使用/).selectOption({ label: "Bei Mobile" });
  await deleteButton.click();
  await expect.poll(() => saves.at(-1)?.document.entities.profiles.some((profile) => profile.handle === "oc-3")).toBe(false);
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.type === "instagram")?.content.profileRef.id).toBe("profile:bei");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [320, 375, 430]) {
  test(`mobile OC editing groups and role actions remain reachable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await mockEditor(page);
    await page.getByRole("button", { name: "手機版" }).click();
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Instagram.exe" }).click();
    await page.getByRole("button", { name: "編輯此視窗" }).click();
    const win = page.getByRole("dialog", { name: "Instagram.exe" });
    const selection = win.getByRole("combobox", { name: "目前編輯角色" });
    const add = win.getByRole("button", { name: "＋ 新增角色" });
    const groups = win.getByRole("tablist", { name: "OC 編輯分組" });
    const scroll = win.locator(".ig-edit-scroll");
    const targets = [
      ["角色資料", win.getByRole("textbox", { name: "Handle", exact: true })],
      ["貼文", win.getByRole("searchbox", { name: "貼文搜尋" })],
      ["精選／合集", win.getByRole("button", { name: "＋ 新增精選" })],
      ["互動", win.getByRole("textbox", { name: "搜尋互動角色" })],
      ["外觀", win.getByRole("button", { name: "Win98", exact: true })],
    ] as const;
    for (const [name, target] of targets) {
      const tab = groups.getByRole("tab", { name, exact: true });
      await expect(tab).toBeInViewport({ ratio: 1 });
      await openEditorGroup(win, name);
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport({ ratio: 1 });
      await expect(selection).toBeInViewport({ ratio: 1 });
      await expect(add).toBeInViewport({ ratio: 1 });
      expect(await scroll.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      if (width === 320 && name === "貼文") {
        await testInfo.attach("mobile-320-oc-posts", { body: await page.screenshot(), contentType: "image/png" });
      }
    }

    await groups.getByRole("tab", { name: "外觀", exact: true }).focus();
    await page.keyboard.press("Home");
    await expect(groups.getByRole("tab", { name: "角色資料", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(groups.getByRole("tab", { name: "外觀", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(groups.getByRole("tab", { name: "角色資料", exact: true })).toHaveAttribute("aria-selected", "true");

    await openEditorGroup(win, "貼文");
    await expect.poll(() => scroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await scroll.evaluate((node) => { node.scrollTop = 0; });
    await scroll.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(selection).toBeInViewport({ ratio: 1 });
    await expect(add).toBeInViewport({ ratio: 1 });
    await selection.selectOption("profile:bei");
    await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toHaveValue("bei");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}

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
  await openEditorGroup(win, "貼文");
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
  await openEditorGroup(win, "角色資料");
  await win.getByRole("textbox", { name: "Handle" }).fill("retro-archive");
  await win.getByRole("textbox", { name: "個人連結文字" }).fill("OC archive link");
  await openEditorGroup(win, "精選／合集");
  await win.getByRole("textbox", { name: "精選標題" }).first().fill("雪國旅程");
  const highlightEditor = win.locator(".ig-canonical-highlights");
  await highlightEditor.getByRole("textbox", { name: "新增精選頁圖片網址" }).fill("https://example.com/highlight-3.png");
  await highlightEditor.getByRole("button", { name: "加入", exact: true }).click();
  await highlightEditor.getByRole("textbox", { name: "精選第 3 頁替代文字" }).fill("旅程第三幕");

  await expect.poll(() => saves.at(-1)?.document.entities.posts.find((post) => post.id === "post:ig:p1")?.title).toBe("OC archive");
  await expect.poll(() => saves.at(-1)?.document.entities.highlights.find((highlight) => highlight.id === canonicalHighlight.id)?.frames[2]?.alt).toBe("旅程第三幕");
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
  await openEditorGroup(reloaded, "貼文");
  const reloadedToggle = reloaded.getByRole("button", { name: /OC archive/ });
  if (await reloadedToggle.getAttribute("aria-expanded") !== "true") await reloadedToggle.click();
  await expect(reloaded.getByRole("textbox", { name: "世界觀日期" })).toHaveValue("霜月 12 日");
  await expect(reloaded.getByRole("textbox", { name: "圖片 3 替代文字" })).toHaveValue("第四張作品");
  await expect(reloaded.getByRole("slider", { name: "圖片 1 水平裁切" })).toHaveValue("24");
  await expect(reloaded.getByRole("slider", { name: "圖片 1 垂直裁切" })).toHaveValue("68");
  await expect(reloaded.getByRole("slider", { name: "圖片 1 縮放" })).toHaveValue("1.75");
  await openEditorGroup(reloaded, "角色資料");
  await expect(reloaded.getByRole("textbox", { name: "Handle" })).toHaveValue("retro-archive");
  await expect(reloaded.getByRole("textbox", { name: "個人連結文字" })).toHaveValue("OC archive link");
  await openEditorGroup(reloaded, "精選／合集");
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

  await openEditorGroup(win, "精選／合集");
  await win.getByRole("button", { name: "＋ 新增合集" }).click();
  await win.getByRole("textbox", { name: "合集標題" }).fill("雪國作品集");
  await win.getByRole("textbox", { name: "合集說明" }).fill("角色在雪國旅行的作品");
  await win.getByRole("checkbox", { name: "公開合集" }).check();
  await win.getByRole("checkbox", { name: "收錄 Second work" }).check();
  await win.getByRole("checkbox", { name: "收錄 p1" }).check();
  await win.getByRole("button", { name: "合集貼文 p1 往前" }).click();

  await expect.poll(() => saves.at(-1)?.document.entities.collections[0]?.title).toBe("雪國作品集");
  await expect.poll(() => saves.at(-1)?.document.entities.collections[0]?.postIds).toEqual(["post:ig:p1", "post:ig:second"]);
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
  await openEditorGroup(reloaded, "精選／合集");
  await expect(reloaded.getByRole("textbox", { name: "合集標題" })).toHaveValue("雪國作品集");
  await expect(reloaded.getByRole("textbox", { name: "合集說明" })).toHaveValue("角色在雪國旅行的作品");
  await expect(reloaded.getByRole("checkbox", { name: "公開合集" })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: "收錄 p1" })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: "收錄 Second work" })).toBeChecked();
  await expect(reloaded.locator(".ig-collection-post-row").filter({ hasText: "p1" })).toHaveAttribute("data-order", "1");
  await expect(reloaded.locator(".ig-collection-post-row").filter({ hasText: "Second work" })).toHaveAttribute("data-order", "2");
});

test("OC post filters and pending URLs stay local to each character while switching groups", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const [moon, sunset] = document.entities.posts;
  if (!moon || !sunset) throw new Error("filter fixture posts missing");
  moon.title = "Moon diary";
  moon.caption = "Travel notes";
  moon.worldDateLabel = "霜月 12 日";
  moon.media[0].alt = "角色站在雪地";
  moon.pinned = true;
  moon.visibility = "published";
  sunset.title = "Sunset sketch";
  sunset.visibility = "draft";
  const beiPost = {
    ...structuredClone(sunset), id: "post:bei:private", authorProfileId: "profile:bei",
    title: "Bei private", caption: "Only Bei's work",
    media: sunset.media.map((media) => ({ ...media, id: `${media.id}:bei` })),
  };
  document.entities.posts.push(beiPost);
  const saves = await mockEditor(page, document);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const groups = win.getByRole("tablist", { name: "OC 編輯分組" });
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toHaveCount(1);
  await expect(win.getByRole("textbox", { name: "顯示名稱", exact: true })).toHaveCount(1);
  await expect(win.getByRole("textbox", { name: "簡介", exact: true })).toHaveCount(1);
  await groups.getByRole("tab", { name: "角色資料", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(groups.getByRole("tab", { name: "貼文", exact: true })).toBeFocused();
  await expect(groups.getByRole("tab", { name: "貼文", exact: true })).toHaveAttribute("aria-selected", "true");

  const editor = win.locator(".ig-canonical-posts");
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(2);
  await testInfo.attach("desktop-oc-posts", { body: await page.screenshot(), contentType: "image/png" });
  await editor.getByRole("searchbox", { name: "貼文搜尋" }).fill("霜月 雪地");
  await editor.getByRole("combobox", { name: "貼文狀態篩選" }).selectOption("published");
  await editor.getByRole("checkbox", { name: "只看置頂貼文" }).check();
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(1);
  await expect(editor.locator(".ig-post-toggle")).toContainText("Moon diary");
  await expect(editor.getByRole("status")).toContainText("顯示 1 / 2 篇");
  await expect(editor.getByRole("button", { name: "貼文往前", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "貼文往後", exact: true })).toBeDisabled();
  await editor.getByRole("combobox", { name: "貼文狀態篩選" }).selectOption("draft");
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(0);
  await expect(editor.getByRole("status")).toContainText("顯示 0 / 2 篇");
  await editor.getByRole("button", { name: "清除貼文篩選" }).click();
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(2);
  await expect(editor.getByRole("button", { name: "貼文往後", exact: true }).first()).toBeEnabled();

  await editor.getByRole("searchbox", { name: "貼文搜尋" }).fill("Sunset");
  await editor.getByRole("combobox", { name: "貼文狀態篩選" }).selectOption("draft");
  await editor.getByRole("textbox", { name: "新貼文圖片網址" }).fill("https://example.com/retro-pending.png");
  await openEditorGroup(win, "精選／合集");
  await openEditorGroup(win, "貼文");
  await expect(editor.getByRole("searchbox", { name: "貼文搜尋" })).toHaveValue("Sunset");

  const selection = win.getByRole("combobox", { name: "目前編輯角色" });
  await selection.selectOption("profile:bei");
  await expect(groups.getByRole("tab", { name: "角色資料", exact: true })).toHaveAttribute("aria-selected", "true");
  await openEditorGroup(win, "貼文");
  await expect(editor.getByRole("searchbox", { name: "貼文搜尋" })).toHaveValue("");
  await expect(editor.getByRole("combobox", { name: "貼文狀態篩選" })).toHaveValue("all");
  await expect(editor.getByRole("checkbox", { name: "只看置頂貼文" })).not.toBeChecked();
  await expect(editor.getByRole("textbox", { name: "新貼文圖片網址" })).toHaveValue("");
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(1);
  await expect(editor.locator(".ig-post-toggle")).toContainText("Bei private");
  await editor.getByRole("searchbox", { name: "貼文搜尋" }).fill("Bei");
  await editor.getByRole("textbox", { name: "新貼文圖片網址" }).fill("https://example.com/bei-pending.png");

  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.type === "instagram")?.content.profileRef.id).toBe("profile:bei");
  const savesBeforeReturn = saves.length;
  await selection.selectOption("profile:ig");
  await expect(groups.getByRole("tab", { name: "貼文", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByRole("searchbox", { name: "貼文搜尋" })).toHaveValue("Sunset");
  await expect(editor.getByRole("combobox", { name: "貼文狀態篩選" })).toHaveValue("draft");
  await expect(editor.getByRole("textbox", { name: "新貼文圖片網址" })).toHaveValue("https://example.com/retro-pending.png");
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(1);
  await expect(editor.locator(".ig-post-toggle")).toContainText("Sunset sketch");
  await expect.poll(() => saves.length).toBeGreaterThan(savesBeforeReturn);
  expect(saves.at(-1)?.document.entities).toEqual(document.entities);
  expect(JSON.stringify(saves.at(-1)?.document)).not.toContain("-pending.png");
});

test("editing a filtered draft keeps its fields mounted and its public visibility unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const draft = document.entities.posts[0];
  if (!draft) throw new Error("draft fixture post missing");
  draft.title = "Private sunset";
  draft.caption = "PRIVATE WORK BEFORE EDIT";
  draft.visibility = "draft";
  const saves = await mockEditor(page, document);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await openEditorGroup(win, "貼文");
  const editor = win.locator(".ig-canonical-posts");
  await editor.getByRole("searchbox", { name: "貼文搜尋" }).fill("Private sunset");
  await editor.getByRole("combobox", { name: "貼文狀態篩選" }).selectOption("draft");
  await editor.locator(".ig-post-toggle").click();
  await editor.getByRole("textbox", { name: "標題", exact: true }).fill("Later sketch");
  await expect(editor.getByRole("textbox", { name: "標題", exact: true })).toBeFocused();
  await expect(editor.getByRole("textbox", { name: "標題", exact: true })).toHaveValue("Later sketch");
  await expect(editor.getByRole("status")).toContainText("另保留 1 篇正在編輯的貼文");
  await editor.getByRole("textbox", { name: "貼文內容", exact: true }).fill("PRIVATE WORK AFTER EDIT");
  await expect(editor.getByRole("checkbox", { name: "公開顯示", exact: true })).not.toBeChecked();
  await expect.poll(() => saves.at(-1)?.document.entities.posts.find((post) => post.id === draft.id)?.caption).toBe("PRIVATE WORK AFTER EDIT");
  const saved = saves.at(-1)?.document;
  if (!saved) throw new Error("draft changes were not saved");
  expect(saved.entities.posts.find((post) => post.id === draft.id)).toMatchObject({ title: "Later sketch", visibility: "draft" });
  await editor.locator(".ig-post-toggle").click();
  await expect(editor.locator(".ig-post-toggle")).toHaveCount(0);

  // The same canonical draft goes through the public client boundary; search must
  // never turn its visibility into permission to expose this post.
  await mockPublic(page, saved);
  await page.goto("/@demo");
  const publicWindow = page.getByRole("dialog", { name: "Instagram.exe" });
  await expect(publicWindow.getByRole("button", { name: "開啟貼文：second sunset" })).toBeVisible();
  await expect(publicWindow.getByRole("button", { name: "開啟貼文：PRIVATE WORK AFTER EDIT" })).toHaveCount(0);
  await expect(publicWindow.getByText("PRIVATE WORK AFTER EDIT")).toHaveCount(0);
});

test("collection search preserves hidden selections and canonical order without exposing draft members", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const [alpha, beta] = document.entities.posts;
  if (!alpha || !beta) throw new Error("collection fixture posts missing");
  alpha.title = "Alpha cover";
  alpha.caption = "Public alpha artwork";
  alpha.visibility = "published";
  beta.title = "Beta draft";
  beta.caption = "PRIVATE BETA ARTWORK";
  beta.visibility = "draft";
  const gamma = {
    ...structuredClone(alpha), id: "post:ig:gamma", title: "Gamma study", caption: "Public gamma artwork",
    media: alpha.media.map((media) => ({ ...media, id: `${media.id}:gamma` })), collectionIds: [],
  };
  document.entities.posts.push(gamma);
  const collectionId = "collection:travel";
  alpha.collectionIds = [collectionId];
  beta.collectionIds = [collectionId];
  document.entities.collections = [{
    kind: "collection", id: collectionId, siteId: "site-1", ownerProfileId: "profile:ig", visibility: "published",
    title: "Travel collection", description: "A public series with a private draft", postIds: [alpha.id, beta.id],
  }];
  const saves = await mockEditor(page, document);
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  await openEditorGroup(win, "精選／合集");
  const collections = win.locator(".ig-canonical-collections");
  await collections.getByRole("searchbox", { name: "搜尋合集", exact: true }).fill("Travel");
  await collections.locator(".ig-post-toggle").click();
  const search = collections.getByRole("searchbox", { name: "搜尋合集貼文", exact: true });
  await search.fill("Gamma");
  await expect(collections.getByRole("checkbox", { name: "收錄 Alpha cover" })).toHaveCount(0);
  await expect(collections.getByRole("checkbox", { name: "收錄 Beta draft" })).toHaveCount(0);
  await collections.getByRole("checkbox", { name: "收錄 Gamma study" }).check();
  await expect.poll(() => saves.at(-1)?.document.entities.collections[0]?.postIds).toEqual([alpha.id, beta.id, gamma.id]);
  await search.fill("Beta");
  await expect(collections.getByRole("checkbox", { name: "收錄 Beta draft" })).toBeChecked();
  await collections.getByRole("button", { name: "合集貼文 Beta draft 往前" }).click();
  await expect.poll(() => saves.at(-1)?.document.entities.collections[0]?.postIds).toEqual([beta.id, alpha.id, gamma.id]);
  await search.fill("Gamma");
  await collections.getByRole("checkbox", { name: "收錄 Gamma study" }).uncheck();
  await expect.poll(() => saves.at(-1)?.document.entities.collections[0]?.postIds).toEqual([beta.id, alpha.id]);
  await collections.getByRole("button", { name: "清除合集貼文搜尋" }).click();
  await expect(collections.getByRole("checkbox", { name: "收錄 Alpha cover" })).toBeChecked();
  await expect(collections.getByRole("checkbox", { name: "收錄 Beta draft" })).toBeChecked();
  await expect(collections.getByRole("checkbox", { name: "收錄 Gamma study" })).not.toBeChecked();
  await expect(collections.locator(".ig-collection-post-row").filter({ hasText: "Beta draft" })).toHaveAttribute("data-order", "1");
  await expect(collections.locator(".ig-collection-post-row").filter({ hasText: "Alpha cover" })).toHaveAttribute("data-order", "2");
  const saved = saves.at(-1)?.document;
  if (!saved) throw new Error("collection changes were not saved");
  expect(saved.entities.posts.find((post) => post.id === alpha.id)?.collectionIds).toEqual([collectionId]);
  expect(saved.entities.posts.find((post) => post.id === beta.id)?.collectionIds).toEqual([collectionId]);
  expect(saved.entities.posts.find((post) => post.id === gamma.id)?.collectionIds).toEqual([]);
  expect(saved.entities.posts.find((post) => post.id === beta.id)?.visibility).toBe("draft");

  await page.reload();
  await openEditorGroup(page.getByRole("dialog", { name: "Instagram.exe" }), "精選／合集");
  await expect(page.getByRole("checkbox", { name: "收錄 Beta draft" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "收錄 Alpha cover" })).toBeChecked();
  await mockPublic(page, saved);
  await page.goto("/@demo");
  const publicWindow = page.getByRole("dialog", { name: "Instagram.exe" });
  await publicWindow.getByRole("tab", { name: "合集", exact: true }).click();
  await publicWindow.getByRole("button", { name: "開啟合集：Travel collection" }).click();
  await expect(publicWindow.locator(".ig-collection-view .ig-cell")).toHaveCount(1);
  await expect(publicWindow.getByRole("button", { name: "開啟貼文：Public alpha artwork" })).toBeVisible();
  await expect(publicWindow.getByText("PRIVATE BETA ARTWORK")).toHaveCount(0);
});

test("a delayed post upload stays with its original OC after the editor switches characters", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const saves = await mockEditor(page, document);
  const uploadId = "22222222-2222-4222-8222-222222222222";
  const assetRef = `retro-asset:${uploadId}`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
  let uploadRequests = 0;
  await page.route("**/api/sites/site-1/assets", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    uploadRequests += 1;
    await uploadGate;
    await route.fulfill({ status: 201, json: { asset: { id: uploadId, url: assetRef, mimeType: "image/png", size: png.length, kind: "image", name: "original-upload" } } });
  });
  await page.route(`**/api/sites/site-1/assets/${uploadId}/content`, (route) => route.fulfill({ contentType: "image/png", body: png }));
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const selection = win.getByRole("combobox", { name: "目前編輯角色" });
  const editor = win.locator(".ig-canonical-posts");
  try {
    await openEditorGroup(win, "貼文");
    await editor.locator('input[type="file"]').first().setInputFiles({ name: "original-upload.png", mimeType: "image/png", buffer: png });
    await expect.poll(() => uploadRequests).toBe(1);
    await expect(editor.getByText("上傳中…", { exact: true })).toBeVisible();
    await selection.selectOption("profile:bei");
    await openEditorGroup(win, "貼文");
    await editor.getByRole("searchbox", { name: "貼文搜尋" }).fill("Bei search in progress");
    await editor.getByRole("textbox", { name: "新貼文圖片網址" }).fill("https://example.com/bei-kept.png");
    await expect(editor.getByText("上傳中…", { exact: true })).toHaveCount(0);

    releaseUpload();
    await expect.poll(() => saves.at(-1)?.document.entities.posts.filter((post) => post.media.some((media) => media.src === assetRef)).length).toBe(1);
    const saved = saves.at(-1)?.document;
    const uploaded = saved?.entities.posts.find((post) => post.media.some((media) => media.src === assetRef));
    expect(uploaded).toMatchObject({ authorProfileId: "profile:ig", siteId: "site-1", visibility: "draft", title: "original-upload" });
    expect(saved?.entities.posts.filter((post) => post.authorProfileId === "profile:bei")).toEqual(document.entities.posts.filter((post) => post.authorProfileId === "profile:bei"));
    expect(saved?.windows.find((window) => window.type === "instagram")?.content.profileRef.id).toBe("profile:bei");
    await expect(selection).toHaveValue("profile:bei");
    await expect(editor.getByRole("searchbox", { name: "貼文搜尋" })).toHaveValue("Bei search in progress");
    await expect(editor.getByRole("textbox", { name: "新貼文圖片網址" })).toHaveValue("https://example.com/bei-kept.png");
    await expect(editor.locator(".ig-post-toggle")).toHaveCount(0);

    await selection.selectOption("profile:ig");
    await expect(editor.getByRole("textbox", { name: "標題", exact: true })).toHaveValue("original-upload");
    await expect(editor.getByText("上傳中…", { exact: true })).toHaveCount(0);
    await expect(editor.getByRole("checkbox", { name: "公開顯示", exact: true })).not.toBeChecked();
  } finally {
    releaseUpload();
  }
});

test("a delayed highlight upload cannot append a page after its original OC is deleted and retargeted", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const document = ocDocument();
  const highlight = document.entities.highlights.find((item) => item.ownerProfileId === "profile:ig");
  if (!highlight || !highlight.frames.length) throw new Error("highlight upload fixture missing");
  const originalFrames = structuredClone(highlight.frames);
  const saves = await mockEditor(page, document);
  const uploadId = "33333333-3333-4333-8333-333333333333";
  const assetRef = `retro-asset:${uploadId}`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
  let uploadRequests = 0;
  await page.route("**/api/sites/site-1/assets", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    uploadRequests += 1;
    await uploadGate;
    await route.fulfill({ status: 201, json: { asset: { id: uploadId, url: assetRef, mimeType: "image/png", size: png.length, kind: "image", name: "retargeted-highlight-upload" } } });
  });
  await page.route(`**/api/sites/site-1/assets/${uploadId}/content`, (route) => route.fulfill({ contentType: "image/png", body: png }));
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const selection = win.getByRole("combobox", { name: "目前編輯角色" });
  const editor = win.locator(".ig-canonical-highlights");
  const row = editor.locator("article.ig-canonical-post").first();
  try {
    await openEditorGroup(win, "精選／合集");
    await expect(row.locator(".ig-post-toggle")).toContainText(highlight.title);
    const uploadControl = row.getByRole("group", { name: "精選圖片上傳" });
    await uploadControl.locator('input[type="file"]').setInputFiles({ name: "retargeted-highlight-upload.png", mimeType: "image/png", buffer: png });
    await expect.poll(() => uploadRequests).toBe(1);
    await expect(uploadControl).toHaveAttribute("aria-busy", "true");

    await openEditorGroup(win, "角色資料");
    await expandDetails(win, "角色管理");
    await win.getByLabel(/此角色仍被視窗／貼文使用/).selectOption("profile:bei");
    await win.getByRole("button", { name: "刪除並轉接" }).click();
    await expect(selection).toHaveValue("profile:bei");
    await expect.poll(() => saves.at(-1)?.document.entities.highlights.find((item) => item.id === highlight.id)?.ownerProfileId).toBe("profile:bei");
    expect(saves.at(-1)?.document.entities.profiles.some((profile) => profile.id === "profile:ig")).toBe(false);
    expect(saves.at(-1)?.document.entities.highlights.find((item) => item.id === highlight.id)?.frames).toEqual(originalFrames);

    const uploadResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/sites/site-1/assets"));
    releaseUpload();
    const response = await uploadResponse;
    expect(response.status()).toBe(201);
    expect(await response.finished()).toBeNull();

    // Save a distinct edit after the upload completes, so the final assertions
    // cannot pass by reading the earlier retarget save before its callback runs.
    await openEditorGroup(win, "精選／合集");
    const toggle = row.locator(".ig-post-toggle");
    await expect(toggle).toContainText(highlight.title);
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const savedTitle = "Bei confirmed after upload";
    await row.getByRole("textbox", { name: "精選標題", exact: true }).fill(savedTitle);
    await expect.poll(() => saves.at(-1)?.document.entities.highlights.find((item) => item.id === highlight.id)?.title).toBe(savedTitle);
    const saved = saves.at(-1)?.document;
    const retargeted = saved?.entities.highlights.find((item) => item.id === highlight.id);
    expect(retargeted).toMatchObject({ id: highlight.id, siteId: "site-1", ownerProfileId: "profile:bei", title: savedTitle });
    expect(retargeted?.frames).toEqual(originalFrames);
    expect(JSON.stringify(saved)).not.toContain(assetRef);
    await expect(row.locator(".ig-highlight-frame-row")).toHaveCount(originalFrames.length);
    await expect(row.getByRole("group", { name: "精選圖片上傳" })).toHaveAttribute("aria-busy", "false");
  } finally {
    releaseUpload();
  }
});

test("public OC details follow the active character and reset across sites", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const document = navigationDocument();
  const retro = document.entities.profiles.find((profile) => profile.id === "profile:ig");
  const bei = document.entities.profiles.find((profile) => profile.id === "profile:bei");
  const secret = document.entities.profiles.find((profile) => profile.id === "profile:secret");
  if (!retro || !bei || !secret) throw new Error("profile detail fixtures missing");
  retro.pronouns = "they/them";
  retro.worldTags = ["RETRO_SNOW_WORLD"];
  retro.customFields = [{ key: "陣營", value: "RETRO_ONLY_DETAIL" }];
  bei.pronouns = "she/her";
  bei.worldTags = ["BEI_OCEAN_WORLD"];
  bei.customFields = [{ key: "能力", value: "BEI_ONLY_DETAIL" }];
  secret.pronouns = "PRIVATE_OC_PRONOUNS";
  secret.worldTags = ["PRIVATE_OC_WORLD"];
  secret.customFields = [{ key: "秘密", value: "PRIVATE_OC_DETAIL" }];

  // Use a second valid site with the same entity IDs to catch state/lookup keys
  // that accidentally omit the site identity without constructing an invalid document.
  const other = migrateSiteDocumentV2(igDocument(), { siteId: "site-2" });
  if (!other.ok || other.version !== 2) throw new Error("second-site detail fixture failed");
  const otherProfile = other.document.entities.profiles[0];
  if (!otherProfile) throw new Error("second-site profile missing");
  otherProfile.pronouns = "xe/xem";
  otherProfile.worldTags = ["OTHER_SITE_WORLD"];
  otherProfile.customFields = [{ key: "另一網站", value: "OTHER_SITE_DETAIL" }];
  await mockPublic(page, document);
  await page.route("**/api/public/sites/other", (route) => route.fulfill({ json: { site: { username: "other", site_name: "Other Desk", published_document: other.document, published_version: 2, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const details = win.locator("summary").filter({ hasText: /^角色資料$/ }).locator("..");
  const expectDetails = async (pronouns: string, world: string, value: string, excluded: string[]) => {
    await expandDetails(win, "角色資料");
    await expect(details.getByText(pronouns, { exact: true })).toBeVisible();
    await expect(details.getByRole("list", { name: "世界標籤" })).toContainText(world);
    await expect(details.getByText(value, { exact: true })).toBeVisible();
    for (const text of [...excluded, "PRIVATE_OC_PRONOUNS", "PRIVATE_OC_WORLD", "PRIVATE_OC_DETAIL"]) {
      await expect(win.getByText(text, { exact: true })).toHaveCount(0);
    }
  };
  await expectDetails("they/them", "RETRO_SNOW_WORLD", "RETRO_ONLY_DETAIL", ["BEI_ONLY_DETAIL", "OTHER_SITE_DETAIL"]);
  await win.getByRole("button", { name: "所有角色" }).click();
  await expect(win.getByText("Secret Draft Character", { exact: true })).toHaveCount(0);
  await win.getByRole("button", { name: "Bei Original @bei", exact: true }).click();
  await expectDetails("she/her", "BEI_OCEAN_WORLD", "BEI_ONLY_DETAIL", ["RETRO_ONLY_DETAIL", "RETRO_SNOW_WORLD", "OTHER_SITE_DETAIL"]);
  await win.getByRole("button", { name: "所有角色" }).click();
  await win.getByRole("button", { name: "Retro User @retro", exact: true }).click();
  await expectDetails("they/them", "RETRO_SNOW_WORLD", "RETRO_ONLY_DETAIL", ["BEI_ONLY_DETAIL", "BEI_OCEAN_WORLD", "OTHER_SITE_DETAIL"]);

  await page.goto("/@other");
  await expectDetails("xe/xem", "OTHER_SITE_WORLD", "OTHER_SITE_DETAIL", ["RETRO_ONLY_DETAIL", "BEI_ONLY_DETAIL"]);
  await page.goto("/@demo");
  await expectDetails("they/them", "RETRO_SNOW_WORLD", "RETRO_ONLY_DETAIL", ["OTHER_SITE_DETAIL", "OTHER_SITE_WORLD", "BEI_ONLY_DETAIL"]);
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
    const outerTitle = width < 500 ? page.locator(".m-win-title") : win.locator(".retro-titlebar");
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
  const document = twoWindowDocument(), writes: string[] = [];
  document.windows.find((window) => window.id === "ig-two")!.defaultOpen = true;
  const before = structuredClone(document);
  page.on("request", (request) => { if (request.method() !== "GET") writes.push(request.url()); });
  await mockPublic(page, document);
  await page.goto("/@demo");
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const scroll = win.locator(".ig-scroll");
  await expect(win.locator(".ig-title strong")).toHaveText("retro");
  await win.getByRole("button", { name: "+ Follow" }).click();
  await expect(win.getByRole("button", { name: "✓ Following" })).toBeVisible();
  await win.getByRole("button", { name: "開啟貼文：Retro archive 0" }).click();
  let card = win.locator(".ig-card");
  await card.getByRole("button", { name: "讚", exact: true }).click();
  await expect(card.getByRole("button", { name: "讚", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  await win.getByRole("button", { name: "所有角色" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(win.getByRole("heading", { name: "此桌面的角色" })).toBeVisible();
  await expect(win.getByText("Secret Draft Character")).toHaveCount(0);
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("bei");
  await expect(win.getByRole("button", { name: "+ Follow" })).toBeVisible();
  await win.getByRole("button", { name: "開啟貼文：Bei timeline" }).click();
  await expect(win.locator(".ig-title strong")).toHaveText("貼文");
  card = win.locator(".ig-card");
  await expect(card.getByRole("button", { name: "讚", exact: true })).toHaveAttribute("aria-pressed", "false");
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

  await win.getByRole("button", { name: "所有角色" }).click();
  await win.getByRole("button", { name: "Bei Original @bei" }).click();
  const other = page.getByRole("dialog", { name: "Other.exe", exact: true });
  await other.getByRole("button", { name: "所有角色" }).click();
  await other.getByRole("button", { name: "Bei Original @bei" }).click();
  await expect(other.locator(".ig-title strong")).toHaveText("bei");
  await other.getByRole("button", { name: "最小化", exact: true }).click();
  await win.getByRole("button", { name: "關閉" }).click();
  await page.locator(".visitor-icon").filter({ hasText: "Instagram.exe" }).click();
  await expect(page.getByRole("dialog", { name: "Instagram.exe" }).locator(".ig-title strong")).toHaveText("retro");
  await page.locator(".visitor-taskbar .task-item").filter({ hasText: "Other.exe" }).click();
  await expect(other.locator(".ig-title strong")).toHaveText("bei");
  expect(writes).toEqual([]); expect(document).toEqual(before);
});

test("mobile visitor can browse the published OC directory without draft leakage or overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublic(page, navigationDocument());
  await page.goto("/@demo");
  await page.getByRole("button", { name: "Instagram.exe" }).click();
  const win = page.getByRole("dialog", { name: "Instagram.exe" });
  const scroll = win.locator(".ig-scroll");
  await expect.poll(() => scroll.evaluate((node) => { node.scrollTop = 180; return node.scrollTop; })).toBeGreaterThan(100);
  await win.getByRole("button", { name: "所有角色" }).evaluate((button) => (button as HTMLButtonElement).click());
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
