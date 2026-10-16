import type { Env } from "../env";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectAssetReferences, parseAssetReference, replaceAssetReferences, type VersionedSiteDocument } from "@retrodesk/shared";

export type ArtifactStatus = "synced" | "failed";
export type PublishArtifactResult = { artifactStatus: ArtifactStatus; retryable: boolean; artifactKey: string; error?: string };

export type PublishedAssetCopyResult =
  | { ok: true; document: VersionedSiteDocument; copied: Array<{ id: string; key: string; url: string }> }
  | { ok: false; code: "missing" | "foreign" | "unavailable" | "copy_failed"; assetId?: string; message: string };

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
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) return { ok: false, code: "missing", assetId: id, message: `Referenced asset ${id} was not found` };
    if (row.owner_id !== input.ownerId || row.site_id !== input.siteId) return { ok: false, code: "foreign", assetId: id, message: `Referenced asset ${id} does not belong to this site` };
    const draftKey = new RegExp(`^draft/users/${escapeRegExp(input.ownerId)}/sites/${escapeRegExp(input.siteId)}/${escapeRegExp(id)}\\.(jpg|png|webp|gif|mp3|ogg|wav)$`, "i");
    const keyMatch = typeof row.object_key === "string" ? row.object_key.match(draftKey) : null;
    if (row.storage_scope !== "draft_private" || !keyMatch) return { ok: false, code: "foreign", assetId: id, message: `Referenced asset ${id} is not a private draft asset` };
    const extension = keyMatch[1].toLowerCase();
    const object = await env.ASSETS.get(row.object_key);
    if (!object) return { ok: false, code: "missing", assetId: id, message: `Referenced asset ${id} is missing from storage` };
    const key = `published/${input.username}/assets/${id}.${extension === "jpeg" ? "jpg" : extension}`;
    try {
      await env.ASSETS.put(key, object.body, { httpMetadata: { contentType: row.mime_type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { site: input.username, assetId: id } });
    } catch (copyError) {
      return { ok: false, code: "copy_failed", assetId: id, message: copyError instanceof Error ? copyError.message : "Asset copy failed" };
    }
    const url = `${env.PUBLIC_ASSET_BASE_URL.replace(/\/$/, "")}/${key}`;
    replacements.set(id, url);
    copied.push({ id, key, url });
  }
  const document = replaceAssetReferences(input.document, replacements);
  if (collectAssetReferences(document).length) return { ok: false, code: "copy_failed", message: "Some asset references could not be rewritten" };
  return { ok: true, document, copied };
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
