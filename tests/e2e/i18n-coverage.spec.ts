import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

/**
 * End-to-end coverage of the translated product: create -> edit -> publish -> browse, language switching while editing,
 * layout at phone widths, and IME-style composition. Japanese and Korean are beta, so those locales only run against the
 * preview build (VITE_I18N_PREVIEW_LOCALES=true, see `pnpm test:e2e:i18n-preview`); English always runs.
 */
const PREVIEW = process.env.VITE_I18N_PREVIEW_LOCALES === "true";
const LOCALES = (PREVIEW ? ["en", "ja", "ko"] : ["en"]) as Array<"en" | "ja" | "ko">;
const LOCALE_KEY = "retrodesk:locale";
const FIXED = "2026-10-17T09:07:00.000Z";
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

test.use({ locale: "zh-TW", timezoneId: "UTC" });

const LOCALE_DIR = join(__dirname, "../../apps/web/src/i18n/locales");
const NAMESPACES = ["common", "editor", "instagram", "music", "errors", "modules", "collab"];
type Tree = { [key: string]: string | Tree };
const catalogs: Record<string, Record<string, Tree>> = {};
function catalog(locale: string, namespace: string): Tree {
  catalogs[locale] ??= {};
  catalogs[locale][namespace] ??= JSON.parse(readFileSync(join(LOCALE_DIR, locale === "zh" ? "zh-Hant" : locale, `${namespace}.json`), "utf8"));
  return catalogs[locale][namespace];
}
/** Text of "ns:path.to.key" in a locale (plain strings only; plural bases resolve to the _other form). */
function tx(locale: string, id: string): string {
  const [namespace, path] = id.split(":");
  let node: string | Tree | undefined = catalog(locale, namespace);
  for (const part of path.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (node === undefined) {
    let other: string | Tree | undefined = catalog(locale, namespace);
    const parts = path.split(".");
    parts[parts.length - 1] += "_other";
    for (const part of parts) other = typeof other === "object" ? other[part] : undefined;
    node = other;
  }
  if (typeof node !== "string") throw new Error(`missing catalog text ${locale}/${id}`);
  return node;
}

function leaves(tree: Tree, out: string[] = []): string[] {
  for (const value of Object.values(tree)) typeof value === "string" ? out.push(value) : leaves(value, out);
  return out;
}
/**
 * Traditional Chinese wording that must never appear in another locale's UI: every zh catalog string (static part >= 3 Han
 * characters) that is not also a legitimate string of the locale being tested (Japanese shares many kanji words).
 */
function leakSegments(locale: string): string[] {
  const own = new Set(NAMESPACES.flatMap((ns) => leaves(catalog(locale, ns))));
  const segments = new Set<string>();
  for (const ns of NAMESPACES) for (const value of leaves(catalog("zh", ns))) {
    for (const part of value.split(/\{\{[^}]*\}\}/)) {
      const text = part.trim();
      if ((text.match(/[㐀-鿿]/g) ?? []).length >= 3 && !own.has(value) && ![...own].some((candidate) => candidate.includes(text))) segments.add(text);
    }
  }
  return [...segments];
}

async function visibleChineseLeaks(page: Page, locale: string): Promise<string[]> {
  const segments = leakSegments(locale);
  return page.evaluate((list) => {
    const hits: string[] = [];
    const scan = (text: string | null | undefined, where: string) => {
      if (!text) return;
      for (const segment of list) if (text.includes(segment)) { hits.push(`${where}: ${segment}`); break; }
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
      scan(node.textContent, `text<${parent.tagName.toLowerCase()}>`);
    }
    for (const element of document.body.querySelectorAll("[aria-label],[title],[placeholder],[alt]")) {
      for (const attribute of ["aria-label", "title", "placeholder", "alt"]) scan(element.getAttribute(attribute), `${attribute}`);
    }
    return hits;
  }, segments);
}

async function setLocale(page: Page, locale: string) {
  await page.addInitScript(([key, value]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); }, [LOCALE_KEY, locale]);
}

function v2(document: unknown): SiteDocumentV2Input {
  const result = migrateSiteDocumentV2(document, { siteId: "site-1" });
  if (!result.ok || result.version !== 2) throw new Error("fixture migration failed");
  return result.document;
}

type Mock = { saves: Array<{ document: Record<string, unknown> & { windows: Array<Record<string, any>> } }>; created: () => Record<string, any> | null; published: () => boolean };
async function mockBackend(page: Page, initial?: unknown): Promise<Mock> {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  let created: Record<string, any> | null = null;
  let draft: unknown = initial ?? null;
  let version = 1;
  let published: unknown = null;
  const saves: Mock["saves"] = [];
  const site = () => ({ id: "site-1", username: "demo", site_name: "Demo", draft_document: draft, draft_version: version, published_document: published, published_version: published ? 1 : null, published_at: published ? FIXED : null, updated_at: FIXED, access_role: "owner" });
  await page.route("**/api/usernames/*/availability", (route) => route.fulfill({ json: { available: true } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON();
    saves.push(body); draft = body.document; version += 1;
    return route.fulfill({ json: { version, updatedAt: FIXED } });
  });
  await page.route("**/api/sites/site-1/publish", (route) => {
    published = draft;
    return route.fulfill({ json: { publishedVersion: 1, publishedAt: FIXED, url: "/@demo", artifactStatus: "synced", cleanupWarnings: [] } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: site() } }));
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo", published_document: published ?? draft, published_version: 1, published_at: FIXED } } }));
  await page.route(/\/api\/sites$/, (route) => {
    if (route.request().method() === "POST") {
      created = route.request().postDataJSON();
      draft = (created as { document: unknown }).document;
      return route.fulfill({ status: 201, json: { site: site() } });
    }
    return route.fulfill({ json: { sites: draft ? [{ ...site(), draft_document: undefined }] : [] } });
  });
  return { saves, created: () => created, published: () => published !== null };
}

for (const locale of LOCALES) {
  test.describe(`${locale}`, () => {
    test(`create, edit, publish and browse with no Chinese left in the interface`, async ({ page }) => {
      await setLocale(page, locale);
      const backend = await mockBackend(page);
      await page.setViewportSize({ width: 1440, height: 900 });

      await page.goto("/");
      expect(await visibleChineseLeaks(page, locale), "landing").toEqual([]);

      await page.goto("/auth");
      await expect(page.getByText(tx(locale, "common:desktopHub.noDesktopsYet"))).toBeVisible();
      expect(await visibleChineseLeaks(page, locale), "desktop hub").toEqual([]);

      await page.getByRole("link", { name: tx(locale, "common:desktopHub.createYourFirstDesktop") }).click();
      await page.getByPlaceholder("your-name").fill("mochi");
      await page.getByRole("textbox").nth(1).fill("Mochi Desk");
      await expect(page.getByText(tx(locale, "common:onboarding.thisUrlIsAvailable"))).toBeVisible();
      expect(await visibleChineseLeaks(page, locale), "onboarding step 1").toEqual([]);
      await page.getByRole("button", { name: tx(locale, "common:onboarding.next") }).click();
      expect(await visibleChineseLeaks(page, locale), "onboarding step 2").toEqual([]);
      await page.getByRole("button", { name: tx(locale, "common:onboarding.next") }).click();
      await page.getByRole("button", { name: new RegExp(tx(locale, "common:onboarding.digitalCard")) }).first().click();
      expect(await visibleChineseLeaks(page, locale), "onboarding step 3").toEqual([]);
      await page.getByRole("button", { name: tx(locale, "common:onboarding.doneOpenTheEditor") }).click();

      // the new site starts with defaults in the chosen language, never Chinese ones
      await expect.poll(() => backend.created()).not.toBeNull();
      const document = backend.created()!.document as { windows: Array<{ title: string }> };
      if (locale !== "ja") expect(JSON.stringify(document.windows)).not.toMatch(/[\u3400-\u9fff]{3,}/); // kanji are legitimate Japanese
      expect(document.windows.map((window) => window.title)).toContain(tx(locale, "editor:defaults.aboutMe"));

      await expect(page).toHaveURL(/\/editor\/site-1/);
      await expect(page.getByRole("button", { name: new RegExp(tx(locale, "editor:shell.publish")) }).first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(600);
      expect(await visibleChineseLeaks(page, locale), "editor").toEqual([]);

      // add a window from the catalog and open its inspector
      await page.getByRole("tab", { name: tx(locale, "editor:tabs.add") }).click();
      await page.locator(".add-card").nth(1).click();
      await page.waitForTimeout(400);
      expect(await visibleChineseLeaks(page, locale), "editor after adding a window").toEqual([]);

      const dialog = page.getByRole("dialog", { name: tx(locale, "editor:editor.publishRetroDesktop") });
      // publishing waits for the autosave to settle, so retry the click until the dialog opens
      await expect(async () => {
        await page.getByRole("button", { name: tx(locale, "editor:shell.publish"), exact: true }).click();
        await expect(dialog).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 15000 });
      expect(await visibleChineseLeaks(page, locale), "publish dialog").toEqual([]);
      await dialog.getByRole("button", { name: tx(locale, "editor:editor.confirmAndPublish") }).click();
      await expect(page.getByRole("dialog", { name: tx(locale, "editor:editor.published") })).toBeVisible();
      expect(backend.published()).toBe(true);
      expect(await visibleChineseLeaks(page, locale), "publish success").toEqual([]);

      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.goto("/@demo");
        await page.waitForTimeout(500);
        expect(await visibleChineseLeaks(page, locale), `public page ${viewport.width}px`).toEqual([]);
        await test.info().attach(`public-${locale}-${viewport.width}`, { body: await page.screenshot(), contentType: "image/png" });
      }
    });

    test(`switching language keeps unsaved text, undo and selection and writes nothing`, async ({ page }) => {
      await setLocale(page, locale === "en" ? "ja" : "en"); // start in another language, then switch
      const backend = await mockBackend(page, v2(documentFixture));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/editor/site-1");
      const titleLabel = (l: string) => tx(l, "editor:inspector.title") ?? "";
      void titleLabel;
      await page.getByRole("tab", { name: /./ }).first().waitFor();
      // type into the first window's title field in the properties panel
      const field = page.locator("#editor-right-panel input.w98-input").first();
      await expect(field).toBeVisible({ timeout: 15000 });
      await field.fill("");
      await page.keyboard.type("Draft in progress");
      await field.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 8));
      const savesBefore = backend.saves.length;
      const selector = page.getByTestId("language-switcher").first();
      await selector.selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("#editor-right-panel input.w98-input").first()).toHaveValue("Draft in progress");
      // switching alone never saves or changes the document
      await page.waitForTimeout(1600);
      expect(backend.saves.length - savesBefore).toBeLessThanOrEqual(1); // at most the pending edit itself
      const last = backend.saves.at(-1);
      expect(JSON.stringify(last)).toContain("Draft in progress");
      // undo is still there after the switch
      await page.getByRole("button", { name: tx(locale, "editor:shell.undo"), exact: true }).click();
      await expect(page.locator("#editor-right-panel input.w98-input").first()).not.toHaveValue("Draft in progress");
    });

    for (const width of [320, 390, 430]) {
      test(`key screens fit at ${width}px`, async ({ page }) => {
        await setLocale(page, locale);
        await mockBackend(page, v2(documentFixture));
        await page.setViewportSize({ width, height: 844 });
        const fits = async (name: string) => {
          const problems = await page.evaluate(() => {
            const out: string[] = [];
            const overflow = document.documentElement.scrollWidth - innerWidth;
            if (overflow > 1) out.push(`page overflows by ${overflow}px`);
            for (const element of document.querySelectorAll<HTMLElement>("button, a, label, select, summary, [role=tab]")) {
              const box = element.getBoundingClientRect();
              if (box.width <= 2 || box.height <= 2 || getComputedStyle(element).visibility === "hidden") continue; // skips visually-hidden labels
              if (box.right > innerWidth + 1 || box.left < -1) out.push(`${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 30)}" leaves the viewport`);
              else if (element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflow !== "visible" && element.tagName !== "SELECT") out.push(`${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 30)}" clips its text`);
            }
            return out;
          });
          expect(problems, `${locale} ${name} at ${width}px`).toEqual([]);
        };
        await page.goto("/");
        await fits("landing");
        await page.goto("/auth");
        await fits("desktop hub");
        await page.goto("/onboarding");
        await fits("onboarding");
        await page.goto("/editor/site-1");
        await expect(page.getByRole("button", { name: new RegExp(tx(locale, "editor:mobile.add")) }).first()).toBeVisible({ timeout: 15000 });
        await fits("phone editor");
        await page.getByRole("button", { name: new RegExp(tx(locale, "editor:mobile.add")) }).first().click();
        await fits("phone add sheet");
        await page.goto("/@demo");
        await page.waitForTimeout(400);
        await fits("public page");
        await test.info().attach(`phone-${locale}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
      });
    }
  });
}

// Simulated IME composition through the DevTools protocol (Chromium). This is NOT a substitute for real-device IME checks.
for (const locale of PREVIEW ? (["ja", "ko"] as const) : []) {
  const compose = { ja: { steps: ["ふぉ", "ふぉる", "ふぉるだ"], committed: "フォルダー", query: "フォルダー" }, ko: { steps: ["ㅍ", "포", "폴", "폴더"], committed: "폴더", query: "폴더" } }[locale];
  test.describe(`${locale} simulated IME`, () => {
    test("icon search keeps the composed text and matches localized icon names", async ({ page }) => {
      await setLocale(page, locale);
      await mockBackend(page, v2(documentFixture));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/editor/site-1");
      await page.getByRole("button", { name: tx(locale, "modules:iconPicker.chooseAnIcon") }).first().click();
      const search = page.locator(".ilib input[type=search]");
      await search.focus();
      const client = await page.context().newCDPSession(page);
      for (const step of compose.steps) await client.send("Input.imeSetComposition", { text: step, selectionStart: step.length, selectionEnd: step.length });
      // mid-composition the control still holds the in-progress text; nothing is lost or replaced
      expect(await search.inputValue()).toContain(compose.steps.at(-1)!);
      await client.send("Input.insertText", { text: compose.committed });
      await expect(search).toHaveValue(compose.committed);
      await expect(page.locator(`.ilib [data-icon="haiku:folder"]`)).toBeVisible();
      await expect(page.locator(`.ilib [data-icon="haiku:folder"] .ilib-name`)).toHaveText(locale === "ja" ? "フォルダー" : "폴더");
      expect(await visibleChineseLeaks(page, locale), "icon picker").toEqual([]);
    });

    test("window title composition commits once and is what gets saved", async ({ page }) => {
      await setLocale(page, locale);
      const backend = await mockBackend(page, v2(documentFixture));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/editor/site-1");
      const field = page.locator("#editor-right-panel input.w98-input").first();
      await expect(field).toBeVisible({ timeout: 15000 });
      await field.fill("");
      await field.focus();
      const client = await page.context().newCDPSession(page);
      for (const step of compose.steps) await client.send("Input.imeSetComposition", { text: step, selectionStart: step.length, selectionEnd: step.length });
      await client.send("Input.insertText", { text: compose.committed });
      await expect(field).toHaveValue(compose.committed);
      await expect.poll(() => JSON.stringify(backend.saves.at(-1) ?? {})).toContain(compose.committed);
      // no fragment of the in-progress composition ended up in the saved title
      const title = backend.saves.at(-1)!.document.windows[0].title as string;
      expect(title).toBe(compose.committed);
    });
  });
}

// Opt-in: CAPTURE_DIR=<dir> writes review screenshots of the editor and the public page in every enabled locale.
const CAPTURE_DIR = process.env.CAPTURE_DIR;
for (const locale of CAPTURE_DIR ? (["zh", ...LOCALES] as const) : []) {
  test(`review screenshots ${locale}`, async ({ page }) => {
    await setLocale(page, locale === "zh" ? "zh-Hant" : locale);
    await mockBackend(page, v2(documentFixture));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/editor/site-1");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(CAPTURE_DIR!, `${locale}-editor.png`) });
    await page.goto("/@demo");
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(CAPTURE_DIR!, `${locale}-public.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor/site-1");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(CAPTURE_DIR!, `${locale}-editor-390.png`) });
  });
}
