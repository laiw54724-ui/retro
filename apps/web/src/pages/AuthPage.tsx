import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t: tr } = useTranslation("common");
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
      setError(cause instanceof Error ? cause.message : tr("auth.couldntReadYourDesktops"));
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
        <header className="landing-titlebar">Retro Desktop — {user ? tr("auth.myDesktops") : tr("auth.signIn")}</header>
        {loading ? (
          <p className="info-box">{tr("auth.checkingSignInStatus")}</p>
        ) : user ? (
          <DesktopHub email={user.email ?? tr("auth.signedIn")} sites={sites} loading={sitesLoading} error={error} notice={notice} onRetry={() => void loadDesktops()} onSignOut={signOut} />
        ) : (
          <>
            {error ? <p className="error-box">{tr("auth.signInFailed", { error })}</p> : null}
            <div className="button-row oauth-row">
              <RetroButton type="button" className="primary" disabled={busy} onClick={signInWithGoogle}>{tr("auth.continueWithGoogle")}</RetroButton>
            </div>
            <div className="button-row end">
              <Link className="retro-link" to="/">{tr("auth.back")}</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
