import type { LinkDestination, NavigationCatalog, ResolvedDestination } from "./linkDestination";
export function resolveLinkDestination(target: LinkDestination, catalog: NavigationCatalog): ResolvedDestination | null {
  if (target.kind === "url") {
    try { const url = new URL(target.url); return ["http:", "https:", "mailto:"].includes(url.protocol) ? { kind: "url", url: target.url } : null; } catch { return null; }
  }
  if (!catalog.siteId || target.siteId !== catalog.siteId) return null;
  if (target.kind === "window") {
    const window = catalog.windows.find((item) => item.id === target.id);
    return window ? { kind: "window", window } : null;
  }
  if (target.kind !== "profile" && target.kind !== "post") return null;
  const profile = catalog.profiles.find((entry) => entry.siteId === catalog.siteId && (target.kind === "profile" ? entry.id === target.id : entry.posts.some((post) => post.id === target.id)));
  if (!profile) return null;
  const window = catalog.windows.find((item) => item.type === "instagram" && catalog.profileIdsByWindow[item.id] === profile.id) ?? catalog.windows.find((item) => item.type === "instagram") ?? null;
  return { kind: "entity", profile, postId: target.kind === "post" ? target.id : null, window };
}
