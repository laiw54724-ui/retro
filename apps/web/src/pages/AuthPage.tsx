import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { RetroButton } from "../components/RetroButton";

function readOAuthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("error_description") ?? hash.get("error_description") ?? params.get("error") ?? hash.get("error") ?? "";
}

export function AuthPage() {
  const navigate = useNavigate();
  const { loading, user, signOut } = useAuth();
  const [error, setError] = useState(readOAuthError);
  const [busy, setBusy] = useState(false);

  async function openDesktop() {
    setBusy(true);
    setError("");
    try {
      const { sites } = await api.listSites();
      navigate(sites.length ? `/editor/${sites[0].id}` : "/onboarding", { replace: true });
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "無法讀取你的桌面");
    }
  }

  useEffect(() => {
    if (user && !readOAuthError()) void openDesktop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` }
    });
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
    }
  }

  return (
    <main className="auth-shell">
      <section className="retro-panel auth-window">
        <header className="landing-titlebar">Retro Desktop — {user ? "已登入" : "登入"}</header>
        {loading ? (
          <p className="info-box">確認登入狀態...</p>
        ) : user ? (
          <>
            <p className="info-box">已登入：{user.email}</p>
            {error ? <p className="error-box">{error}</p> : null}
            <div className="button-row end">
              <RetroButton onClick={signOut}>登出</RetroButton>
              <RetroButton className="primary" disabled={busy} onClick={openDesktop}>{busy ? "開啟中..." : "前往我的桌面"}</RetroButton>
            </div>
          </>
        ) : (
          <>
            {error ? <p className="error-box">登入失敗：{error}</p> : null}
            <div className="button-row oauth-row">
              <RetroButton type="button" className="primary" disabled={busy} onClick={signInWithGoogle}>使用 Google 繼續</RetroButton>
            </div>
            <div className="button-row end">
              <Link className="retro-link" to="/">返回</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
