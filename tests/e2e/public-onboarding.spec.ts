import { expect, test } from "@playwright/test";

for (const width of [320, 768, 1280]) {
  test(`public navigation, FAQ and sign-in explanation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "首頁導覽" })).toBeVisible();
    await page.getByRole("link", { name: "常見問題", exact: true }).click();
    const question = page.locator("#faq summary").first();
    await question.click();
    await expect(page.locator("#faq details").first()).toHaveAttribute("open", "");
    await expect(page.locator("#faq details").first()).toContainText("Google");
    await question.click();
    await expect(page.locator("#faq details").first()).not.toHaveAttribute("open", "");
    for (const link of await page.locator(".landing-footer a[target=_blank]").all()) {
      await expect(link).toContainText("新分頁");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveAttribute("href", /^https:\/\/github.com\/laiw54724-ui\/retro/);
    }
    await expect(page.locator(".landing-footer")).toContainText("Issues 是公開的");
    await page.getByRole("link", { name: "開始建立我的桌面 →", exact: true }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.locator(".auth-introduction")).toContainText("Supabase Auth");
    await expect(page.locator(".auth-introduction")).toContainText("電子郵件");
    await expect(page.getByRole("button", { name: "使用 Google 繼續" })).toHaveAttribute("aria-describedby", "google-sign-in-help");
    await page.screenshot({ path: testInfo.outputPath(`auth-${width}.png`) });
    await page.getByRole("link", { name: "先看看範例" }).click();
    await expect(page).toHaveURL(/\/#examples$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("language detail is optional, locale persists, and the hero Start opens a real demo", async ({ page }) => {
  await page.goto("/");
  const language = page.locator(".landing-navigation");
  await expect(language).toContainText("只切換介面語言");
  const details = language.locator("details");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toContainText("尚未提供簡體中文");
  await language.getByTestId("language-switcher").selectOption("en");
  await expect(page.getByRole("link", { name: "Common questions", exact: true })).toBeVisible();
  await page.reload();
  await expect(language.getByTestId("language-switcher")).toHaveValue("en");
  await page.getByRole("button", { name: "Start the demo →", exact: true }).click();
  await expect(page.locator(".preview-overlay")).toBeVisible();
  await expect(page.locator(".preview-sample-disclaimer")).toContainText("not saved");
  await page.keyboard.press("Escape");
  await expect(page.locator(".preview-overlay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start the demo →", exact: true })).toBeFocused();
});

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
  test(`Fit keeps the complete demo and taskbar in view at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    let writes = 0;
    page.on("request", (request) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) writes++; });
    await page.goto("/");
    for (let i = 0; i < 4; i++) {
      const opener = page.locator(".example-card").nth(i);
      await opener.click();
      const preview = page.locator(".preview-overlay");
      await preview.locator(".device-toggle").getByRole("button", { name: "桌面版", exact: true }).click();
      const region = preview.getByRole("region", { name: "桌面預覽畫布" });
      const canvas = preview.locator("[data-desktop-preview-canvas]");
      await expect(canvas).toBeVisible();
      await expect.poll(async () => {
        const box = await canvas.boundingBox(), host = await region.boundingBox();
        return !!box && !!host && box.x >= host.x - 1 && box.y >= host.y - 1 && box.x + box.width <= host.x + host.width + 1 && box.y + box.height <= host.y + host.height + 1;
      }).toBe(true);
      const taskbar = await preview.locator(".visitor-taskbar").boundingBox();
      const host = await region.boundingBox();
      expect(host!.y + host!.height).toBeLessThanOrEqual(size.height + 1);
      expect(taskbar!.y + taskbar!.height).toBeLessThanOrEqual(host!.y + host!.height + 1);
      const start = preview.getByRole("button", { name: "開始", exact: true });
      await start.focus();
      await page.keyboard.press("ArrowDown");
      const menu = preview.getByRole("menu", { name: "開始功能表" });
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitem").last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(preview).toBeVisible();
      await expect(start).toBeFocused();
      if (i === 0) await page.screenshot({ path: testInfo.outputPath(`fit-${size.width}.png`) });
      await preview.getByRole("button", { name: "100%", exact: true }).click();
      await preview.getByRole("button", { name: "適合畫面", exact: true }).click();
      await preview.locator(".device-toggle").getByRole("button", { name: "手機版", exact: true }).click();
      await expect(preview.locator(".m-screen")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
    expect(writes).toBe(0);
    await page.locator(".example-card").first().click();
    await page.goBack();
    await expect(page.locator(".preview-overlay")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });
}

test("a returned sign-in error leaves the demo escape route available", async ({ page }) => {
  await page.goto("/auth?error_description=Sign-in%20was%20cancelled");
  await expect(page.locator(".error-box")).toContainText("Sign-in was cancelled");
  await expect(page.getByRole("button", { name: "使用 Google 繼續" })).toBeEnabled();
  await page.getByRole("link", { name: "先看看範例" }).click();
  await page.locator(".example-card").first().click();
  await expect(page.locator(".preview-overlay")).toBeVisible();
  await page.getByRole("button", { name: /返回範例/ }).click();
  await expect(page.locator(".preview-overlay")).toHaveCount(0);
  await expect(page).toHaveURL(/\/#examples$/);
});
