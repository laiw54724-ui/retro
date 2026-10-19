import { expect, test, type Page } from "@playwright/test";

type Rgba = [number, number, number, number];

async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return page.evaluate(([px, py]) => Array.from((window as any).paintOperation.engine.bitmap.getContext("2d").getImageData(px, py, 1, 1).data) as Rgba, [x, y]);
}

async function png(page: Page, color: string, width = 4, height = 4): Promise<Buffer> {
  const bytes = await page.evaluate(async ({ color, width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, Math.ceil(width / 2), height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { color, width, height });
  return Buffer.from(bytes);
}

async function pick(page: Page, name: string, buffer: Buffer, mimeType = "image/png") {
  await page.getByLabel("Import image").setInputFiles({ name, mimeType, buffer });
}

async function delayDecodes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = createImageBitmap;
    const originalClose = ImageBitmap.prototype.close;
    const waiting: Array<() => void> = [];
    let closed = 0;
    ImageBitmap.prototype.close = function () { closed++; originalClose.call(this); };
    (window as any).closedDecodes = () => closed;
    (window as any).releaseDecode = () => {
      const release = waiting.shift();
      if (!release) throw new Error("No pending image decode");
      release();
    };
    window.createImageBitmap = async (...args) => {
      await new Promise<void>((resolve) => waiting.push(resolve));
      return original(...args);
    };
  });
}

async function releaseAndWaitForClose(page: Page, closed: number): Promise<void> {
  await page.evaluate(() => (window as any).releaseDecode());
  // close() runs only after the import continuation has discarded or applied
  // the result, so pixel assertions cannot race a late decoder completion.
  await expect.poll(() => page.evaluate(() => (window as any).closedDecodes())).toBe(closed);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/paint-operation-debug.html");
  await expect(page.getByRole("status")).toContainText("640×480");
});

test("a local transparent image becomes one undoable overlay and exports at logical size", async ({ page }) => {
  const source = await png(page, "#e03020");
  await pick(page, "drawing.png", source);
  await expect(page.getByRole("status")).toContainText("Image added");
  expect(await pixel(page, 200, 240)).toEqual([224, 48, 32, 255]);
  expect(await pixel(page, 400, 240)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 10, 10)).toEqual([0, 0, 0, 0]);
  expect(await page.evaluate(() => (window as any).paintOperation.engine.historyBytes)).toBe(640 * 480 * 4);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await pixel(page, 200, 240))[3]).toBe(0);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await pixel(page, 200, 240)).toEqual([224, 48, 32, 255]);
  await page.getByLabel("Zoom").selectOption("2");
  const result = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(await (window as any).paintOperation.engine.exportPng());
    const check = document.createElement("canvas");
    check.width = bitmap.width; check.height = bitmap.height;
    const context = check.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const output = { width: bitmap.width, height: bitmap.height, alpha: context.getImageData(10, 10, 1, 1).data[3] };
    bitmap.close();
    return output;
  });
  expect(result).toEqual({ width: 640, height: 480, alpha: 0 });
  expect(source.length).toBeGreaterThan(0);
});

test("import keeps an existing mouse stroke and branches redo history", async ({ page }) => {
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + 20.5, box.y + 20.5);
  await page.mouse.down(); await page.mouse.up();
  expect((await pixel(page, 20, 20))[3]).toBe(255);
  await page.getByRole("button", { name: "Undo" }).click();
  await pick(page, "red.png", await png(page, "#ff0000"));
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  expect((await pixel(page, 20, 20))[3]).toBe(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.mouse.move(box.x + 20.5, box.y + 20.5);
  await page.mouse.down(); await page.mouse.up();
  await pick(page, "blue.png", await png(page, "#0000ff"));
  expect((await pixel(page, 20, 20))[3]).toBe(255);
  expect(await pixel(page, 200, 240)).toEqual([0, 0, 255, 255]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await pixel(page, 20, 20))[3]).toBe(255);
  expect(await pixel(page, 200, 240)).toEqual([255, 0, 0, 255]);
});

test("bad type, encoded size, corrupt decode, and decoded dimensions leave pixels unchanged", async ({ page }) => {
  await pick(page, "script.svg", Buffer.from("<svg/>"), "image/svg+xml");
  await expect(page.getByRole("status")).toContainText("Choose a local PNG");
  await pick(page, "huge.png", Buffer.alloc(8 * 1024 * 1024 + 1), "image/png");
  await expect(page.getByRole("status")).toContainText("8 MiB");
  await pick(page, "broken.png", Buffer.from("not a png"));
  await expect(page.getByRole("status")).toContainText("could not be decoded");
  await pick(page, "wide.png", await png(page, "#ff0000", 2049, 1));
  await expect(page.getByRole("status")).toContainText("2048 × 2048");
  expect((await pixel(page, 100, 100))[3]).toBe(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("cancelled, repeated, and edit-interrupted decodes cannot overwrite newer pixels", async ({ page }) => {
  const red = await png(page, "#ff0000");
  const blue = await png(page, "#0000ff");
  await delayDecodes(page);
  await pick(page, "red.png", red);
  await expect(page.getByRole("button", { name: "Cancel import" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel import" }).click();
  await releaseAndWaitForClose(page, 1);
  await expect(page.getByRole("status")).toContainText("cancelled");
  expect((await pixel(page, 200, 240))[3]).toBe(0);
  await pick(page, "red.png", red);
  await pick(page, "blue.png", blue);
  await releaseAndWaitForClose(page, 2); // obsolete red
  await releaseAndWaitForClose(page, 3); // current blue
  await expect(page.getByRole("status")).toContainText("Image added");
  expect(await pixel(page, 200, 240)).toEqual([0, 0, 255, 255]);
  await pick(page, "red.png", red);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + 10.5, box.y + 10.5);
  await page.mouse.down(); await page.mouse.up();
  await releaseAndWaitForClose(page, 4);
  expect(await pixel(page, 200, 240)).toEqual([0, 0, 255, 255]);
  expect((await pixel(page, 10, 10))[3]).toBe(255);
});

test("tainted source failure is atomic, and touch during decode cancels import", async ({ page, browser }) => {
  const result = await page.evaluate(() => {
    const engine = (window as any).paintOperation.engine;
    const original = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      if (this.canvas !== engine.bitmap) throw new DOMException("tainted", "SecurityError");
      return original.apply(this, args);
    };
    try {
      const source = document.createElement("canvas");
      source.width = 1; source.height = 1;
      try { engine.importImage(source, 1, 1); return "missed"; }
      catch (error) { return (error as DOMException).name; }
    } finally { CanvasRenderingContext2D.prototype.getImageData = original; }
  });
  expect(result).toBe("SecurityError");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } });
  const touchPage = await context.newPage();
  await touchPage.goto("/paint-operation-debug.html");
  const red = await png(touchPage, "#ff0000");
  await delayDecodes(touchPage);
  await pick(touchPage, "red.png", red);
  await expect(touchPage.getByRole("button", { name: "Cancel import" })).toBeVisible();
  await touchPage.locator("canvas").scrollIntoViewIfNeeded();
  const box = (await touchPage.locator("canvas").boundingBox())!;
  const tapped = await touchPage.evaluate(([x, y]) => (window as any).paintOperation.engine.pointFromClient(x, y), [box.x + 20, box.y + 20]);
  expect(tapped).not.toBeNull();
  await touchPage.touchscreen.tap(box.x + 20, box.y + 20);
  await expect(touchPage.getByRole("status")).toContainText("cancelled");
  await releaseAndWaitForClose(touchPage, 1);
  expect((await pixel(touchPage, 200, 240))[3]).toBe(0);
  expect((await pixel(touchPage, tapped.x, tapped.y))[3]).toBe(255);
  await context.close();
});
