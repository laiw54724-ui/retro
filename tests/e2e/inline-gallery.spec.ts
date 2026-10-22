import { expect, test } from "@playwright/test";
import { mockGallery, pickedFile } from "./inline-gallery.fixture";

for (const width of [1440, 320, 375, 390, 430]) {
  test(`gallery inline controls, focus and screenshots at ${width}px`, async ({ page }, info) => {
    const site = await mockGallery(page, { long: true, width });
    const { gallery } = site;
    const editor = gallery.locator(".gal-editor");
    await expect(editor.locator(".gal-editor-properties")).toHaveCount(1);
    await expect(editor.locator(".gal-editor-list").getByRole("alert")).toBeVisible();
    await editor.screenshot({ path: info.outputPath(`gallery-${width}-selected.png`) });
    const deselect = gallery.getByRole("button", { name: "取消選取", exact: true });
    await deselect.focus();
    await deselect.press("Enter");
    await expect(gallery.getByRole("button", { name: "貼網址…", exact: true })).toBeFocused();
    await expect(editor.locator(".gal-editor-properties")).toHaveCount(0);
    await editor.screenshot({ path: info.outputPath(`gallery-${width}-grid.png`) });
    await editor.locator(".gal-editor-thumb").first().click();
    const move = gallery.getByRole("button", { name: "往後", exact: true });
    await move.focus();
    await move.press("Escape");
    await expect(editor.locator(".gal-editor-properties")).toHaveCount(0);
    await expect(gallery.getByRole("button", { name: "貼網址…", exact: true })).toBeFocused();
    const toggle = gallery.getByRole("button", { name: "貼網址…", exact: true });
    await toggle.click();
    const urls = gallery.getByRole("textbox", { name: "新增圖片網址", exact: true });
    await expect(urls).toBeFocused();
    await urls.fill("https://assets.test/new.png\nhttps://assets.test/second.png\ninvalid");
    await urls.press("Escape");
    await expect(toggle).toBeFocused();
    await toggle.click();
    await expect(urls).toContainText("https://assets.test/new.png");
    await urls.press("Enter");
    await expect(editor.locator(".gal-editor-thumb")).toHaveCount(4);
    await expect(editor.locator(".gal-editor-error")).toContainText("已略過");
    await editor.locator(".gal-editor-error").getByRole("button", { name: "關閉" }).click();
    const current = editor.locator(".gal-editor-thumb").nth(2);
    await current.focus();
    await current.press("ArrowRight");
    await expect(editor.locator(".gal-editor-thumb").nth(3)).toBeFocused();
    const id = await editor.locator(".gal-editor-thumb").nth(3).getAttribute("data-image-id");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(editor.locator(".gal-editor-thumb").nth(2)).toHaveAttribute("data-image-id", id!);
    await expect(editor.locator(".gal-editor-thumb").nth(2)).toBeFocused();
    await page.keyboard.press("Delete");
    await expect(editor.locator(".gal-editor-thumb")).toHaveCount(3);
    await expect(editor.locator(".gal-editor-thumb").nth(2)).toBeFocused();
    const caption = gallery.getByLabel("圖說", { exact: true });
    await caption.fill("caption keeps Delete and arrow keys");
    await caption.press("ArrowLeft");
    await caption.press("Delete");
    await expect(editor.locator(".gal-editor-thumb")).toHaveCount(3);
    await expect.poll(() => editor.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width < 768) {
      const dimensions = await editor.locator(".mini-btn:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(dimensions.every((height) => height >= 44)).toBe(true);
      await page.setViewportSize({ width, height: 500 });
      const title = gallery.getByLabel("圖片標題", { exact: true });
      await title.fill("Short viewport edit");
      await expect(title).toBeFocused();
      await title.screenshot({ path: info.outputPath(`gallery-${width}-short-focus.png`) });
    }
  });
}

test("root drop validates files and replacement cannot overwrite a newer source URL", async ({ page }) => {
  const site = await mockGallery(page, { long: true, hold: "replace.png" });
  const editor = site.gallery.locator(".gal-editor");
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["invalid"], "note.txt", { type: "text/plain" }));
    data.items.add(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" }));
    return data;
  });
  await editor.dispatchEvent("dragover", { dataTransfer });
  await expect(editor.locator(".gal-drop-overlay")).toBeVisible();
  await editor.dispatchEvent("drop", { dataTransfer });
  await expect(editor.locator(".gal-editor-error")).toContainText("8 MB");
  expect(site.calls).toEqual([]);
  await site.gallery.getByLabel("更換圖片…", { exact: true }).setInputFiles(pickedFile("replace.png"));
  await expect.poll(() => site.calls).toEqual(["replace.png"]);
  const source = site.gallery.getByLabel("圖片網址", { exact: true });
  await source.fill("https://assets.test/newer.png");
  await source.press("Tab");
  site.release("replace.png");
  await expect.poll(() => site.images()[0].src).toBe("https://assets.test/newer.png");
  await expect(editor.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await expect(editor.getByRole("button", { name: "重試 replace.png" })).toHaveCount(0);
});

test("drag sorting inserts before, after and at the tail without changing image metadata", async ({ page }) => {
  const site = await mockGallery(page, { long: true });
  const editor = site.gallery.locator(".gal-editor");
  const first = editor.locator('[data-image-id="broken"]');
  const second = editor.locator('[data-image-id="empty"]');
  const before = structuredClone(site.images());
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await first.dispatchEvent("dragstart", { dataTransfer: transfer });
  const rect = await second.boundingBox();
  await second.dispatchEvent("dragover", { dataTransfer: transfer, clientX: rect!.x + rect!.width - 1 });
  await expect(second).toHaveAttribute("data-drop", "after");
  await second.dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(() => site.images().map((image) => image.id)).toEqual(["empty", "broken"]);
  expect(site.images()).toEqual([before[1], before[0]]);
  await second.dispatchEvent("dragstart", { dataTransfer: transfer });
  await editor.locator(".gal-end-drop").dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(() => site.images()).toEqual(before);
});

test("multi-file drop inserts at its target and retry preserves selection order", async ({ page }) => {
  const site = await mockGallery(page, { long: true, hold: "drop-one.png", failOnce: "drop-two.png" });
  const editor = site.gallery.locator(".gal-editor");
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    for (const name of ["drop-one.png", "drop-two.png", "drop-three.png"]) {
      data.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
    }
    return data;
  }, [...pickedFile("sample.png").buffer]);
  const target = editor.locator('[data-image-id="empty"]');
  const rect = await target.boundingBox();
  await target.dispatchEvent("dragover", { dataTransfer: transfer, clientX: rect!.x });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(() => site.calls).toEqual(["drop-one.png"]);
  site.release("drop-one.png");
  await expect(editor.locator('[data-upload-state="completed"]')).toHaveCount(2);
  await expect(editor.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await expect.poll(() => site.images().slice(1, -1).map((image) => image.title)).toEqual(["drop-one", "drop-three"]);
  await editor.getByRole("button", { name: "重試 drop-two.png", exact: true }).click();
  await expect(editor.locator('[data-upload-state="completed"]')).toHaveCount(3);
  await expect.poll(() => site.images().slice(1, -1).map((image) => image.title)).toEqual(["drop-one", "drop-two", "drop-three"]);
  expect(site.calls).toEqual(["drop-one.png", "drop-two.png", "drop-three.png", "drop-two.png"]);
});

test("IME Enter keeps a URL draft local and rejected lines never reach canonical content", async ({ page }) => {
  const site = await mockGallery(page);
  await site.gallery.getByRole("button", { name: "貼網址…", exact: true }).click();
  const urls = site.gallery.getByRole("textbox", { name: "新增圖片網址", exact: true });
  await urls.fill("https://assets.test/ime.png");
  await urls.dispatchEvent("compositionstart");
  await urls.press("Enter");
  expect(site.images()).toHaveLength(0);
  await expect(urls).toBeVisible();
  await urls.dispatchEvent("compositionend");
  await urls.fill("http://assets.test/no.png\nhttps://\njavascript:alert(1)");
  await urls.press("Enter");
  await expect(site.gallery.locator(".gal-editor-error")).toContainText("https://");
  expect(site.images()).toHaveLength(0);
  await urls.fill("https://drive.google.com/file/d/1234567890abc/view");
  await urls.press("Enter");
  await expect.poll(() => site.images()[0]?.src).toBe("https://drive.google.com/thumbnail?id=1234567890abc&sz=w2000");
  expect(site.images()[0].srcUrl).toBe("https://drive.google.com/file/d/1234567890abc/view");
});
