import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

test.use({ locale: "en-US" });
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "contributor@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function openMockEditor(page: Page, mode: "share" | "cancel" | "reject" | "unsupported") {
  await page.addInitScript(({ session, mode }) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(session));
    Object.defineProperty(navigator, "share", { configurable: true, value: mode === "unsupported" ? undefined : async (data: ShareData) => {
      sessionStorage.setItem("shared", JSON.stringify(data));
      if (mode === "cancel") throw new DOMException("Cancelled", "AbortError");
      if (mode === "reject") throw new Error("Unavailable");
    } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { sessionStorage.setItem("copy-attempt", "yes"); throw new Error("Denied"); } } });
  }, { session, mode });
  const draft = structuredClone(documentFixture);
  draft.windows.forEach((win) => { win.defaultOpen = true; win.layout.desktop.x = 20; win.layout.desktop.y = 20; });
  let publishes = 0;
  const site = { id: "site-1", username: "demo", site_name: "Review Desktop", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
  await page.route("**/api/sites/site-1/publish", (route) => { publishes++; return route.fulfill({ json: { publishedVersion: 2, publishedAt: "2026-10-15T00:02:00.000Z", url: "/@demo", artifactStatus: "synced", cleanupWarnings: [] } }); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.locator(".save-text")).toHaveText("Saved");
  return () => publishes;
}

for (const mode of ["share", "cancel", "reject", "unsupported"] as const) {
  test(`publishing feedback and ${mode} sharing use only the mocked public URL`, async ({ page, baseURL }) => {
    const publishes = await openMockEditor(page, mode);
    await expect(page.locator(".topbar-meta")).toContainText("Address after publishing:");
    await expect(page.getByRole("button", { name: "Share link", exact: true })).toHaveCount(0);
    const publish = page.getByRole("button", { name: "Publish", exact: true });
    await publish.focus();
    await expect(publish).toHaveCSS("outline-color", "rgb(255, 234, 0)");
    await expect(publish).toHaveCSS("outline-width", "3px");
    await publish.press("Enter");
    const preflight = page.getByRole("dialog", { name: "Publish Retro Desktop", exact: true });
    await expect(preflight.getByRole("textbox", { name: "Address after publishing:" })).toHaveValue(`${baseURL}/@demo`);
    await expect(preflight).toContainText("not live yet");
    await expect(preflight.locator(".publish-checks .warn").filter({ hasText: "overlap" })).toHaveCount(1);
    await expect(preflight.locator(".publish-checks .ok").filter({ hasText: "windows open automatically" })).toHaveCount(0);
    await expect(preflight).toContainText("visitors keep seeing the published version");
    await preflight.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(publishes()).toBe(0);
    await expect(publish).toBeFocused();
    await publish.click();
    await preflight.getByRole("button", { name: "Confirm and publish" }).click();
    const success = page.getByRole("dialog", { name: "Published", exact: true });
    await expect(success).toBeVisible();
    expect(publishes()).toBe(1);
    const share = success.getByRole("button", { name: "Share link", exact: true });
    if (mode === "unsupported") await expect(share).toHaveCount(0);
    else {
      await share.click();
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("shared") || "{}").url)).toBe(`${baseURL}/@demo`);
      expect(await page.evaluate(() => sessionStorage.getItem("copy-attempt"))).toBeNull();
      if (mode === "reject") await expect(success).toContainText("Sharing is unavailable");
      else await expect(success).not.toContainText("Sharing is unavailable");
    }
    await success.getByRole("button", { name: "Copy URL", exact: true }).click();
    await expect(success).toContainText("Select the address below and copy it manually");
    await expect(success.getByRole("textbox", { name: "Public URL:" })).toHaveValue(`${baseURL}/@demo`);
  });
}
