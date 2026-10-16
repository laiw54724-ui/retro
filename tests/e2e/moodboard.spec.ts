import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function boardDocument() {
  const board = makeWindow("moodboard");
  board.id = "board"; board.title = "Moodboard.exe"; board.layout.desktop = { ...board.layout.desktop, x: 80, y: 30, w: 620, h: 620, z: 3 };
  return { ...structuredClone(documentFixture), windows: [board] } as SiteDocument;
}

async function openEditor(page: Page, draftDocument = boardDocument()) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draftDocument, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: SiteDocument }> = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocument };
    saves.push(body); site.draft_document = structuredClone(body.document); site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "Moodboard.exe" })).toBeVisible();
  return { saves };
}

test("author creates Chinese moodboard content, drags it, undoes and reloads", async ({ page }) => {
  const { saves } = await openEditor(page);
  const board = page.getByRole("dialog", { name: "Moodboard.exe" });
  await board.getByRole("button", { name: "文字", exact: true }).click();
  await board.getByRole("textbox", { name: "文字", exact: true }).fill("角色世界觀・中文輸入");
  const element = board.getByRole("button", { name: /選取文字/ });
  const before = await element.boundingBox();
  if (!before) throw new Error("missing moodboard element box");
  await element.hover();
  await page.mouse.down(); await page.mouse.move(before.x + 90, before.y + 70, { steps: 4 }); await page.mouse.up();
  const moved = await element.boundingBox();
  expect(moved?.x).toBeGreaterThan(before.x + 20);
  await page.getByRole("button", { name: "復原" }).click();
  const undone = await element.boundingBox();
  expect(Math.abs((undone?.x ?? 0) - before.x)).toBeLessThan(4);
  await page.getByRole("button", { name: /選取文字/ }).click();
  await board.getByRole("button", { name: "→" }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.some((window) => window.type === "moodboard" && window.content.elements.some((item) => item.kind === "text" && item.content === "角色世界觀・中文輸入"))).toBe(true);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Moodboard.exe" }).getByRole("textbox", { name: "文字", exact: true })).toHaveValue("角色世界觀・中文輸入");
});

test("visitor moodboard stays readable without horizontal overflow on mobile", async ({ page }) => {
  const document = boardDocument();
  const board = document.windows[0];
  if (board.type !== "moodboard") throw new Error("moodboard fixture mismatch");
  board.content.elements = [{ id: "text", kind: "text", x: 80, y: 70, width: 360, height: 100, zOrder: 1, locked: false, content: "角色靈感板", color: "#111111", fontSize: 42, align: "center" }];
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "Moodboard.exe" }).click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Moodboard.exe" });
  await expect(dialog.getByText("角色靈感板", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Moodboard 內容" })).toContainText("角色靈感板");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("author exports the bounded board as a real PNG after fonts are ready", async ({ page }) => {
  const document = boardDocument();
  const board = document.windows[0];
  if (board.type !== "moodboard") throw new Error("moodboard fixture mismatch");
  board.content.elements = [
    { id: "color", kind: "color", x: 20, y: 20, width: 220, height: 160, zOrder: 0, locked: false, color: "#f5b7d2" },
    { id: "text", kind: "text", x: 40, y: 50, width: 300, height: 120, zOrder: 1, locked: false, content: "角色世界觀", color: "#111111", fontSize: 42, align: "left" }
  ];
  await openEditor(page, document);
  const dialog = page.getByRole("dialog", { name: "Moodboard.exe" });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "匯出 PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Moodboard.exe.png");
  await expect(dialog.getByRole("status")).toContainText("800×600 PNG");
});

test("PNG export identifies a cross-origin image that cannot be safely drawn", async ({ page }) => {
  const document = boardDocument();
  const board = document.windows[0];
  if (board.type !== "moodboard") throw new Error("moodboard fixture mismatch");
  board.content.elements = [{ id: "remote", kind: "image", x: 20, y: 20, width: 220, height: 160, zOrder: 0, locked: false, src: "https://images.example.test/oc.png", srcUrl: "", alt: "外站角色圖" }];
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lm5+WQAAAABJRU5ErkJggg==", "base64");
  await page.route("https://images.example.test/oc.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: pixel }));
  await openEditor(page, document);
  const dialog = page.getByRole("dialog", { name: "Moodboard.exe" });
  await expect(dialog.locator(".moodboard-image")).toBeVisible();
  await dialog.getByRole("button", { name: "匯出 PNG" }).click();
  await expect(dialog.getByRole("status")).toContainText("外站角色圖");
  await expect(dialog.getByRole("status")).toContainText("改用已上傳且允許匯出的圖片");
});

test("author receives an explanation at the 100 element limit", async ({ page }) => {
  const document = boardDocument();
  const board = document.windows[0];
  if (board.type !== "moodboard") throw new Error("moodboard fixture mismatch");
  board.content.elements = Array.from({ length: 100 }, (_, index) => ({ id: `color-${index}`, kind: "color" as const, x: index % 20 * 24, y: Math.floor(index / 20) * 24, width: 24, height: 24, zOrder: index, locked: false, color: "#f5b7d2" }));
  await openEditor(page, document);
  const dialog = page.getByRole("dialog", { name: "Moodboard.exe" });
  await dialog.getByRole("button", { name: "文字", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已達 100 個物件上限");
  await expect(dialog.getByText("100/100", { exact: true })).toBeVisible();
});
