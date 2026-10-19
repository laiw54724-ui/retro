import { expect, test, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
test.use({ screenshot: "on" });

const SECRET = "UNPUBLISHED_GUESTBOOK_SUBMISSION";

function guestbookDocument(enabled = true): SiteDocument {
  const guestbook = makeWindow("guestbook");
  guestbook.id = "guestbook";
  guestbook.title = "Guestbook.exe";
  guestbook.defaultOpen = true;
  guestbook.content.enabled = enabled;
  guestbook.layout.desktop = { ...guestbook.layout.desktop, x: 30, y: 20, w: 500, h: 650, z: 1 };
  return { ...structuredClone(documentFixture), windows: [guestbook] } as SiteDocument;
}

async function setup(page: Page, width: number, role: "owner" | "viewer" = "owner", enabled = true) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const loaded = migrateSiteDocumentV2(guestbookDocument(enabled), { siteId: "site-preview" });
  if (!loaded.ok || loaded.version !== 2) throw new Error("Guestbook fixture migration failed");
  const document = loaded.document;
  const site = { id: "site-preview", username: "demo", site_name: "Demo", draft_document: document, draft_version: 1, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z", updated_at: "2026-10-17T00:00:00.000Z", access_role: role };
  let requests = 0;
  let saves = 0;
  await page.route("**/api/sites/site-preview", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-preview/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-preview/draft", (route) => { saves += 1; return route.fulfill({ json: { version: 2, updatedAt: site.updated_at } }); });
  await page.route("**/api/**/guestbook**", (route) => {
    requests += 1;
    return route.fulfill({ json: { entries: [{ id: "secret", displayName: SECRET, body: SECRET, status: "pending", createdAt: site.updated_at }] } });
  });
  await page.goto("/editor/site-preview");
  await expect(page.locator(role === "owner" ? ".editor-topbar" : ".draft-viewer-body")).toBeVisible();
  // Let legitimate owner-editor moderation reads finish before measuring preview activity.
  if (role === "owner" && width >= 768) await expect(page.locator(".guestbook-moderation")).toContainText(SECRET);
  const before = requests;
  if (role === "owner") {
    if (width >= 768) await page.getByRole("button", { name: /訪客預覽/ }).first().click();
    else await page.locator(".m-tool", { hasText: "預覽" }).first().click();
  }
  const root = page.locator(role === "owner" ? ".preview-overlay" : ".draft-viewer-body");
  await expect(root).toBeVisible();
  if (width < 768) await root.getByRole("button", { name: "Guestbook.exe", exact: true }).click();
  return { root, requests: () => requests - before, saves: () => saves };
}

for (const width of [1280, 320]) {
  for (const role of ["owner", "viewer"] as const) {
    test(`${role} guestbook preview at ${width}px uses only simulation`, async ({ page }) => {
      const backend = await setup(page, width, role);
      const { root } = backend;
      await expect(root.locator(".guestbook-app")).toBeVisible();
      expect(backend.requests()).toBe(0);
      await expect(root.locator(".guestbook-preview-notice")).toContainText("模擬");
      await expect(root).not.toContainText(SECRET);
      await expect(root.locator(".guestbook-moderation, .guestbook-settings")).toHaveCount(0);
      const name = root.getByRole("textbox", { name: "暱稱（不驗證身分）" });
      const body = root.getByRole("textbox", { name: "留言", exact: true });
      await name.fill("Local visitor");
      await body.fill("LOCAL_PENDING_ONLY");
      await root.getByRole("button", { name: "送出審核" }).click();
      await expect(root.locator(".guestbook-status")).toContainText("模擬");
      await expect(name).toHaveValue("");
      await expect(body).toHaveValue("");
      await expect(root.locator(".guestbook-list")).not.toContainText("LOCAL_PENDING_ONLY");
      await root.getByRole("button", { name: "檢舉", exact: true }).click();
      await expect(root.locator(".guestbook-status")).toContainText("模擬");
      if (role === "owner") {
        await root.getByRole("button", { name: "目前草稿", exact: true }).click();
        if (width < 768) {
          // Source switching keeps the current app open.
          await expect(root.locator(".guestbook-app")).toBeVisible();
        }
        await expect(root.locator(".guestbook-preview-notice")).toBeVisible();
        await expect(root).not.toContainText(SECRET);
      }
      await page.waitForTimeout(1300);
      expect(backend.requests()).toBe(0);
      expect(backend.saves()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
  }
}

for (const width of [1280, 390]) {
  test(`guestbook preview at ${width}px closes nested layers, resets local state, and Back leaves the editor intact`, async ({ page }) => {
    const backend = await setup(page, width);
    const { root } = backend;
    const url = page.url();
    await root.getByRole("textbox", { name: "留言", exact: true }).fill("UNSENT_LOCAL_TEXT");
    if (width >= 768) {
      await root.getByRole("button", { name: "開始", exact: true }).click();
      await expect(root.locator(".start-menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(root.locator(".start-menu")).toHaveCount(0);
    } else {
      await page.keyboard.press("Escape");
      await expect(root.locator(".guestbook-app")).toHaveCount(0);
      const icon = root.getByRole("button", { name: "Guestbook.exe", exact: true });
      await expect(icon).toBeFocused();
      await icon.click();
      await expect(root.getByRole("textbox", { name: "留言", exact: true })).toHaveValue("");
    }
    await expect(root).toBeVisible();
    await page.goBack();
    await expect(root).toHaveCount(0);
    expect(page.url()).toBe(url);
    const opener = width >= 768 ? page.getByRole("button", { name: /訪客預覽/ }).first() : page.locator(".m-tool", { hasText: "預覽" }).first();
    await expect(opener).toBeFocused();
    await opener.click();
    if (width < 768) await root.getByRole("button", { name: "Guestbook.exe", exact: true }).click();
    await expect(root.getByRole("textbox", { name: "留言", exact: true })).toHaveValue("");
    if (width < 768) {
      await page.keyboard.press("Escape");
      await expect(root).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(root).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.waitForTimeout(1300);
    expect(backend.requests()).toBe(0);
    expect(backend.saves()).toBe(0);
    if (width >= 768) await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
  });

  test(`home sample with a guestbook at ${width}px uses explicit simulation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let requests = 0;
    await page.route("**/api/**/guestbook**", (route) => { requests += 1; return route.fulfill({ json: { entries: [] } }); });
    // Existing built-in samples contain no guestbook. Substitute only the sample document's windows;
    // exercise the real LandingPage -> VisitorPreview sample path and unchanged renderer/context wiring.
    await page.route("**/src/pages/LandingPage.tsx*", async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      expect(source).toContain("localizeDefaults(createDemoDocument(demo))");
      return route.fulfill({ response, body: source.replace("localizeDefaults(createDemoDocument(demo))", `localizeDefaults({...createDemoDocument(demo), windows: ${JSON.stringify(guestbookDocument().windows)}})`) });
    });
    await page.goto("/");
    await page.locator(".example-card").first().click();
    const root = page.locator(".preview-overlay");
    await expect(root).toHaveAttribute("data-preview-source", "sample");
    if (width < 768) await root.getByRole("button", { name: "Guestbook.exe", exact: true }).click();
    await expect(root.locator(".guestbook-preview-notice")).toBeVisible();
    await root.getByRole("textbox", { name: "暱稱（不驗證身分）" }).fill("Sample visitor");
    await root.getByRole("textbox", { name: "留言", exact: true }).fill("Sample only");
    await root.getByRole("button", { name: "送出審核" }).click();
    await expect(root.locator(".guestbook-status")).toContainText("模擬");
    await root.getByRole("button", { name: "檢舉", exact: true }).click();
    await expect(root.locator(".guestbook-status")).toContainText("未傳送");
    expect(requests).toBe(0);
  });
}

test("disabled guestbook preview explains simulation but offers no submit or report", async ({ page }) => {
  const backend = await setup(page, 1280, "owner", false);
  await expect(backend.root.locator(".guestbook-preview-notice")).toBeVisible();
  await expect(backend.root.getByText("留言簿尚未開放")).toBeVisible();
  await expect(backend.root.locator(".guestbook-form, .guestbook-list")).toHaveCount(0);
  expect(backend.requests()).toBe(0);
});

test("real public guestbook still loads approved entries and sends reports after leaving preview", async ({ page }) => {
  const backend = await setup(page, 1280);
  const document = guestbookDocument();
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  let reports = 0;
  await page.route("**/api/public/sites/demo/guestbook", (route) => route.fulfill({ json: { entries: [{ id: "approved", displayName: "Real approved visitor", body: "PUBLIC_MESSAGE", status: "approved", createdAt: "2026-10-17T00:00:00.000Z" }] } }));
  await page.route("**/api/public/sites/demo/guestbook/approved/reports", (route) => { reports += 1; expect(route.request().method()).toBe("POST"); return route.fulfill({ json: { accepted: true } }); });
  await backend.root.getByRole("button", { name: /回到編輯器/ }).click();
  await expect(backend.root).toHaveCount(0);
  await page.goto("/@demo");
  const guestbook = page.locator(".guestbook-app");
  await expect(guestbook).toContainText("PUBLIC_MESSAGE");
  await expect(guestbook.locator(".guestbook-preview-notice")).toHaveCount(0);
  await guestbook.getByRole("button", { name: "檢舉", exact: true }).click();
  await expect(guestbook.getByRole("status")).toContainText("已收到檢舉");
  expect(reports).toBe(1);
});
