import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const source = "https://images.example.test/portrait.png";

async function setup(page: Page, width: number) {
  const legacy = createStarterDocument("Character editor", "classic98", "blank");
  const character = makeWindow("character-dialog");
  character.id = "welcome"; character.title = "Welcome.exe";
  character.content = { ...character.content, characterName: "Snow", message: "Welcome to my desktop", image: source, imageUrl: source, linkLabel: "Explore", linkUrl: "https://example.com/old", autoShow: true };
  character.layout.desktop = { ...character.layout.desktop, x: 20, y: 20, w: 460, h: 540 };
  legacy.windows = [character];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration");
  let draft = migrated.document; let saves = 0;
  await page.addInitScript(value => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://images.example.test/**", route => route.fulfill({ path: "tests/fixtures/image-w3a/transparent.png", contentType: "image/png" }));
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Character editor", draft_document: draft, draft_version: saves + 1, published_document: null, published_version: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", route => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", route => {
    draft = route.request().postDataJSON().document; saves++;
    return route.fulfill({ json: { version: saves + 1 } });
  });
  await page.setViewportSize({ width, height: 900 }); await page.goto("/editor/site-1");
  if (width < 768) { await page.locator(".m-icon").click(); if (await page.locator(".m-edit-toggle").count()) await page.locator(".m-edit-toggle").click(); else await expect(page.locator(".m-window-settings")).toBeVisible(); }
  const editor = page.locator(".character-message-editor:visible");
  await expect(editor).toBeVisible();
  return { editor, saved: () => draft.windows.find(window => window.type === "character-dialog")?.content, saves: () => saves };
}

for (const width of [1440, 320, 375, 390, 430]) {
  test(`character message is edited in place with staged link cancellation at ${width}px`, async ({ page }, info) => {
    const backend = await setup(page, width), editor = backend.editor;
    await expect(editor.locator("details, fieldset")).toHaveCount(0);
    const name = editor.getByRole("textbox", { name: "角色名稱", exact: true });
    const message = editor.getByRole("textbox", { name: "訊息", exact: true });
    const buttonText = editor.getByRole("textbox", { name: "連結文字", exact: true });
    await expect(name).toBeInViewport({ ratio: 1 });
    await expect(message).toBeInViewport({ ratio: 1 });
    await name.fill("Snow edited"); await message.fill("Hello from Snow"); await buttonText.fill("Visit Snow");
    await expect.poll(() => backend.saved()).toMatchObject({ characterName: "Snow edited", message: "Hello from Snow", linkLabel: "Visit Snow", autoShow: true });
    const link = editor.getByRole("button", { name: "安全連結", exact: true });
    await link.click();
    const url = editor.getByRole("textbox", { name: "安全連結", exact: true });
    await url.fill("https://example.com/canceled"); await url.press("Escape");
    await expect(url).toBeHidden(); await expect(link).toBeFocused();
    expect(backend.saved()?.linkUrl).toBe("https://example.com/old");
    await link.click(); await url.fill("javascript:alert(1)");
    await editor.getByRole("button", { name: "套用", exact: true }).click();
    await expect(editor.getByRole("alert")).toBeVisible();
    expect(backend.saved()?.linkUrl).toBe("https://example.com/old");
    await url.fill("https://example.com/new"); await url.press("Enter");
    await expect.poll(() => backend.saved()?.linkUrl).toBe("https://example.com/new");
    await expect(link).toBeFocused();
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await expect.poll(() => backend.saved()?.linkUrl).toBe("https://example.com/old");
    await page.screenshot({ path: info.outputPath(`character-inline-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("character avatar drop rejects invalid files without a draft write", async ({ page }) => {
  const { editor, saves } = await setup(page, 1440);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer(); data.items.add(new File(["text"], "note.txt", { type: "text/plain" })); return data;
  });
  await editor.locator(".character-image-drop").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(editor.getByRole("alert")).toBeVisible();
  expect(saves()).toBe(0);
  await expect(editor.locator(".character-dialog-image")).toHaveAttribute("src", source);
});

test("delayed dropped portrait preserves newer message text and is one Undo step", async ({ page }) => {
  const { editor, saved } = await setup(page, 1440);
  let pending: Route | undefined;
  const assetId = "11111111-1111-4111-8111-111111111111", asset = `retro-asset:${assetId}`;
  await page.route("**/api/sites/site-1/assets", route => {
    if (route.request().method() === "POST") { pending = route; return; }
    return route.fulfill({ json: { assets: [] } });
  });
  await page.route(`**/api/sites/site-1/assets/${assetId}/content`, route => route.fulfill({ path: "tests/fixtures/image-w3a/transparent.png", contentType: "image/png" }));
  const encoded = (await readFile("tests/fixtures/image-w3a/transparent.png")).toString("base64");
  const transfer = await page.evaluateHandle(base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const data = new DataTransfer(); data.items.add(new File([bytes], "portrait.png", { type: "image/png" })); return data;
  }, encoded);
  await editor.locator(".character-image-drop").dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(() => !!pending).toBe(true);
  await editor.getByRole("textbox", { name: "訊息", exact: true }).fill("Typed during upload");
  await expect.poll(() => saved()?.message).toBe("Typed during upload");
  await pending!.fulfill({ json: { asset: { id: assetId, url: asset, mimeType: "image/png", size: 100, kind: "image", name: "portrait" } } });
  await expect.poll(() => saved()).toMatchObject({ image: asset, imageUrl: "", message: "Typed during upload" });
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect.poll(() => saved()).toMatchObject({ image: source, imageUrl: source, message: "Typed during upload" });
});

test('v2 welcome popup stage replays without canonical writes and removes a link in one Undo', async ({page}, info) => {
  const backend=await setup(page,390), editor=backend.editor;
  await expect(editor.getByRole('group',{name:'歡迎彈窗預覽（可直接編輯）',exact:true})).toBeVisible();
  await expect(editor.locator('.character-popup-title')).toContainText('Snow');
  const snapshot=()=>page.evaluate(async()=>{const {useEditorStore}=await import('/src/features/editor/store.ts'); const s=useEditorStore.getState();return {doc:s.versionedDocument,past:s.past.length,future:s.future.length};});
  const before=await snapshot();
  await editor.getByRole('button',{name:'播放出場',exact:true}).click();
  await expect(editor.getByRole('button',{name:'播放出場',exact:true})).toBeFocused();
  expect(await snapshot()).toEqual(before);
  await editor.getByRole('button',{name:'安全連結',exact:true}).click();
  await editor.getByRole('button',{name:'移除連結按鈕',exact:true}).click();
  await expect.poll(()=>backend.saved()?.linkLabel).toBe('');
  await expect.poll(()=>backend.saved()?.linkUrl).toBe('');
  await page.getByRole('button',{name:'復原',exact:true}).click();
  await expect.poll(()=>backend.saved()?.linkLabel).toBe('Explore');
  await expect.poll(()=>backend.saved()?.linkUrl).toBe('https://example.com/old');
  await page.screenshot({path:info.outputPath('welcome-v2-390.png')});
});

for(const width of [320,375])test(`v2 popup grows below the complete options and replay targets at ${width}px`,async({page},info)=>{
 const backend=await setup(page,width),editor=backend.editor,options=editor.locator('.character-top-options'),stage=editor.locator('.character-popup-stage'),popup=editor.locator('.character-popup');
 const replay=editor.getByRole('button',{name:'播放出場',exact:true}),toggle=options.getByRole('checkbox');
 await expect(replay).toBeInViewport({ratio:1});await expect(toggle).toBeInViewport({ratio:1});
 const top=await options.boundingBox(),area=await stage.boundingBox(),dialog=await popup.boundingBox();
 expect(area!.y).toBeGreaterThanOrEqual(top!.y+top!.height);expect(dialog!.y).toBeGreaterThanOrEqual(area!.y);expect(dialog!.y+dialog!.height).toBeLessThanOrEqual(area!.y+area!.height);
 for(const target of [replay,toggle])expect(await target.evaluate(node=>{const r=node.getBoundingClientRect();return node===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)||node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 const before=backend.saved();await replay.click();await expect(replay).toBeFocused();expect(backend.saved()).toEqual(before);await toggle.uncheck();await expect.poll(()=>backend.saved()?.autoShow).toBe(false);await page.getByRole('button',{name:'復原',exact:true}).click();await expect.poll(()=>backend.saved()?.autoShow).toBe(true);
 await page.screenshot({path:info.outputPath(`welcome-v2-safe-${width}.png`)});
});
