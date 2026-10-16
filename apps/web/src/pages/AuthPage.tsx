import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { api, type SiteListRecord } from "../lib/api";
import { supabase } from "../lib/supabase";
import { RetroButton } from "../components/RetroButton";
import { DesktopHub } from "../features/sites/DesktopHub";

function readOAuthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("error_description") ?? hash.get("error_description") ?? params.get("error") ?? hash.get("error") ?? "";
}

function readNotice() {
  return new URLSearchParams(window.location.search).get("notice") ?? "";
}

export function AuthPage() {
  const { loading, user, signOut } = useAuth();
  const [error, setError] = useState(readOAuthError);
  const [notice] = useState(readNotice);
  const [busy, setBusy] = useState(false);
  const [sites, setSites] = useState<SiteListRecord[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  async function loadDesktops() {
    setSitesLoading(true);
    setError("");
    try {
      const result = await api.listSites();
      setSites(result.sites);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法讀取你的桌面");
    } finally {
      setSitesLoading(false);
    }
  }

  useEffect(() => {
    if (user) void loadDesktops();
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
      <section className={`retro-panel ${user ? "desktop-hub-window" : "auth-window"}`}>
        <header className="landing-titlebar">Retro Desktop — {user ? "我的桌面" : "登入"}</header>
        {loading ? (
          <p className="info-box">確認登入狀態...</p>
        ) : user ? (
          <DesktopHub email={user.email ?? "已登入帳號"} sites={sites} loading={sitesLoading} error={error} notice={notice} onRetry={() => void loadDesktops()} onSignOut={signOut} />
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
