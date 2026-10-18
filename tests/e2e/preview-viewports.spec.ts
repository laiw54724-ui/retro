import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

/**
 * R2 / Issue #69: the three preview entries (home sample, owner preview, collaborator draft viewer) shared no viewport
 * boundary. Below 768px global CSS hides `.visitor-desktop`, so a preview that defaulted to (or was switched to) the
 * simulated desktop was blank, and the mobile simulation drew a fake phone bezel and status bar on a real phone.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const PHONES = [320, 375, 390, 430, 767] as const;
const DESKTOPS = [768, 1280] as const;

async function signIn(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
}

async function mockSite(page: Page, role: "owner" | "viewer") {
  await signIn(page);
  const id = role === "owner" ? "site-1" : "site-viewer";
  const site = { id, username: "demo", site_name: "Demo", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: role };
  await page.route(`**/api/sites/${id}`, (route) => route.fulfill({ json: { site } }));
  await page.route(`**/api/sites/${id}/assets**`, (route) => route.fulfill({ json: { assets: [] } }));
  await page.route(`**/api/sites/${id}/draft`, (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
  return id;
}

type Entry = { name: string; open: (page: Page, width: number) => Promise<void>; root: string };
const entries: Entry[] = [
  {
    name: "home sample",
    root: ".preview-overlay",
    open: async (page) => { await page.goto("/"); await page.getByRole("button", { name: /開啟互動範例/ }).first().click(); await expect(page.locator(".preview-overlay")).toBeVisible(); }
  },
  {
    name: "owner preview",
    root: ".preview-overlay",
    open: async (page, width) => {
      const id = await mockSite(page, "owner");
      await page.goto(`/editor/${id}`);
      if (width >= 768) await page.getByRole("button", { name: /訪客預覽/ }).first().click();
      else { await page.locator(".m-tool", { hasText: "預覽" }).first().click(); }
      await expect(page.locator(".preview-overlay")).toBeVisible();
    }
  },
  {
    name: "collaborator viewer",
    root: ".draft-viewer-body",
    open: async (page) => { const id = await mockSite(page, "viewer"); await page.goto(`/editor/${id}`); await expect(page.locator(".draft-viewer-body")).toBeVisible(); }
  }
];

/** Something a person can actually see and use: a window icon or the mobile screen title, with a real size. */
async function expectVisibleContent(page: Page, root: string, label: string) {
  const box = await page.evaluate((selector) => {
    const scope = document.querySelector(selector);
    if (!scope) return { found: false, area: 0, text: "" };
    const target = scope.querySelector<HTMLElement>(".m-screen, .visitor-desktop");
    if (!target) return { found: false, area: 0, text: "" };
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return { found: style.display !== "none", area: rect.width * rect.height, text: (target.innerText ?? "").trim().slice(0, 40) };
  }, root);
  expect(box.found, `${label}: preview content is displayed`).toBe(true);
  expect(box.area, `${label}: preview content has size`).toBeGreaterThan(40_000);
  expect(box.text.length, `${label}: preview content has text`).toBeGreaterThan(0);
}

for (const entry of entries) {
  for (const width of PHONES) {
    test(`${entry.name} at ${width}px shows real content with no fake device chrome`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await entry.open(page, width);
      await expectVisibleContent(page, entry.root, `${entry.name} ${width}px initial`);
      await expect(page.locator(`${entry.root} .m-bezel, ${entry.root} .m-status`)).toHaveCount(0);
      // the preview fits the viewport (bottom edge reachable) and keeps its exit control visible
      const screenBottom = await page.evaluate((selector) => document.querySelector(`${selector} .m-screen`)?.getBoundingClientRect().bottom ?? 0, entry.root);
      expect(screenBottom, `${entry.name} ${width}px mobile screen ends inside the viewport`).toBeLessThanOrEqual(800 + 1);
      expect(screenBottom).toBeGreaterThan(300);
      // no horizontal page scroll
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      // a real phone has only one honest view; a device toggle must never be able to produce a blank screen
      const desktopButton = page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name: /桌面版/ });
      if (await desktopButton.count()) {
        await desktopButton.first().click();
        await expectVisibleContent(page, entry.root, `${entry.name} ${width}px after choosing desktop`);
      }
    });
  }

  for (const width of DESKTOPS) {
    test(`${entry.name} at ${width}px defaults to the desktop and can simulate a phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await entry.open(page, width);
      await expectVisibleContent(page, entry.root, `${entry.name} ${width}px desktop`);
      await expect(page.locator(`${entry.root} .visitor-desktop`)).toBeVisible();
      await page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name: /手機版/ }).first().click();
      await expectVisibleContent(page, entry.root, `${entry.name} ${width}px simulated phone`);
      await expect(page.locator(`${entry.root} .m-bezel`)).toBeVisible();
      await page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name: /桌面版/ }).first().click();
      await expect(page.locator(`${entry.root} .visitor-desktop`)).toBeVisible();
    });
  }
}

// Landscape: phones rotated below 768px wide are still phones; wider rotated phones may simulate either view.
for (const entry of entries) {
  for (const size of [{ width: 667, height: 375, phone: true }, { width: 844, height: 390, phone: false }]) {
    test(`${entry.name} in landscape ${size.width}x${size.height} is never blank`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await entry.open(page, size.width);
      await expectVisibleContent(page, entry.root, `${entry.name} landscape ${size.width}`);
      if (size.phone) await expect(page.locator(`${entry.root} .m-bezel, ${entry.root} .m-status`)).toHaveCount(0);
      else await expect(page.locator(`${entry.root} .visitor-desktop`)).toBeVisible();
    });
  }
}
