import { expect, test } from "@playwright/test";

for (const width of [320, 1280]) {
  test(`fictional landing examples and preview are clearly marked at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const examples = page.locator("#examples");
    await expect(examples.getByRole("note")).toContainText("虛構示意");
    await expect(examples.getByRole("note")).toContainText("追蹤數");
    await expect(examples.getByRole("note")).toContainText("留言");

    // Thumbnail content can be checked without relying on the browser reaching Commons.
    const thumbnailImages = examples.locator(".example-thumb img");
    await expect(thumbnailImages).toHaveCount(8);
    const urls = await thumbnailImages.evaluateAll((images) => images.map((image) => image.getAttribute("src")));
    expect(urls.every((src) => src?.startsWith("https://upload.wikimedia.org/wikipedia/commons/"))).toBe(true);
    expect(new Set(urls).size).toBe(8);

    await examples.getByRole("button", { name: /復古 IG/ }).click();
    const preview = page.locator(".preview-overlay");
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("note")).toContainText("虛構示意");
    await expect(preview.getByRole("note")).toContainText("留言");
    await preview.getByRole("button", { name: /返回範例/ }).click();
    await expect(preview).toHaveCount(0);
  });
}
