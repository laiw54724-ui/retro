import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { duplicateProfile, migrateSiteDocumentV2, type SiteDocumentV2Input } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

async function openEditor(page: Page, width = 1400, openFields = true) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const duplicated = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: "site-1", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("duplicate fixture");
  let saved: SiteDocumentV2Input = duplicated.document;
  saved.entities.profiles[0].customFields = [{ key: "Role", value: "Writer" }];
  saved.entities.profiles[0].worldTags = ["First"];
  saved.entities.profiles[0].otherFollowerCount = 12;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  let saves = 0;
  await page.route("https://example.test/**",route=>route.fulfill({path:"tests/fixtures/image-w3a/transparent.png",contentType:"image/png"}));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "D", draft_document: saved, draft_version: saves + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; saves++; return route.fulfill({ json: { version: saves + 1, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯內容" }).click(); }
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  if (openFields) {
    await win.getByRole("region", { name: "Instagram 角色編輯視窗" }).getByRole("button", { name: "管理編輯欄位" }).click();
    await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();
  } else await expect(win.getByRole("region", { name: "Instagram 角色編輯視窗" })).toBeVisible();
  return { win, saved: () => saved, profile: () => saved.entities.profiles[0], saves: () => saves };
}


test("review: IG return to app retains a keyboard focus target", async ({ page }, info) => {
  const site = await openEditor(page, 390, false);
  const app = site.win.getByRole("region", { name: "Instagram 角色編輯視窗" });
  await page.screenshot({ path: info.outputPath("implementation-ig-app-390.png") });
  const edit = app.getByRole("button", { name: "編輯個人檔案", exact: true });
  await edit.focus(); await page.keyboard.press("Enter");
  const back = site.win.getByRole("button", { name: "← 返回 IG 畫面", exact: true });
  await back.focus(); await page.keyboard.press("Enter");
  await expect(app).toBeVisible();
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0,80), hidden: !!document.activeElement?.closest("[hidden]") }));

  expect(focus.tag).not.toBe("BODY");
  expect(focus.hidden).toBe(false);
  await expect(edit).toBeFocused();
});


test("new post Back cancels without a canonical write or Undo entry", async ({page}) => {
 const site=await openEditor(page,390,false);
 const before=await page.evaluate(async()=>{const {useEditorStore}=await import("/src/features/editor/store.ts");const s=useEditorStore.getState();return {document:s.versionedDocument,past:s.past.length};});
 const app=site.win.getByRole("region",{name:"Instagram 角色編輯視窗"});
 await app.locator(".ig-nav4").getByRole("button",{name:"新增貼文",exact:true}).press("Enter");
 await site.win.getByRole("button",{name:"← 返回 IG 畫面",exact:true}).press("Enter");
 const after=await page.evaluate(async()=>{const {useEditorStore}=await import("/src/features/editor/store.ts");const s=useEditorStore.getState();return {document:s.versionedDocument,past:s.past.length};});
 expect(after).toEqual(before);await page.waitForTimeout(1000);expect(site.saves()).toBe(0);
});

async function snapshot(page:Page) { return page.evaluate(async()=>{const {useEditorStore}=await import("/src/features/editor/store.ts");const s=useEditorStore.getState();return {document:s.versionedDocument,past:s.past.length};}); }
for (const exit of ["取消","Escape","← 返回 IG 畫面"]) for (const width of [320,375,390,430,1440]) test(`composer ${exit} discards selected photos and details at ${width}px without writes or history`,async({page},info)=>{
 const site=await openEditor(page,width,false);const before=await snapshot(page);
 const app=site.win.getByRole("region",{name:"Instagram 角色編輯視窗"});const entry=app.locator(".ig-nav4").getByRole("button",{name:"新增貼文",exact:true});await entry.press("Enter");
 const composer=site.win.getByRole("region",{name:"新貼文",exact:true});
 await expect(composer.getByRole("button",{name:"下一步",exact:true})).toBeDisabled();
 await composer.getByRole("textbox",{name:"圖片網址",exact:true}).fill("https://example.test/photo.png");await composer.getByRole("button",{name:"加入",exact:true}).click();
 await expect(composer.getByRole("img",{name:"照片 1",exact:true})).toHaveCount(1);
 await composer.getByRole("button",{name:"下一步",exact:true}).click();await composer.getByRole("textbox",{name:"貼文內容",exact:true}).fill("Uncommitted caption");
 await composer.getByRole("button",{name:"← 返回選圖",exact:true}).click();await composer.getByRole("button",{name:"下一步",exact:true}).click();await expect(composer.getByRole("textbox",{name:"貼文內容",exact:true})).toHaveValue("Uncommitted caption");
 await page.screenshot({path:info.outputPath(`compose-details-${width}.png`)});
 if(exit==="Escape")await page.keyboard.press("Escape");else await composer.getByRole("button",{name:exit,exact:true}).click();
 await expect(app).toBeVisible();await expect(entry).toBeFocused();expect(await snapshot(page)).toEqual(before);await page.waitForTimeout(1000);expect(site.saves()).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("composer completes exactly one canonical post and one Undo step",async({page})=>{
 const site=await openEditor(page,390,false);const before=await snapshot(page);const app=site.win.getByRole("region",{name:"Instagram 角色編輯視窗"});
 await app.locator(".ig-nav4").getByRole("button",{name:"新增貼文",exact:true}).press("Enter");const composer=site.win.getByRole("region",{name:"新貼文",exact:true});
 await composer.getByRole("textbox",{name:"圖片網址",exact:true}).fill("https://example.test/photo.png");await composer.getByRole("button",{name:"加入",exact:true}).click();await composer.getByRole("button",{name:"下一步",exact:true}).click();
 await composer.getByRole("textbox",{name:"標題",exact:true}).fill("Confirmed title");await composer.getByRole("textbox",{name:"貼文內容",exact:true}).fill("Confirmed caption");expect(await snapshot(page)).toEqual(before);
 await composer.getByRole("button",{name:"完成",exact:true}).click();await expect(composer).toHaveCount(0);
 const after=await snapshot(page);expect(after.past).toBe(before.past+1);expect(after.document!.entities.posts).toHaveLength(before.document!.entities.posts.length+1);expect(after.document!.entities.posts.at(-1)).toMatchObject({title:"Confirmed title",caption:"Confirmed caption",visibility:"draft",media:[{src:"https://example.test/photo.png"}]});
 await page.keyboard.press("Control+z");expect((await snapshot(page)).document).toEqual(before.document);await page.keyboard.press("Control+Shift+z");expect((await snapshot(page)).document).toEqual(after.document);
});

test("return to App uses an available fallback if the original entry disappears",async({page})=>{
 const site=await openEditor(page,390,false);const app=site.win.getByRole("region",{name:"Instagram 角色編輯視窗"});const edit=app.getByRole("button",{name:"編輯個人檔案",exact:true});const source=await edit.elementHandle();await edit.press("Enter");await source!.evaluate(node=>node.remove());
 await site.win.getByRole("button",{name:"← 返回 IG 畫面",exact:true}).press("Enter");await expect(app.getByRole("combobox",{name:"以角色操作",exact:true})).toBeFocused();
});

const FILE="tests/fixtures/image-w3a/transparent.png";
const ASSET_ID="11111111-1111-4111-8111-111111111111";
async function startCompose(page:Page,win:ReturnType<Page["getByRole"]>) {
 const app=win.getByRole("region",{name:"Instagram 角色編輯視窗"});await app.locator(".ig-nav4").getByRole("button",{name:"新增貼文",exact:true}).press("Enter");return win.getByRole("region",{name:"新貼文",exact:true});
}
async function privateImages(page:Page) {await page.route("**/api/sites/site-1/assets/*/content",route=>route.fulfill({path:FILE,contentType:"image/png"}));}
const stored={asset:{id:ASSET_ID,url:`retro-asset:${ASSET_ID}`,mimeType:"image/png",size:100,kind:"image",name:"local-compose"}};

test("canceled composer cannot receive a delayed upload in a new composer",async({page})=>{
 const site=await openEditor(page,390,false);const before=await snapshot(page);await privateImages(page);let uploadRoute:Route|undefined;
 await page.evaluate(()=>{const state=window as typeof window&{composeUploadConsumed:number};state.composeUploadConsumed=0;const original=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).endsWith("/api/sites/site-1/assets")&&args[1]?.method==="POST"){const json=response.json.bind(response);response.json=async()=>{const result=await json();setTimeout(()=>state.composeUploadConsumed++,0);return result;};}return response;};});
 await page.route("**/api/sites/site-1/assets",route=>{if(route.request().method()==="POST"){uploadRoute=route;return;}return route.fulfill({json:{assets:[]}});});
 let composer=await startCompose(page,site.win);await composer.getByLabel(/^從裝置選擇照片/).setInputFiles(FILE);await expect.poll(()=>!!uploadRoute).toBe(true);await expect(composer.getByRole("button",{name:"下一步",exact:true})).toBeDisabled();
 await composer.getByRole("button",{name:"取消",exact:true}).click();composer=await startCompose(page,site.win);await uploadRoute!.fulfill({json:stored});
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{composeUploadConsumed:number}).composeUploadConsumed)).toBe(1);
 await expect(composer.getByRole("img")).toHaveCount(0);await expect(composer.getByRole("button",{name:"下一步",exact:true})).toBeDisabled();expect(await snapshot(page)).toEqual(before);expect(site.saves()).toBe(0);await composer.getByRole("button",{name:"取消",exact:true}).click();
});

test("local upload reserves its tenth photo slot and confirmation commits all photos together",async({page})=>{
 const site=await openEditor(page,320,false);const before=await snapshot(page);await privateImages(page);let uploadRoute:Route|undefined;
 await page.route("**/api/sites/site-1/assets",route=>{if(route.request().method()==="POST"){uploadRoute=route;return;}return route.fulfill({json:{assets:[]}});});
 const composer=await startCompose(page,site.win);await composer.getByLabel(/^從裝置選擇照片/).setInputFiles(FILE);await expect.poll(()=>!!uploadRoute).toBe(true);
 for(let n=0;n<9;n++){await composer.getByRole("textbox",{name:"圖片網址",exact:true}).fill(`https://example.test/${n}.png`);await composer.getByRole("button",{name:"加入",exact:true}).click();}
 await expect(composer.getByRole("button",{name:"加入",exact:true})).toBeDisabled();await expect(composer.getByRole("button",{name:"下一步",exact:true})).toBeDisabled();expect(await snapshot(page)).toEqual(before);
 await uploadRoute!.fulfill({json:stored});await expect(composer.getByRole("img")).toHaveCount(10);await expect(composer.getByRole("button",{name:"下一步",exact:true})).toBeEnabled();expect(await snapshot(page)).toEqual(before);
 await composer.getByRole("button",{name:"下一步",exact:true}).click();await composer.getByRole("button",{name:"完成",exact:true}).click();const after=await snapshot(page);expect(after.past).toBe(before.past+1);expect(after.document!.entities.posts.at(-1)!.media).toHaveLength(10);expect(after.document!.entities.posts.at(-1)!.media.some(item=>item.src===stored.asset.url)).toBe(true);
});

test("failed local upload retries without creating a post until confirmation",async({page})=>{
 const site=await openEditor(page,390,false);const before=await snapshot(page);await privateImages(page);let attempts=0;
 await page.route("**/api/sites/site-1/assets",route=>{if(route.request().method()!=="POST")return route.fulfill({json:{assets:[]}});attempts++;return attempts===1?route.fulfill({status:500,json:{error:{code:"internal_error",message:"Synthetic upload failure"}}}):route.fulfill({json:stored});});
 const composer=await startCompose(page,site.win);await composer.getByLabel(/^從裝置選擇照片/).setInputFiles(FILE);await expect(composer.locator('[data-upload-state="failed"]')).toHaveCount(1);expect(await snapshot(page)).toEqual(before);
 await composer.getByRole("button",{name:/重試.*transparent/}).click();await expect(composer.getByRole("img")).toHaveCount(1);expect(attempts).toBe(2);expect(await snapshot(page)).toEqual(before);await composer.getByRole("button",{name:"取消",exact:true}).click();expect(await snapshot(page)).toEqual(before);expect(site.saves()).toBe(0);
});


test("failed photo thumbnail keeps its message and remove action inside the320px composer",async({page},info)=>{
 const site=await openEditor(page,320,false);await page.route("https://example.test/broken.png",route=>route.abort());const composer=await startCompose(page,site.win);
 await page.screenshot({path:info.outputPath("compose-pick-320.png")});
 await composer.getByRole("textbox",{name:"圖片網址",exact:true}).fill("https://example.test/broken.png");await composer.getByRole("button",{name:"加入",exact:true}).click();
 const failed=composer.locator(".img-fail");await expect(failed).toBeVisible();
 expect(await failed.evaluate(node=>{const r=document.createRange();r.selectNodeContents(node);return r.getBoundingClientRect().bottom<=node.getBoundingClientRect().bottom+1;})).toBe(true);
 const remove=composer.getByRole("button",{name:"移除照片 1",exact:true});expect(await remove.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 await page.screenshot({path:info.outputPath("compose-failed-photo-320.png")});await remove.click();await expect(composer.getByRole("button",{name:"下一步",exact:true})).toBeDisabled();await composer.getByRole("button",{name:"取消",exact:true}).click();expect(site.saves()).toBe(0);
});


for (const removeSuccessful of [false, true]) test(`composer retry keeps selection order and cover, remove successful=${removeSuccessful}`, async ({ page }) => {
  const site = await openEditor(page, 390, false);
  const before = await snapshot(page);
  await privateImages(page);
  const assetA = "retro-asset:22222222-2222-4222-8222-222222222222";
  const assetB = "retro-asset:33333333-3333-4333-8333-333333333333";
  let attemptsA = 0;
  await page.route("**/api/sites/site-1/assets", route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets: [] } });
    const isA = route.request().postDataBuffer()!.includes(Buffer.from('filename="A.png"'));
    if (isA && ++attemptsA === 1) return route.fulfill({ status: 500, json: { error: { code: "internal_error", message: "Synthetic A failure" } } });
    const url = isA ? assetA : assetB;
    return route.fulfill({ json: { asset: { ...stored.asset, id: url.slice("retro-asset:".length), url } } });
  });
  const composer = await startCompose(page, site.win);
  const bytes = readFileSync(FILE);
  await composer.getByLabel(/^從裝置選擇照片/).setInputFiles([
    { name: "A.png", mimeType: "image/png", buffer: bytes },
    { name: "B.png", mimeType: "image/png", buffer: bytes }
  ]);
  await expect(composer.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await expect(composer.locator('[data-upload-state="completed"]')).toHaveCount(1);
  // A later URL must retain its place after both initially selected files.
  await composer.getByRole("textbox", { name: "圖片網址", exact: true }).fill("https://example.test/C.png");
  await composer.getByRole("button", { name: "加入", exact: true }).click();
  if (removeSuccessful) await composer.getByRole("button", { name: "移除照片 1", exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
  await composer.getByRole("button", { name: "重試 A.png", exact: true }).click();
  await expect(composer.getByRole("img")).toHaveCount(removeSuccessful ? 2 : 3);
  await expect(composer.getByRole("button", { name: "下一步", exact: true })).toBeEnabled();
  expect(attemptsA).toBe(2);
  expect(await snapshot(page)).toEqual(before);
  await composer.getByRole("button", { name: "下一步", exact: true }).click();
  await composer.getByRole("button", { name: "完成", exact: true }).click();
  const after = await snapshot(page);
  const post = after.document!.entities.posts.at(-1)!;
  expect(post.media.map(item => item.src)).toEqual(removeSuccessful ? [assetA, "https://example.test/C.png"] : [assetA, assetB, "https://example.test/C.png"]);
  expect(post.src).toBe(assetA);
  expect(after.past).toBe(before.past + 1);
  await page.keyboard.press("Control+z");
  expect((await snapshot(page)).document).toEqual(before.document);
  await page.keyboard.press("Control+Shift+z");
  expect((await snapshot(page)).document).toEqual(after.document);
});
