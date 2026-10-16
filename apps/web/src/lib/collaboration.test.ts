import { describe, expect, it } from "vitest";
import { collaborationActions, inviteStatus, isTerminalInviteError } from "./collaboration";

describe("collaboration role decisions", () => {
  it("keeps every site action available to the owner", () => {
    expect(collaborationActions("owner")).toEqual({
      editDraft: true,
      uploadAssets: true,
      publish: true,
      migrateAssets: true,
      manageMembers: true,
      viewDraft: true
    });
  });

  it("lets editors author without owner operations", () => {
    expect(collaborationActions("editor")).toEqual({
      editDraft: true,
      uploadAssets: true,
      publish: false,
      migrateAssets: false,
      manageMembers: false,
      viewDraft: true
    });
  });

  it("makes viewers read only", () => {
    expect(collaborationActions("viewer")).toEqual({
      editDraft: false,
      uploadAssets: false,
      publish: false,
      migrateAssets: false,
      manageMembers: false,
      viewDraft: true
    });
  });
});

describe("invite state mapping", () => {
  const now = new Date("2026-10-16T10:00:00.000Z");

  it("prioritizes accepted and revoked states over expiry", () => {
    expect(inviteStatus({ accepted_at: "2026-10-15T10:00:00.000Z", revoked_at: null, expires_at: "2026-10-16T09:00:00.000Z" }, now)).toEqual({ code: "accepted", label: "已接受" });
    expect(inviteStatus({ accepted_at: null, revoked_at: "2026-10-15T10:00:00.000Z", expires_at: "2026-10-17T10:00:00.000Z" }, now)).toEqual({ code: "revoked", label: "已撤銷" });
  });

  it("distinguishes expired and pending invitations", () => {
    expect(inviteStatus({ accepted_at: null, revoked_at: null, expires_at: "2026-10-16T09:59:59.000Z" }, now)).toEqual({ code: "expired", label: "已過期" });
    expect(inviteStatus({ accepted_at: null, revoked_at: null, expires_at: "2026-10-16T10:00:01.000Z" }, now)).toEqual({ code: "pending", label: "等待接受" });
  });
});

describe("terminal invitation errors", () => {
  it.each(["invalid_invite", "invite_expired", "invite_revoked", "invite_used", "invite_email_mismatch", "owner_cannot_join", "verified_email_required"])("classifies %s as terminal", (code) => {
    expect(isTerminalInviteError(code)).toBe(true);
  });

  it("keeps transient failures retryable", () => {
    expect(isTerminalInviteError("db_error")).toBe(false);
    expect(isTerminalInviteError("network_error")).toBe(false);
  });
});
