import { expect, test, type Page } from "@playwright/test";
import { migrateSiteDocumentV2 } from "../../packages/shared/src";
import { igDocument } from "../e2e/ig-fixture";

// Real compiled app/resources. Only the private owner API/session is synthetic;
// no translation modules, strings, selectors or locale flags are mocked.
async function ownerFixture(page: Page) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "release-locales" });
  if (!migrated.ok) throw new Error("Invalid fixture");
  let document = migrated.document, version = 1;
  await page.evaluate(() => localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } })));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/draft")) { document = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version } }); }
    if (url.pathname === "/api/sites/release-locales") return route.fulfill({ json: { site: { id: "release-locales", username: "fixture", site_name: "Fixture", draft_document: document, draft_version: version, published_document: null, published_version: null, access_role: "owner" } } });
    if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
}

const text = {
  ja: { auth: "Googleで続行", add: "コンポーネントを追加", mobileAdd: "追加", group: "紹介と文章", manage: "投稿を管理", done: "編集を完了", hint: "変更はサイトの下書きに反映されます。完了や戻る操作では公開されません。", replace: "画像 1 を置き換え", publish: "公開" },
  ko: { auth: "Google로 계속", add: "구성 요소 추가", mobileAdd: "추가", group: "소개와 글", manage: "게시물 관리", done: "편집 완료", hint: "변경 사항은 사이트 초안에 반영됩니다. 완료나 뒤로 가기로 사이트가 게시되지는 않습니다.", replace: "이미지 1 교체", publish: "게시" },
};

for (const locale of ["ja", "ko"] as const) for (const width of [1440, 320]) {
  test(`${locale} release bundle at ${width}px switches auth, shell, catalog and IG`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const select = page.getByTestId("language-switcher").first();
    await expect.poll(() => select.locator("option").evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))).toEqual(["zh-Hant", "en", "ja", "ko"]);
    await select.selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(select.locator(`option[value='${locale}']`)).toContainText(locale === "ja" ? "ベータ" : "베타");
    await page.reload();
    await expect(select).toHaveValue(locale);
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: text[locale].auth, exact: true })).toBeVisible();
    await ownerFixture(page);
    await page.goto("/editor/release-locales");
    await expect(page.getByRole("button", { name: text[locale].publish, exact: true })).toBeVisible();
    const add = width < 768 ? page.locator(".m-toolbar").getByRole("button", { name: text[locale].mobileAdd, exact: true }) : page.getByRole("button", { name: text[locale].add, exact: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: text[locale].add, exact: true });
    await expect(dialog.getByRole("heading", { name: text[locale].group, exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`compiled-${locale}-catalog-${width}.png`) });
    await page.keyboard.press("Escape"); await expect(add).toBeFocused();
    if (width < 768) { await page.locator(".m-icon").click(); await page.locator(".m-edit-toggle").click(); }
    const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
    await win.getByRole("button", { name: text[locale].manage, exact: true }).click();
    const posts = win.locator(".ig-canonical-posts");
    await posts.locator("[data-ig-edit]").filter({ hasText: "p1" }).click();
    await expect(posts.getByText(text[locale].hint, { exact: true })).toBeVisible();
    await expect(posts.getByLabel(text[locale].replace, { exact: true })).toBeAttached();
    await expect(posts.getByRole("button", { name: text[locale].done, exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`compiled-${locale}-ig-${width}.png`) });
    await posts.getByRole("button", { name: text[locale].done, exact: true }).click();
    await expect(posts.locator("[data-ig-edit]").filter({ hasText: "p1" })).toBeFocused();
    expect(errors).toEqual([]);
  });
}
