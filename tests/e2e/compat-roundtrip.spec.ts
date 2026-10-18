import { expect, test, type Page } from "@playwright/test";
import { WindowChromeSchema, createStarterDocument, makeBlock, makeGalleryImage, makeWindow, migrateSiteDocumentV2, type SiteDocument } from "@retrodesk/shared";

/**
 * Read -> edit something unrelated -> save must not lose or invent fields. The additive fields (caption/alt, window.chrome,
 * Explorer icon, providerEmbed) are strict in older readers, so a lossy or noisy round-trip would break rollback.
 */
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const SPOTIFY = "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA";

function withNewFields(): SiteDocument {
  const document = createStarterDocument("Compat", "classic98", "oc");
  const doc = document.windows.find((window) => window.type === "document");
  const gallery = document.windows.find((window) => window.type === "gallery");
  if (!doc || doc.type !== "document" || !gallery || gallery.type !== "gallery") throw new Error("fixture missing document/gallery");
  doc.chrome = WindowChromeSchema.parse({ preset: "classic-95", controls: ["close"] });
  doc.content.blocks.push({ ...makeBlock("image"), alt: "Portrait alternative", caption: "Visible portrait caption" });
  gallery.content.images.push(makeGalleryImage({ title: "Portrait", caption: "Visible gallery caption", alt: "Independent gallery alternative" }));
  gallery.icon = "haiku:folder";
  const explorer = makeWindow("explorer", document.windows.length);
  const music = makeWindow("music", document.windows.length + 1);
  if (explorer.type !== "explorer" || music.type !== "music") throw new Error("fixture types");
  explorer.id = "explorer"; explorer.title = "World.exe";
  explorer.content.folders = [{ id: "icons", parentId: null, name: "Icons", icon: "pixelart:heart", order: 0, visibility: "published" }];
  explorer.content.shortcuts = [{ id: "to-gallery", parentId: "icons", label: "Gallery", icon: "pixelarticons:image", order: 0, visibility: "published", target: { siteId: "site-1", id: gallery.id, kind: "window" } }];
  music.content.tracks = [{ id: "sp", title: "Official player", artist: "", cover: null, coverUrl: "", lyrics: "", rightsNote: "", source: { kind: "providerEmbed", provider: "spotify", resourceType: "track", resourceId: "50q2aUjWoTn6CJIfSPRJQA", canonicalUrl: SPOTIFY, originalUrl: SPOTIFY } }];
  music.content.playlist.trackIds = ["sp"];
  document.windows.push(explorer, music);
  return document;
}

function legacyWithoutNewFields(): SiteDocument {
  return createStarterDocument("Old", "classic98", "oc");
}

const asV2 = (document: SiteDocument) => {
  const migrated = migrateSiteDocumentV2(document, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("migration failed");
  return migrated.document;
};

async function editUnrelated(page: Page, draft: { windows: Array<{ id: string; title: string }> }) {
  const target = draft.windows[0];
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Compat", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: Record<string, unknown> & { windows: Array<Record<string, any>> } }> = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    site.draft_document = body.document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  await page.getByRole("tab", { name: "視窗" }).click();
  await page.locator(".layer").filter({ hasText: target.title }).first().getByRole("button").first().click();
  await page.getByRole("tab", { name: "通用" }).click();
  const title = page.getByLabel("視窗標題");
  await expect(title).toBeVisible();
  await title.fill(`${target.title} 改`);
  await expect.poll(() => saves.at(-1)?.document.windows.find((window) => window.id === target.id)?.title).toBe(`${target.title} 改`);
  await page.reload();
  await expect(page.getByRole("tab", { name: "視窗" })).toBeVisible();
  return { saves, renamedId: target.id };
}

// Selecting a window raises it (z-order), which is a legitimate side effect of the interaction.
const strip = (document: any, renamedId: string) => ({ ...document, windows: document.windows.map((window: any) => window.id === renamedId ? { ...window, title: "<renamed>", layout: { ...window.layout, desktop: { ...window.layout.desktop, z: 0 } } } : window) });

for (const label of ["legacy v1", "canonical v2"] as const) {
  test(`${label} document with every additive field survives edit-something-else and save unchanged`, async ({ page }) => {
    const source = withNewFields();
    const original = label === "legacy v1" ? source : asV2(source);
    const { saves, renamedId } = await editUnrelated(page, original);
    const saved = saves.at(-1)!.document;
    const expected = asV2(source);
    // the new-field payloads are intact
    const byType = (type: string) => saved.windows.find((window) => window.type === type)!;
    expect(byType("document").chrome).toMatchObject({ preset: "classic-95", controls: ["close"] });
    expect(byType("document").content.blocks.find((block: any) => block.kind === "image")).toMatchObject({ alt: "Portrait alternative", caption: "Visible portrait caption" });
    expect(byType("gallery").content.images.at(-1)).toMatchObject({ caption: "Visible gallery caption", alt: "Independent gallery alternative" });
    expect(byType("gallery").icon).toBe("haiku:folder");
    expect(byType("explorer").content.folders[0].icon).toBe("pixelart:heart");
    expect(byType("explorer").content.shortcuts[0].icon).toBe("pixelarticons:image");
    expect(byType("music").content.tracks[0].source).toMatchObject({ kind: "providerEmbed", provider: "spotify", resourceId: "50q2aUjWoTn6CJIfSPRJQA" });
    // nothing else changed: identical to the original apart from the renamed window
    expect(strip(saved, renamedId)).toEqual(strip(JSON.parse(JSON.stringify(expected)), renamedId));
  });
}

test("an old document without the additive fields is not given any of them by a save", async ({ page }) => {
  const original = asV2(legacyWithoutNewFields());
  const { saves, renamedId } = await editUnrelated(page, original);
  const saved = saves.at(-1)!.document;
  expect(strip(saved, renamedId)).toEqual(strip(JSON.parse(JSON.stringify(original)), renamedId));
  const text = JSON.stringify(saved);
  expect(text).not.toContain('"chrome"');
  expect(text).not.toContain("providerEmbed");
  expect(text).not.toMatch(/"icon":"[a-z]+:[a-z0-9-]+"/);
});
