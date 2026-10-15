import type { SiteDocument, VersionedSiteDocument } from "@retrodesk/shared";
import { supabase } from "./supabase";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/$/, "");

export type SiteRecord = {
  id: string;
  username: string;
  site_name: string;
  draft_document: VersionedSiteDocument;
  draft_version: number;
  published_document: VersionedSiteDocument | null;
  published_version: number | null;
  published_at: string | null;
  updated_at: string;
};

export type AssetKind = "image" | "icon";
export type PublishResult = { publishedVersion: number; publishedAt: string; url: string; artifactStatus: "synced" | "failed"; retryable: boolean; artifactKey?: string; warning?: string };
export type AssetRecord = { id: string; url: string; mimeType: string; size: number; kind: AssetKind; name: string; createdAt: string; storageScope?: "legacy_public" | "draft_private"; migrationStatus?: string; migrationRequired?: boolean; publicCopyRemaining?: boolean };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const sessionToken = await accessToken();
    if (!sessionToken) throw new ApiError(401, "unauthorized", "Please sign in first");
    headers.set("Authorization", "Bearer " + sessionToken);
  }

  const response = await fetch(API_URL + path, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(response.status, error?.code ?? "request_failed", error?.message ?? "Request failed", error?.details);
  }
  return payload as T;
}

export const api = {
  usernameAvailability(username: string) {
    return request<{ available: boolean; reason?: string }>("/api/usernames/" + encodeURIComponent(username) + "/availability", {}, false);
  },
  listSites() {
    return request<{ sites: Array<Pick<SiteRecord, "id" | "username" | "site_name" | "draft_version" | "published_version" | "published_at" | "updated_at">> }>("/api/sites");
  },
  createSite(input: { username: string; siteName: string; document: SiteDocument }) {
    return request<{ site: SiteRecord }>("/api/sites", { method: "POST", body: JSON.stringify(input) });
  },
  getSite(siteId: string) {
    return request<{ site: SiteRecord }>("/api/sites/" + siteId);
  },
  saveDraft(siteId: string, expectedVersion: number, document: VersionedSiteDocument) {
    return request<{ version: number; updatedAt: string }>("/api/sites/" + siteId + "/draft", {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, document })
    });
  },
  publish(siteId: string, expectedVersion: number) {
    return request<PublishResult>("/api/sites/" + siteId + "/publish", {
      method: "POST",
      body: JSON.stringify({ expectedVersion })
    });
  },
  retryPublish(siteId: string) {
    return request<PublishResult>("/api/sites/" + siteId + "/publish/retry", { method: "POST" });
  },
  publicSite(username: string) {
    return request<{ site: { username: string; site_name: string; published_document: VersionedSiteDocument; published_version: number; published_at: string } }>(
      "/api/public/sites/" + encodeURIComponent(username),
      { cache: "no-store" },
      false
    );
  },
  async uploadAsset(siteId: string, file: File, options: { kind?: AssetKind; name?: string } = {}) {
    const form = new FormData();
    form.set("file", file);
    if (options.kind) form.set("kind", options.kind);
    if (options.name) form.set("name", options.name);
    return request<{ asset: { id: string; url: string; mimeType: string; size: number; kind: AssetKind; name: string } }>("/api/sites/" + siteId + "/assets", { method: "POST", body: form });
  },
  listAssets(siteId: string, kind?: AssetKind) {
    return request<{ assets: AssetRecord[] }>("/api/sites/" + siteId + "/assets" + (kind ? "?kind=" + kind : ""));
  },
  migrateLegacyAssets(siteId: string, expectedVersion: number) {
    return request<{ version: number; document: SiteDocument; migratedCount: number; cleanupWarnings: string[] }>("/api/sites/" + siteId + "/assets/migrate", { method: "POST", body: JSON.stringify({ expectedVersion }) });
  },
  deleteAsset(siteId: string, assetId: string) {
    return request<void>("/api/sites/" + siteId + "/assets/" + assetId, { method: "DELETE" });
  }
};
