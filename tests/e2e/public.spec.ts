import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const documentFixture = {
  schemaVersion: 1,
  siteName: "Demo Desk",
  theme: {
    id: "classic98",
    name: "經典 98",
    wall: "#008080",
    pattern: "none",
    patternColor: "#0a8f8f",
    face: "#c0c0c0",
    light: "#dfdfdf",
    shadow: "#808080",
    dark: "#0a0a0a",
    text: "#111111",
    titleFrom: "#000080",
    titleTo: "#1084d0",
    taskbar: "#c0c0c0",
    accent: "#000080",
    font: "noto",
    iconStyle: "classic"
  },
  windows: [
    {
      id: "about",
      type: "about",
      title: "About.exe",
      icon: "user",
      defaultOpen: true,
      layout: {
        desktop: { x: 140, y: 40, w: 340, h: 360, z: 1, iconX: 16, iconY: 18 },
        mobile: { order: 0 }
      },
      content: {
        avatar: null,
        nickname: "Demo User",
        bio: "Hello from Retro Desktop.",
        banner: "ABOUT ME",
        quote: "",
        fields: [{ id: "field-1", key: "Role", value: "Creator" }],
        socials: []
      }
    },
    {
      id: "links",
      type: "links",
      title: "Links.exe",
      icon: "link",
      defaultOpen: false,
      layout: {
        desktop: { x: 500, y: 90, w: 300, h: 260, z: 2, iconX: 16, iconY: 96 },
        mobile: { order: 1 }
      },
      content: {
        links: [{ id: "link-1", label: "Example", icon: "link", color: "#000080", target: "url", url: "https://example.com", windowId: "" }]
      }
    }
  ],
  mobileColumns: 4
};

async function mockPublicSite(page: Page) {
  await page.route("**/api/public/sites/demo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        site: {
          username: "demo",
          site_name: "Demo Desk",
          published_document: documentFixture,
          published_version: 1,
          published_at: "2026-10-15T00:00:00.000Z"
        }
      })
    });
  });
}

test("landing page has no critical accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把你的小宇宙/ })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((violation) => violation.impact === "critical");
  expect(critical).toEqual([]);
});

test("desktop visitor can minimize, restore, close and reopen windows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublicSite(page);
  await page.goto("/@demo");

  const dialog = page.getByRole("dialog", { name: "About.exe" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "最小化" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".visitor-task-buttons").getByRole("button", { name: "About.exe" }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "最大化" }).click();
  await expect(dialog.getByRole("button", { name: "還原" })).toBeVisible();

  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".visitor-icon").filter({ hasText: "About.exe" }).click();
  await expect(dialog).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`mobile visitor remains reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockPublicSite(page);
    await page.goto("/@demo");

    await expect(page.locator(".visitor-mobile")).toBeVisible();
    await page.locator(".visitor-mobile").getByRole("button", { name: "About.exe" }).click();
    await expect(page.locator(".visitor-mobile").getByRole("dialog", { name: "About.exe" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
