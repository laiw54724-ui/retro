import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";
import { igDocument } from "./ig-fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function canonical(raw: unknown): SiteDocumentV2Input {
  const migrated = migrateSiteDocumentV2(raw, { siteId: "site-1" });
  if (!migrated.ok) throw new Error(`fixture migration failed: ${JSON.stringify(migrated.diagnostics)}`);
  return migrated.document;
}

async function mockEditor(page: Page, draft: SiteDocumentV2Input) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, access_role: "owner" };
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    site.draft_document = route.request().postDataJSON().document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:00:00Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  return site;
}

async function mockPublic(page: Page, document: SiteDocument) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00Z" } } }));
}

for (const width of [1440, 320]) {
  test(`OC custom field keeps focus while typing and after deleting an earlier row at ${width}px`, async ({ page }) => {
    const draft = canonical(igDocument());
    draft.entities.profiles[0].customFields = [{ key: "First", value: "one" }, { key: "Role", value: "two" }];
    const site = await mockEditor(page, draft);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/editor/site-1");
    if (width < 768) {
      await page.getByRole("button", { name: "Instagram.exe", exact: true }).click();
      await enterContentEditor(page);
    }
    const profile = page.locator(".ig-profile-editor:visible");
    await profile.getByRole("button", { name: "展開角色設定" }).click();
    const names = profile.getByPlaceholder("欄位名稱");
    await names.nth(1).focus();
    await names.nth(1).press("End");
    await page.keyboard.type("XYZ", { delay: 30 });
    await expect(names.nth(1)).toHaveValue("RoleXYZ");
    expect(await names.nth(1).evaluate((input) => input === document.activeElement)).toBe(true);
    await profile.getByRole("button", { name: "刪除自訂欄位 First" }).click();
    await names.first().fill("職業");
    await expect(names.first()).toHaveValue("職業");
    // unfinished IG input is committed when the field is left (blur), not on every keystroke
    await names.first().blur();
    await expect.poll(() => site.draft_document.entities.profiles[0].customFields).toEqual([{ key: "職業", value: "two" }]);
    await page.reload();
    if (width < 768) {
      await page.getByRole("button", { name: "Instagram.exe", exact: true }).click();
      await enterContentEditor(page);
    }
    const reloaded = page.locator(".ig-profile-editor:visible");
    await reloaded.getByRole("button", { name: "展開角色設定" }).click();
    await expect(reloaded.getByPlaceholder("欄位名稱")).toHaveValue("職業");
  });

  test(`Moodboard keyboard selection follows the second element at ${width}px`, async ({ page }) => {
    const board = makeWindow("moodboard");
    if (board.type !== "moodboard") throw new Error("moodboard fixture mismatch");
    board.id = "board";
    board.content.elements = ["First", "Second"].map((content, index) => ({ id: `text-${index}`, kind: "text", content, color: "#111111", fontSize: 32, align: "left", x: 40 + index * 260, y: 70, width: 240, height: 150, zOrder: index, locked: false }));
    await mockEditor(page, canonical({ ...documentFixture, windows: [board] }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/editor/site-1");
    if (width < 768) {
      await page.getByRole("button", { name: "Moodboard.exe", exact: true }).click();
      await enterContentEditor(page);
    }
    const dialog = page.getByRole("dialog", { name: "Moodboard.exe" });
    const second = dialog.getByRole("button", { name: "選取文字：Second" });
    await second.focus();
    await page.keyboard.press("Enter");
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("textbox", { name: "文字", exact: true })).toHaveValue("Second");
    const first = dialog.getByRole("button", { name: "選取文字：First" });
    await first.focus();
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-pressed", "true");
  });

  test(`Gallery lightbox cycles focus, changes image and restores opener at ${width}px`, async ({ page }, testInfo) => {
    const gallery = makeWindow("gallery");
    if (gallery.type !== "gallery") throw new Error("gallery fixture mismatch");
    gallery.id = "gallery";
    gallery.title = "Gallery.exe";
    gallery.content.images = ["First", "Second"].map((title, index) => ({ id: `image-${index}`, src: null, srcUrl: "", title, caption: "", href: "" }));
    await mockPublic(page, { ...structuredClone(documentFixture), windows: [gallery] } as SiteDocument);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/@demo");
    if (width < 768) await page.locator(".visitor-mobile").getByRole("button", { name: "Gallery.exe" }).click();
    const dialog = page.getByRole("dialog", { name: "Gallery.exe" });
    const opener = dialog.getByRole("button", { name: "放大 First" });
    await opener.click();
    const lightbox = page.getByRole("dialog", { name: "圖片檢視" });
    await expect(lightbox).toBeVisible();
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath("gallery-lightbox-desktop.png") });
    await lightbox.getByRole("button", { name: "下一張" }).focus();
    await page.keyboard.press("Tab");
    expect(await lightbox.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await lightbox.getByRole("button", { name: "關閉" }).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await lightbox.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(lightbox.locator(".lb-cap strong")).toHaveText("Second");
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
    await expect.poll(() => opener.evaluate((node) => node === document.activeElement)).toBe(true);
    await expect(dialog).toBeVisible();
  });
}

test("single-image Gallery has no previous or next action", async ({ page }) => {
  const gallery = makeWindow("gallery");
  if (gallery.type !== "gallery") throw new Error("gallery fixture mismatch");
  gallery.id = "gallery";
  gallery.title = "Gallery.exe";
  gallery.content.images = [{ id: "only", src: null, srcUrl: "", title: "Only", caption: "", href: "" }];
  await mockPublic(page, { ...structuredClone(documentFixture), windows: [gallery] } as SiteDocument);
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "Gallery.exe" }).click();
  await page.getByRole("dialog", { name: "Gallery.exe" }).getByRole("button", { name: "放大 Only" }).click();
  const lightbox = page.getByRole("dialog", { name: "圖片檢視" });
  await expect(lightbox.getByRole("button", { name: "上一張" })).toBeDisabled();
  await expect(lightbox.getByRole("button", { name: "下一張" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
});

for (const [width, columns] of [[320, 5], [320, 8], [320, 12], [375, 12], [430, 12]] as const) {
  test(`Minesweeper ${columns} columns are reachable at ${width}px`, async ({ page }, testInfo) => {
    const mine = makeWindow("minesweeper");
    if (mine.type !== "minesweeper") throw new Error("minesweeper fixture mismatch");
    mine.id = "mines";
    mine.defaultOpen = true;
    mine.content.columns = columns;
    await mockPublic(page, { ...structuredClone(documentFixture), windows: [mine] } as SiteDocument);
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/@demo");
    await page.locator(".visitor-mobile").getByRole("button", { name: mine.title }).click();
    const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: mine.title });
    const scroller = dialog.locator(".minesweeper-board-scroll");
    await expect(scroller).toBeVisible();
    await dialog.getByRole("gridcell").first().focus();
    for (let index = 1; index < columns; index++) await page.keyboard.press("ArrowRight");
    const last = dialog.getByRole("gridcell").nth(columns - 1);
    expect(await last.evaluate((node) => node === document.activeElement)).toBe(true);
    const geometry = await scroller.evaluate((node) => ({ right: node.getBoundingClientRect().right, scrollLeft: node.scrollLeft }));
    const lastBox = await last.boundingBox();
    expect(lastBox).not.toBeNull();
    expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(geometry.right + 1);
    if (width === 320 && columns === 12) expect(geometry.scrollLeft).toBeGreaterThan(0);
    if (width === 320 && columns === 12) await page.screenshot({ path: testInfo.outputPath("minesweeper-12-columns-320.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
