import { useCallback, useEffect, useRef, useState } from "react";
import { RetroButton } from "../../components/RetroButton";
import { api, ApiError } from "../../lib/api";
import { inviteStatus, type CollaboratorRole, type SiteInvite, type SiteMember } from "../../lib/collaboration";

type BusyTarget = "load" | "create" | `invite:${string}` | `member:${string}` | null;

const ROLE_COPY: Record<CollaboratorRole, string> = {
  editor: "可編輯草稿",
  viewer: "只能查看草稿"
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CollaborationDialog({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const headingRef = useRef<HTMLElement | null>(null);
  const [members, setMembers] = useState<SiteMember[]>([]);
  const [invites, setInvites] = useState<SiteInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<BusyTarget>("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [expiryHours, setExpiryHours] = useState<1 | 24 | 72 | 168>(24);
  const [inviteUrl, setInviteUrl] = useState("");
  const [removeTarget, setRemoveTarget] = useState<SiteMember | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setBusy("load");
    setError("");
    try {
      const [memberResult, inviteResult] = await Promise.all([api.listMembers(siteId), api.listInvites(siteId)]);
      setMembers(memberResult.members);
      setInvites(inviteResult.invites);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入協作者，請稍後重試。");
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
    setError(changed ? "協作者資料已變更，清單已重新載入。" : cause instanceof Error ? cause.message : "無法更新協作者。");
    await refresh();
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setBusy("create");
    setError("");
    setNotice("");
    setInviteUrl("");
    try {
      const result = await api.createInvite(siteId, { email: normalized, role, expiryHours });
      setInviteUrl(`${window.location.origin}/invite#token=${encodeURIComponent(result.token)}`);
      setEmail("");
      setNotice("邀請已建立。這個連結只會顯示這一次，請立即複製。");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法建立邀請。");
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("已複製邀請連結。");
    } catch {
      setNotice("無法自動複製；連結仍保留在欄位中，請手動選取複製。");
    }
  }

  async function revoke(invite: SiteInvite) {
    setBusy(`invite:${invite.id}`);
    setError("");
    try {
      await api.revokeInvite(siteId, invite.id);
      setNotice(`已撤銷 ${invite.email} 的邀請。`);
      await refresh();
    } catch (cause) {
      await recoverAfterMutation(cause);
    } finally {
      setBusy(null);
    }
  }

  async function updateRole(member: SiteMember, nextRole: CollaboratorRole) {
    setBusy(`member:${member.user_id}`);
    setError("");
    try {
      await api.updateMemberRole(siteId, member.user_id, nextRole);
      setNotice(`${member.email} 已改為「${ROLE_COPY[nextRole]}」。`);
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
    setError("");
    try {
      await api.removeMember(siteId, member.user_id);
      setRemoveTarget(null);
      setNotice(`已移除 ${member.email}。`);
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
          <span>協作者</span>
          <button type="button" className="titlebar-button" aria-label="關閉協作者" disabled={!!busy} onClick={onClose}>×</button>
        </header>
        <div className="collaboration-body">
          <p className="collaboration-intro">邀請可信任的人編輯或查看這個私人草稿。只有你能發布網站與管理協作者。</p>
          {error ? <div className="collaboration-alert error" role="alert"><span>{error}</span><RetroButton disabled={busy === "load"} onClick={() => void refresh(true)}>重新載入</RetroButton></div> : null}
          {notice ? <p className="collaboration-alert notice" role="status" aria-live="polite">{notice}</p> : <span className="sr-only" role="status" aria-live="polite" />}

          <section className="collaboration-section" aria-labelledby="members-title">
            <div className="collaboration-section-heading"><h2 id="members-title">成員</h2><span>{members.length} 位協作者</span></div>
            {!loaded && busy === "load" ? <p className="collaboration-empty" role="status">正在載入成員…</p> : members.length === 0 ? <p className="collaboration-empty">目前只有你可以存取這個桌面。</p> : (
              <ul className="collaboration-list member-list">
                {members.map((member) => {
                  const rowBusy = busy === `member:${member.user_id}`;
                  return <li key={member.user_id}>
                    <div className="collaboration-person"><strong>{member.email}</strong><small>加入於 {dateTime(member.created_at)}</small></div>
                    <label><span className="sr-only">{member.email} 的權限</span><select aria-label={`${member.email} 的權限`} disabled={rowBusy} value={member.role} onChange={(event) => void updateRole(member, event.target.value as CollaboratorRole)}><option value="editor">可編輯草稿</option><option value="viewer">只能查看草稿</option></select></label>
                    <RetroButton className="danger" disabled={rowBusy} aria-label={`移除 ${member.email}`} onClick={() => setRemoveTarget(member)}>{rowBusy ? "更新中…" : "移除"}</RetroButton>
                  </li>;
                })}
              </ul>
            )}
          </section>

          <section className="collaboration-section" aria-labelledby="invites-title">
            <div className="collaboration-section-heading"><h2 id="invites-title">邀請</h2><span>連結與電子郵件綁定且只能使用一次</span></div>
            <form className="invite-form" onSubmit={createInvite}>
              <label><span>電子郵件</span><input type="email" aria-label="邀請電子郵件" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" /></label>
              <label><span>權限</span><select aria-label="邀請權限" value={role} onChange={(event) => setRole(event.target.value as CollaboratorRole)}><option value="editor">可編輯草稿</option><option value="viewer">只能查看草稿</option></select></label>
              <label><span>有效期限</span><select aria-label="邀請有效期限" value={expiryHours} onChange={(event) => setExpiryHours(Number(event.target.value) as 1 | 24 | 72 | 168)}><option value={1}>1 小時</option><option value={24}>24 小時</option><option value={72}>3 天</option><option value={168}>7 天</option></select></label>
              <RetroButton className="primary invite-create" type="submit" disabled={busy === "create"}>{busy === "create" ? "建立中…" : "建立邀請"}</RetroButton>
            </form>

            {inviteUrl ? <div className="one-time-invite">
              <strong>一次性邀請連結</strong>
              <p>關閉這個視窗後無法再次取得同一個連結。</p>
              <div><input aria-label="一次性邀請連結" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><RetroButton onClick={copyInvite}>複製邀請連結</RetroButton></div>
            </div> : null}

            {!loaded && busy === "load" ? <p className="collaboration-empty" role="status">正在載入邀請…</p> : invites.length === 0 ? <p className="collaboration-empty">還沒有邀請。建立後請把一次性連結交給指定的 Google 帳號。</p> : (
              <ul className="collaboration-list invite-list">
                {invites.map((invite) => {
                  const status = inviteStatus(invite);
                  const rowBusy = busy === `invite:${invite.id}`;
                  return <li key={invite.id}>
                    <div className="collaboration-person"><strong>{invite.email}</strong><small>{ROLE_COPY[invite.role]} · 到期 {dateTime(invite.expires_at)}</small></div>
                    <span className={`invite-status ${status.code}`}>{status.label}</span>
                    {status.code === "pending" ? <RetroButton disabled={rowBusy} aria-label={`撤銷 ${invite.email} 的邀請`} onClick={() => void revoke(invite)}>{rowBusy ? "撤銷中…" : "撤銷"}</RetroButton> : <span className="invite-action-spacer" />}
                  </li>;
                })}
              </ul>
            )}
          </section>
        </div>
        <footer className="collaboration-footer"><RetroButton disabled={!!busy} onClick={onClose}>完成</RetroButton></footer>
      </section>

      {removeTarget ? <div className="modal-backdrop confirmation-backdrop" role="presentation">
        <section className="retro-panel editor-dialog confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-member-title" aria-describedby="remove-member-copy">
          <header className="landing-titlebar" id="remove-member-title">移除協作者</header>
          <div className="dialog-body"><p id="remove-member-copy">確定移除 <strong>{removeTarget.email}</strong>？對方下一次請求就會失去這個桌面的存取權。</p><div className="button-row end"><RetroButton disabled={!!busy} onClick={() => setRemoveTarget(null)}>取消</RetroButton><RetroButton autoFocus className="danger" disabled={!!busy} onClick={() => void confirmRemove()}>{busy ? "移除中…" : "確認移除"}</RetroButton></div></div>
        </section>
      </div> : null}
    </div>
  );
}
