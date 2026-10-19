import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function boardDocument() {
  const board = makeWindow("moodboard");
  board.id = "board"; board.title = "Moodboard.exe";
  board.layout.desktop = { ...board.layout.desktop, x: 40, y: 30, w: 760, h: 680, z: 3 };
  board.content.elements = [
    { id: "note", kind: "text", content: "Hidden note", color: "#111111", fontSize: 32, align: "left", x: 80, y: 70, width: 240, height: 150, zOrder: 2, locked: false },
    { id: "cover", kind: "color", color: "#f5b7d2", x: 80, y: 70, width: 260, height: 170, zOrder: 2, locked: false },
    { id: "locked", kind: "text", content: "Locked note", color: "#111111", fontSize: 24, align: "left", x: 420, y: 290, width: 240, height: 150, zOrder: 9, locked: true }
  ];
  return { ...structuredClone(documentFixture), windows: [board] } as SiteDocument;
}

async function openEditor(page: Page, width: number) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: boardDocument(), draft_version: 1, published_document: null, published_version: null, published_at: null, access_role: "owner" };
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    site.draft_document = route.request().postDataJSON().document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-18T00:00:00Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: "Moodboard.exe", exact: true }).click();
    await page.getByRole("button", { name: "編輯內容" }).click();
  }
  return site;
}

for (const width of [1440, 320, 390]) {
  test.describe(`${width}px Moodboard`, () => {
    test.use({ hasTouch: width < 768 });
    test("covered objects, exact geometry, order, lock, history and reload", async ({ page }, testInfo) => {
      const site = await openEditor(page, width);
      const editor = page.locator(".moodboard-editor:visible");
      const list = editor.getByRole("list", { name: "Moodboard 內容" });
      const inspector = editor.getByRole("complementary", { name: "選取物件屬性" });
      const act = async (target: ReturnType<Page["locator"]>) => width < 768 ? target.tap() : target.click();
      const note = list.getByRole("button", { name: "文字：Hidden note", exact: true });
      await act(note);
      await expect(note).toHaveAttribute("aria-pressed", "true");
      await expect(inspector.getByRole("textbox", { name: "文字", exact: true })).toHaveValue("Hidden note");
      for (const [name, value] of [["X", "160"], ["Y", "120"], ["寬", "320"], ["高", "210"]]) {
        const input = inspector.getByRole("spinbutton", { name, exact: true });
        await input.fill(value); await input.press("Enter");
        await expect(input).toHaveValue(value);
      }
      const x = inspector.getByRole("spinbutton", { name: "X", exact: true });
      await x.fill("9999"); await x.press("Enter");
      await expect(x).toHaveValue("480");
      await x.fill("-30"); await x.press("Enter");
      await expect(x).toHaveValue("0");
      await x.fill("160"); await x.press("Enter");
      const height = inspector.getByRole("spinbutton", { name: "高", exact: true });
      await height.fill("-20"); await height.press("Enter");
      await expect(height).toHaveValue("24");
      await height.fill("210"); await height.press("Enter");
      await x.fill("400"); await x.press("Escape");
      await expect(x).toHaveValue("160");
      await x.fill(""); await x.press("Tab");
      await expect(x).toHaveValue("160");
      await act(inspector.getByRole("button", { name: "置中", exact: true }));
      await expect(editor.locator('[data-moodboard-id="note"] .moodboard-text')).toHaveCSS("text-align", "center");
      // A stable tie originally puts the cover above the note. One backward move must swap them.
      await act(list.getByRole("button", { name: "色塊 #f5b7d2", exact: true }));
      await act(inspector.getByRole("button", { name: "下移一層" }));
      await expect(list.getByRole("button").last()).toHaveAttribute("aria-label", "色塊 #f5b7d2");
      await act(inspector.getByRole("button", { name: "移到最前" }));
      await expect(list.getByRole("button").first()).toHaveAttribute("aria-label", "色塊 #f5b7d2");
      if (width === 1440) {
        await page.getByRole("button", { name: "復原", exact: true }).click();
        await expect(list.getByRole("button").last()).toHaveAttribute("aria-label", "色塊 #f5b7d2");
        await page.getByRole("button", { name: "重做", exact: true }).click();
        await expect(list.getByRole("button").first()).toHaveAttribute("aria-label", "色塊 #f5b7d2");
      }
      await act(list.getByRole("button", { name: "文字：Locked note", exact: true }));
      await expect(inspector.getByRole("spinbutton", { name: "X", exact: true })).toBeDisabled();
      await expect(inspector.getByRole("button", { name: "→", exact: true })).toBeDisabled();
      await expect(inspector.getByRole("button", { name: "放大", exact: true })).toBeDisabled();
      await act(note);
      await act(inspector.getByRole("button", { name: "移到最前" }));
      await expect(list.getByRole("button").first()).toHaveAttribute("aria-label", "文字：Hidden note");
      await act(inspector.getByRole("button", { name: "複製", exact: true }));
      await expect(list.getByRole("button")).toHaveCount(4);
      await act(inspector.getByRole("button", { name: "刪除", exact: true }));
      await expect(list.getByRole("button")).toHaveCount(3);
      await act(note);
      await expect.poll(() => {
        const saved = site.draft_document.windows[0];
        if (saved.type !== "moodboard") return null;
        const note = saved.content.elements.find((item) => item.id === "note");
        return { count: saved.content.elements.length, note, locked: saved.content.elements.find((item) => item.id === "locked")?.locked };
      }).toEqual({ count: 3, note: { id: "note", kind: "text", content: "Hidden note", color: "#111111", fontSize: 32, align: "center", x: 160, y: 120, width: 320, height: 210, zOrder: 2, locked: false }, locked: true });
      await page.reload();
      if (width < 768) {
        await page.getByRole("button", { name: "Moodboard.exe", exact: true }).click();
        await page.getByRole("button", { name: "編輯內容" }).click();
      }
      await expect(inspector.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue("160");
      await expect(inspector.getByRole("spinbutton", { name: "高", exact: true })).toHaveValue("210");
      await expect(list.getByRole("button").first()).toHaveAttribute("aria-label", "文字：Hidden note");
      await expect(inspector.getByRole("button", { name: "置中", exact: true })).toHaveAttribute("aria-pressed", "true");
      await note.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`after-${width}.png`), fullPage: true });
      await inspector.locator(".moodboard-geometry").scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`after-geometry-${width}.png`), fullPage: true });
      await inspector.getByRole("button", { name: "刪除", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`after-controls-${width}.png`), fullPage: true });
      const stageBox = await editor.locator(".moodboard-stage").boundingBox();
      expect(stageBox).not.toBeNull();
      expect(Math.abs(stageBox!.width / stageBox!.height - 800 / 600)).toBeLessThan(0.03);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

      // Render the actual saved document through the existing public reader.
      await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: site.draft_document, published_version: 1, published_at: "2026-10-18T00:00:00Z" } } }));
      await page.goto("/@demo");
      if (width < 768) await act(page.locator(".visitor-mobile").getByRole("button", { name: "Moodboard.exe", exact: true }));
      const view = page.locator(".moodboard-view:visible");
      await expect(view.locator('[data-moodboard-id="note"]')).toBeVisible();
      const persisted = await view.locator('[data-moodboard-id="note"]').evaluate((node) => ({ left: (node as HTMLElement).style.left, top: (node as HTMLElement).style.top, width: (node as HTMLElement).style.width, height: (node as HTMLElement).style.height }));
      expect(persisted).toEqual({ left: "20%", top: "20%", width: "40%", height: "35%" });
      await expect(view.locator('[data-moodboard-id="note"] .moodboard-text')).toHaveCSS("text-align", "center");
      await expect(view.locator(".moodboard-layer")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`public-${width}.png`), fullPage: true });
    });
  });
}

for (const width of [1440, 320]) {
  test.describe(`numeric draft ${width}px`, () => {
    test.use({ hasTouch: width < 768 });
    for (const destination of ["object", "blank", "layer"] as const) {
      test(`Moodboard geometry commits on ${destination} selection without Enter`, async ({ page }) => {
        await openEditor(page, width);
        const editor = page.locator(".moodboard-editor:visible");
        const list = editor.getByRole("list", { name: "Moodboard 內容" });
        const inspector = editor.getByRole("complementary", { name: "選取物件屬性" });
        const note = list.getByRole("button", { name: "文字：Hidden note", exact: true });
        const x = inspector.getByRole("spinbutton", { name: "X", exact: true });
        const act = async (target: ReturnType<Page["locator"]>) => width < 768 ? target.tap() : target.click();
        await act(note);
        await x.fill("230");
        if (destination === "object") await act(editor.locator('[data-moodboard-id="cover"]'));
        else if (destination === "blank") {
          const stage = editor.locator(".moodboard-stage");
          if (width < 768) await stage.tap({ position: { x: 8, y: 8 } });
          else await stage.click({ position: { x: 8, y: 8 } });
        } else await act(list.getByRole("button", { name: "色塊 #f5b7d2", exact: true }));
        await act(note);
        await expect(x).toHaveValue("230");
        if (width === 1440) {
          await page.getByRole("button", { name: "復原", exact: true }).click();
          await expect(x).toHaveValue("80");
          await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
          await page.getByRole("button", { name: "重做", exact: true }).click();
          await expect(x).toHaveValue("230");
        }
      });
    }
  });
}

test("Moodboard geometry Enter, Escape and external Undo stay atomic", async ({ page }) => {
  await openEditor(page, 1440);
  const editor = page.locator(".moodboard-editor:visible");
  const list = editor.getByRole("list", { name: "Moodboard 內容" });
  const note = list.getByRole("button", { name: "文字：Hidden note", exact: true });
  const x = editor.getByRole("spinbutton", { name: "X", exact: true });
  const undo = page.getByRole("button", { name: "復原", exact: true });
  const redo = page.getByRole("button", { name: "重做", exact: true });
  await note.click();
  await x.fill("230"); await x.press("Enter"); await x.press("Enter");
  await x.fill("350"); await x.press("Escape");
  await editor.locator(".moodboard-stage").click({ position: { x: 8, y: 8 } });
  await note.click();
  await expect(x).toHaveValue("230");
  await undo.click();
  await expect(x).toHaveValue("80");
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(x).toHaveValue("230");
  await x.fill("240");
  await undo.click();
  await expect(x).toHaveValue("230");
  await undo.click();
  await expect(x).toHaveValue("80");
  await expect(undo).toBeDisabled();
});

test("Moodboard drag starts from the numeric draft committed on pointerdown", async ({ page }) => {
  await openEditor(page, 1440);
  const editor = page.locator(".moodboard-editor:visible");
  const list = editor.getByRole("list", { name: "Moodboard 內容" });
  const inspector = editor.getByRole("complementary", { name: "選取物件屬性" });
  await list.getByRole("button", { name: "文字：Hidden note", exact: true }).click();
  await inspector.getByRole("button", { name: "移到最前" }).click();
  const x = inspector.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("230");
  await editor.locator('[data-moodboard-id="note"]').scrollIntoViewIfNeeded();
  const object = await editor.locator('[data-moodboard-id="note"]').boundingBox();
  const stage = await editor.locator(".moodboard-stage").boundingBox();
  if (!object || !stage) throw new Error("missing board geometry");
  const start = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + stage.width * 64 / 800, start.y, { steps: 3 });
  await page.mouse.up();
  await expect(x).toHaveValue("294");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(x).toHaveValue("230");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(x).toHaveValue("80");
});
