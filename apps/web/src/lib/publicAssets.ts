/**
 * Base URLs the API publishes asset copies under (`<base>/published/<username>/assets/<id>.<ext>`). The editor uses them
 * to recognise the published form of a draft's asset references, so it must be the same value the API was deployed with
 * as `PUBLIC_ASSET_BASE_URL`. By default that is the API's own `/api/assets`; a deployment that serves assets from
 * another origin sets `VITE_PUBLIC_ASSET_BASE_URL`. A mismatch is safe: the site then simply shows as having
 * unpublished changes (republishing fixes it) instead of hiding a real difference.
 */
export function trustedPublicAssetBaseUrls(): string[] {
  const api = String(import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/+$/, "");
  const configured = String(import.meta.env.VITE_PUBLIC_ASSET_BASE_URL || "").replace(/\/+$/, "");
  return [...new Set([configured, `${api}/api/assets`].filter(Boolean))];
}
