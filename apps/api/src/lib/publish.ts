import type { Env } from "../env";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectAssetReferences, parseAssetReference, replaceAssetReferences, type VersionedSiteDocument } from "@retrodesk/shared";

export type ArtifactStatus = "synced" | "failed";
export type PublishArtifactResult = { artifactStatus: ArtifactStatus; retryable: boolean; artifactKey: string; error?: string };

export type PublishedAssetCopyResult =
  | { ok: true; document: VersionedSiteDocument; copied: Array<{ id: string; key: string; url: string }> }
  | { ok: false; code: "missing" | "foreign" | "unavailable" | "copy_failed"; assetId?: string; message: string };

// The public URL stays stable. Only this internal, non-public storage key is new.
// Retain staged bytes for retries even if the author later removes the upload.
export function publicationAssetStageKey(siteId: string, filename: string): string {
  return `draft/publication-assets/${siteId}/${filename}`;
}

/** Prepare the public document, but copy bytes ONLY into the private namespace. */
export async function copyReferencedAssets(
  env: Env,
  supabase: SupabaseClient,
  input: { ownerId: string; siteId: string; username: string; document: VersionedSiteDocument }
): Promise<PublishedAssetCopyResult> {
  const ids = collectAssetReferences(input.document);
  if (!ids.length) return { ok: true, document: input.document, copied: [] };
  const { data: rows, error } = await supabase.from("site_assets").select("id,owner_id,site_id,object_key,storage_scope,mime_type").in("id", ids);
  if (error) return { ok: false, code: "unavailable", message: "Could not load referenced assets" };
  const byId = new Map((rows ?? []).map((row) => [String(row.id), row]));
  const replacements = new Map<string, string>();
  const copied: Array<{ id: string; key: string; url: string }> = [];
  const prepared: Array<{ id: string; sourceKey: string; stageKey: string; url: string; mimeType: string }> = [];
  // Validate the entire inventory before any storage writes, including references
  // that appear after an otherwise valid asset.
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) return { ok: false, code: "missing", assetId: id, message: `Referenced asset ${id} was not found` };
    if (row.owner_id !== input.ownerId || row.site_id !== input.siteId) return { ok: false, code: "foreign", assetId: id, message: `Referenced asset ${id} does not belong to this site` };
    const draftKey = new RegExp(`^draft/users/${escapeRegExp(input.ownerId)}/sites/${escapeRegExp(input.siteId)}/${escapeRegExp(id)}\\.(jpg|png|webp|gif|mp3|ogg|wav)$`, "i");
    const keyMatch = typeof row.object_key === "string" ? row.object_key.match(draftKey) : null;
    if (row.storage_scope !== "draft_private" || !keyMatch) return { ok: false, code: "foreign", assetId: id, message: `Referenced asset ${id} is not a private draft asset` };
    const extension = keyMatch[1].toLowerCase();
    const key = `published/${input.username}/assets/${id}.${extension === "jpeg" ? "jpg" : extension}`;
    const url = `${env.PUBLIC_ASSET_BASE_URL.replace(/\/$/, "")}/${key}`;
    prepared.push({ id, sourceKey: row.object_key, stageKey: publicationAssetStageKey(input.siteId, `${id}.${extension}`), url, mimeType: row.mime_type });
    replacements.set(id, url);
  }
  const document = replaceAssetReferences(input.document, replacements);
  if (collectAssetReferences(document).length) return { ok: false, code: "copy_failed", message: "Some asset references could not be rewritten" };
  for (const asset of prepared) {
    try {
      if (!await env.ASSETS.head(asset.stageKey)) {
        const object = await env.ASSETS.get(asset.sourceKey);
        if (!object) return { ok: false, code: "missing", assetId: asset.id, message: `Referenced asset ${asset.id} is missing from storage` };
        const staged = await env.ASSETS.put(asset.stageKey, object.body, {
          onlyIf: new Headers({ "If-None-Match": "*" }),
          httpMetadata: { contentType: asset.mimeType, cacheControl: "private, no-store" },
          customMetadata: { siteId: input.siteId, assetId: asset.id }
        });
        if (staged === null && !await env.ASSETS.head(asset.stageKey)) {
          return { ok: false, code: "copy_failed", assetId: asset.id, message: "Could not retain publication asset" };
        }
      }
    } catch {
      return { ok: false, code: "copy_failed", assetId: asset.id, message: "Could not stage publication asset" };
    }
    copied.push({ id: asset.id, key: asset.stageKey, url: asset.url });
  }
  return { ok: true, document, copied };
}

/** Call only for a document whose DB publication has committed (including retry). */
export async function promotePublishedAssets(
  env: Env,
  input: { siteId: string; username: string; document: unknown }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const prefix = `${env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, "")}/published/${input.username}/assets/`;
  const filenames = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.startsWith(prefix)) {
      const filename = value.slice(prefix.length);
      const match = /^([0-9a-f-]+)\.(jpg|png|webp|gif|mp3|ogg|wav)$/i.exec(filename);
      if (match && parseAssetReference(`retro-asset:${match[1]}`)) filenames.add(filename);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(input.document);
  for (const filename of filenames) {
    const key = `published/${input.username}/assets/${filename}`;
    try {
      // Old publications and concurrent successful promotions are immutable.
      if (await env.ASSETS.head(key)) continue;
      const object = await env.ASSETS.get(publicationAssetStageKey(input.siteId, filename));
      if (!object) return { ok: false, message: "A committed publication asset is missing; retry after restoring staged storage" };
      const promoted = await env.ASSETS.put(key, object.body, {
        onlyIf: new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: object.httpMetadata?.contentType ?? "application/octet-stream", cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: { site: input.username, assetId: filename.slice(0, filename.lastIndexOf(".")) }
      });
      if (promoted === null && !await env.ASSETS.head(key)) return { ok: false, message: "Could not retain committed publication asset" };
    } catch {
      return { ok: false, message: "Publication is committed; asset promotion failed and can be retried" };
    }
  }
  return { ok: true };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function publishedArtifactKey(username: string, version: number): string {
  return `published/${username}/versions/${version}/site.json`;
}

export function publishedArtifactBody(input: { username: string; version: number; document: unknown; publishedAt: string }): string {
  return JSON.stringify(input);
}

export async function writePublishedArtifact(
  env: Env,
  input: { username: string; version: number; document: unknown; publishedAt: string; artifactKey?: string }
): Promise<PublishArtifactResult> {
  const artifactKey = input.artifactKey ?? publishedArtifactKey(input.username, input.version);
  try {
    await env.ASSETS.put(artifactKey, publishedArtifactBody(input), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { site: input.username, version: String(input.version) }
    });
    return { artifactStatus: "synced", retryable: false, artifactKey };
  } catch (error) {
    return { artifactStatus: "failed", retryable: true, artifactKey, error: error instanceof Error ? error.message : "R2 write failed" };
  }
}

export async function recordArtifactStatus(
  supabase: SupabaseClient,
  siteId: string,
  ownerId: string,
  version: number,
  status: ArtifactStatus,
  statusError?: string
) {
  const { data, error } = await supabase
    .from("sites")
    .update({ published_artifact_status: status, published_artifact_error: statusError ?? null })
    .eq("id", siteId)
    .eq("owner_id", ownerId)
    .eq("published_version", version)
    .select("id")
    .maybeSingle();
  return { error, updated: Boolean(data) };
}
