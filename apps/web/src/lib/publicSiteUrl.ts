/**
 * The one place that decides what a site's public address is, so the editor, the publish dialog, previews and share
 * links all show a URL that actually reaches the site on the environment the visitor is using (production, staging or
 * local) instead of a hard-coded brand domain.
 */
const currentOrigin = () => (typeof window !== "undefined" ? window.location.origin : "");

/** Absolute, reachable URL of the published site: `<origin>/@<username>`. */
export function publicSiteUrl(username: string, origin: string = currentOrigin()): string {
  const handle = username.replace(/^@/, "");
  return `${origin.replace(/\/+$/, "")}/@${encodeURIComponent(handle)}`;
}

/** Same address without the scheme, for compact display (`host/@name`). */
export function publicSiteLabel(username: string, origin: string = currentOrigin()): string {
  return publicSiteUrl(username, origin).replace(/^https?:\/\//, "");
}
