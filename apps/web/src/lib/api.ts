import type { ImportPreview, RetroExportPackage, SiteDocument, VersionedSiteDocument, VersionedSiteDocumentInput } from "@retrodesk/shared";
import { supabase } from "./supabase";
import type { CollaboratorRole, CreatedSiteInvite, SiteAccessRole, SiteInvite, SiteMember } from "./collaboration";

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
  access_role: SiteAccessRole;
};

export type SiteListRecord = Pick<SiteRecord, "id" | "username" | "site_name" | "draft_version" | "published_version" | "published_at" | "updated_at" | "access_role">;

export type AssetKind = "image" | "icon" | "audio";
export type PublishResult = { publishedVersion: number; publishedAt: string; url: string; artifactStatus: "synced" | "failed"; retryable: boolean; artifactKey?: string; warning?: string };
export type AssetRecord = { id: string; url: string; mimeType: string; size: number; kind: AssetKind; name: string; createdAt: string; storageScope?: "legacy_public" | "draft_private"; migrationStatus?: string; migrationRequired?: boolean; publicCopyRemaining?: boolean };
export type GuestbookStatus = "pending" | "approved" | "rejected";
export type GuestbookEntry = { id: string; displayName: string; body: string; status: GuestbookStatus; createdAt: string; reportCount?: number; openReportCount?: number };

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

async function download(path: string) {
  const token = await accessToken();
  if (!token) throw new ApiError(401, "unauthorized", "Please sign in first");
  const response = await fetch(API_URL + path, { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, payload?.error?.code ?? "export_failed", payload?.error?.message ?? "Export failed", payload?.error?.details);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "retro-export.json";
  return { blob: await response.blob(), filename };
}

export const api = {
  usernameAvailability(username: string) {
    return request<{ available: boolean; reason?: string }>("/api/usernames/" + encodeURIComponent(username) + "/availability", {}, false);
  },
  listSites() {
    return request<{ sites: SiteListRecord[] }>("/api/sites");
  },
  createSite(input: { username: string; siteName: string; document: SiteDocument }) {
    return request<{ site: Omit<SiteRecord, "access_role"> }>("/api/sites", { method: "POST", body: JSON.stringify(input) });
  },
  getSite(siteId: string) {
    return request<{ site: SiteRecord }>("/api/sites/" + siteId);
  },
  saveDraft(siteId: string, expectedVersion: number, document: VersionedSiteDocumentInput) {
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
  exportSite(siteId: string, scope: "draft" | "published") {
    return download(`/api/sites/${encodeURIComponent(siteId)}/export?scope=${scope}`);
  },
  previewImport(value: unknown) {
    return request<{ preview: ImportPreview; digest: string }>("/api/imports/preview", { method: "POST", body: JSON.stringify(value) });
  },
  confirmImport(value: RetroExportPackage, input: { digest: string; username: string; siteName: string; allowMissingMedia: boolean }) {
    const query = new URLSearchParams({ digest: input.digest, username: input.username, siteName: input.siteName, allowMissingMedia: String(input.allowMissingMedia) });
    return request<{ site: { id: string; username: string; site_name: string; draft_version: number }; missingMedia: ImportPreview["missingMedia"] }>(`/api/imports/confirm?${query}`, { method: "POST", body: JSON.stringify(value) });
  },
  publicGuestbook(username: string) {
    return request<{ entries: GuestbookEntry[] }>(`/api/public/sites/${encodeURIComponent(username)}/guestbook`, { cache: "no-store" }, false);
  },
  submitGuestbook(username: string, input: { displayName: string; body: string; requestId: string }) {
    return request<{ entry: GuestbookEntry }>(`/api/public/sites/${encodeURIComponent(username)}/guestbook`, { method: "POST", body: JSON.stringify(input) }, false);
  },
  reportGuestbookEntry(username: string, entryId: string, input: { requestId: string; reason?: string }) {
    return request<{ accepted: true }>(`/api/public/sites/${encodeURIComponent(username)}/guestbook/${encodeURIComponent(entryId)}/reports`, { method: "POST", body: JSON.stringify(input) }, false);
  },
  listGuestbookEntries(siteId: string) {
    return request<{ entries: GuestbookEntry[] }>(`/api/sites/${siteId}/guestbook`, { cache: "no-store" });
  },
  moderateGuestbookEntry(siteId: string, entryId: string, status: Exclude<GuestbookStatus, "pending">) {
    return request<{ entry: GuestbookEntry }>(`/api/sites/${siteId}/guestbook/${entryId}`, { method: "PUT", body: JSON.stringify({ status }) });
  },
  deleteGuestbookEntry(siteId: string, entryId: string) {
    return request<void>(`/api/sites/${siteId}/guestbook/${entryId}`, { method: "DELETE" });
  },
  resolveGuestbookReports(siteId: string, entryId: string) {
    return request<{ resolved: number }>(`/api/sites/${siteId}/guestbook/${entryId}/reports/resolve`, { method: "POST" });
  },
  async uploadAsset(siteId: string, file: File, options: { kind?: AssetKind; name?: string } = {}) {
    const form = new FormData();
    form.set("file", file);
    if (options.kind) form.set("kind", options.kind);
    if (options.name) form.set("name", options.name);
    return request<{ asset: { id: string; url: string; mimeType: string; size: number; kind: AssetKind; name: string } }>("/api/sites/" + siteId + "/assets", { method: "POST", body: form });
  },
  listAssets(siteId: string, kind?: AssetKind) {
    return request<{ assets: AssetRecord[] }>("/api/sites/" + siteId + "/assets" + (kind ? "?kind=" + kind : ""), { cache: "no-store" });
  },
  migrateLegacyAssets(siteId: string, expectedVersion: number) {
    return request<{ version: number; document: VersionedSiteDocument; migratedCount: number; cleanupWarnings: string[] }>("/api/sites/" + siteId + "/assets/migrate", { method: "POST", body: JSON.stringify({ expectedVersion }) });
  },
  deleteAsset(siteId: string, assetId: string) {
    return request<void>("/api/sites/" + siteId + "/assets/" + assetId, { method: "DELETE" });
  },
  listMembers(siteId: string) {
    return request<{ members: SiteMember[] }>("/api/sites/" + siteId + "/members", { cache: "no-store" });
  },
  listInvites(siteId: string) {
    return request<{ invites: SiteInvite[] }>("/api/sites/" + siteId + "/invites", { cache: "no-store" });
  },
  createInvite(siteId: string, input: { email: string; role: CollaboratorRole; expiryHours: 1 | 24 | 72 | 168 }) {
    return request<{ invite: CreatedSiteInvite; token: string }>("/api/sites/" + siteId + "/invites", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  revokeInvite(siteId: string, inviteId: string) {
    return request<void>("/api/sites/" + siteId + "/invites/" + inviteId, { method: "DELETE" });
  },
  updateMemberRole(siteId: string, userId: string, role: CollaboratorRole) {
    return request<{ ok: true }>("/api/sites/" + siteId + "/members/" + userId, {
      method: "PUT",
      body: JSON.stringify({ role })
    });
  },
  removeMember(siteId: string, userId: string) {
    return request<void>("/api/sites/" + siteId + "/members/" + userId, { method: "DELETE" });
  },
  acceptInvite(token: string) {
    return request<{ membership: { site_id: string; role: CollaboratorRole } }>("/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token })
    });
  }
};
