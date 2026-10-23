import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function document(): SiteDocument {
  const guestbook = makeWindow("guestbook");
  guestbook.id = "guestbook";
  guestbook.title = "Guestbook.exe";
  guestbook.defaultOpen = true;
  guestbook.content.enabled = true;
  guestbook.layout.desktop = { ...guestbook.layout.desktop, x: 40, y: 20, w: 520, h: 650, z: 2 };
  return { ...structuredClone(documentFixture), windows: [guestbook] } as SiteDocument;
}

function entry(n: number, name: string, status: "pending" | "approved" | "rejected", openReportCount = 0) {
  return { id: id(n), displayName: name, body: `${name} body`, status, createdAt: "2026-10-17T00:00:00.000Z", openReportCount };
}

async function owner(page: Page) {
  const draft = document();
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: site.updated_at } }));
}

test("owner filters real queue rows, retries a failed read, and locks only the active row", async ({ page }) => {
  await owner(page);
  const rows = [entry(1, "Pending visitor", "pending"), entry(2, "Public visitor", "approved", 2), entry(3, "Rejected visitor", "rejected"), entry(4, "Reported pending", "pending", 1)];
  let reads = 0;
  let actions = 0;
  let releaseAction: (() => void) | undefined;
  await page.route("**/api/sites/site-1/guestbook", (route) => {
    reads++;
    return route.fulfill(reads <= 2 ? { status: 503, json: { error: { code: "db_error" } } } : { json: { entries: rows } });
  });
  await page.route(`**/api/sites/site-1/guestbook/${id(1)}`, async (route) => {
    actions++;
    if (actions === 1) return route.fulfill({ status: 503, json: { error: { code: "db_error" } } });
    await new Promise<void>((resolve) => { releaseAction = resolve; });
    rows[0] = { ...rows[0], status: "approved" };
    await route.fulfill({ json: { entry: rows[0] } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const queue = page.getByRole("dialog", { name: "Guestbook.exe" }).locator(".guestbook-moderation");
  await expect(queue.getByRole("alert")).toContainText("無法載入審核列表");
  await expect(queue).not.toContainText("目前沒有留言");
  await queue.getByRole("button", { name: "重試" }).click();
  await expect(queue.locator("article")).toHaveCount(4);
  await queue.getByRole("button", { name: "待審", exact: true }).click();
  await expect(queue.locator("article")).toHaveCount(2);
  await expect(queue).toContainText("Pending visitor");
  await expect(queue).not.toContainText("Public visitor");
  await queue.getByRole("button", { name: "已公開", exact: true }).click();
  await expect(queue.locator("article")).toHaveCount(1);
  await expect(queue).toContainText("Public visitor");
  await queue.getByRole("button", { name: "有待處理檢舉" }).click();
  await expect(queue.locator("article")).toHaveCount(2);
  await expect(queue).toContainText("Reported pending");
  await queue.getByRole("button", { name: "已拒絕" }).click();
  await expect(queue.locator("article")).toHaveCount(1);
  await queue.getByRole("button", { name: "全部" }).click();
  const pending = queue.locator("article", { hasText: "Pending visitor" });
  await pending.getByRole("button", { name: "核准" }).click();
  await expect(page.getByRole("dialog", { name: "Guestbook.exe" }).getByRole("alert")).toContainText("審核操作失敗");
  await expect(pending).toContainText("待審");
  await pending.getByRole("button", { name: "核准" }).click();
  await expect(pending.getByRole("button", { name: "核准" })).toBeDisabled();
  await expect(pending.getByRole("button", { name: "隱藏" })).toBeDisabled();
  await expect(pending.getByRole("button", { name: "刪除" })).toBeDisabled();
  await expect(queue.locator("article", { hasText: "Public visitor" }).getByRole("button", { name: "刪除" })).toBeEnabled();
  expect(actions).toBe(2);
  releaseAction?.();
  await expect(pending).toContainText("已公開");
  await queue.getByRole("button", { name: "待審", exact: true }).click();
  await expect(queue.locator("article")).toHaveCount(1);
});

test("focused moderation card supports A, H and Delete without leaking actions from other controls", async ({ page }) => {
  await owner(page);
  let rows = [entry(1, "Keyboard visitor", "pending")];
  const requests: Array<{ method: string; status?: string }> = [];
  await page.route("**/api/sites/site-1/guestbook", (route) => route.fulfill({ json: { entries: rows } }));
  await page.route(`**/api/sites/site-1/guestbook/${id(1)}`, async (route) => {
    const method = route.request().method();
    const status = method === "PUT" ? route.request().postDataJSON().status as string : undefined;
    requests.push({ method, status });
    if (method === "DELETE") { rows = []; return route.fulfill({ status: 204, body: "" }); }
    rows = [{ ...rows[0], status: status as "approved" | "rejected" }];
    return route.fulfill({ json: { entry: rows[0] } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const queue = page.getByRole("dialog", { name: "Guestbook.exe" }).locator(".guestbook-moderation");
  const card = queue.locator("article", { hasText: "Keyboard visitor" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "核准" }).focus();
  await page.keyboard.press("h");
  expect(requests).toHaveLength(0);
  await card.focus(); await page.keyboard.press("a");
  await expect(card).toContainText("已公開");
  await expect.poll(() => requests).toEqual([{ method: "PUT", status: "approved" }]);
  await card.focus(); await page.keyboard.press("h");
  await expect(card).toContainText("已拒絕");
  await expect.poll(() => requests).toHaveLength(2);
  expect(requests[1]).toEqual({ method: "PUT", status: "rejected" });
  await card.focus(); await page.keyboard.press("Delete");
  await expect(card).toHaveCount(0);
  expect(requests[2]).toEqual({ method: "DELETE" });
});

test.describe("mobile owner queue", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const width of [320, 375, 390, 430]) {
    test(`${width}px keeps the moderation cards ahead of settings with reachable actions`, async ({ page }, info) => {
      await owner(page);
      await page.route("**/api/sites/site-1/guestbook", (route) => route.fulfill({ json: { entries: [entry(1, "Pending visitor", "pending")] } }));
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/editor/site-1");
      await page.locator(".m-icon", { hasText: "Guestbook.exe" }).click();
      await page.locator(".m-edit-toggle").click();
      const queue = page.locator(".m-window .guestbook-moderation");
      await expect(queue.locator("article")).toHaveCount(1);
      const card = queue.locator("article");
      await expect(card.getByRole("button", { name: "核准" })).toBeVisible();
      const queueBox = await queue.boundingBox();
      const settingsBox = await page.locator(".m-window .guestbook-settings").boundingBox();
      if (!queueBox || !settingsBox) throw new Error("queue layout bounds");
      expect(queueBox.y).toBeLessThan(settingsBox.y);
      const approve = await card.getByRole("button", { name: "核准" }).boundingBox();
      expect(approve?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`guestbook-queue-${width}.png`), fullPage: false });
    });
  }
});

test.describe("touch visitor", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const width of [320, 390]) {
    test(`at ${width}px retries loading and keeps pending messages private`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      const draft = document();
      await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: draft, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
      let reads = 0;
      let reports = 0;
      let submissions = 0;
      let releaseReport: (() => void) | undefined;
      await page.route("**/api/public/sites/demo/guestbook", (route) => {
        if (route.request().method() === "POST") {
          submissions++;
          return route.fulfill({ status: 202, json: { entry: entry(3, "Private pending", "pending") } });
        }
        reads++;
        return route.fulfill(reads <= 2 ? { status: 503, json: { error: { code: "db_error" } } } : { json: { entries: [entry(1, "Visible public", "approved"), entry(2, "Never public", "pending")] } });
      });
      await page.route(`**/api/public/sites/demo/guestbook/${id(1)}/reports`, async (route) => {
        reports++;
        await new Promise<void>((resolve) => { releaseReport = resolve; });
        await route.fulfill({ json: { accepted: true } });
      });
      await page.goto("/@demo");
      await page.locator(".visitor-mobile").getByRole("button", { name: "Guestbook.exe" }).tap();
      const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Guestbook.exe" });
      await expect(dialog.getByRole("alert")).toContainText("目前無法載入留言");
      await expect(dialog).not.toContainText("目前還沒有已核准的留言");
      await dialog.getByRole("button", { name: "重試" }).tap();
      await expect(dialog).toContainText("Visible public");
      await expect(dialog).not.toContainText("Never public");
      const name = dialog.getByRole("textbox", { name: "暱稱（不驗證身分）" });
      const body = dialog.getByRole("textbox", { name: "留言", exact: true });
      await name.fill("A".repeat(40));
      await body.fill("B".repeat(1000));
      await expect(dialog).toContainText("40/40");
      await expect(dialog).toContainText("1000/1000");
      await dialog.getByRole("button", { name: "送出審核" }).tap();
      await expect(dialog.getByRole("status")).toContainText("已送出待審");
      await expect(dialog).not.toContainText("Private pending");
      expect(submissions).toBe(1);
      const report = dialog.getByRole("button", { name: "檢舉" });
      await report.tap();
      await expect(report).toBeDisabled();
      expect(reports).toBe(1);
      releaseReport?.();
      await expect(report).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
  }
});

test("late list response after owner window closes cannot replace the reopened queue", async ({ page }) => {
  await owner(page);
  let reads = 0;
  const releaseOld: Array<() => void> = [];
  await page.route("**/api/sites/site-1/guestbook", async (route) => {
    reads++;
    if (reads <= 2) {
      await new Promise<void>((resolve) => { releaseOld.push(resolve); });
      return route.fulfill({ json: { entries: [entry(1, "Old response", "pending")] } });
    }
    return route.fulfill({ json: { entries: [entry(2, "Fresh response", "approved")] } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const dialog = page.getByRole("dialog", { name: "Guestbook.exe" });
  await expect(dialog.getByRole("status")).toContainText("載入中");
  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /開啟 Guestbook.exe/ }).click();
  await expect(dialog).toContainText("Fresh response");
  releaseOld.forEach((release) => release());
  await expect(dialog).not.toContainText("Old response");
});

test("closing during submission and navigating during report leave later visitor state intact", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  const draft = document();
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: draft, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.route("**/api/public/sites/demo/guestbook", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { entries: [entry(1, "Public visitor", "approved")] } });
    await new Promise<void>((resolve) => { releaseSubmission = resolve; });
    return route.fulfill({ status: 202, json: { entry: entry(2, "Pending visitor", "pending") } });
  });
  let releaseSubmission: (() => void) | undefined;
  let releaseReport: (() => void) | undefined;
  await page.route(`**/api/public/sites/demo/guestbook/${id(1)}/reports`, async (route) => {
    await new Promise<void>((resolve) => { releaseReport = resolve; });
    await route.fulfill({ json: { accepted: true } }).catch(() => {}); // Navigation may cancel the old page's request.
  });
  await page.goto("/@demo");
  const icon = page.locator(".visitor-mobile").getByRole("button", { name: "Guestbook.exe" });
  await icon.click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Guestbook.exe" });
  await dialog.getByRole("textbox", { name: "暱稱（不驗證身分）" }).fill("First visitor");
  await dialog.getByRole("textbox", { name: "留言", exact: true }).fill("In flight");
  await dialog.getByRole("button", { name: "送出審核" }).click();
  await expect(dialog.getByRole("button", { name: "送出中…" })).toBeDisabled();
  await expect.poll(() => Boolean(releaseSubmission)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await icon.click();
  const body = dialog.getByRole("textbox", { name: "留言", exact: true });
  await body.fill("Fresh unsent draft");
  const settled = page.waitForResponse((response) => response.url().endsWith("/api/public/sites/demo/guestbook") && response.request().method() === "POST");
  releaseSubmission?.();
  await settled;
  await expect(body).toHaveValue("Fresh unsent draft");
  await expect(dialog).not.toContainText("已送出待審");
  await dialog.getByRole("button", { name: "檢舉" }).click();
  await expect.poll(() => Boolean(releaseReport)).toBe(true);
  await page.goto("/");
  await expect(page.locator(".landing-shell")).toBeVisible();
  releaseReport?.();
  await page.goto("/@demo");
  await icon.click();
  await expect(dialog).toContainText("Public visitor");
  await expect(dialog).not.toContainText("已收到檢舉");
});
