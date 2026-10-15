import type { Env } from "../env";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ArtifactStatus = "synced" | "failed";
export type PublishArtifactResult = { artifactStatus: ArtifactStatus; retryable: boolean; artifactKey: string; error?: string };

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
