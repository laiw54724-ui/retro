import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { RetroButton } from "../components/RetroButton";
import { api, ApiError } from "../lib/api";
import { isTerminalInviteError } from "../lib/collaboration";
import { captureInviteToken, clearInviteToken, readInviteToken } from "../lib/inviteToken";
import { supabase } from "../lib/supabase";

type InvitePhase = "capturing" | "ready" | "accepting" | "success" | "error";

const TERMINAL_COPY: Record<string, string> = {
  invalid_invite: "這個邀請連結無效，請向桌面擁有者索取新連結。",
  invite_expired: "這個邀請已過期，請向桌面擁有者索取新連結。",
  invite_revoked: "這個邀請已被撤銷。",
  invite_used: "這個邀請已經使用過。每個邀請連結只能接受一次。",
  invite_email_mismatch: "目前登入的 Google 帳號不是收到邀請的帳號，請登出後切換帳號。",
  owner_cannot_join: "你已經是這個桌面的擁有者，不需要接受協作邀請。",
  verified_email_required: "Google 帳號必須有已驗證的電子郵件才能接受邀請。"
};

function oauthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("error_description") ?? hash.get("error_description") ?? params.get("error") ?? hash.get("error") ?? "";
}

export function InvitePage() {
  const navigate = useNavigate();
  const { loading, user, signOut } = useAuth();
  const [phase, setPhase] = useState<InvitePhase>("capturing");
  const [message, setMessage] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    const result = captureInviteToken(window.location, window.sessionStorage, (url) => window.history.replaceState(null, "", url));
    const returnedError = oauthError();
    if (returnedError) {
      setMessage(`Google 登入失敗：${returnedError}`);
      setPhase("error");
    } else if (result === "invalid" || result === "missing") {
      setMessage("這個邀請連結不完整或無效，請重新開啟擁有者提供的完整連結。");
      setPhase("error");
    } else {
      setPhase("ready");
    }
  }, []);

  async function signIn() {
    setMessage("");
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/invite` }
    });
    if (result.error) {
      setMessage(`Google 登入失敗：${result.error.message}`);
      setPhase("error");
    }
  }

  async function accept() {
    const token = readInviteToken(window.sessionStorage);
    if (!token) {
      setMessage("找不到待接受的邀請，請重新開啟完整邀請連結。");
      setPhase("error");
      return;
    }
    setPhase("accepting");
    setMessage("");
    try {
      const { membership } = await api.acceptInvite(token);
      clearInviteToken(window.sessionStorage);
      setSiteId(membership.site_id);
      setPhase("success");
    } catch (cause) {
      if (cause instanceof ApiError && isTerminalInviteError(cause.code)) {
        clearInviteToken(window.sessionStorage);
        setMessage(TERMINAL_COPY[cause.code] ?? cause.message);
      } else {
        setMessage(cause instanceof Error ? cause.message : "目前無法接受邀請，請稍後重試。");
      }
      setPhase("error");
    }
  }

  const canRetry = phase === "error" && !!readInviteToken(window.sessionStorage) && !!user;
  const canRetrySignIn = phase === "error" && !!readInviteToken(window.sessionStorage) && !user;

  return (
    <main className="auth-shell invite-shell">
      <section className="retro-panel auth-window invite-window" aria-labelledby="invite-title">
        <header className="landing-titlebar" id="invite-title">Retro Desktop — 協作邀請</header>
        <div className="dialog-body">
          {phase === "capturing" || loading ? <p className="info-box" role="status">正在確認邀請與登入狀態…</p> : null}

          {!loading && phase === "ready" && !user ? <>
            <h1>你收到一個私人桌面邀請</h1>
            <p>請使用收到邀請的 Google 帳號登入。登入後會回到這裡，由你確認是否加入。</p>
            <div className="button-row end"><RetroButton className="primary" onClick={signIn}>使用 Google 登入並繼續</RetroButton></div>
          </> : null}

          {!loading && phase === "ready" && user ? <>
            <h1>接受協作邀請？</h1>
            <p>目前登入：<strong>{user.email}</strong></p>
            <p>接受後，你可以依擁有者授予的權限編輯或查看這個私人桌面。</p>
            <div className="button-row end">
              <RetroButton onClick={async () => { await signOut(); setPhase("ready"); }}>切換 Google 帳號</RetroButton>
              <RetroButton className="primary" onClick={accept}>接受邀請</RetroButton>
            </div>
          </> : null}

          {phase === "accepting" ? <p className="info-box" role="status">正在加入私人桌面…</p> : null}

          {phase === "success" && siteId ? <>
            <h1>已加入桌面</h1>
            <p className="success-box" role="status">邀請已接受，現在可以開啟共享桌面。</p>
            <div className="button-row end"><RetroButton className="primary" onClick={() => navigate(`/editor/${siteId}`, { replace: true })}>開啟共享桌面</RetroButton></div>
          </> : null}

          {phase === "error" ? <>
            <h1>無法完成邀請</h1>
            <p className="error-box" role="alert">{message}</p>
            <div className="button-row end">
              {canRetrySignIn ? <RetroButton className="primary" onClick={signIn}>重試 Google 登入</RetroButton> : null}
              {canRetry ? <RetroButton className="primary" onClick={accept}>重試接受</RetroButton> : null}
              <RetroButton onClick={() => navigate("/", { replace: true })}>回到首頁</RetroButton>
            </div>
          </> : null}
        </div>
      </section>
    </main>
  );
}
