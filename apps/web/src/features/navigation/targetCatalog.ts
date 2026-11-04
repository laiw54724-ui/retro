import type { NavigationCatalog } from "./linkDestination";
export type TargetOption = { kind: "window" | "profile" | "post"; id: string; label: string; group: string };
/** The caller supplies an already authorised source; no canonical document or network lookup. */
export function targetCatalog(catalog: Pick<NavigationCatalog, "siteId" | "profiles"> & { windows: readonly { id: string; title: string }[] }, labels: { window: string; profile: string; post: string }, excludeWindowId?: string): TargetOption[] {
  return [
    ...catalog.windows.filter((window) => window.id !== excludeWindowId).map((window) => ({ kind: "window" as const, id: window.id, label: window.title, group: labels.window })),
    ...catalog.profiles.filter((profile) => catalog.siteId !== null && profile.siteId === catalog.siteId).flatMap((profile) => [
      { kind: "profile" as const, id: profile.id, label: profile.profile.name || profile.profile.username, group: labels.profile },
      ...profile.posts.map((post) => ({ kind: "post" as const, id: post.id, label: `${profile.profile.name || profile.profile.username}: ${post.title || post.caption || post.id}`, group: labels.post }))
    ])
  ];
}
