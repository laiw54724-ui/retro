import { describe, expect, it, vi } from "vitest";
import { createStarterDocument, makeIgPost, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { buildProfileDirectory } from "../modules/instagram/profileDirectory";
import { resolveLinkDestination } from "./resolveLinkDestination";
import { dispatchUiActions } from "./dispatchUiActions";
import { targetCatalog } from "./targetCatalog";
import { createEntityViewer } from "./createEntityViewer";
import type { LinkDestination, NavigationCatalog } from "./linkDestination";
const ig = makeWindow("instagram");
if (ig.type !== "instagram") throw new Error("fixture");
ig.id = "ig"; ig.content.images = [makeIgPost({ id: "a-post", title: "Exact post" })];
const raw = { ...createStarterDocument("Nav"), windows: [ig] };
const loaded = migrateSiteDocumentV2(raw, { siteId: "site" });
if (!loaded.ok || loaded.version !== 2) throw new Error("fixture");
const profiles = buildProfileDirectory(loaded.document, false);
const profile = profiles[0];
const post = profile.posts[0];
const catalog: NavigationCatalog = { siteId: "site", windows: [ig], profiles, profileIdsByWindow: { ig: profile.id } };
describe("existing-reference session navigation", () => {
  it("rejects cross-site, missing, unknown kind and unscoped targets without dispatch", () => {
    const open = vi.fn();
    for (const destination of [{ kind: "profile", siteId: "other", id: profile.id }, { kind: "post", siteId: "site", id: "missing" }, { kind: "window", siteId: "other", id: "ig" }, { kind: "script", siteId: "site", id: "ig" }] as LinkDestination[]) {
      expect(dispatchUiActions({ kind: "openDestination", destination }, { editing: false, catalog, open })).toEqual({ ok: false, reason: "unavailable" });
    }
    expect(resolveLinkDestination({ kind: "profile", siteId: "site", id: profile.id }, { ...catalog, siteId: null })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
  it("never resolves an entity omitted from the source-authorised directory", () => {
    expect(resolveLinkDestination({ kind: "profile", siteId: "site", id: profile.id }, { ...catalog, profiles: [] })).toBeNull();
    expect(resolveLinkDestination({ kind: "post", siteId: "site", id: post.id }, { ...catalog, profiles: [] })).toBeNull();
  });
  it("opens the exact post's real author and matching host, independent of title and order", () => {
    const resolved = resolveLinkDestination({ kind: "post", siteId: "site", id: post.id }, { ...catalog, windows: [{ ...ig, title: "Renamed" }] });
    expect(resolved).toMatchObject({ kind: "entity", profile: { id: profile.id }, postId: post.id, window: { id: "ig" } });
  });
  it("resolves a post owned by another profile instead of falling back to the host entry", () => {
    const other = { ...profile, id: "other-profile", posts: [{ ...post, id: "other-post" }] };
    expect(resolveLinkDestination({ kind: "post", siteId: "site", id: "other-post" }, { ...catalog, profiles: [...profiles, other] })).toMatchObject({ kind: "entity", profile: { id: "other-profile" }, postId: "other-post", window: { id: "ig" } });
  });
  it("requires a temporary viewer only when the source has no suitable IG host", () => {
    const snapshot = structuredClone(catalog);
    const resolved = resolveLinkDestination({ kind: "profile", siteId: "site", id: profile.id }, { ...catalog, windows: [] });
    expect(resolved).toMatchObject({ kind: "entity", window: null });
    const viewer = createEntityViewer(profile, []);
    expect(viewer.type).toBe("instagram"); expect(viewer.defaultOpen).toBe(false);
    expect(viewer.content).toMatchObject({ profile: profile.profile, images: profile.posts });
    expect(catalog).toEqual(snapshot);
  });
  it("author editing is inert and external URLs retain the existing protocol allowlist", () => {
    const open = vi.fn();
    const destination = { kind: "window", id: "ig", siteId: "site" } as const;
    expect(dispatchUiActions({ kind: "openDestination", destination }, { editing: true, catalog, open }).ok).toBe(false);
    expect(open).not.toHaveBeenCalled();
    for (const url of ["https://example.com", "http://example.com", "mailto:a@example.com"]) expect(resolveLinkDestination({ kind: "url", url }, catalog)).toMatchObject({ kind: "url", url });
    for (const url of ["javascript:alert(1)", "data:text/html,x", "https://", ""]) expect(resolveLinkDestination({ kind: "url", url }, catalog)).toBeNull();
  });
  it("catalogue uses stable IDs and excludes foreign source profiles", () => {
    const options = targetCatalog({ ...catalog, profiles: [...profiles, { ...profile, id: "foreign", siteId: "foreign" }] }, { window: "Window", profile: "OC", post: "Post" });
    expect(options.find((option) => option.kind === "post")?.id).toBe(post.id);
    expect(options.some((option) => option.id === "foreign")).toBe(false);
  });
});
