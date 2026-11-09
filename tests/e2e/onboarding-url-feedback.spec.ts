import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "contributor@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

for (const width of [320, 390, 768, 1440]) {
  test(`URL rules, status and exit are clear at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
    const writes: string[] = [];
    let checks = 0;
    page.on("request", (request) => { if (request.method() !== "GET") writes.push(request.url()); });
    await page.route("**/api/usernames/*/availability", async (route) => {
      checks++;
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (route.request().url().includes("failed")) return route.fulfill({ status: 500, json: { error: "unavailable" } });
      return route.fulfill({ json: { available: !route.request().url().includes("taken") } });
    });
    await page.route("**/api/sites", (route) => route.fulfill({ json: { sites: [] } }));
    await page.goto("/onboarding");
    const url = page.getByPlaceholder("your-name");
    const status = page.locator("#url-availability");
    const next = page.getByRole("button", { name: "Next ›" });
    await expect(page.locator(".url-input > span")).toHaveText(`${new URL(baseURL!).host}/@`);
    for (const [value, reason] of [["ab", "at least 3"], ["a".repeat(21), "no more than 20"], ["bad_name", "only lowercase"], ["-name", "Start and end"], ["name-", "Start and end"], ["admin", "reserved"]]) {
      await url.fill(value);
      await expect(status).toContainText(reason);
      await expect(status).toHaveClass(/bad/);
      await expect(status).toHaveCSS("color", "rgb(138, 0, 24)");
      await expect(url).toHaveAttribute("aria-invalid", "true");
      await expect(next).toBeDisabled();
    }
    expect(checks).toBe(0);
    await url.fill("valid-name");
    await expect(status).toHaveClass(/neutral/);
    await expect(status).toContainText("Checking");
    await expect(status).toHaveClass(/good/);
    await expect(status).toContainText("available");
    await expect(url).not.toHaveAttribute("aria-invalid", "true");
    await expect(next).toBeEnabled();
    await url.fill("taken-name");
    await expect(status).toContainText("already taken");
    await expect(status).toHaveClass(/bad/);
    await url.fill("failed-name");
    await expect(page.getByRole("button", { name: "Retry check" })).toBeVisible();
    await expect(status).toHaveClass(/bad/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`onboarding-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Back to My desktops" }).click();
    await expect(page).toHaveURL(/\/auth$/);
    expect(writes).toEqual([]);
  });
}
