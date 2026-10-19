import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleProps } from "../types";

/** Entirely local: no API, owner capabilities, stored entries or document update channel. */
export function PreviewGuestbook({ window }: Pick<ModuleProps<"guestbook">, "window">) {
  const { t: tr } = useTranslation("modules");
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<"sent" | "reported" | null>(null);

  return <div className="guestbook-app">
    <p className="guestbook-note guestbook-preview-notice">{tr("guestbook.preview.notice")}</p>
    <p className="guestbook-intro">{window.content.intro}</p>
    {window.content.enabled ? <>
      <form className="guestbook-form" onSubmit={(event) => {
        event.preventDefault();
        setDisplayName(""); setBody(""); setMessage("sent");
      }}>
        <label>{tr("guestbook.nicknameIdentityIsntVerified")}<input required minLength={1} maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>{tr("guestbook.message")}<textarea required minLength={1} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <button type="submit" className="w98-btn">{tr("guestbook.submitForReview")}</button>
      </form>
      {message ? <p role="status" className="guestbook-status">{tr(`guestbook.preview.${message}`)}</p> : null}
      <section className="guestbook-list" aria-label={tr("guestbook.approvedMessages")}>
        <article><header><strong>{tr("guestbook.preview.sampleName")}</strong></header><p>{tr("guestbook.preview.sampleBody")}</p><button type="button" className="w98-btn small" onClick={() => setMessage("reported")}>{tr("guestbook.report")}</button></article>
      </section>
    </> : <div className="guestbook-empty"><strong>{tr("guestbook.theGuestbookIsntOpenYet")}</strong><p>{tr("guestbook.theSiteOwnerIsntAccepting")}</p></div>}
  </div>;
}
