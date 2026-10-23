import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function signIn(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
}

test("geometry drafts commit once on Enter or blur, preserve partial text, and undo once", async ({ page }) => {
  await signIn(page);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  const saves: Array<any> = [];
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { version: saves.length + 1, updatedAt: "2026-10-15T00:01:00.000Z" } });
  });
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  await expect.poll(() => saves.at(-1)?.document.schemaVersion).toBe(2);
  await expect(page.locator(".save-text")).toHaveText("已儲存");
  await page.getByRole("tab", { name: "版面", exact: true }).click();
  const aboutWindow = page.getByRole("dialog", { name: "About.exe" }).locator("xpath=ancestor::div[contains(@class,'canvas-window')]");
  const width = page.locator("#editor-right-panel").getByLabel("寬", { exact: true });
  await expect(width).toHaveValue("340");
  await expect(aboutWindow).toHaveCSS("width", "340px");
  const baseline = saves.length;
  await width.fill("");
  await expect(width).toHaveValue("");
  await width.fill("4");
  await expect(width).toHaveValue("4");
  expect(saves.length).toBe(baseline);
  await width.fill("430");
  await expect(width).toHaveValue("430");
  await expect(aboutWindow).toHaveCSS("width", "340px");
  expect(saves.length).toBe(baseline);
  await width.press("Enter");
  await expect(aboutWindow).toHaveCSS("width", "430px");
  await expect.poll(() => saves.at(-1)?.document.windows.find((window: any) => window.id === "about")?.layout.desktop.w).toBe(430);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(width).toHaveValue("340");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(width).toHaveValue("430");

  await width.fill("-");
  await width.press("Tab");
  await expect(width).toHaveValue("430");
  await width.fill("9999");
  await width.press("Enter");
  await expect(width).toHaveValue("1400");
  await width.fill("20");
  await width.press("Tab");
  await expect(width).toHaveValue("220");
  await width.fill("220");
  await width.dispatchEvent("compositionstart");
  await width.press("Enter");
  await expect(width).toBeFocused();
  await expect(width).toHaveValue("220");
  await width.dispatchEvent("compositionend");
  await width.press("Enter");
  await expect(width).toHaveValue("220");
  await width.fill("280");
  await width.dispatchEvent("compositionstart");
  await width.evaluate((input) => (input as HTMLInputElement).blur());
  await expect(width).toHaveValue("280");
  await width.dispatchEvent("compositionend");
  await expect(width).toHaveValue("280");
  await width.fill("300");
  await width.press("Escape");
  await expect(width).toHaveValue("280");
});

async function reachCreate(page: Page) {
  await signIn(page);
  await page.route("**/api/usernames/*/availability", (route) => route.fulfill({ json: { available: true } }));
  await page.goto("/onboarding");
  await page.getByPlaceholder("your-name").fill("taken-name");
  await page.getByLabel("桌面名稱").fill("My preserved desktop");
  await expect(page.getByText("這個網址可以使用")).toBeVisible();
  await page.getByRole("button", { name: "下一步 ›" }).click();
  await page.locator(".theme-grid button").nth(1).click();
  await page.getByRole("button", { name: "下一步 ›" }).click();
  await page.locator(".template-grid button").nth(2).click();
}

test("unchanged normalized URL keeps its availability and Next action", async ({ page }) => {
  await signIn(page);
  let checks = 0;
  await page.route("**/api/usernames/*/availability", (route) => {
    checks++;
    return route.fulfill({ json: { available: true } });
  });
  await page.goto("/onboarding");
  const url = page.getByPlaceholder("your-name");
  await url.fill("demo");
  await expect(page.getByText("這個網址可以使用")).toBeVisible();
  expect(checks).toBe(1);
  await url.fill("DEMO"); // Normalizes back to the same stored username.
  await expect(url).toHaveValue("demo");
  await expect(page.getByText("這個網址可以使用")).toBeVisible();
  await expect(page.getByRole("button", { name: "下一步 ›" })).toBeEnabled();
  expect(checks).toBe(1);
  await page.getByRole("button", { name: "下一步 ›" }).click();
  await expect(page.getByRole("heading", { name: "選一個初始主題" })).toBeVisible();
});

test("409 offers URL correction while preserving the chosen theme and template", async ({ page }) => {
  let creates = 0;
  await page.route("**/api/sites", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { sites: [] } });
    creates++;
    if (creates === 1) return route.fulfill({ status: 409, json: { error: { code: "username_taken", message: "taken" } } });
    return route.fulfill({ status: 201, json: { site: { id: "site-2" } } });
  });
  await reachCreate(page);
  await page.getByRole("button", { name: "完成，進入編輯器" }).click();
  await expect(page.getByRole("alert")).toContainText("設定期間這個網址已被使用");
  await expect(page.getByRole("button", { name: "完成，進入編輯器" })).toBeDisabled();
  expect(creates).toBe(1);
  await page.getByRole("button", { name: "更換網址" }).click();
  await expect(page.getByLabel("桌面名稱")).toHaveValue("My preserved desktop");
  await page.getByPlaceholder("your-name").fill("new-name");
  await expect(page.getByText("這個網址可以使用")).toBeVisible();
  await page.getByRole("button", { name: "下一步 ›" }).click();
  await expect(page.locator(".theme-grid button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步 ›" }).click();
  await expect(page.locator(".template-grid button").nth(2)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "完成，進入編輯器" }).click();
  await expect(page).toHaveURL(/\/editor\/site-2$/);
  expect(creates).toBe(2);
});

test("failed creation shows retry and rapid repeated activation sends one request", async ({ page }) => {
  let creates = 0;
  let release!: () => void;
  await page.route("**/api/sites", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { sites: [] } });
    creates++;
    if (creates === 1) {
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ status: 500, json: { error: { code: "db_error", message: "failed" } } });
    }
    return route.fulfill({ status: 201, json: { site: { id: "site-3" } } });
  });
  await reachCreate(page);
  const done = page.getByRole("button", { name: "完成，進入編輯器" });
  await done.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => creates).toBe(1);
  await expect(page.getByRole("button", { name: "建立中..." })).toBeDisabled();
  await expect(page.getByRole("button", { name: "上一步" })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("請檢查網路後重試");
  const retry = page.getByRole("button", { name: "重試建立" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page).toHaveURL(/\/editor\/site-3$/);
  expect(creates).toBe(2);
});

test("expired session offers sign-in rather than a fruitless create retry", async ({ page }) => {
  await page.route("**/api/sites", (route) => route.fulfill({ status: 401, json: { error: { code: "unauthorized", message: "expired" } } }));
  await reachCreate(page);
  await page.getByRole("button", { name: "完成，進入編輯器" }).click();
  await expect(page.getByRole("alert")).toContainText("登入狀態已過期");
  await expect(page.getByRole("button", { name: "重新登入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "完成，進入編輯器" })).toBeDisabled();
});

test("invalid creation details offer review and the desktop name is capped to the API bound", async ({ page }) => {
  let creates = 0;
  await page.route("**/api/sites", (route) => {
    creates++;
    return route.fulfill({ status: 400, json: { error: { code: "invalid_site", message: "invalid" } } });
  });
  await reachCreate(page);
  await page.getByRole("button", { name: "完成，進入編輯器" }).click();
  await expect(page.getByRole("alert")).toContainText("請確認網址和桌面名稱");
  await expect(page.getByRole("button", { name: "完成，進入編輯器" })).toBeDisabled();
  await page.getByRole("button", { name: "檢查資料" }).click();
  const siteName = page.getByLabel("桌面名稱");
  await expect(siteName).toHaveValue("My preserved desktop");
  await expect(siteName).toHaveAttribute("maxlength", "120");
  expect(creates).toBe(1);
});
