import { expect, test, type Locator } from "@playwright/test";

async function setRange(locator: Locator, value: string) {
  await locator.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    const steps = Math.round((Number(next) - input.valueAsNumber) / Number(input.step));
    input.stepUp(steps);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/image-w3b-debug.html");
  await expect(page.getByRole("heading", { name: "Image W3b leaf fixture" })).toBeVisible();
});

test("image controls update the reader and preserve alt while decorative", async ({ page }) => {
  const editor = page.locator("#image-editor");
  const visitor = page.locator("#image-visitor");
  const state = page.getByTestId("content-state");
  await expect(visitor.locator("img")).toHaveAttribute("alt", "Wide synthetic artwork");
  await editor.getByLabel("Alt text").fill("New alternative description");
  await expect(visitor.locator("img")).toHaveAttribute("alt", "New alternative description");
  await editor.getByRole("textbox", { name: "Caption", exact: true }).fill("New caption");
  await expect(visitor.locator("figcaption")).toHaveText("New caption");
  await editor.getByLabel("Show caption").uncheck();
  await expect(visitor.locator("figcaption")).toHaveCount(0);
  await editor.getByLabel("Image role").selectOption("decorative");
  await expect(visitor.locator("figure")).toHaveAttribute("aria-hidden", "true");
  await expect(visitor.locator("img")).toHaveAttribute("alt", "");
  await expect(state).toContainText('"alt":"New alternative description"');
  await editor.getByLabel("Image role").selectOption("content");
  await expect(visitor.locator("img")).toHaveAttribute("alt", "New alternative description");
});

test("fit, crop, background, pixel rendering, and undo are real leaf edits", async ({ page }) => {
  const editor = page.locator("#image-editor");
  const visitor = page.locator("#image-visitor");
  const state = page.getByTestId("content-state");
  await editor.getByLabel("Fit").selectOption("cover");
  await expect(visitor.locator("figure")).toHaveAttribute("data-fit", "cover");
  await setRange(editor.getByRole("slider", { name: "Horizontal focus" }), "23");
  await setRange(editor.getByRole("slider", { name: "Vertical focus" }), "71");
  await setRange(editor.getByRole("slider", { name: "Zoom" }), "2");
  await expect(state).toContainText('"crop":{"x":23,"y":71,"zoom":2}');
  await editor.getByLabel("Background").selectOption("checker");
  await expect(visitor.locator("[data-testid=image-stage]")).toHaveClass(/checker/);
  await editor.getByLabel("Background").selectOption("color");
  await editor.getByLabel("Color", { exact: true }).fill("#aabbcc");
  await expect(visitor.locator("[data-testid=image-stage]")).toHaveCSS("background-color", "rgb(170, 187, 204)");
  await editor.getByLabel("Pixelated rendering").check();
  await expect(visitor.locator("img")).toHaveCSS("image-rendering", "pixelated");
  await page.locator("#fixture-undo").click();
  await expect(visitor.locator("img")).not.toHaveCSS("image-rendering", "pixelated");
  await expect(state).toContainText('"background":{"color":"#aabbcc"}');
  await editor.getByRole("button", { name: "Reset crop" }).click();
  await expect(state).not.toContainText('"crop"');
  await editor.getByRole("combobox", { name: "Frame", exact: true }).selectOption("none");
  await expect(visitor.locator("figure")).toHaveAttribute("data-frame", "none");
  await expect(state).toContainText('"src":"/wide.png"');
});

test("source URL commits and removes in disposable host", async ({ page }) => {
  const editor = page.locator("#image-editor");
  const state = page.getByTestId("content-state");
  await editor.getByLabel("Image URL").fill("/bad-relative-url");
  await editor.getByLabel("Image URL").blur();
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(state).toContainText('"src":"/wide.png"');
  const localUrl = "https://example.test/wide.png";
  await page.route(localUrl, (route) => route.fulfill({ path: "tests/fixtures/image-w3a/wide.png", contentType: "image/png" }));
  await editor.getByLabel("Image URL").fill(localUrl);
  await editor.getByLabel("Image URL").blur();
  await expect(state).toContainText(`"src":"${localUrl}"`);
  await editor.getByRole("button", { name: "Remove image" }).click();
  await expect(state).toContainText('"src":null');
});
