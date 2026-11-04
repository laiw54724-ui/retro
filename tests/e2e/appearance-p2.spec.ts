import { expect, test } from "@playwright/test";
import { mockColors } from "./appearance-p2-fixture";

for (const width of [320, 390, 430]) {
  test(`P2 public colors, labels and explicit tiles at ${width}`, async ({ page }, testInfo) => {
    await mockColors(page);
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/@demo");
    const firstLabel = page.getByRole("button", { name: "First.exe", exact: true }).locator(".m-label");
    await expect(firstLabel).toHaveCSS("background-color", "rgb(34, 34, 34)");
    await expect(firstLabel).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.getByRole("button", { name: "First.exe", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "First.exe", exact: true });
    await expect(dialog).toHaveCSS("background-color", "rgb(51, 68, 85)");
    await expect(dialog.locator(".retro-titlebar")).toHaveCSS("color", "rgb(255, 204, 221)");
    await expect(dialog.locator(".module-host")).toHaveCSS("background-color", "rgb(255, 238, 204)");
    await expect(dialog.locator(".module-host")).toHaveCSS("color", "rgb(51, 17, 34)");
    await page.screenshot({ path: testInfo.outputPath(`p2-mobile-${width}.png`) });
    await page.getByRole("button", { name: "關閉", exact: true }).click();
    await page.getByRole("button", { name: "Second.exe", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Second.exe", exact: true });
    await expect(dialog).toHaveCSS("background-color", "rgb(85, 68, 51)");
    await expect(dialog.locator(".module-host")).toHaveCSS("background-color", "rgb(221, 238, 255)");
    // Explicit tile fill is above generic content appearance.
    await expect(dialog.locator(".link-tile").first()).not.toHaveCSS("background-color", "rgb(221, 238, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("P2 reader isolates two windows in owner, preview and public; title reset retains other colors", async ({ page }, testInfo) => {
  const site = await mockColors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const first = page.getByRole("dialog", { name: "First.exe", exact: true });
  const second = page.getByRole("dialog", { name: "Second.exe", exact: true });
  await expect(first).toHaveCSS("background-color", "rgb(51, 68, 85)");
  await expect(second).toHaveCSS("background-color", "rgb(85, 68, 51)");
  await expect(first.locator(".module-host")).toHaveCSS("background-color", "rgb(255, 238, 204)");
  await expect(second.locator(".module-host")).toHaveCSS("background-color", "rgb(221, 238, 255)");
  await page.screenshot({ path: testInfo.outputPath("p2-desktop-two-windows.png") });
  await page.getByRole("button", { name: "▶ 訪客預覽", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "訪客預覽", exact: true });
  await expect(preview.getByRole("dialog", { name: "First.exe", exact: true })).toHaveCSS("background-color", "rgb(51, 68, 85)");
  await preview.getByRole("button", { name: "手機版", exact: true }).click();
  await preview.getByRole("button", { name: "First.exe", exact: true }).click();
  await expect(preview.getByRole("dialog", { name: "First.exe", exact: true }).locator(".module-host")).toHaveCSS("color", "rgb(51, 17, 34)");
  await preview.getByRole("button", { name: "‹ 回到編輯器", exact: true }).click();
  expect(site.writes()).toBe(0);
  await first.locator(".retro-titlebar").click();
  await page.getByRole("tab", { name: "版面", exact: true }).click();
  await page.getByRole("button", { name: "恢復主題設定", exact: true }).click();
  if (process.env.VITE_APPEARANCE_P2_WRITER === "true") await page.getByRole("button", { name: "套用視窗色彩", exact: true }).click();
  await expect.poll(() => site.saved().windows[0].appearance?.titleFrom).toBeUndefined();
  expect(site.saved().windows[0].appearance?.contentBackground).toBe("#ffeecc");
  expect(site.saved().windows[0].appearance?.desktopLabelText).toBe("#ffffff");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "First.exe", exact: true })).toHaveCSS("background-color", "rgb(51, 68, 85)");
  await page.goto("/@demo");
  await expect(page.getByRole("dialog", { name: "First.exe", exact: true }).locator(".module-host")).toHaveCSS("background-color", "rgb(255, 238, 204)");
});
