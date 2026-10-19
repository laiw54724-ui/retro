import { expect, test, type Locator, type Page } from "@playwright/test";

const root = (page: Page) => page.locator("#renderer figure");
const stage = (page: Page) => page.locator("#renderer [data-testid=image-stage]");
const image = (page: Page) => page.locator("#renderer img");

async function choose(page: Page, field: string, value: string) {
  await page.locator(`#${field}`).selectOption(value);
}

async function ready(page: Page, width?: number, height?: number) {
  await expect(image(page)).toBeVisible();
  await expect.poll(() => image(page).evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight]))
    .toEqual(width && height ? [width, height] : expect.arrayContaining([expect.any(Number), expect.any(Number)]));
  await expect(root(page)).not.toHaveAttribute("aria-busy", "true");
}

async function pixel(locator: Locator, x: number, y: number): Promise<number[]> {
  const data = (await locator.screenshot()).toString("base64");
  return locator.page().evaluate(async ({ data, x, y }) => {
    const bitmap = new Image();
    bitmap.src = `data:image/png;base64,${data}`;
    await bitmap.decode();
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return Array.from(context.getImageData(x, y, 1, 1).data);
  }, { data, x, y });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/image-w3a-debug.html");
  await expect(page.getByRole("heading", { name: "Image W3a renderer fixture" })).toBeVisible();
});

test("real pixels reflect contain, cover, original, crop, and transparent backing", async ({ page }) => {
  await ready(page, 200, 100);
  await page.locator("#caption").fill("");
  await expect(root(page).locator("figcaption")).toHaveCount(0);
  await expect.poll(() => image(page).evaluate((element) => element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top)).toBeGreaterThan(5);
  const rect = await stage(page).boundingBox();
  expect(rect).not.toBeNull();
  const mid = Math.floor(rect!.width / 2);
  const top = await pixel(stage(page), 20, 3);
  expect(top.slice(0, 3)).toEqual([249, 228, 140]); // underlay through contain letterbox
  const red = await pixel(stage(page), 20, Math.floor(rect!.height / 2));
  const blue = await pixel(stage(page), Math.floor(rect!.width - 20), Math.floor(rect!.height / 2));
  expect(red[0]).toBeGreaterThan(200);
  expect(blue[2]).toBeGreaterThan(200);

  await choose(page, "fit", "cover");
  await expect.poll(async () => image(page).evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(rect!.height, 0);
  expect((await pixel(stage(page), Math.floor(rect!.width - 20), 3))[2]).toBeGreaterThan(200);
  await choose(page, "fit", "original");
  const dimensions = await image(page).evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  expect(dimensions).toEqual({ width: 200, height: 100 });
  await page.locator("#crop-zoom").fill("2");
  await expect.poll(() => image(page).evaluate((element) => element.getBoundingClientRect().width)).toBe(400);

  await choose(page, "source", "transparent");
  await page.locator("#crop-zoom").fill("1");
  await ready(page, 20, 20);
  await choose(page, "fit", "contain");
  await choose(page, "background", "checker");
  const corner = await pixel(stage(page), mid - 80, 30);
  const center = await pixel(stage(page), mid, Math.floor(rect!.height / 2));
  expect([[217, 221, 225], [249, 228, 140]]).toContainEqual(corner.slice(0, 3));
  expect(center[0]).toBeGreaterThan(200);
  expect(center[2]).toBeGreaterThan(140);
});

test("GIF image element survives style-only changes and broken or empty sources show status", async ({ page }) => {
  await choose(page, "source", "gif");
  await ready(page, 40, 40);
  await image(page).evaluate((element) => { (window as Window & { fixtureImage?: Element }).fixtureImage = element; });
  await choose(page, "frame", "simple");
  await choose(page, "fit", "cover");
  await page.locator("#pixelated").check();
  await page.locator("#caption").fill("Updated");
  expect(await image(page).evaluate((element) => element === (window as Window & { fixtureImage?: Element }).fixtureImage)).toBe(true);
  await expect(image(page)).toHaveCSS("image-rendering", "pixelated");
  await expect(root(page).locator("figcaption")).toHaveText("Updated");
  await choose(page, "source", "broken");
  await expect(stage(page).getByRole("alert")).toHaveText("Image unavailable");
  await choose(page, "source", "wide");
  await ready(page, 200, 100);
  await choose(page, "source", "broken");
  await expect(stage(page).getByRole("alert")).toHaveText("Image unavailable");
  await choose(page, "source", "none");
  await expect(stage(page).getByRole("status")).toHaveText("No image");
});

test("visitor decoration passes input through and editor selection remains operable", async ({ page }) => {
  await ready(page, 200, 100);
  await choose(page, "interaction", "decorative");
  await expect(root(page)).toHaveAttribute("aria-hidden", "true");
  await expect(image(page)).toHaveAttribute("alt", "");
  await expect(root(page).locator("figcaption")).toHaveCount(0);
  await stage(page).click({ position: { x: 100, y: 100 }, force: true });
  await expect(page.locator("#counts")).toContainText("Underlying clicks: 1");
  await choose(page, "mode", "editor");
  await expect(root(page).getByRole("button", { name: "Select image" })).toBeVisible();
  await root(page).getByRole("button", { name: "Select image" }).click();
  await expect(page.locator("#counts")).toContainText("selections: 1");
});

test("extreme images, WebP and narrow viewports stay within the host", async ({ page }) => {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await stage(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.width).toBeGreaterThan(250);
  }
  for (const source of ["extremeWide", "extremeTall", "webp"]) {
    await choose(page, "source", source);
    await ready(page);
    const geometry = await image(page).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, natural: [element.naturalWidth, element.naturalHeight] };
    });
    expect(geometry.width).toBeLessThanOrEqual(32_768);
    expect(geometry.height).toBeLessThanOrEqual(32_768);
    expect(geometry.natural.every((value) => value > 0)).toBe(true);
  }
});

test("late protected asset result cannot replace a newer source", async ({ page }) => {
  let releaseA!: (value: void) => void;
  const pendingA = new Promise<void>((resolve) => { releaseA = resolve; });
  await page.route("**/api/sites/synthetic-fixture/assets/*/content", async (route) => {
    if (route.request().url().includes("11111111")) {
      await pendingA;
      await route.fulfill({ path: "tests/fixtures/image-w3a/wide.png", contentType: "image/png" });
    } else {
      await route.fulfill({ path: "tests/fixtures/image-w3a/tall.png", contentType: "image/png" });
    }
  });
  await choose(page, "source", "assetA");
  await expect(root(page)).toHaveAttribute("aria-busy", "true");
  await choose(page, "source", "assetB");
  await ready(page, 100, 200);
  const staleResponse = page.waitForResponse((response) => response.url().includes("11111111") && response.ok());
  releaseA();
  await staleResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => image(page).evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([100, 200]);
  await expect(image(page)).toHaveAttribute("src", /^blob:/);
});
