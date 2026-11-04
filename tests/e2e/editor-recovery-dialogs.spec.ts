import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";

// #174 / #175: all API traffic is synthetic and every non-local request is blocked.
// Copy contract: reuse existing "已複製" / "無法使用剪貼簿" feedback inside the
// conflict dialog; fallback reuses "下載本機復原 JSON" from upgrade recovery.
const session = { access_token: "a.b.c", refresh_token: "fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
type PublishResult = "success" | "conflict" | "upgrade";

async function fixture(page: Page, result: PublishResult = "success", legacyAssets = false) {
  const legacy = createStarterDocument("Recovery fixture", "classic98", "blank");
  const notes = makeWindow("document");
  notes.id = "notes"; notes.title = "Notes.exe"; notes.defaultOpen = false;
  legacy.windows = [notes];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "recovery-fixture" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  let draft = migrated.document;
  let saves = 0, publishes = 0, version = 1;
  const assets = legacyAssets ? [{ id: "11111111-1111-4111-8111-111111111111", url: "https://legacy.example.test/fixture.png", name: "測試舊素材", mimeType: "image/png", size: 10, kind: "image", createdAt: "2026-10-26T00:00:00Z", storageScope: "legacy_public", migrationRequired: true, publicCopyRemaining: false }] : [];
  await page.addInitScript(value => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(value));
    localStorage.setItem("retrodesk:locale", "zh-Hant");
  }, session);
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/sites/recovery-fixture") return route.fulfill({ json: { site: { id: "recovery-fixture", username: "fixture", site_name: "Recovery fixture", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-26T00:00:00Z", access_role: "owner" } } });
    if (url.pathname === "/api/sites/recovery-fixture/assets") return route.fulfill({ json: { assets } });
    if (url.pathname === "/api/sites/recovery-fixture/draft") {
      draft = route.request().postDataJSON().document; saves++;
      return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-26T00:01:00Z" } });
    }
    if (url.pathname === "/api/sites/recovery-fixture/publish") {
      publishes++;
      if (result !== "success") return route.fulfill({ status: result === "conflict" ? 409 : 426, json: { error: { code: result === "conflict" ? "version_conflict" : "client_upgrade_required", message: "Synthetic recovery response" } } });
      return route.fulfill({ json: { publishedVersion: version, publishedAt: "2026-10-26T00:02:00Z", url: "/@fixture", artifactStatus: "synced", retryable: false } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.goto("/editor/recovery-fixture");
  await expect(page.getByRole("button", { name: "發布", exact: true })).toBeEnabled();
  return { draft: () => draft, saves: () => saves, publishes: () => publishes };
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await page.getByRole("dialog", { name: "發布 Retro Desktop", exact: true }).getByRole("button", { name: "確認發布", exact: true }).click();
}

async function modalContract(page: Page, dialog: Locator, width: number) {
  await expect(dialog).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  const controls = dialog.locator("button:enabled, a[href], input:enabled, select:enabled, textarea:enabled, [tabindex='0']").filter({ visible: true });
  await controls.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

for (const width of [320, 390, 430]) {
  test(`published success owns keyboard focus and names its URL at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const backend = await fixture(page);
    await publish(page);
    const dialog = page.getByRole("dialog", { name: "發布完成", exact: true });
    await modalContract(page, dialog, width);
    await expect(dialog.getByRole("textbox", { name: /公開網址/ })).toHaveValue(/\/@fixture$/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    // Publishing may disable its opener; focus must have an enabled, visible fallback.
    await expect.poll(() => page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return !!active && active !== document.body && !!document.getElementById("root")?.contains(active) && !active.matches(":disabled") && active.getClientRects().length > 0;
    })).toBe(true);
    expect(backend.publishes()).toBe(1);
    expect(backend.saves()).toBe(0);
  });

  test(`legacy asset dialog owns keyboard focus and returns to opener at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const backend = await fixture(page, "success", true);
    const opener = page.getByRole("button", { name: "查看是哪幾個", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "舊素材遷移明細", exact: true });
    await modalContract(page, dialog, width);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    expect(backend.saves()).toBe(0);
    expect(backend.publishes()).toBe(0);
  });

  test(`426 recovery contains focus and safely returns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const backend = await fixture(page, "upgrade");
    await publish(page);
    const dialog = page.getByRole("alertdialog", { name: "編輯器需要更新", exact: true });
    await modalContract(page, dialog, width);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
    const reopen = page.getByRole("button", { name: "編輯器需要更新", exact: true });
    await reopen.click();
    await modalContract(page, dialog, width);
    await page.keyboard.press("Escape");
    await expect(reopen).toBeFocused();
    expect(backend.saves()).toBe(0);
    expect(backend.publishes()).toBe(1);
  });
}

for (const clipboard of ["success", "reject", "unavailable"] as const) {
  test(`conflict backup feedback stays inside the dialog and download preserves canonical data: ${clipboard}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(mode => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "unavailable" ? undefined : {
        writeText: async (value: string) => {
          if (mode === "reject") throw new DOMException("Synthetic clipboard rejection", "NotAllowedError");
          (window as unknown as { copiedRecovery: string }).copiedRecovery = value;
        }
      } });
    }, clipboard);
    const backend = await fixture(page, "conflict");
    await publish(page);
    const dialog = page.getByRole("alertdialog", { name: "版本衝突", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "複製本機 JSON", exact: true }).click();
    const feedback = dialog.locator('[role="status"], [role="alert"]');
    await expect(feedback.filter({ hasText: clipboard === "success" ? /已複製/ : /無法使用剪貼簿/ })).toBeVisible();
    if (clipboard === "success") {
      expect(JSON.parse(await page.evaluate(() => (window as unknown as { copiedRecovery: string }).copiedRecovery))).toEqual(backend.draft());
    }
    const downloaded = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "下載本機復原 JSON", exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(JSON.parse(await readFile(path!, "utf8"))).toEqual(backend.draft());
    await expect(dialog).toBeVisible();
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(backend.saves()).toBe(0);
    expect(backend.publishes()).toBe(1);
  });
}

test("asset deletion failure remains readable inside the inert-background dialog", async ({ page }) => {
  await fixture(page, "success", true);
  await page.route("**/api/sites/recovery-fixture/assets/11111111-1111-4111-8111-111111111111", route => route.fulfill({ status: 500, json: { error: { code: "request_failed" } } }));
  await page.getByRole("button", { name: "查看是哪幾個", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "舊素材遷移明細", exact: true });
  page.once("dialog", prompt => prompt.accept());
  await dialog.getByRole("button", { name: "刪除未使用素材", exact: true }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await expect(dialog.getByRole("status")).not.toBeEmpty();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
});

test("conflict clipboard pending state stays visible and prevents duplicate copying", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: () => new Promise<void>(resolve => { (window as unknown as { finishCopy: () => void }).finishCopy = resolve; })
    } });
  });
  await fixture(page, "conflict");
  await publish(page);
  const dialog = page.getByRole("alertdialog", { name: "版本衝突", exact: true });
  const copy = dialog.getByRole("button", { name: "複製本機 JSON", exact: true });
  await copy.click();
  await expect(copy).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("正在複製");
  await expect(dialog.getByRole("button", { name: "下載本機復原 JSON", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { finishCopy: () => void }).finishCopy());
  await expect(copy).toBeEnabled();
  await expect(dialog.getByRole("status")).toContainText("已複製");
});
