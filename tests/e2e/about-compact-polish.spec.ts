import {expect,test,type Page} from "@playwright/test";
import {createStarterDocument,makeWindow,migrateSiteDocumentV2} from "../../packages/shared/src";

const avatar = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#d9e9f4"/><circle cx="80" cy="62" r="28" fill="#f5d28d"/><path d="M28 156a52 52 0 0 1 104 0" fill="#588f96"/><path d="M52 62c-6-53 63-53 56 0l-16-20-36 6z" fill="#42566d"/></svg>';
async function fixture(page:Page,width:number,windowWidth=340){
 const source=createStarterDocument("About compact QA","classic98","blank"),win=makeWindow("about");
 win.id="about";win.title="About.exe";win.defaultOpen=true;win.layout.desktop={...win.layout.desktop,x:34,y:20,w:windowWidth,h:windowWidth>=500?640:420,z:1};
 win.content={...win.content,avatar:"https://assets.test/about-avatar.svg",avatarUrl:"",fields:[],socials:[],nickname:"QA Demo",detailsTitle:"簡介標題",bio:"保留的介紹",quote:"",banner:""};
 source.windows=[win];const migrated=migrateSiteDocumentV2(source,{siteId:"about-polish"});if(!migrated.ok)throw Error("fixture migration");
 let document=migrated.document,version=1,writes=0;
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{localStorage.setItem("retrodesk:locale","zh-Hant");localStorage.setItem("sb-example-auth-token",JSON.stringify({access_token:"a.b.c",refresh_token:"fixture",expires_at:4102444800,expires_in:3600,token_type:"bearer",user:{id:"fixture",email:"fixture@example.test",aud:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-01-01"}}));});
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="assets.test")return route.fulfill({contentType:"image/svg+xml",body:avatar});
  if(url.hostname!=="127.0.0.1")return route.abort();
  if(!url.pathname.startsWith("/api/"))return route.continue();
  if(url.pathname.endsWith("/draft")){document=route.request().postDataJSON().document;writes++;return route.fulfill({json:{version:++version,updatedAt:"2026-10-24T00:00:00Z"}});}
  if(url.pathname.endsWith("/assets"))return route.fulfill({json:{assets:[]}});
  if(url.pathname==="/api/sites/about-polish")return route.fulfill({json:{site:{id:"about-polish",username:"fixture",site_name:document.siteName,draft_document:document,draft_version:version,published_document:null,published_version:null,access_role:"owner"}}});
  return route.fulfill({status:404,json:{error:{code:"not_found"}}});
 });
 await page.goto("/editor/about-polish");
 const open=async()=>{if(width<768)await page.getByRole("button",{name:"About.exe",exact:true}).click();};
 await open();const editor=page.getByRole("dialog",{name:"About.exe",exact:true});
 await expect(editor.locator(".about-editor")).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 return{editor,open,saved:()=>document.windows[0].content,writes:()=>writes};
}

for(const [width,windowWidth] of [[1440,550],[1440,340],[1440,260],[320,340],[390,340],[430,340]])test(`About compact layout and lifecycle at ${width}px window ${windowWidth}`,async({page})=>{
 const state=await fixture(page,width,windowWidth),editor=state.editor;
 const picture=editor.locator(".about-avatar-drop"),trigger=editor.locator(".about-avatar-toggle");
 await expect(editor.getByRole("img",{name:"頭像預覽",exact:true})).toBeVisible();
 const photo=await picture.boundingBox(),button=await trigger.boundingBox();if(!photo||!button)throw Error("avatar bounds missing");
 await page.screenshot({path:test.info().outputPath(`about-${width}-${windowWidth}.png`)});
 expect.soft(button.y).toBeGreaterThanOrEqual(photo.y+photo.height);
 const add=editor.getByRole("textbox",{name:"＋ 新增欄位",exact:true});
 const hint=await add.evaluate(input=>{const field=input as HTMLInputElement,style=getComputedStyle(field),canvas=document.createElement("canvas"),context=canvas.getContext("2d")!;context.font=style.font;return{needed:context.measureText(field.placeholder).width,available:field.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};});
 expect.soft(hint.needed).toBeLessThanOrEqual(hint.available+1);
 if(width>=768){const toolbar=page.getByRole("toolbar",{name:"已選取元件操作",exact:true}),bar=await toolbar.boundingBox(),window=await editor.boundingBox();if(!bar||!window)throw Error("toolbar bounds missing");expect.soft(bar.width).toBeLessThanOrEqual(window.width+1);for(const item of await toolbar.getByRole("button").all())await expect(item).toBeInViewport({ratio:1});}
 else expect(button.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await trigger.click();await expect(editor.getByRole("textbox",{name:"頭像網址",exact:true})).toBeVisible();
 await page.keyboard.press("Escape");await expect(trigger).toBeFocused();expect(state.writes()).toBe(0);
 await add.fill("生日");await add.press("Enter");await expect(editor.getByLabel("欄位內容",{exact:true})).toBeFocused();await page.keyboard.type("April 1");
 await editor.getByRole("textbox",{name:"暱稱",exact:true}).fill("Saved QA");
 await expect.poll(()=>state.saved().nickname).toBe("Saved QA");
 await expect.poll(()=>state.saved().fields[0]?.value).toBe("April 1");
 if(width>=768){
  const toolbar=page.getByRole("toolbar",{name:"已選取元件操作",exact:true});await toolbar.getByRole("button",{name:"完成",exact:true}).click();
  await expect(editor.locator(".about-editor")).toHaveCount(0);await expect(editor.locator(".about-view")).toBeVisible();
  await expect(toolbar.getByRole("button",{name:"編輯內容",exact:true})).toBeFocused();
  await toolbar.getByRole("button",{name:"編輯內容",exact:true}).click();
  await editor.locator(".titlebar-controls").getByRole("button",{name:"關閉",exact:true}).click();
  await expect(editor).toHaveCount(0);await expect(toolbar).toHaveCount(0);await expect(page.locator(".selection-scrim")).toHaveCount(0);
  await expect(page.locator(".deskicon")).toBeFocused();await page.locator(".deskicon").press("Enter");
 }else{
  await editor.getByRole("button",{name:"視窗設定",exact:true}).click();
  await page.getByRole("dialog",{name:"視窗設定",exact:true}).getByRole("button",{name:"完成",exact:true}).click();
  await expect(editor.getByRole("button",{name:"視窗設定",exact:true})).toBeFocused();
  await editor.locator(".m-back").click();await state.open();
 }
 await expect(editor.getByRole("textbox",{name:"暱稱",exact:true})).toHaveValue("Saved QA");
 await page.reload();await state.open();
 await expect(editor.getByRole("textbox",{name:"暱稱",exact:true})).toHaveValue("Saved QA");await expect(editor.getByLabel("欄位內容",{exact:true})).toHaveValue("April 1");
});

for(const [width,windowWidth] of [[1440,340],[1440,260],[320,340]])test(`About hints and compact actions follow enabled locales at ${width}/${windowWidth}`,async({page})=>{
 const state=await fixture(page,width,windowWidth);
 const locales=process.env.VITE_I18N_PREVIEW_LOCALES==="true"?["zh-Hant","en","ja","ko"]:["zh-Hant","en"];
 for(const locale of locales){
  await page.getByTestId("language-switcher").selectOption(locale);await expect(page.locator("html")).toHaveAttribute("lang",locale);
  const add=state.editor.locator(".about-field-add input");
  const metrics=await add.evaluate(input=>{const field=input as HTMLInputElement,s=getComputedStyle(field),ctx=document.createElement("canvas").getContext("2d")!;ctx.font=s.font;return{needed:ctx.measureText(field.placeholder).width,available:field.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)};});
  expect(metrics.needed).toBeLessThanOrEqual(metrics.available+1);
  await expect(add).toHaveAttribute("title",/.+/);
  const picture=await state.editor.locator(".about-avatar-drop").boundingBox(),button=await state.editor.locator(".about-avatar-toggle").boundingBox();if(!picture||!button)throw Error("avatar bounds");
  expect(button.y).toBeGreaterThanOrEqual(picture.y+picture.height);
  if(width>=768){const bar=await page.getByRole("toolbar").boundingBox(),win=await state.editor.boundingBox();if(!bar||!win)throw Error("toolbar bounds");expect(bar.width).toBeLessThanOrEqual(win.width+1);}
 }
 expect(state.writes()).toBe(0);
 await page.screenshot({path:test.info().outputPath(`locales-${width}-${windowWidth}.png`)});
});

test.describe("coarse pointer desktop",()=>{
 test.use({hasTouch:true});
 test("compact actions retain 44px targets and stay inside the selected window",async({page})=>{
  const state=await fixture(page,1440,340);
  expect(await page.evaluate(()=>matchMedia("(pointer: coarse)").matches)).toBe(true);
  const avatarButton=await state.editor.locator(".about-avatar-toggle").boundingBox();expect(avatarButton!.height).toBeGreaterThanOrEqual(44);
  const toolbar=page.getByRole("toolbar");
  for(const button of await toolbar.getByRole("button").all()){const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);await expect(button).toBeInViewport({ratio:1});}
  expect((await toolbar.boundingBox())!.width).toBeLessThanOrEqual((await state.editor.boundingBox())!.width+1);
 });
});
