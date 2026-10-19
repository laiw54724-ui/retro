import { expect, test, type Page } from "@playwright/test";

async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(([px, py]) => {
    const engine = (window as any).paintOperation.engine;
    return Array.from(engine.bitmap.getContext("2d").getImageData(px, py, 1, 1).data);
  }, [x, y]);
}

async function stroke(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const box = (await page.locator("canvas").boundingBox())!;
  const zoom = await page.evaluate(() => (window as any).paintOperation.engine.display.getBoundingClientRect().width / (window as any).paintOperation.engine.width);
  await page.mouse.move(box.x + (x1 + .5) * zoom, box.y + (y1 + .5) * zoom);
  await page.mouse.down();
  await page.mouse.move(box.x + (x2 + .5) * zoom, box.y + (y2 + .5) * zoom, { steps: 3 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/paint-operation-debug.html");
  await expect(page.getByRole("region", { name: "Paint canvas" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("640×480");
});

test("toolbar, palette, picker, transparent eraser, and undo/redo operate on real pixels", async ({ page }) => {
  const tools = page.getByRole("toolbar", { name: "Drawing tools" });
  await page.getByRole("button", { name: "Use #e03020" }).click();
  await tools.getByRole("button", { name: "Pencil" }).click();
  await stroke(page, 20, 20, 35, 20);
  expect(await pixel(page, 27, 20)).toEqual([224, 48, 32, 255]);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await tools.getByRole("button", { name: "Color picker" }).click();
  await page.getByLabel("Current color").fill("#000000");
  await stroke(page, 27, 20, 27, 20);
  await expect(page.getByLabel("Current color")).toHaveValue("#e03020");
  await tools.getByRole("button", { name: "Eraser" }).click();
  await stroke(page, 27, 20, 27, 20);
  expect(await pixel(page, 27, 20)).toEqual([0, 0, 0, 0]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await pixel(page, 27, 20)).toEqual([224, 48, 32, 255]);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await pixel(page, 27, 20)).toEqual([0, 0, 0, 0]);
  await expect(tools.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");
});

test("shape tools and filled toggle commit one stroke at a time", async ({ page }) => {
  const tools = page.getByRole("toolbar", { name: "Drawing tools" });
  await page.getByLabel("Brush size").selectOption("1");
  await tools.getByRole("button", { name: "Line" }).click();
  await stroke(page, 20, 60, 50, 60);
  expect((await pixel(page, 35, 60))[3]).toBe(255);
  await tools.getByRole("button", { name: "Rectangle" }).click();
  await stroke(page, 70, 60, 100, 90);
  expect((await pixel(page, 70, 60))[3]).toBe(255);
  expect((await pixel(page, 85, 75))[3]).toBe(0);
  await page.getByLabel("Filled shape").check();
  await tools.getByRole("button", { name: "Ellipse" }).click();
  await stroke(page, 120, 60, 150, 90);
  expect((await pixel(page, 135, 75))[3]).toBe(255);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await pixel(page, 135, 75))[3]).toBe(0);
  expect((await pixel(page, 70, 60))[3]).toBe(255);
  await expect(page.getByLabel("Filled shape")).toBeEnabled();
  await tools.getByRole("button", { name: "Pencil" }).click();
  await expect(page.getByLabel("Filled shape")).toBeDisabled();
});

test("clear and new ask before discarding, and local PNG keeps logical size and alpha", async ({ page }) => {
  await stroke(page, 16, 16, 16, 16);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  expect((await pixel(page, 16, 16))[3]).toBe(255);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  expect((await pixel(page, 16, 16))[3]).toBe(0);
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await pixel(page, 16, 16))[3]).toBe(255);
  await page.getByLabel("Canvas size").selectOption("320x240");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "New canvas" }).click();
  await expect(page.getByRole("status")).toContainText("640×480");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New canvas" }).click();
  await expect(page.getByRole("status")).toContainText("320×240");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await page.getByLabel("Zoom").selectOption("2");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("paint-320x240.png");
  const result = await page.evaluate(async () => {
    const engine = (window as any).paintOperation.engine;
    const bitmap = await createImageBitmap(await engine.exportPng());
    const probe = document.createElement("canvas");
    probe.width = bitmap.width; probe.height = bitmap.height;
    const context = probe.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, corner: Array.from(context.getImageData(319, 239, 1, 1).data), backingWidth: engine.display.width, cssWidth: engine.display.getBoundingClientRect().width };
  });
  expect(result).toEqual({ width: 320, height: 240, corner: [0, 0, 0, 0], backingWidth: 320, cssWidth: 640 });
});

test("keyboard cursor draws, cancels, and leaves editable controls alone", async ({ page }) => {
  const canvas = page.locator("canvas");
  await canvas.focus();
  await canvas.press("Home");
  await expect(page.getByRole("status")).toContainText("Cursor 0, 0");
  await canvas.press("Space");
  await canvas.press("Shift+ArrowRight");
  await canvas.press("Space");
  expect((await pixel(page, 0, 0))[3]).toBe(255);
  expect((await pixel(page, 10, 0))[3]).toBe(255);
  await page.getByLabel("Brush size").focus();
  await page.keyboard.press("Control+z");
  expect((await pixel(page, 10, 0))[3]).toBe(255);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  expect((await pixel(page, 10, 0))[3]).toBe(0);
  await page.keyboard.press("Control+Shift+z");
  expect((await pixel(page, 10, 0))[3]).toBe(255);
  await canvas.press("End");
  await canvas.press("Space");
  await canvas.press("Escape");
  expect((await pixel(page, 639, 479))[3]).toBe(0);
  await expect(page.locator("canvas")).toHaveAttribute("aria-describedby", /.+/);
});

for (const activation of ["Space", "Enter"] as const) {
  test(`held ${activation} activates one keyboard gesture until a fresh press commits it`, async ({ page }) => {
    const canvas = page.locator("canvas");
    await canvas.focus();
    await canvas.press("Home");
    await page.keyboard.down(activation);
    await page.keyboard.down(activation);
    await page.keyboard.down(activation);
    await page.keyboard.press("Shift+ArrowRight");
    expect(await page.evaluate(() => {
      const engine = (window as any).paintOperation.engine;
      return { active: engine.active, canUndo: engine.canUndo, historyBytes: engine.historyBytes };
    })).toEqual({ active: true, canUndo: false, historyBytes: 0 });
    await page.keyboard.up(activation);
    await page.keyboard.press(activation);
    expect(await page.evaluate(() => {
      const engine = (window as any).paintOperation.engine;
      return { active: engine.active, canUndo: engine.canUndo, historyBytes: engine.historyBytes };
    })).toEqual({ active: false, canUndo: true, historyBytes: 640 * 480 * 4 });
    expect((await pixel(page, 10, 0))[3]).toBe(255);
    await page.getByRole("button", { name: "Undo" }).click();
    expect((await pixel(page, 0, 0))[3]).toBe(0);
    expect((await pixel(page, 10, 0))[3]).toBe(0);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });
}

test("pointer and keyboard cannot take over each other's active gesture", async ({ page }) => {
  const canvas = page.locator("canvas");
  await canvas.focus();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20.5, box.y + 20.5);
  await page.mouse.down();
  await page.mouse.move(box.x + 30.5, box.y + 20.5);
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => {
    const engine = (window as any).paintOperation.engine;
    return { active: engine.active, historyBytes: engine.historyBytes };
  })).toEqual({ active: true, historyBytes: 0 });
  await page.mouse.up();
  expect((await pixel(page, 25, 20))[3]).toBe(255);
  expect((await pixel(page, 321, 240))[3]).toBe(0);
  expect(await page.evaluate(() => (window as any).paintOperation.engine.historyBytes)).toBe(640 * 480 * 4);

  await canvas.press("Home");
  await canvas.press("Space");
  expect((await pixel(page, 0, 0))[3]).toBe(255);
  await canvas.evaluate((element) => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, pointerType: "touch", isPrimary: false }));
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 78, pointerType: "mouse", isPrimary: true, button: 2 }));
  });
  await expect(page.getByRole("status")).toContainText("Drawing");
  await page.mouse.move(box.x + 50.5, box.y + 50.5);
  await page.mouse.down();
  await page.mouse.up();
  expect((await pixel(page, 0, 0))[3]).toBe(0);
  expect((await pixel(page, 50, 50))[3]).toBe(255);
  expect(await page.evaluate(() => (window as any).paintOperation.engine.historyBytes)).toBe(2 * 640 * 480 * 4);
});

test("320, 390, and 430px controls stay reachable; touch paints only inside canvas", async ({ page, browser }) => {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 700 });
    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export PNG" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await stroke(page, 20, 20, 30, 20);
    expect((await pixel(page, 25, 20))[3]).toBe(255);
  }
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } });
  const touchPage = await context.newPage();
  await touchPage.goto("/paint-operation-debug.html");
  const canvas = touchPage.locator("canvas");
  await expect(canvas).toHaveCSS("touch-action", "none");
  const box = (await canvas.boundingBox())!;
  await touchPage.touchscreen.tap(box.x + 20, box.y + 20);
  expect((await pixel(touchPage, 40, 40))[3]).toBe(255);
  await context.close();
});
