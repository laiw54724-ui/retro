import { i18n } from "../i18n";
export type SiteAccessRole = "owner" | "editor" | "viewer";
export type CollaboratorRole = Exclude<SiteAccessRole, "owner">;

export type CollaborationActions = {
  editDraft: boolean;
  uploadAssets: boolean;
  publish: boolean;
  migrateAssets: boolean;
  manageMembers: boolean;
  viewDraft: boolean;
};

export type SiteMember = {
  user_id: string;
  email: string;
  role: CollaboratorRole;
  created_at: string;
  updated_at: string;
};

export type SiteInvite = {
  id: string;
  email: string;
  role: CollaboratorRole;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type CreatedSiteInvite = Pick<SiteInvite, "id" | "email" | "role" | "expires_at" | "created_at"> & {
  site_id: string;
};

const ROLE_ACTIONS: Record<SiteAccessRole, CollaborationActions> = {
  owner: { editDraft: true, uploadAssets: true, publish: true, migrateAssets: true, manageMembers: true, viewDraft: true },
  editor: { editDraft: true, uploadAssets: true, publish: false, migrateAssets: false, manageMembers: false, viewDraft: true },
  viewer: { editDraft: false, uploadAssets: false, publish: false, migrateAssets: false, manageMembers: false, viewDraft: true }
};

export function collaborationActions(role: SiteAccessRole): CollaborationActions {
  return ROLE_ACTIONS[role];
}

type InviteDates = Pick<SiteInvite, "accepted_at" | "revoked_at" | "expires_at">;
export type InviteStatus = { code: "pending" | "accepted" | "revoked" | "expired"; label: string };

export function inviteStatus(invite: InviteDates, now = new Date()): InviteStatus {
  if (invite.accepted_at) return { code: "accepted", label: i18n.t("collab:collaboration.accepted") };
  if (invite.revoked_at) return { code: "revoked", label: i18n.t("collab:collaboration.revoked") };
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return { code: "expired", label: i18n.t("collab:collaboration.expired") };
  return { code: "pending", label: i18n.t("collab:collaboration.awaitingAcceptance") };
}

const TERMINAL_INVITE_ERRORS = new Set([
  "invalid_invite",
  "invite_expired",
  "invite_revoked",
  "invite_used",
  "invite_email_mismatch",
  "owner_cannot_join",
  "verified_email_required"
]);

export function isTerminalInviteError(code: string): boolean {
  return TERMINAL_INVITE_ERRORS.has(code);
}
