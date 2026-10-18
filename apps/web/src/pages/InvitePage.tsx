import { useEffect, useState } from "react";
import { i18n } from "../i18n";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { RetroButton } from "../components/RetroButton";
import { api, ApiError } from "../lib/api";
import { isTerminalInviteError } from "../lib/collaboration";
import { captureInviteToken, clearInviteToken, readInviteToken } from "../lib/inviteToken";
import { supabase } from "../lib/supabase";

type InvitePhase = "capturing" | "ready" | "accepting" | "success" | "error";

const terminalCopy = (): Record<string, string> => ({
  invalid_invite: i18n.t("collab:invite.thisInvitationLinkIsntValid"),
  invite_expired: i18n.t("collab:invite.thisInvitationHasExpiredAsk"),
  invite_revoked: i18n.t("collab:invite.thisInvitationWasRevoked"),
  invite_used: i18n.t("collab:invite.thisInvitationHasAlreadyBeen"),
  invite_email_mismatch: i18n.t("collab:invite.theGoogleAccountYoureSigned"),
  owner_cannot_join: i18n.t("collab:invite.youAlreadyOwnThisDesktop"),
  verified_email_required: i18n.t("collab:invite.theGoogleAccountMustHave")
});

function oauthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("error_description") ?? hash.get("error_description") ?? params.get("error") ?? hash.get("error") ?? "";
}

export function InvitePage() {
  const { t: tr } = useTranslation("collab");
  const navigate = useNavigate();
  const { loading, user, signOut } = useAuth();
  const [phase, setPhase] = useState<InvitePhase>("capturing");
  const [message, setMessage] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    const result = captureInviteToken(window.location, window.sessionStorage, (url) => window.history.replaceState(null, "", url));
    const returnedError = oauthError();
    if (returnedError) {
      setMessage(tr("invite.googleSignInFailed", { returnedError }));
      setPhase("error");
    } else if (result === "invalid" || result === "missing") {
      setMessage(tr("invite.thisInvitationLinkIsIncomplete"));
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
      setMessage(tr("invite.googleSignInFailed2", { message: result.error.message }));
      setPhase("error");
    }
  }

  async function accept() {
    const token = readInviteToken(window.sessionStorage);
    if (!token) {
      setMessage(tr("invite.noPendingInvitationWasFound"));
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
        setMessage(terminalCopy()[cause.code] ?? cause.message);
      } else {
        setMessage(cause instanceof Error ? cause.message : tr("invite.cantAcceptTheInvitationRight"));
      }
      setPhase("error");
    }
  }

  const canRetry = phase === "error" && !!readInviteToken(window.sessionStorage) && !!user;
  const canRetrySignIn = phase === "error" && !!readInviteToken(window.sessionStorage) && !user;

  return (
    <main className="auth-shell invite-shell">
      <section className="retro-panel auth-window invite-window" aria-labelledby="invite-title">
        <header className="landing-titlebar" id="invite-title">{tr("invite.retroDesktopCollaborationInvitation")}</header>
        <div className="dialog-body">
          {phase === "capturing" || loading ? <p className="info-box" role="status">{tr("invite.checkingTheInvitationAndSign")}</p> : null}

          {!loading && phase === "ready" && !user ? <>
            <h1>{tr("invite.youReceivedAnInvitationTo")}</h1>
            <p>{tr("invite.signInWithTheGoogle")}</p>
            <div className="button-row end"><RetroButton className="primary" onClick={signIn}>{tr("invite.signInWithGoogleAnd")}</RetroButton></div>
          </> : null}

          {!loading && phase === "ready" && user ? <>
            <h1>{tr("invite.acceptTheCollaborationInvitation")}</h1>
            <p>{tr("invite.signedInAs")}<strong>{user.email}</strong></p>
            <p>{tr("invite.afterYouAcceptYouCan")}</p>
            <div className="button-row end">
              <RetroButton onClick={async () => { await signOut(); setPhase("ready"); }}>{tr("invite.switchGoogleAccount")}</RetroButton>
              <RetroButton className="primary" onClick={accept}>{tr("invite.acceptInvitation")}</RetroButton>
            </div>
          </> : null}

          {phase === "accepting" ? <p className="info-box" role="status">{tr("invite.joiningThePrivateDesktop")}</p> : null}

          {phase === "success" && siteId ? <>
            <h1>{tr("invite.joinedTheDesktop")}</h1>
            <p className="success-box" role="status">{tr("invite.theInvitationWasAcceptedYou")}</p>
            <div className="button-row end"><RetroButton className="primary" onClick={() => navigate(`/editor/${siteId}`, { replace: true })}>{tr("invite.openTheSharedDesktop")}</RetroButton></div>
          </> : null}

          {phase === "error" ? <>
            <h1>{tr("invite.couldntCompleteTheInvitation")}</h1>
            <p className="error-box" role="alert">{message}</p>
            <div className="button-row end">
              {canRetrySignIn ? <RetroButton className="primary" onClick={signIn}>{tr("invite.retryGoogleSignIn")}</RetroButton> : null}
              {canRetry ? <RetroButton className="primary" onClick={accept}>{tr("invite.retryAccepting")}</RetroButton> : null}
              <RetroButton onClick={() => navigate("/", { replace: true })}>{tr("invite.backToHome")}</RetroButton>
            </div>
          </> : null}
        </div>
      </section>
    </main>
  );
}
