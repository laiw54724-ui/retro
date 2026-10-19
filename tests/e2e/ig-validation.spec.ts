import { expect, test, type Page } from "@playwright/test";
import { duplicateProfile, migrateSiteDocumentV2, type SiteDocumentV2Input } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

async function openEditor(page: Page, width = 1400) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const duplicated = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: "site-1", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("duplicate fixture");
  let saved: SiteDocumentV2Input = duplicated.document;
  saved.entities.profiles[0].customFields = [{ key: "Role", value: "Writer" }];
  saved.entities.profiles[0].worldTags = ["First"];
  saved.entities.profiles[0].otherFollowerCount = 12;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  let saves = 0;
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "D", draft_document: saved, draft_version: saves + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; saves++; return route.fulfill({ json: { version: saves + 1, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯內容" }).click(); }
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  return { win, saved: () => saved, profile: () => saved.entities.profiles[0], saves: () => saves };
}

const identity = (win: ReturnType<Page["locator"]>) => win.getByRole("textbox", { name: "Handle", exact: true });
const nameField = (win: ReturnType<Page["locator"]>) => win.getByRole("textbox", { name: "顯示名稱", exact: true });

for (const width of [1400, 390]) {
  test(`clear and retype identity without warnings or invalid autosaves at ${width}px`, async ({ page }, testInfo) => {
    const site = await openEditor(page, width); const { win } = site;
    const handle = identity(win);
    await handle.fill("");
    await expect(handle).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await handle.pressSequentially("new-");
    await expect(handle).toHaveValue("new-");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(site.profile().handle).toBe("retro");
    await handle.pressSequentially("name");
    await handle.press("Enter");
    await expect.poll(() => site.profile().handle).toBe("new-name");
    const name = nameField(win);
    await name.fill("");
    await expect(name).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await name.pressSequentially("New Display Name ");
    await expect(name).toHaveValue("New Display Name ");
    expect(site.profile().displayName).toBe("Retro User");
    await name.press("Tab");
    await expect.poll(() => site.profile().displayName).toBe("New Display Name");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`identity-${width}.png`) });
    await page.reload();
    if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯內容" }).click(); }
    await expect(identity(win)).toHaveValue("new-name");
    await expect(nameField(win)).toHaveValue("New Display Name");
  });
}

test("required and duplicate errors are inline after commit; Escape and cancel restore saved values", async ({ page }) => {
  const site = await openEditor(page); const { win } = site;
  await identity(win).fill("other");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await identity(win).press("Enter");
  await expect(win.getByRole("alert")).toContainText("此 Handle 已被使用");
  await expect(identity(win)).toHaveValue("other");
  expect(site.profile().handle).toBe("retro");
  await identity(win).press("Escape");
  await expect(identity(win)).toHaveValue("retro");
  await nameField(win).fill("");
  await nameField(win).press("Tab");
  await expect(win.getByRole("alert")).toContainText("此欄位不可空白");
  await win.getByRole("button", { name: "取消編輯顯示名稱", exact: true }).click();
  await expect(nameField(win)).toHaveValue("Retro User");
  await nameField(win).fill("Do not save");
  await win.getByRole("button", { name: "取消編輯顯示名稱", exact: true }).click();
  await expect(nameField(win)).toHaveValue("Retro User");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(site.profile().displayName).toBe("Retro User");
});

test("composition Enter does not commit; completed IME text commits on blur", async ({ page }) => {
  const site = await openEditor(page); const input = nameField(site.win);
  await input.dispatchEvent("compositionstart");
  await input.fill("名");
  await input.press("Enter");
  await expect(input).toHaveValue("名");
  expect(site.profile().displayName).toBe("Retro User");
  await input.fill("名字 空格");
  await input.dispatchEvent("compositionend", { data: "名字 空格" });
  expect(site.profile().displayName).toBe("Retro User");
  await input.press("Tab");
  await expect.poll(() => site.profile().displayName).toBe("名字 空格");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("invalid drafts belong to their profile and survive switching; undo clears them", async ({ page }) => {
  const site = await openEditor(page); const { win } = site;
  await identity(win).fill("unfinished-");
  const switcher = win.getByRole("region", { name: "角色切換器" }).locator("select").first();
  await switcher.selectOption("other");
  await expect(identity(win)).toHaveValue("other");
  await nameField(win).fill("Other renamed");
  await nameField(win).press("Enter");
  await expect.poll(() => site.saved().entities.profiles[1].displayName).toBe("Other renamed");
  await switcher.selectOption("profile:ig");
  await expect(identity(win)).toHaveValue("unfinished-");
  await expect(win.getByRole("alert")).toContainText("開頭與結尾");
  expect(site.profile().handle).toBe("retro");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await switcher.selectOption("profile:ig");
  await expect(identity(win)).toHaveValue("retro");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("tag separators and custom-field names remain editable until commit", async ({ page }) => {
  const site = await openEditor(page); const { win } = site;
  await win.getByRole("button", { name: "展開角色設定" }).click();
  const tags = win.getByLabel("世界標籤（以逗號分隔）", { exact: true });
  await tags.fill("First, ");
  await tags.pressSequentially("Second tag");
  await expect(tags).toHaveValue("First, Second tag");
  expect(site.profile().worldTags).toEqual(["First"]);
  await tags.press("Enter");
  await expect.poll(() => site.profile().worldTags).toEqual(["First", "Second tag"]);
  const field = win.getByPlaceholder("欄位名稱", { exact: true });
  await field.fill(""); await field.pressSequentially("New field name ");
  await expect(field).toHaveValue("New field name ");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await field.press("Enter");
  await expect.poll(() => site.profile().customFields[0].key).toBe("New field name");
  await field.fill("");
  const switcher = win.getByRole("region", { name: "角色切換器" }).locator("select").first();
  await switcher.selectOption("other"); await switcher.selectOption("profile:ig");
  await expect(field).toHaveValue("");
  await win.getByRole("button", { name: "取消編輯欄位名稱", exact: true }).click();
  await expect(field).toHaveValue("New field name");
});

test("clearing structured counts keeps the saved number and rejects decimals inline", async ({ page }) => {
  const site = await openEditor(page); const { win } = site;
  await win.getByRole("tab", { name: "互動", exact: true }).click();
  const count = win.getByRole("spinbutton", { name: "其他粉絲數", exact: true });
  await count.fill("");
  await expect(count).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(site.profile().otherFollowerCount).toBe(12);
  await count.press("Tab");
  await expect(win.getByRole("alert")).toContainText("整數");
  await count.fill("1.5"); await count.press("Enter");
  await expect(win.getByRole("alert")).toContainText("整數");
  await count.fill("27"); await count.press("Enter");
  await expect.poll(() => site.profile().otherFollowerCount).toBe(27);
});

test("incomplete links stay local, unsafe links fail inline and valid links save", async ({ page }) => {
  const site = await openEditor(page); const { win } = site;
  const link = win.getByLabel("個人連結網址", { exact: true });
  await link.fill("https:");
  await expect(link).toHaveValue("https:");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(site.profile().linkUrl).toBe("https://example.com");
  await link.press("Tab");
  await expect(win.getByRole("alert")).toContainText("完整");
  await link.fill("javascript:alert(1)"); await link.press("Enter");
  await expect(win.getByRole("alert")).toContainText("完整");
  await link.fill("https://example.com/new"); await link.press("Enter");
  await expect.poll(() => site.profile().linkUrl).toBe("https://example.com/new");
});

test("an IME blur waits for composition to finish before applying", async ({ page }) => {
  const site = await openEditor(page); const input = nameField(site.win);
  await input.dispatchEvent("compositionstart");
  await input.fill("完成的名字");
  await input.evaluate((node) => node.blur());
  expect(site.profile().displayName).toBe("Retro User");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await input.dispatchEvent("compositionend", { data: "完成的名字" });
  await expect.poll(() => site.profile().displayName).toBe("完成的名字");
});

test("post-count drafts survive collapsing their editor without saving zero", async ({ page }) => {
  const site = await openEditor(page); const { win } = site;
  await win.getByRole("tab", { name: "貼文", exact: true }).click();
  const toggle = win.locator(".ig-canonical-posts .ig-post-toggle").first();
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const details = win.locator(".ig-post-social-details").filter({ has: page.locator(".ig-post-social") }).first();
  await details.locator("summary").click();
  const count = win.getByRole("spinbutton", { name: "其他虛構喜歡人數", exact: true }).first();
  const original = await count.inputValue();
  await count.fill("");
  await toggle.click(); await toggle.click();

  await expect(count).toHaveValue("");
  await win.getByRole("button", { name: "取消編輯其他虛構喜歡人數", exact: true }).click();
  await expect(count).toHaveValue(original);
  expect(site.saved().entities.posts[0].otherLikeCount).toBe(Number(original));
});

test("language switching keeps the draft and translates its inline error on mobile", async ({ page }, testInfo) => {
  const site = await openEditor(page, 390); const { win } = site;
  await identity(win).fill("other");
  await identity(win).press("Enter");
  await page.locator(".editor-topbar").getByTestId("language-switcher").selectOption("en");
  await expect(identity(win)).toHaveValue("other");
  await expect(win.getByRole("alert")).toContainText("already in use");
  expect(site.profile().handle).toBe("retro");
  await expect(win.getByRole("button", { name: "Cancel edit to Handle", exact: true })).toBeVisible();
  expect(await win.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("inline-error-en-390.png") });
  await win.getByRole("button", { name: "Cancel edit to Handle", exact: true }).click();
  await expect(identity(win)).toHaveValue("retro");
});
