import { expect, test, type Locator, type Page } from "@playwright/test";

const fixtureIds = ["error", "recorder", "paint", "help", "instagram"] as const;
const presets = ["classic-95", "classic-98", "compact-98"] as const;
const fixture = (page: Page, id: typeof fixtureIds[number]) => page.getByTestId(`fixture-${id}`);
const frame = (page: Page, id: typeof fixtureIds[number]) => fixture(page, id).locator(":scope > [data-chrome-preset]");

async function openShowcase(page: Page) {
  await page.goto("/window-chrome.html");
  await expect(page.getByRole("heading", { name: "One frame. Five familiar windows." })).toBeVisible();
  await expect(fixture(page, "instagram")).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function expectContainedControls(window: Locator) {
  const overflow = await window.evaluate((element) => {
    const title = element.querySelector(".retro-titlebar")!;
    const bounds = title.getBoundingClientRect();
    const controls = Array.from(title.querySelectorAll(".titlebar-controls > *"));
    return controls.some((control) => {
      const rect = control.getBoundingClientRect();
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.width < 24 || rect.height < 24;
    });
  });
  expect(overflow).toBe(false);
}

test("@smoke frame changes and hidden slots preserve the app, counter and exact input node", async ({ page }) => {
  await openShowcase(page);
  const help = fixture(page, "help");
  const draft = help.getByTestId("state-draft");
  await draft.fill("A draft that must survive every frame change");
  const originalInput = await draft.elementHandle();
  await help.getByRole("button", { name: "Increment demo counter" }).click();
  await help.getByRole("button", { name: "Increment demo counter" }).click();

  for (const preset of presets) {
    await page.getByLabel("Chrome preset", { exact: true }).selectOption(preset);
    await expect(frame(page, "help")).toHaveAttribute("data-chrome-preset", preset);
    await expect(draft).toHaveValue("A draft that must survive every frame change");
    expect(await draft.evaluate((current, previous) => current === previous, originalInput)).toBe(true);
    await expect(help.getByTestId("state-counter")).toHaveText("2");
  }
  await page.getByLabel("Show toolbar", { exact: true }).uncheck();
  await page.getByLabel("Show status bar", { exact: true }).uncheck();
  await expect(help.locator('[data-chrome-slot="toolbar"]')).toBeHidden();
  await expect(help.locator('[data-chrome-slot="statusBar"]')).toBeHidden();
  expect(await draft.evaluate((current, previous) => current === previous, originalInput)).toBe(true);
  await page.getByLabel("Show toolbar", { exact: true }).check();
  await page.getByLabel("Show status bar", { exact: true }).check();
  await help.getByRole("button", { name: "Increment demo counter" }).click();
  await expect(help.getByTestId("state-counter")).toHaveText("3");
  await expect(draft).toHaveValue("A draft that must survive every frame change");
});

test("@smoke menu keyboard focus, disabled commands, checkbox items and Escape work", async ({ page }) => {
  await openShowcase(page);
  const paint = fixture(page, "paint");
  const file = paint.getByRole("menuitem", { name: "File", exact: true });
  await file.focus();
  await page.keyboard.press("ArrowDown");
  await expect(paint.getByRole("menuitem", { name: "Reset sample", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const save = paint.getByRole("menuitem", { name: "Save bitmap…", exact: true });
  await expect(save).toBeFocused();
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(paint.getByRole("menu")).toBeVisible();
  await expect(paint.getByTestId("paint-status")).toHaveText("Select a sample color");
  await page.keyboard.press("End");
  await expect(paint.getByRole("menuitem", { name: "About this fixture", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(file).toBeFocused();
  await expect(paint.getByTestId("paint-status")).toHaveText("Self-authored sample; no drawing engine");
  await page.keyboard.press("ArrowRight");
  await expect(paint.getByRole("menuitem", { name: "Edit", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const view = paint.getByRole("menuitem", { name: "View", exact: true });
  await expect(view).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(paint.getByRole("menuitemcheckbox", { name: "Blue sample", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(paint.getByRole("button", { name: "Teal sample", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(view).toBeFocused();
  await expect(paint.getByRole("menu")).toHaveCount(0);
});

test("@smoke local Help tabs and existing Instagram navigation remain usable", async ({ page }) => {
  await openShowcase(page);
  const help = fixture(page, "help");
  await help.getByRole("tab", { name: "Contents", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(help.getByRole("tab", { name: "Index", exact: true })).toBeFocused();
  await expect(help.getByRole("tabpanel")).toContainText("Chrome → reusable window frame");
  await page.keyboard.press("End");
  await help.getByLabel("Find a help topic").fill("keyboard");
  await expect(help.getByRole("listitem")).toHaveText(["Keyboard menus"]);

  const instagram = fixture(page, "instagram");
  await instagram.getByRole("button", { name: "首頁", exact: true }).click();
  await expect(instagram.getByRole("button", { name: "首頁", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Chrome preset", { exact: true }).selectOption("compact-98");
  await expect(instagram.getByRole("button", { name: "首頁", exact: true })).toHaveAttribute("aria-current", "page");
  await instagram.getByRole("button", { name: "個人", exact: true }).click();
  await instagram.getByRole("button", { name: "開啟貼文：First local placeholder", exact: true }).click();
  await expect(instagram.getByRole("button", { name: "返回", exact: true })).toBeVisible();
  await expect(instagram.locator(".ig-text")).toContainText("First local placeholder");
});

test("@smoke chrome delegates close, minimize and restore to the fixture host", async ({ page }) => {
  await openShowcase(page);
  await fixture(page, "error").getByRole("button", { name: "OK", exact: true }).click();
  await fixture(page, "error").getByRole("button", { name: "關閉", exact: true }).click();
  await expect(fixture(page, "error")).toBeHidden();
  await page.getByRole("button", { name: "Restore Application Error", exact: true }).click();
  await expect(fixture(page, "error").getByTestId("error-message")).toHaveText("Acknowledged. No file was changed.");
  const recorder = fixture(page, "recorder");
  await recorder.getByRole("button", { name: "最小化", exact: true }).click();
  await expect(recorder).toBeHidden();
  await page.getByRole("button", { name: "Restore Sound Recorder", exact: true }).click();
  await recorder.getByRole("button", { name: "最大化", exact: true }).click();
  await expect(frame(page, "recorder")).toHaveAttribute("data-maximized", "true");
  await recorder.getByRole("button", { name: "還原", exact: true }).click();
  await expect(frame(page, "recorder")).toHaveAttribute("data-maximized", "false");
});

async function openContract(page: Page) {
  await openShowcase(page);
  await page.getByText("API contract and minimum-size example", { exact: true }).click();
  return page.getByRole("dialog", { name: "Chrome contract example", exact: true });
}

test("@smoke a minimum 220 by 140 frame keeps all sections, footer and title controls reachable", async ({ page }) => {
  const window = await openContract(page);
  await page.getByLabel("Contract toolbar visible", { exact: true }).check();
  await expect(window).toHaveCSS("overflow-y", "auto");
  expect(await window.locator(".retro-window-body").evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(64);
  const input = window.getByRole("textbox", { name: "Contract draft", exact: true });
  const original = await input.elementHandle();
  await window.getByRole("button", { name: "Reset contract draft", exact: true }).click();
  await expect(input).toHaveValue("Reset by footer");
  expect(await input.evaluate((current, previous) => current === previous, original)).toBe(true);
  const bounds = await window.boundingBox();
  const close = window.getByRole("button", { name: "關閉", exact: true });
  const target = await close.boundingBox();
  expect(target!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(target!.y + target!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  await close.click();
});

test("@smoke App and direct status slots replace the fallback while keeping the same content node", async ({ page }) => {
  const window = await openContract(page);
  const input = window.getByRole("textbox", { name: "Contract draft", exact: true });
  await input.fill("State across producer changes");
  const original = await input.elementHandle();
  for (const [producer, label] of [["app", "App portal status"], ["fallback", "Host fallback status"], ["direct", "Direct host status"], ["app", "App portal status"]]) {
    await page.getByLabel("Status producer", { exact: true }).selectOption(producer);
    await expect(window.getByRole("status")).toHaveCount(1);
    await expect(window.getByRole("status")).toHaveText(label);
    await expect(input).toHaveValue("State across producer changes");
    expect(await input.evaluate((current, previous) => current === previous, original)).toBe(true);
  }
});

test("@smoke initially hidden toolbars regain a Tab entry, skip disabled buttons and preserve text keys", async ({ page }) => {
  const window = await openContract(page);
  await page.getByLabel("Contract toolbar visible", { exact: true }).check();
  const toolbar = window.getByRole("toolbar", { name: "Contract toolbar", exact: true });
  const previous = toolbar.getByRole("button", { name: "Previous", exact: true });
  // Assert before any programmatic focus/click could repair a lost tab stop.
  await expect(previous).toHaveAttribute("tabindex", "0");
  const file = window.getByRole("menuitem", { name: "File", exact: true });
  await file.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(previous).toBeFocused();
  await expect(window.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Next", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const input = toolbar.getByRole("textbox", { name: "Toolbar text", exact: true });
  await expect(input).toBeFocused();
  await input.fill("abc");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(input).toBeFocused();
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
  await file.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+Tab");
  await expect(window.getByRole("button", { name: "關閉", exact: true })).toBeFocused();
  await expect(window.getByRole("menu")).toHaveCount(0);
});

test.describe("Chromium Linux screenshot baselines", () => {
  // The regular e2e command may discover this file, but only the dedicated
  // project compares images. WebKit has behavior smoke tests, never Linux PNGs.
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== "chromium" || process.platform !== "linux" || testInfo.project.name !== "chrome-linux", "Run with playwright.chrome.config.ts on Linux Chromium");
  });

  for (const preset of presets) {
    test(`${preset}: five fixtures, bevels, title colors and controls`, async ({ page }) => {
      await openShowcase(page);
      await page.getByLabel("Chrome preset", { exact: true }).selectOption(preset);
      for (const id of fixtureIds) {
        const window = frame(page, id);
        await expect(window).toHaveAttribute("data-chrome-preset", preset);
        await expect(window).toHaveCSS("background-color", "rgb(192, 192, 192)");
        await expect(window).toHaveCSS("border-radius", "0px");
        expect(await window.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("inset");
        const title = window.locator(".retro-titlebar");
        await expect(title).toHaveCSS("background-image", preset === "classic-95" ? "none" : "linear-gradient(90deg, rgb(0, 0, 128), rgb(0, 103, 177))");
        await expect(title).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(window.locator(".retro-title-text")).toHaveCSS("font-size", preset === "compact-98" ? "12px" : "13px");
        await expectContainedControls(window);
        await expect(fixture(page, id)).toHaveScreenshot(`${preset}-${id}.png`);
      }
    });
  }

  test("inactive presets keep their own titlebar treatment", async ({ page }) => {
    await openShowcase(page);
    await page.getByLabel("Active windows", { exact: true }).uncheck();
    for (const preset of presets) {
      await page.getByLabel("Chrome preset", { exact: true }).selectOption(preset);
      const paint = frame(page, "paint");
      await expect(paint).toHaveAttribute("data-active", "false");
      await expect(paint.locator(".retro-titlebar")).toHaveCSS("background-image", preset === "classic-95" ? "none" : "linear-gradient(90deg, rgb(128, 128, 128), rgb(223, 223, 223))");
      await expect(fixture(page, "paint")).toHaveScreenshot(`${preset}-inactive-paint.png`);
    }
  });

  for (const width of [320, 375, 430]) {
    test(`narrow ${width}px viewport contains title controls and chrome sections`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openShowcase(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const id of fixtureIds) {
        const window = frame(page, id);
        await expectContainedControls(window);
        const bounds = await window.boundingBox();
        expect(bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      await expect(fixture(page, "paint")).toHaveScreenshot(`narrow-${width}-paint.png`);
      await expect(fixture(page, "help")).toHaveScreenshot(`narrow-${width}-help.png`);
      if (width === 375) await expect(fixture(page, "instagram")).toHaveScreenshot("narrow-375-instagram.png");
    });
  }

  test("200% CSS zoom keeps menu controls and text usable (not native browser zoom)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await openShowcase(page);
    await page.getByLabel("Preview width", { exact: true }).selectOption("320");
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await expect(page.locator("html")).toHaveCSS("zoom", "2");
    const paint = frame(page, "paint");
    await expectContainedControls(paint);
    await expect(fixture(page, "paint")).toHaveScreenshot("css-zoom-200-paint.png");
    await fixture(page, "paint").getByRole("menuitem", { name: "File", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(fixture(page, "paint").getByRole("menuitem", { name: "Reset sample", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
  });

  test("open menu has visible focus, separators, shortcuts and disabled state", async ({ page }) => {
    await openShowcase(page);
    const paint = fixture(page, "paint");
    await paint.scrollIntoViewIfNeeded();
    await paint.getByRole("menuitem", { name: "File", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(paint.getByRole("menu")).toBeVisible();
    await expect(paint.getByRole("menuitem", { name: "Reset sample", exact: true })).toBeFocused();
    await expect(paint).toHaveScreenshot("classic-98-paint-open-menu.png");
  });
});
