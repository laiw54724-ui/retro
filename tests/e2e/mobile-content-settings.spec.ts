import { expect, test, type Page } from "@playwright/test";
import { createStarterDocument, makeGalleryImage, makeWindow, migrateSiteDocumentV2, type DesktopWindow } from "@retrodesk/shared";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const types: DesktopWindow["type"][] = ["image", "document", "gallery", "links", "about", "instagram", "music", "moodboard", "explorer", "minesweeper", "character-dialog", "guestbook"];

async function openEditor(page: Page, type: DesktopWindow["type"] = "gallery", empty = false) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const legacy = createStarterDocument("Entry demo", "classic98", "blank");
  const window = makeWindow(type);
  window.id = "current"; window.title = `${type}.exe`; window.defaultOpen = false;
  if (window.type === "gallery") window.content.images = Array.from({ length: 8 }, (_, index) => makeGalleryImage({ id: `image-${index}`, title: `Image ${index}`, src: null, srcUrl: "" }));
  legacy.windows = empty ? [] : [window];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  let draft = migrated.document;
  let version = 1;
  let saves = 0;
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Entry demo", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", route => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/guestbook**", route => route.fulfill({ json: { entries: [] } }));
  await page.route("**/api/sites/site-1/draft", route => {
    saves += 1; draft = route.request().postDataJSON().document;
    return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:00:00Z" } });
  });
  await page.goto("/editor/site-1");
  await expect(page.locator(".m-toolbar")).toBeVisible();
  return { title: window.title, saves: () => saves };
}


const settingsButton=(page:Page)=>page.locator('.m-window-settings');
const settings=(page:Page)=>page.getByRole('dialog',{name:'視窗設定',exact:true});
test.use({hasTouch:true});
for(const type of types)test(type+': direct content and settings keep the mounted app and restore the actual opener',async({page})=>{
 await page.setViewportSize({width:390,height:844});const backend=await openEditor(page,type);await page.locator('.m-icon').tap();
 await expect(page.locator('.m-edit-toggle')).toHaveCount(0);await expect(page.locator('.m-win-body')).toBeVisible();const node=await page.locator('.m-win-body .module-host').elementHandle();
 const opener=settingsButton(page);expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(44);await opener.tap();await expect(settings(page)).toBeVisible();await settings(page).getByRole('button',{name:'完成',exact:true}).tap();await expect(settings(page)).toBeHidden();await expect(opener).toBeFocused();
 expect(await node!.evaluate(n=>n.isConnected)).toBe(true);await expect(page.locator('.m-inline-titlebar input')).toHaveValue(backend.title);expect(backend.saves()).toBe(0);
});
for(const width of [320,390,430])test('settings preserve unfinished gallery draft and scroll at '+width,async({page})=>{
 await page.setViewportSize({width,height:844});const backend=await openEditor(page);await page.locator('.m-icon').tap();await page.locator('.gal-editor-toolbar button[aria-expanded]').click();const input=page.getByLabel('新增圖片網址',{exact:true});await input.fill('https://unfinished');const node=await input.elementHandle();const body=page.locator('.gal-editor-grid-scroll');const scroll=await body.evaluate(el=>{el.scrollTop=180;return el.scrollTop;});expect(scroll).toBeGreaterThan(0);
 await settingsButton(page).tap();await settings(page).getByRole('button',{name:'完成',exact:true}).tap();await expect(settingsButton(page)).toBeFocused();await expect(input).toHaveValue('https://unfinished');expect(await node!.evaluate(n=>n.isConnected)).toBe(true);expect(await body.evaluate(el=>el.scrollTop)).toBe(scroll);await page.waitForTimeout(750);expect(backend.saves()).toBe(0);
});
for(const empty of [false,true])test('home exposes four tools without inventing a settings target '+empty,async({page})=>{await page.setViewportSize({width:320,height:844});const backend=await openEditor(page,'gallery',empty);await expect(settingsButton(page)).toHaveCount(0);await expect(page.locator('.m-toolbar button')).toHaveCount(4);expect(backend.saves()).toBe(0);});
test('settings preserve mounted IG and its unfinished Handle',async({page})=>{
 await page.setViewportSize({width:390,height:844});const backend=await openEditor(page,'instagram');await page.locator('.m-icon').tap();const edit=page.getByRole('button',{name:'編輯個人檔案',exact:true});if(await edit.isVisible())await edit.click();const handle=page.getByRole('textbox',{name:'Handle',exact:true});await handle.fill('');const node=await handle.elementHandle();await settingsButton(page).tap();await settings(page).getByRole('button',{name:'完成',exact:true}).tap();await expect(handle).toHaveValue('');expect(await node!.evaluate(n=>n.isConnected)).toBe(true);await page.waitForTimeout(750);expect(backend.saves()).toBe(0);
});
test('English settings opener fits 320px and returns focus',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('retrodesk:locale','en'));await page.setViewportSize({width:320,height:844});await openEditor(page);await page.locator('.m-icon').tap();const opener=page.getByRole('button',{name:'Window settings',exact:true});expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect(await opener.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight)).toBe(true);await opener.tap();const dialog=page.getByRole('dialog',{name:'Window settings',exact:true});await dialog.getByRole('button',{name:'Done',exact:true}).tap();await expect(dialog).toBeHidden();await expect(opener).toBeFocused();
});
