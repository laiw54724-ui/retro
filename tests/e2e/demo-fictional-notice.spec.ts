import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const media = JSON.parse(readFileSync("docs/assets/demo-media.provenance.json", "utf8")).sets["commons-demo"].outputs as Array<{ path: string }>;

test("all 14 bundled CC0 images decode without external image requests", async ({ page }) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.resourceType() === "image" && !new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) {
      external.push(request.url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  const paths = media.map(({ path }) => path.replace("apps/web/public", ""));
  expect(paths).toHaveLength(14);
  const decoded = await page.evaluate(async (paths) => Promise.all(paths.map(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return { src, width: image.naturalWidth, height: image.naturalHeight };
  })), paths);
  expect(decoded.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
  expect(external).toEqual([]);
});

for (const width of [320, 1280]) {
  test(`fictional landing examples and preview are clearly marked at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const examples = page.locator("#examples");
    await expect(examples.getByRole("note")).toContainText("虛構示意");
    await expect(examples.getByRole("note")).toContainText("追蹤數");
    await expect(examples.getByRole("note")).toContainText("留言");

    // Decode the actual bundled images, not just their URL strings.
    const thumbnailImages = examples.locator(".example-thumb img");
    await expect(thumbnailImages).toHaveCount(8);
    const urls = await thumbnailImages.evaluateAll((images) => images.map((image) => image.getAttribute("src")));
    expect(urls.every((src) => src?.startsWith("/demo-assets/commons/"))).toBe(true);
    expect(new Set(urls).size).toBe(8);
    for (const img of await thumbnailImages.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }

    for (let index = 0; index < 4; index += 1) {
      await examples.locator(".example-card").nth(index).click();
      const preview = page.locator(".preview-overlay");
      await expect(preview).toBeVisible();
      await expect(preview.getByRole("note").filter({ hasText: "虛構示意" })).toContainText("虛構示意");
      await expect(preview.getByRole("note").filter({ hasText: "虛構示意" })).toContainText("留言");
      await preview.getByRole("button", { name: "桌面版", exact: true }).click();
      const images = preview.locator('img[src*="/demo-assets/commons/"]');
      await expect(images.first()).toBeVisible();
      for (const img of await images.all()) {
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      }
      if (width === 1280 && index === 1) await page.screenshot({ path: "tests/tmp/cc0-ig-local.png" });
      await preview.getByRole("button", { name: /返回範例/ }).click();
      await expect(preview).toHaveCount(0);
    }
  });
}
