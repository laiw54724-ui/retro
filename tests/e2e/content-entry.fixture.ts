import {expect,type Locator,type Page} from '@playwright/test';
/** Mobile v2 opens the real editor directly; desktop retains its existing content action. */
export async function enterContentEditor(page:Page,scope:Page|Locator=page){
 const phone=page.locator('.editor-app .m-screen:visible');
 if(await phone.count()){
   await expect(phone.locator('.m-window-settings')).toBeVisible();
   await expect(phone.locator('.m-edit-toggle')).toHaveCount(0);
   await expect(phone.locator('.m-win-body .module-host')).toBeVisible();
 }else await scope.getByRole('button',{name:/^(編輯內容|Edit content)$/,exact:true}).click();
}
