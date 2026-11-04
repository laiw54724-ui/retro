import { expect, test, type Page } from "@playwright/test";

async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(([px, py]) => {
    const engine = (window as any).paintDebug.engine;
    return Array.from(engine.bitmap.getContext("2d").getImageData(px, py, 1, 1).data);
  }, [x, y]);
}

async function stroke(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const box = (await page.locator("#canvas").boundingBox())!;
  await page.mouse.move(box.x + x1 + 0.5, box.y + y1 + 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + x2 + 0.5, box.y + y2 + 0.5, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto(process.env.PAINT_DEBUG_FILE_URL ?? "/paint-debug.html");
  await expect(page.locator("#status")).toContainText("640×480");
});

test("mouse pencil, transparent eraser, picker and one-gesture undo/redo", async ({ page }) => {
  await page.locator("#color").fill("#e03020");
  await stroke(page, 10, 10, 25, 10);
  expect(await pixel(page, 18, 10)).toEqual([224, 48, 32, 255]);
  await page.getByRole("button", { name: "Picker" }).click();
  await page.locator("#color").fill("#000000");
  await stroke(page, 18, 10, 18, 10);
  await expect(page.locator("#color")).toHaveValue("#e03020");
  await page.getByRole("button", { name: "Eraser" }).click();
  await stroke(page, 18, 10, 18, 10);
  expect(await pixel(page, 18, 10)).toEqual([0, 0, 0, 0]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await pixel(page, 18, 10)).toEqual([224, 48, 32, 255]);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await pixel(page, 18, 10)).toEqual([0, 0, 0, 0]);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Pencil" }).click();
  await stroke(page, 30, 10, 31, 10);
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
});

test("line, rectangle and ellipse preview then commit", async ({ page }) => {
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await stroke(page, 10, 20, 30, 20);
  expect((await pixel(page, 20, 20))[3]).toBe(255);
  await page.getByRole("button", { name: "Rectangle" }).click();
  await stroke(page, 40, 20, 60, 40);
  expect((await pixel(page, 40, 20))[3]).toBe(255);
  expect((await pixel(page, 50, 30))[3]).toBe(0);
  await page.locator("#filled").check();
  await page.getByRole("button", { name: "Ellipse" }).click();
  await stroke(page, 70, 20, 90, 40);
  expect((await pixel(page, 80, 30))[3]).toBe(255);
  expect((await pixel(page, 70, 20))[3]).toBe(0);
});

test("pointer cancellation rolls back, including lost capture", async ({ page }) => {
  const box = (await page.locator("#canvas").boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 10);
  expect((await pixel(page, 20, 10))[3]).toBe(255);
  await page.locator("#canvas").evaluate(canvas => {
    canvas.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
  });
  await page.mouse.up();
  expect((await pixel(page, 20, 10))[3]).toBe(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 10);
  await page.locator("#canvas").evaluate(canvas => canvas.releasePointerCapture(1));
  await page.mouse.up();
  expect((await pixel(page, 20, 10))[3]).toBe(0);
});

test("secondary pointer cancellation and capture loss preserve the primary stroke", async ({ page }) => {
  const box = (await page.locator("#canvas").boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 70);
  expect((await pixel(page, 20, 70))[3]).toBe(255);

  await page.locator("#canvas").evaluate(canvas => {
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, pointerType: "touch", isPrimary: false }));
    canvas.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 77, pointerType: "touch", isPrimary: false }));
    canvas.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 77, pointerType: "touch", isPrimary: false }));
  });
  expect((await pixel(page, 20, 70))[3]).toBe(255);
  expect(await page.evaluate(() => (window as any).paintDebug.engine.active)).toBe(true);

  await page.mouse.move(box.x + 40, box.y + 70);
  await page.mouse.up();
  expect((await pixel(page, 35, 70))[3]).toBe(255);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await pixel(page, 20, 70))[3]).toBe(0);
  expect((await pixel(page, 35, 70))[3]).toBe(0);
});

test("leaving and returning to the canvas does not bridge a stroke", async ({ page }) => {
  const box = (await page.locator("#canvas").boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x - 20, box.y + 60);
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.up();
  expect((await pixel(page, 10, 60))[3]).toBe(255);
  expect((await pixel(page, 20, 60))[3]).toBe(0);
  expect((await pixel(page, 35, 60))[3]).toBe(255);
});

test("clear/new confirmations, bounds, zoom and transparent logical PNG", async ({ page }) => {
  await stroke(page, 12, 12, 12, 12);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Clear" }).click();
  expect((await pixel(page, 12, 12))[3]).toBe(255);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Clear" }).click();
  expect((await pixel(page, 12, 12))[3]).toBe(0);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await pixel(page, 12, 12))[3]).toBe(255);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "New canvas" }).click();
  expect((await pixel(page, 12, 12))[3]).toBe(255);
  await page.locator("#width").fill("1025");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "New canvas" }).click();
  await expect(page.locator("#status")).toContainText("Canvas must be");
  expect((await pixel(page, 12, 12))[3]).toBe(255);
  await page.locator("#width").fill("1024");
  await page.locator("#height").fill("768");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "New canvas" }).click();
  await page.locator("#zoom").selectOption("2");
  const result = await page.evaluate(async () => {
    const engine = (window as any).paintDebug.engine;
    engine.setDisplay(2, 3);
    const blob = await engine.exportPng();
    const image = await createImageBitmap(blob);
    const probe = document.createElement("canvas");
    probe.width = image.width;
    probe.height = image.height;
    const context = probe.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const bytes = engine.allocationBytes;
    return { width: image.width, height: image.height, bytes, history: engine.historyBytes,
      pixel: Array.from(context.getImageData(1023, 767, 1, 1).data),
      backingWidth: engine.display.width };
  });
  expect(result.width).toBe(1024);
  expect(result.height).toBe(768);
  expect(result.pixel).toEqual([0, 0, 0, 0]);
  expect(result.backingWidth).toBe(2048);
  expect(result.bytes).toBe(5 * 1024 * 768 * 4);
  expect(result.history).toBe(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("paint-1024x768.png");
});

test("eight snapshot limit and touch input", async ({ page, browser }) => {
  const stats = await page.evaluate(() => {
    const engine = (window as any).paintDebug.engine;
    for (let i = 0; i < 12; i++) {
      engine.begin({ x: i, y: 100 }, { tool: "pencil", color: "#112233", size: 1 });
      engine.end();
    }
    let undone = 0;
    while (engine.undo()) undone++;
    return { undone, bytes: engine.historyBytes };
  });
  expect(stats.undone).toBe(8);
  expect(stats.bytes).toBeLessThanOrEqual(8 * 640 * 480 * 4);

  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 900, height: 800 } });
  const touchPage = await context.newPage();
  await touchPage.goto(process.env.PAINT_DEBUG_FILE_URL ?? "/paint-debug.html");
  const box = (await touchPage.locator("#canvas").boundingBox())!;
  await touchPage.touchscreen.tap(box.x + 45, box.y + 45);
  expect((await pixel(touchPage, 45, 45))[3]).toBe(255);
  const cdp = await context.newCDPSession(touchPage);
  const at = (x: number) => [{ x: box.x + x, y: box.y + 55, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(60) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(80) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect((await pixel(touchPage, 70, 55))[3]).toBe(255);
  await context.close();
});
