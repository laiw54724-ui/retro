import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeLink, SiteDocumentSchema, type SiteDocument, type VersionedSiteDocumentInput } from "../../packages/shared/src";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function editorDocument(): SiteDocument {
  const document = SiteDocumentSchema.parse(structuredClone(documentFixture));
  document.windows[0].layout.desktop = { ...document.windows[0].layout.desktop, x: 20, y: 20, w: 400, h: 640, z: 2 };
  document.windows[1].layout.desktop = { ...document.windows[1].layout.desktop, x: 435, y: 35, w: 350, h: 580, z: 1 };
  return document;
}

async function mockEditor(page: Page, document = editorDocument(), width = 1440) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: document as VersionedSiteDocumentInput, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  const saves: VersionedSiteDocumentInput[] = [];
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: VersionedSiteDocumentInput };
    site.draft_document = structuredClone(body.document);
    site.draft_version += 1;
    saves.push(site.draft_document);
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:01:00.000Z" } });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  return { saves, savedDocument: () => site.draft_document };
}

async function mockPublic(page: Page, document: VersionedSiteDocumentInput) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 2, published_at: "2026-10-17T00:01:00.000Z" } } }));
}

async function expectContained(surface: Locator) {
  await expect.poll(() => surface.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

async function expectLastControlAboveDone(dialog: Locator, control: Locator) {
  const body = dialog.locator(".m-win-body");
  await body.evaluate((element) => { element.scrollTop = element.scrollHeight; element.querySelector(".link-editor-list")?.scrollTo(0, 99999); element.querySelector(".about-editor-scroll")?.scrollTo(0, 99999); });
  const controlBox = await control.boundingBox();
  const bodyBox = await body.boundingBox();
  // The finish-editing action now lives in the window's title bar, so it can never cover a control; the last control
  // must still be fully reachable inside the scrolled content area.
  const done = dialog.getByRole("button", { name: "完成", exact: true });
  await expect(done).toBeVisible();
  const doneBox = await done.boundingBox();
  if (!controlBox || !doneBox || !bodyBox) throw new Error("mobile control is missing");
  expect(doneBox.y + doneBox.height).toBeLessThanOrEqual(bodyBox.y + 1);
  expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height + 1);
}

test("about groups retain edited fields, undo deletion, save, reload and render on the public page", async ({ page }) => {
  const { saves, savedDocument } = await mockEditor(page);
  const about = page.getByRole("dialog", { name: "About.exe" });
  await about.getByLabel("暱稱", { exact: true }).fill("被子的創作桌面");
  await about.getByLabel("簡介", { exact: true }).fill("網站、角色與日常創作。\n歡迎來到我的桌面。");
  await about.getByLabel("引言", { exact: true }).fill("把喜歡的事慢慢做好。");
  await about.getByLabel("橫幅文字", { exact: true }).fill("作品整理中");
  await about.getByLabel("欄位名稱", { exact: true }).fill("創作類型");
  await about.getByLabel("欄位內容", { exact: true }).fill("網站與角色故事");
  await about.getByLabel("＋ 新增欄位", { exact: true }).fill("喜歡的作品");
  await about.getByLabel("＋ 新增欄位", { exact: true }).press("Enter");
  await about.getByLabel("欄位名稱", { exact: true }).last().fill("喜歡的作品");
  await about.getByLabel("欄位內容", { exact: true }).last().fill("長篇故事");
  await about.getByRole("button", { name: "刪除欄位", exact: true }).first().click();
  await expect(about.getByLabel("欄位名稱", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(about.getByLabel("欄位名稱", { exact: true })).toHaveCount(2);
  await expect(about.getByLabel("欄位內容", { exact: true }).first()).toHaveValue("網站與角色故事");

  await about.getByLabel("＋ 新增社群", { exact: true }).fill("https://example.com/portfolio");
  await about.getByLabel("＋ 新增社群", { exact: true }).press("Enter");
  await about.getByLabel("社群名稱", { exact: true }).fill("作品集");
  await about.getByLabel("社群網址", { exact: true }).fill("https://example.com/portfolio");
  await expect(about.getByLabel("暱稱", { exact: true })).toHaveValue("被子的創作桌面");
  await expect.poll(() => {
    const window = saves.at(-1)?.windows.find((candidate) => candidate.id === "about");
    return window?.type === "about" && window.content.fields.length === 2 && window.content.socials[0]?.url === "https://example.com/portfolio";
  }).toBe(true);

  await page.reload();
  await expect(about.getByLabel("暱稱", { exact: true })).toHaveValue("被子的創作桌面");
  await expect(about.getByLabel("引言", { exact: true })).toHaveValue("把喜歡的事慢慢做好。");
  await expect(about.getByLabel("欄位內容", { exact: true }).first()).toHaveValue("網站與角色故事");

  await mockPublic(page, savedDocument());
  await page.goto("/@demo");
  const publicAbout = page.locator(".visitor-desktop").getByRole("dialog", { name: "About.exe" });
  await expect(publicAbout.getByText("創作類型: 網站與角色故事", { exact: true })).toBeVisible();
  await expect(publicAbout.getByText("作品整理中", { exact: true })).toBeVisible();
  await expect(publicAbout.getByRole("link", { name: "作品集", exact: true })).toHaveAttribute("href", "https://example.com/portfolio");
  await expect(publicAbout.getByRole("textbox")).toHaveCount(0);
});

test("rapid edits to the same about field in different windows remain separate undo steps", async ({ page }) => {
  const document = editorDocument();
  const second = structuredClone(document.windows[0]);
  second.id = "about-two";
  second.title = "Second About.exe";
  second.layout.desktop = { ...second.layout.desktop, x: 435, z: 1 };
  document.windows = [document.windows[0], second];
  await mockEditor(page, document);
  const first = page.getByRole("dialog", { name: "About.exe", exact: true }).getByLabel("暱稱", { exact: true });
  const other = page.getByRole("dialog", { name: "Second About.exe", exact: true }).getByLabel("暱稱", { exact: true });
  await first.fill("第一張名片");
  await other.fill("第二張名片");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(other).toHaveValue("Demo User");
  await expect(first).toHaveValue("第一張名片");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(other).toHaveValue("第二張名片");
});

test("link panels retain target drafts through cancel, undo and reload", async ({ page }) => {
  const { saves } = await mockEditor(page);
  const links = page.getByRole("dialog", { name: "Links.exe" });
  const card = links.locator('[data-link-id="link-1"]');
  const open = () => card.locator(".link-destination-trigger").click();
  await open();
  await card.getByLabel("連結網址", { exact: true }).fill("javascript:alert(1)");
  await expect(card.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
  await card.getByLabel("連結網址", { exact: true }).fill("https://example.com/oc");
  await card.getByRole("button", { name: "完成", exact: true }).click();
  await open();
  await card.getByRole("radio", { name: "打開我桌面上的視窗" }).check();
  await card.getByRole("button", { name: "About.exe", exact: true }).click();
  await card.getByRole("button", { name: "完成", exact: true }).click();
  await expect(card.getByText("開啟視窗：About.exe", { exact: true })).toBeVisible();
  await open();
  await card.getByRole("radio", { name: "開啟網址", exact: true }).check();
  await expect(card.getByLabel("連結網址", { exact: true })).toHaveValue("https://example.com/oc");
  await card.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card.getByText("開啟視窗：About.exe", { exact: true })).toBeVisible();
  await card.getByLabel("按鈕文字", { exact: true }).fill("名片入口");
  await links.getByRole("button", { name: "＋ 空白按鈕" }).click();
  await expect(links.getByText("尚未設定完整網址", { exact: true })).toBeVisible();
  await card.getByLabel("按鈕文字", { exact: true }).press("Alt+ArrowDown");
  await expect(links.locator(".link-editor-card").last()).toHaveAttribute("data-link-id", "link-1");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(links.locator(".link-editor-card").first()).toHaveAttribute("data-link-id", "link-1");
  await expect.poll(() => {
    const window = saves.at(-1)?.windows.find((candidate) => candidate.id === "links");
    return window?.type === "links" && window.content.links[0]?.label === "名片入口" && window.content.links[0]?.windowId === "about" && window.content.links[0]?.url === "https://example.com/oc";
  }).toBe(true);
  await page.reload();
  await expect(card.getByText("開啟視窗：About.exe", { exact: true })).toBeVisible();
  await open();
  await expect(card.getByRole("button", { name: "✓ About.exe", exact: true })).toHaveAttribute("aria-pressed", "true");
});

for (const width of [320, 375, 390, 430]) {
  test(`about and links groups contain long text in a ${width}px mobile editor`, async ({ page }) => {
    const document = editorDocument();
    const about = document.windows[0];
    const links = document.windows[1];
    if (about.type !== "about" || links.type !== "links") throw new Error("invalid UX fixture");
    about.content.nickname = "LongNickname".repeat(10);
    about.content.quote = "AReallyLongQuoteWithoutSpaces".repeat(12);
    about.content.banner = "長篇創作橫幅".repeat(30);
    about.content.fields[0].value = "LongCustomField".repeat(25);
    about.content.socials = [{ id: "social-long", label: "長篇作品集名稱".repeat(10), url: `https://example.com/${"portfolio".repeat(80)}` }];
    links.content.links[0].label = "LongLinkLabel".repeat(12);
    links.content.links[0].url = `https://example.com/${"destination".repeat(90)}`;
    await mockEditor(page, document, width);
    await page.locator(".m-icon").getByText("About.exe", { exact: true }).click();
    const aboutDialog = page.getByRole("dialog", { name: "About.exe", exact: true });
    const editAbout = aboutDialog.locator("..").getByRole("button", { name: "編輯內容", exact: true });
    await expect(editAbout).toBeVisible();
    await editAbout.click();
    await expectContained(aboutDialog.locator(".about-editor"));
    await expectContained(aboutDialog.locator(".about-editor"));
    await expectContained(aboutDialog.locator(".m-win-body"));
    await expectLastControlAboveDone(aboutDialog, aboutDialog.getByLabel("橫幅文字", { exact: true }));
    await aboutDialog.locator("..").getByRole("button", { name: "完成", exact: true }).click();
    await expectContained(aboutDialog.locator(".about-view"));
    await aboutDialog.getByRole("button", { name: "關閉", exact: true }).click();
    await page.locator(".m-icon").getByText("Links.exe", { exact: true }).click();
    const linksDialog = page.getByRole("dialog", { name: "Links.exe", exact: true });
    const editLinks = linksDialog.locator("..").getByRole("button", { name: "編輯內容", exact: true });
    await expect(editLinks).toBeVisible();
    await editLinks.click();
    await linksDialog.getByRole("button", { name: /^設定連結/ }).click();
    await linksDialog.getByRole("button", { name: "取消", exact: true }).click();
    await expectContained(linksDialog.locator(".links-editor"));
    await expectContained(linksDialog.locator(".m-win-body"));
    await expectLastControlAboveDone(linksDialog, linksDialog.getByRole("button", { name: "＋ 空白按鈕" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}

for (const width of [1280, 375]) {
  test(`public links identify missing and empty targets and open a valid window at ${width}px`, async ({ page }) => {
    const document = editorDocument();
    const about = document.windows[0];
    const links = document.windows[1];
    if (links.type !== "links") throw new Error("invalid links fixture");
    about.defaultOpen = false;
    links.defaultOpen = true;
    links.content.links = [
      makeLink({ id: "internal", label: "開啟名片", target: "window", windowId: "about" }),
      makeLink({ id: "missing", label: "已移除的作品", target: "window", windowId: "deleted" }),
      makeLink({ id: "empty", label: "建置中的網站", target: "url", url: "https://" }),
    ];
    await mockPublic(page, document);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/@demo");
    const surface = page.locator(width < 768 ? ".visitor-mobile" : ".visitor-desktop");
    if (width < 768) await surface.getByRole("button", { name: "Links.exe", exact: true }).click();
    const linksDialog = surface.getByRole("dialog", { name: "Links.exe", exact: true });
    await expect(linksDialog.getByRole("button", { name: "已移除的作品", exact: true })).toBeDisabled();
    await expect(linksDialog.getByRole("button", { name: "建置中的網站", exact: true })).toBeDisabled();
    await expect(linksDialog.getByText("目標視窗已不存在", { exact: true })).toBeVisible();
    await linksDialog.getByRole("button", { name: "開啟名片", exact: true }).click();
    await expect(surface.getByRole("dialog", { name: "About.exe", exact: true })).toBeVisible();
  });
}
