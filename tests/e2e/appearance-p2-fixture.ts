import { type Page } from "@playwright/test";
import { makeWindow, SiteDocumentSchema } from "../../packages/shared/src/site";
import { migrateSiteDocumentV2 } from "../../packages/shared/src/site-versioning";
import { documentFixture } from "./fixture";

export async function mockColors(page: Page, options: { authoredModules?: boolean } = {}) {
  const source = SiteDocumentSchema.parse(structuredClone(documentFixture));
  source.theme.appearance = { titleText: "#ffffcc", frameColor: "#554433", contentBackground: "#ddeeff", contentText: "#112233", desktopLabelText: "#101010", desktopLabelBackground: "#eeeeee" };
  source.windows = [makeWindow("document", 0), makeWindow("links", 1)];
  source.windows[0].title = "First.exe";
  source.windows[1].title = "Second.exe";
  source.windows[0].defaultOpen = true;
  source.windows[1].defaultOpen = true;
  source.windows[0].appearance = { titleFrom: "#002244", titleTo: "#003355", titleText: "#ffccdd", frameColor: "#334455", contentBackground: "#ffeecc", contentText: "#331122", desktopLabelText: "#ffffff", desktopLabelBackground: "#222222" };
  if (options.authoredModules) {
    const moodboard = makeWindow("moodboard", 2);
    if (moodboard.type !== "moodboard") throw new Error("moodboard fixture");
    moodboard.title = "Canvas.exe";
    moodboard.content.background = "#aa22bb";
    moodboard.appearance = { contentBackground: "#ff0000", contentText: "#00ff00", frameColor: "#334455" };
    const oc = makeWindow("instagram", 3);
    oc.title = "Character.exe";
    oc.appearance = { contentBackground: "#ff0000", contentText: "#00ff00", frameColor: "#334455" };
    source.windows.push(moodboard, oc);
  }
  const result = migrateSiteDocumentV2(source, { siteId: "site-1" });
  if (!result.ok || result.version !== 2) throw new Error("fixture migration");
  let saved = result.document;
  if (options.authoredModules) saved.entities.profiles[0].themeOverride = { accent: "#22aabb", background: "#112255" };
  let writes = 0;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo", draft_document: saved, draft_version: writes + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; writes++; return route.fulfill({ json: { version: writes + 1, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: saved, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
  return { saved: () => saved, writes: () => writes };
}

