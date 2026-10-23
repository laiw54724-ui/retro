import {expect,test,type Page} from '@playwright/test';
import {createStarterDocument,makeWindow,makeGalleryImage,migrateSiteDocumentV2} from '@retrodesk/shared';
async function fixture(page:Page,width=390){
 const legacy=createStarterDocument('Phone','classic98','blank');
 legacy.windows=['links','gallery','about'].map((type,index)=>{const w=makeWindow(type as 'links'); w.id=`w${index}`; w.title=['Links','Gallery','About'][index];w.layout.mobile.order=index;return w;});
 const gallery=legacy.windows[1];if(gallery.type==='gallery')gallery.content.images=Array.from({length:8},(_,i)=>makeGalleryImage({id:`im${i}`,title:`Picture ${i}`}));
 const migrated=migrateSiteDocumentV2(legacy,{siteId:'site-1'});if(!migrated.ok)throw Error('migration');let draft=migrated.document,writes=0;
 const session={access_token:'a.b.c',refresh_token:'r',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:'u',email:'x@y.z',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01'}};
 await page.addInitScript(v=>localStorage.setItem('sb-example-auth-token',JSON.stringify(v)),session);
 await page.route('**/api/sites/site-1',r=>r.fulfill({json:{site:{id:'site-1',username:'demo',site_name:'Phone',draft_document:draft,draft_version:writes+1,published_document:null,published_version:null,access_role:'owner'}}}));
 await page.route('**/api/sites/site-1/assets**',r=>r.fulfill({json:{assets:[]}}));
 await page.route('**/api/sites/site-1/draft',r=>{draft=r.request().postDataJSON().document;writes++;return r.fulfill({json:{version:writes+1}});});
 await page.setViewportSize({width,height:844});await page.goto('/editor/site-1');await expect(page.locator('.m-toolbar')).toBeVisible();return{saved:()=>draft,writes:()=>writes};
}
const state=(page:Page)=>page.evaluate(async()=>{const{useEditorStore}=await import('/src/features/editor/store.ts');const s=useEditorStore.getState();return{doc:s.versionedDocument,past:s.past.length,future:s.future.length};});
for(const width of [320,375,390,430])test(`v2 phone home and mounted raw draft through sheets at ${width}`,async({page},info)=>{
 const backend=await fixture(page,width);
 await expect(page.locator('.m-toolbar button')).toHaveCount(4);
 await page.getByRole('button',{name:'Gallery',exact:true}).click();
 await expect(page.locator('.m-edit-toggle')).toHaveCount(0);
 await expect(page.locator('.gal-editor-toolbar')).toBeVisible();
 await page.locator('.gal-editor-toolbar button[aria-expanded]').click();
 const url=page.getByLabel('新增圖片網址',{exact:true});await url.fill('https://unfinished');const node=await url.elementHandle();
 const before=await state(page);
 await page.getByRole('button',{name:'視窗設定',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'視窗設定',exact:true});await expect(sheet).toBeVisible();
 const b=await sheet.boundingBox();expect(b!.height).toBeLessThanOrEqual(844*.78+2);
 await sheet.getByRole('button',{name:'關閉',exact:true}).press('Escape');
 await expect(sheet).toBeHidden();await expect(page.getByRole('button',{name:'視窗設定',exact:true})).toBeFocused();
 await expect(url).toHaveValue('https://unfinished');expect(await node!.evaluate(n=>n.isConnected)).toBe(true);expect(await state(page)).toEqual(before);expect(backend.writes()).toBe(0);
 await page.screenshot({path:info.outputPath(`phone-v2-${width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('v2 longpress reorders once on release, Undo restores order and delete Undo sends no write',async({page},info)=>{
 const backend=await fixture(page);const before=await state(page);
 const first=page.locator('[data-reorder-id=w0]'),last=page.locator('[data-reorder-id=w2]');const a=await first.boundingBox();
 await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2);await page.mouse.down();await page.waitForTimeout(480);
 await expect(page.locator('.editing-reorder-ghost')).toBeVisible();
 const b=await last.boundingBox(); await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:4});
 expect(await state(page)).toEqual(before);
 await page.mouse.up();await expect.poll(async()=>(await state(page)).past).toBe(before.past+1);
 expect((await state(page)).doc?.windows.find(w=>w.id==='w0')?.layout.mobile.order).toBe(2);
 await page.getByRole('button',{name:'復原',exact:true}).click();await expect.poll(async()=>(await state(page)).doc?.windows.find(w=>w.id==='w0')?.layout.mobile.order).toBe(0);
 await expect.poll(()=>backend.saved().windows.find(w=>w.id==='w0')?.layout.mobile.order).toBe(0);
 const current=await state(page);const writes=backend.writes();
 await page.getByRole('button',{name:'刪除 Links',exact:true}).click();await expect(first).toHaveCount(0);
 await page.locator('.editing-undo-toast').getByRole('button',{name:'復原',exact:true}).click();await expect(first).toBeVisible();expect(await state(page)).toEqual(current);expect(backend.writes()).toBe(writes);
 await page.screenshot({path:info.outputPath('phone-arrange.png')});
});
test('v2 keyboard reorder, cancel rename, theme palettes and direct add preserve canonical history',async({page})=>{
 await fixture(page);const first=page.locator('[data-reorder-id=w0]');await first.focus();await first.press('Alt+ArrowRight');await expect(first).toBeFocused();
 await expect.poll(async()=>(await state(page)).doc?.windows.find(w=>w.id==='w0')?.layout.mobile.order).toBe(1);
 await page.getByRole('button',{name:'整理',exact:true}).click();await first.press('Enter');const rename=page.getByLabel('圖示名稱',{exact:true});await rename.fill('discard');const before=await state(page);await rename.press('Escape');expect(await state(page)).toEqual(before);await expect(first).toBeFocused();
 await page.getByRole('button',{name:'完成',exact:true}).click();await page.locator('.m-toolbar').getByRole('button',{name:'主題',exact:true}).click();const theme=page.getByRole('dialog',{name:'主題',exact:true});await theme.getByRole('button',{name:'桌布顏色 2',exact:true}).click();await expect.poll(async()=>(await state(page)).doc?.theme.wall).toBe('#ffd6e5');await theme.getByRole('button',{name:'完成',exact:true}).click();
 await page.locator('.m-toolbar').getByRole('button',{name:'新增',exact:true}).click();await page.locator('.m-sheet .m-add').filter({hasText:/^文件/}).click();
 await expect(page.locator('.m-inline-titlebar input')).toBeFocused();await expect(page.locator('.module-document .doc-status')).toBeVisible();
});

test('v2 scroll threshold, pointer cancellation and history changes cannot commit stale arrangements',async({page})=>{
 await fixture(page);const first=page.locator('[data-reorder-id=w0]');const a=await first.boundingBox();const before=await state(page);
 await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2);await page.mouse.down();await page.mouse.move(a!.x+a!.width/2+12,a!.y+a!.height/2,{steps:2});await page.waitForTimeout(480);await expect(page.locator('.editing-reorder-ghost')).toHaveCount(0);await page.mouse.up();expect(await state(page)).toEqual(before);
 await first.focus();await first.press('Alt+ArrowRight');await expect.poll(async()=>(await state(page)).past).toBe(1);
 const b=await first.boundingBox();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);await page.mouse.down();await page.waitForTimeout(480);await expect(page.locator('.editing-reorder-ghost')).toBeVisible();
 await page.evaluate(async()=>{const{useEditorStore}=await import('/src/features/editor/store.ts');useEditorStore.getState().undo();});const undone=await state(page);await page.mouse.up();expect(await state(page)).toEqual(undone);await expect(page.locator('.editing-reorder-ghost')).toHaveCount(0);
 const c=await first.boundingBox();await page.mouse.move(c!.x+c!.width/2,c!.y+c!.height/2);await page.mouse.down();await page.mouse.move(c!.x+c!.width/2+10,c!.y+c!.height/2,{steps:2});await expect(page.locator('.editing-reorder-ghost')).toBeVisible();await first.dispatchEvent('pointercancel',{pointerId:1,bubbles:true});await page.mouse.up();expect(await state(page)).toEqual(undone);await expect(page.locator('.editing-reorder-ghost')).toHaveCount(0);
});

test('v2 blank required titles stay local through sheets and Escape cancels without closing the app',async({page})=>{
 const backend=await fixture(page),before=await state(page);const site=page.getByLabel('網站名稱',{exact:true});await site.fill('');await page.locator('.m-toolbar').getByRole('button',{name:'主題',exact:true}).click();await page.keyboard.press('Escape');await expect(site).toHaveValue('');await site.press('Escape');await expect(site).toHaveValue('Phone');expect(await state(page)).toEqual(before);
 await page.getByRole('button',{name:'Links',exact:true}).click();const title=page.getByLabel('視窗標題',{exact:true});await title.fill('');await page.getByRole('button',{name:'視窗設定',exact:true}).click();await page.keyboard.press('Escape');await expect(title).toHaveValue('');await title.press('Escape');await expect(title).toHaveValue('Links');await expect(page.locator('.m-win-body')).toBeVisible();expect(await state(page)).toEqual(before);expect(backend.writes()).toBe(0);
});

test('review: Escape during a longpress cancels its ghost and pointerup cannot reorder',async({page})=>{
 await fixture(page);const before=await state(page),first=page.locator('[data-reorder-id=w0]');await first.focus();const a=await first.boundingBox();await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2);await page.mouse.down();await page.waitForTimeout(480);await expect(page.locator('.editing-reorder-ghost')).toBeVisible();await first.press('Escape');await expect(page.locator('.m-toolbar')).toBeVisible();const ghostAfterEscape=await page.locator('.editing-reorder-ghost').count();const b=await page.locator('[data-reorder-id=w2]').boundingBox();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:4});await page.mouse.up();expect(await state(page)).toEqual(before);expect(ghostAfterEscape).toBe(0);await expect(page.locator('.editing-reorder-ghost')).toHaveCount(0);
});
