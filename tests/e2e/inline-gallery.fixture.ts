import galleryDelta from "../../apps/web/src/features/modules/gallery/locale-deltas/zh-Hant.json";
import { expect, test, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createAssetReference, makeGalleryImage, makeWindow, migrateSiteDocumentV2,
  normalizeDocument, projectPublicSiteDocument, replaceAssetReferences
} from "../../packages/shared/src";
import { documentFixture } from "./fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
export const pickedFile = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

function fixture(long = false, legacyAlt = false) {
  const gallery = makeWindow("gallery");
  if (gallery.type !== "gallery") throw new Error("gallery fixture");
  gallery.id = "gallery-a";
  gallery.title = "Gallery A";
  gallery.defaultOpen = true;
  gallery.layout.desktop = { ...gallery.layout.desktop, x: 10, y: 10, w: 390, h: 680, z: 3 };
  gallery.content.images = long ? [
    makeGalleryImage({ id: "broken", title: "LongImageTitle".repeat(14), caption: "LongVisibleCaption".repeat(45), alt: legacyAlt ? undefined : "DetailedImageDescription".repeat(12), src: "https://assets.test/broken.png", href: "https://example.com/" + "destination".repeat(100) }),
    makeGalleryImage({ id: "empty", title: "沒有圖片", src: null })
  ] : [];
  const other = structuredClone(gallery);
  other.id = "gallery-b";
  other.title = "Gallery B";
  other.defaultOpen = false;
  other.layout.desktop = { ...other.layout.desktop, x: 415, z: 2 };
  other.content.images = [makeGalleryImage({ id: "other-image", title: "Other gallery data", caption: "Keep me", src: "https://assets.test/other.png" })];
  const about = makeWindow("about");
  about.id = "about";
  about.title = "About.exe";
  about.defaultOpen = false;
  const doc = makeWindow("document");
  if (doc.type !== "document") throw new Error("document fixture");
  doc.id = "document";
  doc.title = "Document.exe";
  doc.defaultOpen = false;
  doc.content.blocks = [
    { id: "image-one", kind: "image", src: null, srcUrl: "", alt: "first image", caption: "A caption" },
    { id: "image-two", kind: "image", src: null, srcUrl: "", alt: "second image", caption: "Another caption" }
  ];
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [gallery, other, about, doc] }), { siteId: "site-1" });
  if (!migrated.ok) throw new Error("media fixture migration failed");
  return migrated.document;
}

export async function mockGallery(page: Page, { long = false, legacyAlt = false, width = 1440, wide = true, failOnce = "", hold = "" } = {}) {
  let draft = fixture(long, legacyAlt);
  if (wide) draft.windows[0].layout.desktop.w = 760;
  let published = structuredClone(draft);
  let version = 1;
  let protectedFailure = false;
  const calls: string[] = [];
  const assets: Array<{ id: string; url: string; kind: string; name: string }> = [];
  const held = new Map<string, () => void>();
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", (route) => route.request().url().includes("broken")
    ? route.fulfill({ status: 404, body: "missing" })
    : route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: version, published_document: published, published_version: 1, published_at: "2026-10-17T00:00:00Z", access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    draft = structuredClone(route.request().postDataJSON().document);
    version++;
    return route.fulfill({ json: { version, updatedAt: "2026-10-17T00:01:00Z" } });
  });
  await page.route("**/api/sites/site-1/assets**", async (route: Route) => {
    if (route.request().url().endsWith("/content")) return protectedFailure
      ? route.fulfill({ status: 403, body: "unavailable" })
      : route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets } });
    const body = route.request().postDataBuffer()?.toString() ?? "";
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? "unknown";
    calls.push(name);
    if (name === hold) await new Promise<void>((resolve) => held.set(name, resolve));
    if (name === failOnce && calls.filter((value) => value === name).length === 1) {
      return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    }
    const id = randomUUID();
    const asset = { id, url: createAssetReference(id), kind: body.includes("\r\nicon\r\n") ? "icon" : "image", name, mimeType: "image/png", size: PNG.length, createdAt: "2026-10-17T00:00:00Z" };
    assets.push(asset);
    return route.fulfill({ json: { asset } });
  });
  await page.route("**/api/public/sites/demo", (route) => {
    const projected = projectPublicSiteDocument(published, "site-1");
    if (!projected.ok) throw new Error("invalid public fixture");
    const publicDocument = replaceAssetReferences(projected.document, new Map(assets.map((asset) => [asset.id, `https://assets.test/${asset.id}.png`])));
    return route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: publicDocument, published_version: version, published_at: "2026-10-17T00:01:00Z" } } });
  });
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: "Gallery A", exact: true }).click();
    await page.getByRole("button", { name: "編輯內容" }).click();
  }
  const gallery = page.getByRole("dialog", { name: "Gallery A", exact: true });
  await expect(gallery.locator(".gal-editor")).toBeVisible();

  await page.evaluate(async (delta) => {
    const path = "/src/i18n/index.ts";
    const { i18n } = await import(path);
    i18n.addResourceBundle("zh-Hant", "modules", delta, true, true);
    i18n.emit("languageChanged", "zh-Hant");
  }, galleryDelta);
  return {
    gallery, calls, assets, saved: () => draft,
    failProtected: () => { protectedFailure = true; },
    release: (name: string) => { const resolve = held.get(name); if (!resolve) throw new Error("request not held"); held.delete(name); resolve(); },
    publishSaved: () => { published = structuredClone(draft); },
    images: (id = "gallery-a") => {
      const window = draft.windows.find((window) => window.id === id);
      if (window?.type !== "gallery") throw new Error("missing gallery");
      return window.content.images;
    }
  };
}
