import { useCallback, useEffect, useRef, useState } from "react";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { useLocaleFormatting } from "../../i18n/format";
import { translateError } from "../../i18n/errors";
import { RetroButton } from "../../components/RetroButton";
import { api, ApiError } from "../../lib/api";
import { inviteStatus, type CollaboratorRole, type SiteInvite, type SiteMember } from "../../lib/collaboration";

type BusyTarget = "load" | "create" | `invite:${string}` | `member:${string}` | null;
type ErrorFallback = "collaborationDialog.couldntLoadCollaboratorsPleaseTry" | "collaborationDialog.couldntUpdateTheCollaborator" | "collaborationDialog.couldntCreateTheInvitation" | "collaborationDialog.collaboratorDataChangedSoThe";
type DialogError = { code?: string; fallback: ErrorFallback; changed?: boolean };

const roleCopy = (): Record<CollaboratorRole, string> => ({
  editor: i18n.t("collab:collaborationDialog.canEditDraft"),
  viewer: i18n.t("collab:collaborationDialog.viewDraftOnly")
});

export function CollaborationDialog({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const { t: tr } = useTranslation("collab");
  const { t: errorT } = useTranslation("errors");
  const { formatDate } = useLocaleFormatting();
  const dateTime = (value: string) => formatDate(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const headingRef = useRef<HTMLElement | null>(null);
  const [members, setMembers] = useState<SiteMember[]>([]);
  const [invites, setInvites] = useState<SiteInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<BusyTarget>("load");
  const [error, setError] = useState<DialogError | null>(null);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [expiryHours, setExpiryHours] = useState<1 | 24 | 72 | 168>(24);
  const [inviteUrl, setInviteUrl] = useState("");
  const [removeTarget, setRemoveTarget] = useState<SiteMember | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setBusy("load");
    setError(null);
    try {
      const [memberResult, inviteResult] = await Promise.all([api.listMembers(siteId), api.listInvites(siteId)]);
      setMembers(memberResult.members);
      setInvites(inviteResult.invites);
      setLoaded(true);
    } catch (cause) {
      setError({ code: cause instanceof ApiError ? cause.code : undefined, fallback: "collaborationDialog.couldntLoadCollaboratorsPleaseTry" });
    } finally {
      if (showLoading) setBusy(null);
    }
  }, [siteId]);

  useEffect(() => {
    void refresh(true);
    headingRef.current?.focus();
  }, [refresh]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy && !removeTarget) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, removeTarget]);

  async function recoverAfterMutation(cause: unknown) {
    const changed = cause instanceof ApiError && (cause.status === 404 || cause.status === 409);
    const nextError: DialogError = changed
      ? { fallback: "collaborationDialog.collaboratorDataChangedSoThe", changed: true }
      : { code: cause instanceof ApiError ? cause.code : undefined, fallback: "collaborationDialog.couldntUpdateTheCollaborator" };
    await refresh();
    setError(nextError);
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setBusy("create");
    setError(null);
    setNotice("");
    setInviteUrl("");
    try {
      const result = await api.createInvite(siteId, { email: normalized, role, expiryHours });
      setInviteUrl(`${window.location.origin}/invite#token=${encodeURIComponent(result.token)}`);
      setEmail("");
      setNotice(tr("collaborationDialog.invitationCreatedThisLinkIs"));
      await refresh();
    } catch (cause) {
      setError({ code: cause instanceof ApiError ? cause.code : undefined, fallback: "collaborationDialog.couldntCreateTheInvitation" });
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice(tr("collaborationDialog.invitationLinkCopied"));
    } catch {
      setNotice(tr("collaborationDialog.couldntCopyAutomaticallyTheLink"));
    }
  }

  async function revoke(invite: SiteInvite) {
    setBusy(`invite:${invite.id}`);
    setError(null);
    try {
      await api.revokeInvite(siteId, invite.id);
      setNotice(tr("collaborationDialog.revokedTheInvitationFor", { email: invite.email }));
      await refresh();
    } catch (cause) {
      await recoverAfterMutation(cause);
    } finally {
      setBusy(null);
    }
  }

  async function updateRole(member: SiteMember, nextRole: CollaboratorRole) {
    setBusy(`member:${member.user_id}`);
    setError(null);
    try {
      await api.updateMemberRole(siteId, member.user_id, nextRole);
      setNotice(tr("collaborationDialog.isNow", { email: member.email, v2: roleCopy()[nextRole] }));
      await refresh();
    } catch (cause) {
      await recoverAfterMutation(cause);
    } finally {
      setBusy(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const member = removeTarget;
    setBusy(`member:${member.user_id}`);
    setError(null);
    try {
      await api.removeMember(siteId, member.user_id);
      setRemoveTarget(null);
      setNotice(tr("collaborationDialog.removed", { email: member.email }));
      await refresh();
    } catch (cause) {
      setRemoveTarget(null);
      await recoverAfterMutation(cause);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop collaboration-backdrop" role="presentation">
      <section className="retro-panel editor-dialog collaboration-dialog" role="dialog" aria-modal="true" aria-labelledby="collaboration-title">
        <header className="landing-titlebar collaboration-titlebar" id="collaboration-title" ref={headingRef} tabIndex={-1}>
          <span>{tr("collaborationDialog.collaborators")}</span>
          <button type="button" className="titlebar-button" aria-label={tr("collaborationDialog.closeCollaborators")} disabled={!!busy} onClick={onClose}>×</button>
        </header>
        <div className="collaboration-body">
          <p className="collaboration-intro">{tr("collaborationDialog.invitePeopleYouTrustTo")}</p>
          {error ? <div className="collaboration-alert error" role="alert"><span>{error.changed ? tr(error.fallback) : translateError(error, errorT, tr(error.fallback))}</span><RetroButton disabled={busy === "load"} onClick={() => void refresh(true)}>{tr("collaborationDialog.reload")}</RetroButton></div> : null}
          {notice ? <p className="collaboration-alert notice" role="status" aria-live="polite">{notice}</p> : <span className="sr-only" role="status" aria-live="polite" />}

          <section className="collaboration-section" aria-labelledby="members-title">
            <div className="collaboration-section-heading"><h2 id="members-title">{tr("collaborationDialog.members")}</h2><span>{tr("dialog.membersCount", { count: members.length })}</span></div>
            {!loaded && busy === "load" ? <p className="collaboration-empty" role="status">{tr("collaborationDialog.loadingMembers")}</p> : members.length === 0 ? <p className="collaboration-empty">{tr("collaborationDialog.onlyYouCanAccessThis")}</p> : (
              <ul className="collaboration-list member-list">
                {members.map((member) => {
                  const rowBusy = busy === `member:${member.user_id}`;
                  return <li key={member.user_id}>
                    <div className="collaboration-person"><strong>{member.email}</strong><small>{tr("dialog.joinedOn", { date: dateTime(member.created_at) })}</small></div>
                    <label><span className="sr-only">{tr("collaborationDialog.permissionFor", { email: member.email })}</span><select aria-label={tr("collaborationDialog.permissionFor", { email: member.email })} disabled={rowBusy} value={member.role} onChange={(event) => void updateRole(member, event.target.value as CollaboratorRole)}><option value="editor">{tr("collaborationDialog.canEditDraft")}</option><option value="viewer">{tr("collaborationDialog.viewDraftOnly")}</option></select></label>
                    <RetroButton className="danger" disabled={rowBusy} aria-label={tr("collaborationDialog.remove", { email: member.email })} onClick={() => setRemoveTarget(member)}>{rowBusy ? tr("collaborationDialog.updating") : tr("collaborationDialog.remove2")}</RetroButton>
                  </li>;
                })}
              </ul>
            )}
          </section>

          <section className="collaboration-section" aria-labelledby="invites-title">
            <div className="collaboration-section-heading"><h2 id="invites-title">{tr("collaborationDialog.invite")}</h2><span>{tr("collaborationDialog.theLinkIsTiedTo")}</span></div>
            <form className="invite-form" onSubmit={createInvite}>
              <label><span>{tr("collaborationDialog.email")}</span><input type="email" aria-label={tr("collaborationDialog.invitationEmail")} autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" /></label>
              <label><span>{tr("collaborationDialog.permission")}</span><select aria-label={tr("collaborationDialog.invitationPermission")} value={role} onChange={(event) => setRole(event.target.value as CollaboratorRole)}><option value="editor">{tr("collaborationDialog.canEditDraft")}</option><option value="viewer">{tr("collaborationDialog.viewDraftOnly")}</option></select></label>
              <label><span>{tr("collaborationDialog.expires")}</span><select aria-label={tr("collaborationDialog.invitationExpiry")} value={expiryHours} onChange={(event) => setExpiryHours(Number(event.target.value) as 1 | 24 | 72 | 168)}><option value={1}>{tr("collaborationDialog.n1Hour")}</option><option value={24}>{tr("collaborationDialog.n24Hours")}</option><option value={72}>{tr("collaborationDialog.n3Days")}</option><option value={168}>{tr("collaborationDialog.n7Days")}</option></select></label>
              <RetroButton className="primary invite-create" type="submit" disabled={busy === "create"}>{busy === "create" ? tr("collaborationDialog.creating") : tr("collaborationDialog.createInvitation")}</RetroButton>
            </form>

            {inviteUrl ? <div className="one-time-invite">
              <strong>{tr("collaborationDialog.oneTimeInvitationLink")}</strong>
              <p>{tr("collaborationDialog.afterYouCloseThisWindow")}</p>
              <div><input aria-label={tr("collaborationDialog.oneTimeInvitationLink")} readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><RetroButton onClick={copyInvite}>{tr("collaborationDialog.copyInvitationLink")}</RetroButton></div>
            </div> : null}

            {!loaded && busy === "load" ? <p className="collaboration-empty" role="status">{tr("collaborationDialog.loadingInvitations")}</p> : invites.length === 0 ? <p className="collaboration-empty">{tr("collaborationDialog.noInvitationsYetAfterCreating")}</p> : (
              <ul className="collaboration-list invite-list">
                {invites.map((invite) => {
                  const status = inviteStatus(invite);
                  const rowBusy = busy === `invite:${invite.id}`;
                  return <li key={invite.id}>
                    <div className="collaboration-person"><strong>{invite.email}</strong><small>{tr("dialog.roleExpires", { role: roleCopy()[invite.role], date: dateTime(invite.expires_at) })}</small></div>
                    <span className={`invite-status ${status.code}`}>{status.label}</span>
                    {status.code === "pending" ? <RetroButton disabled={rowBusy} aria-label={tr("collaborationDialog.revokeTheInvitationFor", { email: invite.email })} onClick={() => void revoke(invite)}>{rowBusy ? tr("collaborationDialog.revoking") : tr("collaborationDialog.revoke")}</RetroButton> : <span className="invite-action-spacer" />}
                  </li>;
                })}
              </ul>
            )}
          </section>
        </div>
        <footer className="collaboration-footer"><RetroButton disabled={!!busy} onClick={onClose}>{tr("collaborationDialog.done")}</RetroButton></footer>
      </section>

      {removeTarget ? <div className="modal-backdrop confirmation-backdrop" role="presentation">
        <section className="retro-panel editor-dialog confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-member-title" aria-describedby="remove-member-copy">
          <header className="landing-titlebar" id="remove-member-title">{tr("collaborationDialog.removeCollaborator")}</header>
          <div className="dialog-body"><p id="remove-member-copy">{tr("collaborationDialog.remove3")} <strong>{removeTarget.email}</strong>{tr("collaborationDialog.theyWillLoseAccessTo")}</p><div className="button-row end"><RetroButton disabled={!!busy} onClick={() => setRemoveTarget(null)}>{tr("collaborationDialog.cancel")}</RetroButton><RetroButton autoFocus className="danger" disabled={!!busy} onClick={() => void confirmRemove()}>{busy ? tr("collaborationDialog.removing") : tr("collaborationDialog.confirmRemoval")}</RetroButton></div></div>
        </section>
      </div> : null}
    </div>
  );
}
