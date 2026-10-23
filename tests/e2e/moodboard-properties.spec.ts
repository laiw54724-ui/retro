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

const selected = (page: Page, id: string) => page.locator(`.moodboard-editor:visible [data-moodboard-id="${id}"]`);
async function select(page: Page, id: string) { await selected(page, id).focus(); await expect(selected(page, id)).toHaveAttribute("aria-pressed", "true"); }
async function geometry(page: Page) {
  const trigger = page.getByRole("button", { name: "精確位置與尺寸", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  return page.locator(".moodboard-geometry");
}
const rank = (page: Page, id: string) => selected(page, id).evaluate(node => Number((node as HTMLElement).style.zIndex));
test.describe("Moodboard touch controls", () => {
  test.use({ hasTouch: true });
  test("320px touch selection, stacking and Undo keep the selected object", async ({ page }) => {
    await openEditor(page, 320);
    const editor = page.locator(".moodboard-editor:visible");
    const coverBox = await selected(page, "cover").boundingBox();
    if (!coverBox) throw new Error("touch target missing");
    await selected(page, "cover").tap({ position: { x: coverBox.width - 2, y: coverBox.height - 2 } });
    await expect(selected(page, "cover")).toHaveAttribute("aria-pressed", "true");
    const beforeRank = await rank(page, "cover");
    await editor.getByRole("button", { name: "下移一層" }).tap();
    await expect.poll(async () => await rank(page, "cover") < beforeRank).toBe(true);
    await page.getByRole("button", { name: "復原", exact: true }).tap();
    await expect.poll(() => rank(page, "cover")).toBe(beforeRank);
    await editor.locator(".moodboard-stage").tap({ position: { x: 8, y: 8 } });
    await expect(selected(page, "cover")).toHaveAttribute("aria-pressed", "false");
  });
});
for (const width of [1440, 320, 375, 390, 430]) {
  test(`Moodboard ${width}px covered objects, exact geometry, order, lock, history and reload`, async ({ page }, testInfo) => {
    const site = await openEditor(page, width), editor = page.locator(".moodboard-editor:visible");
    await select(page, "note");
    await selected(page, "note").press("Enter");
    await expect(editor.getByRole("textbox", { name: "文字", exact: true })).toHaveValue("Hidden note");
    await editor.getByRole("textbox", { name: "文字", exact: true }).press("Escape");
    await geometry(page);
    for (const [name, value] of [["X", "160"], ["Y", "120"], ["寬", "320"], ["高", "210"]]) {
      const input = editor.getByRole("spinbutton", { name, exact: true });
      await input.fill(value); await input.press("Enter"); await expect(input).toHaveValue(value);
    }
    const x = editor.getByRole("spinbutton", { name: "X", exact: true });
    await x.fill("9999"); await x.press("Enter"); await expect(x).toHaveValue("480");
    await x.fill("-30"); await x.press("Enter"); await expect(x).toHaveValue("0");
    await x.fill("160"); await x.press("Enter");
    const height = editor.getByRole("spinbutton", { name: "高", exact: true });
    await height.fill("-20"); await height.press("Enter"); await expect(height).toHaveValue("24");
    await height.fill("210"); await height.press("Enter");
    await x.fill("400"); await x.press("Escape"); await expect(x).toHaveValue("160");
    await x.fill(""); await x.press("Tab"); await expect(x).toHaveValue("160");
    await editor.getByRole("button", { name: "置中", exact: true }).click();
    await expect(editor.locator('[data-moodboard-id="note"] .moodboard-text')).toHaveCSS("text-align", "center");
    await select(page, "cover"); await editor.getByRole("button", { name: "下移一層" }).click();
    expect(await rank(page,"cover")).toBe(0);
    await editor.getByRole("button", { name: "移到最前" }).click(); expect(await rank(page,"cover")).toBe(2);
    if (width === 1440) {
      await page.getByRole("button", { name: "復原", exact: true }).click(); expect(await rank(page,"cover")).toBe(0);
      await page.getByRole("button", { name: "重做", exact: true }).click(); expect(await rank(page,"cover")).toBe(2);
    }
    await select(page,"locked"); await selected(page,"locked").press("ArrowRight");
    await expect(selected(page,"locked")).toHaveCSS("left","420px");
    await expect(editor.locator(".moodboard-handle")).toHaveCount(0);
    await geometry(page); await expect(x).toBeDisabled();
    await select(page,"note"); await editor.getByRole("button", { name: "移到最前" }).click(); await expect.poll(() => rank(page,"note")).toBe(2);
    await editor.getByRole("button", { name: "複製", exact: true }).click(); await expect(editor.locator("[data-moodboard-id]")).toHaveCount(4);
    await editor.getByRole("button", { name: "刪除", exact: true }).click(); await expect(editor.locator("[data-moodboard-id]")).toHaveCount(3);
    await select(page,"note");
    await expect.poll(() => {
      const saved = site.draft_document.windows[0]; if (saved.type !== "moodboard") return null;
      return { count: saved.content.elements.length, note: saved.content.elements.find(item => item.id === "note"), locked: saved.content.elements.find(item => item.id === "locked")?.locked };
    }).toEqual({ count: 3, note: { id:"note",kind:"text",content:"Hidden note",color:"#111111",fontSize:32,align:"center",x:160,y:120,width:320,height:210,zOrder:2,locked:false }, locked:true });
    await page.reload(); if(width<768){await page.getByRole("button",{name:"Moodboard.exe",exact:true}).click();await page.getByRole("button",{name:"編輯內容"}).click();}
    await select(page,"note"); await geometry(page); await expect(x).toHaveValue("160"); await expect(height).toHaveValue("210");
    expect(await rank(page,"note")).toBe(2); await expect(editor.getByRole("button",{name:"置中",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.screenshot({path:testInfo.outputPath(`geometry-${width}.png`),fullPage:true});
    await editor.getByRole("button",{name:"精確位置與尺寸",exact:true}).click();
    await page.screenshot({path:testInfo.outputPath(`selection-${width}.png`),fullPage:true});
    const box=await editor.locator(".moodboard-stage").boundingBox();expect(Math.abs(box!.width/box!.height-800/600)).toBeLessThan(.03);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.route("**/api/public/sites/demo",route=>route.fulfill({json:{site:{username:"demo",site_name:"Demo Desk",published_document:site.draft_document,published_version:1,published_at:"2026-10-18T00:00:00Z"}}}));
    await page.goto("/@demo");if(width<768)await page.locator(".visitor-mobile").getByRole("button",{name:"Moodboard.exe",exact:true}).click();
    const view=page.locator(".moodboard-view:visible");await expect(view.locator('[data-moodboard-id="note"]')).toBeVisible();
    expect(await view.locator('[data-moodboard-id="note"]').evaluate(node=>{const s=(node as HTMLElement).style;return{left:s.left,top:s.top,width:s.width,height:s.height};})).toEqual({left:"20%",top:"20%",width:"40%",height:"35%"});
    await expect(view.locator('[data-moodboard-id="note"] .moodboard-text')).toHaveCSS("text-align","center");await expect(view.locator(".moodboard-layer")).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath(`public-${width}.png`),fullPage:true});
  });
}
for (const width of [1440,320]) for (const destination of ["object","blank","keyboard"] as const) {
  test(`Moodboard ${width}px numeric draft commits on ${destination} selection`,async({page})=>{
    await openEditor(page,width);await select(page,"note");await geometry(page);
    const x=page.getByRole("spinbutton",{name:"X",exact:true});await x.fill("230");
    if(destination==="object")await selected(page,"cover").click();
    else if(destination==="blank")await page.locator(".moodboard-stage.editing").click({position:{x:8,y:8}});
    else { await selected(page,"cover").focus(); }
    await select(page,"note");await geometry(page);await expect(x).toHaveValue("230");
    if(width===1440){await page.getByRole("button",{name:"復原",exact:true}).click();await geometry(page);await expect(x).toHaveValue("80");await expect(page.getByRole("button",{name:"復原",exact:true})).toBeDisabled();await page.getByRole("button",{name:"重做",exact:true}).click();await geometry(page);await expect(x).toHaveValue("230");}
  });
}
test("Moodboard geometry Enter Escape and external Undo remain atomic",async({page})=>{
  await openEditor(page,1440);await select(page,"note");await geometry(page);
  const x=page.getByRole("spinbutton",{name:"X",exact:true}),undo=page.getByRole("button",{name:"復原",exact:true}),redo=page.getByRole("button",{name:"重做",exact:true});
  await x.fill("230");await x.press("Enter");await x.press("Enter");await x.fill("350");await x.press("Escape");await expect(x).toHaveValue("230");
  await page.locator(".moodboard-stage.editing").click({position:{x:8,y:8}});await select(page,"note");await geometry(page);await expect(x).toHaveValue("230");
  await undo.click();await geometry(page);await expect(x).toHaveValue("80");await expect(undo).toBeDisabled();await redo.click();await geometry(page);await expect(x).toHaveValue("230");
  await x.fill("240");await undo.click();await geometry(page);await expect(x).toHaveValue("230");await undo.click();await geometry(page);await expect(x).toHaveValue("80");await expect(undo).toBeDisabled();
});
test("Moodboard drag starts at committed numeric draft and each gesture has one undo step",async({page})=>{
  await openEditor(page,1440);await select(page,"note");await page.locator(".moodboard-floating").getByRole("button",{name:"移到最前"}).click();await geometry(page);
  const x=page.getByRole("spinbutton",{name:"X",exact:true});await x.fill("230");
  const object=await selected(page,"note").boundingBox(),stage=await page.locator(".moodboard-stage.editing").boundingBox();if(!object||!stage)throw Error("geometry missing");
  await page.keyboard.down("Alt");await page.mouse.move(object.x+object.width/2,object.y+object.height/2);await page.mouse.down();await page.mouse.move(object.x+object.width/2+stage.width*64/800,object.y+object.height/2,{steps:3});await page.mouse.up();await page.keyboard.up("Alt");
  await geometry(page);await expect(x).toHaveValue("294");
  await page.getByRole("button",{name:"復原",exact:true}).click();await geometry(page);await expect(x).toHaveValue("230");
  await page.getByRole("button",{name:"復原",exact:true}).click();await geometry(page);await expect(x).toHaveValue("80");
});
