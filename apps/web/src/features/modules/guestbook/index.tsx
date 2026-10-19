import { useCallback, useEffect, useRef, useState } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { useLocaleFormatting } from "../../../i18n/format";
import { api, ApiError, type GuestbookEntry, type GuestbookStatus } from "../../../lib/api";
import type { ModuleProps } from "../types";
import { PreviewGuestbook } from "./PreviewGuestbook";
import { useGuestbookPreview } from "./previewContext";

const statusLabel = (): Record<GuestbookStatus, string> => ({ pending: i18n.t("modules:guestbook.pending"), approved: i18n.t("modules:guestbook.public"), rejected: i18n.t("modules:guestbook.rejected") });

function VisitorGuestbook({ window, ctx }: ModuleProps<"guestbook">) {
  const { t: tr } = useTranslation("modules");
  const { formatDate } = useLocaleFormatting();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    if (!window.content.enabled || !ctx.siteHandle) return;
    try { setEntries((await api.publicGuestbook(ctx.siteHandle)).entries); }
    catch { setMessage(tr("guestbook.couldntLoadMessagesRightNow")); }
  }, [ctx.siteHandle, window.content.enabled]);
  useEffect(() => { void load(); }, [load]);
  if (!window.content.enabled) return <div className="guestbook-empty"><strong>{tr("guestbook.theGuestbookIsntOpenYet")}</strong><p>{tr("guestbook.theSiteOwnerIsntAccepting")}</p></div>;
  if (!ctx.siteHandle) return <div className="guestbook-empty">{tr("guestbook.publishTheSiteToUse")}</div>;
  const submit = async () => {
    setBusy(true); setMessage("");
    try {
      await api.submitGuestbook(ctx.siteHandle!, { displayName, body, requestId: requestId.current });
      setDisplayName(""); setBody(""); requestId.current = crypto.randomUUID();
      setMessage(tr("guestbook.sentForReviewItBecomes"));
    } catch (reason) {
      setMessage(reason instanceof ApiError && reason.code === "rate_limited" ? tr("guestbook.sendingTooOftenPleaseTry") : tr("guestbook.couldntSendPleaseTryAgain"));
    } finally { setBusy(false); }
  };
  const report = async (entryId: string) => {
    try { await api.reportGuestbookEntry(ctx.siteHandle!, entryId, { requestId: crypto.randomUUID(), reason: tr("guestbook.reportByAVisitor") }); setMessage(tr("guestbook.reportReceivedTheSiteOwner")); }
    catch { setMessage(tr("guestbook.theReportWasntSentPlease")); }
  };
  return <div className="guestbook-app">
    <p className="guestbook-intro">{window.content.intro}</p>
    <form className="guestbook-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label>{tr("guestbook.nicknameIdentityIsntVerified")}<input required minLength={1} maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>{tr("guestbook.message")}<textarea required minLength={1} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <button type="submit" className="w98-btn" disabled={busy}>{busy ? tr("guestbook.sending") : tr("guestbook.submitForReview")}</button>
      <small>{tr("guestbook.onlyANicknamePlainText")}</small>
      {message ? <p role="status" className="guestbook-status">{message}</p> : null}
    </form>
    <section className="guestbook-list" aria-label={tr("guestbook.approvedMessages")}>
      {entries.map((entry) => <article key={entry.id}><header><strong>{entry.displayName}</strong><time dateTime={entry.createdAt}>{formatDate(new Date(entry.createdAt))}</time></header><p>{entry.body}</p><button type="button" className="w98-btn small" onClick={() => void report(entry.id)}>{tr("guestbook.report")}</button></article>)}
      {!entries.length ? <p>{tr("guestbook.noApprovedMessagesYet")}</p> : null}
    </section>
  </div>;
}

function OwnerGuestbook({ window, ctx, update }: ModuleProps<"guestbook">) {
  const { t: tr } = useTranslation("modules");
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!ctx.siteId) return;
    try { setEntries((await api.listGuestbookEntries(ctx.siteId)).entries); setMessage(""); }
    catch (reason) { setMessage(reason instanceof ApiError && reason.status === 403 ? tr("guestbook.onlyTheDesktopOwnerCan") : tr("guestbook.couldntLoadTheModerationList")); }
  }, [ctx.siteId]);
  useEffect(() => { void load(); }, [load]);
  const patch = (change: Partial<typeof window.content>, key?: string) => update((current) => ({ ...current, content: { ...current.content, ...change } }), key);
  const moderate = async (entry: GuestbookEntry, action: "approved" | "rejected" | "delete" | "resolve") => {
    if (!ctx.siteId) return;
    try {
      if (action === "delete") await api.deleteGuestbookEntry(ctx.siteId, entry.id);
      else if (action === "resolve") await api.resolveGuestbookReports(ctx.siteId, entry.id);
      else await api.moderateGuestbookEntry(ctx.siteId, entry.id, action);
      await load();
    } catch { setMessage(tr("guestbook.theModerationActionFailedPlease")); }
  };
  return <div className="guestbook-app owner">
    <fieldset className="guestbook-settings"><legend>{tr("guestbook.publicSettings")}</legend><label className="check-row"><input type="checkbox" checked={window.content.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />{tr("guestbook.allowVisitorsToSubmitMessages")}</label><label>{tr("guestbook.note")}<textarea value={window.content.intro} onChange={(event) => patch({ intro: event.target.value }, `guestbook-intro-${window.id}`)} /></label></fieldset>
    <p className="guestbook-note">{tr("guestbook.whenOffTheServerRejects")}</p>
    {message ? <p role="status" className="guestbook-status">{message}</p> : null}
    <section className="guestbook-moderation" aria-label={tr("guestbook.messageModerationList")}>
      {entries.map((entry) => <article key={entry.id}><header><strong>{entry.displayName}</strong><span>{statusLabel()[entry.status]} · {tr("guestbook.reports", { count: entry.openReportCount ?? 0 })}</span></header><p>{entry.body}</p><div className="button-row"><button type="button" className="w98-btn small" onClick={() => void moderate(entry, "approved")}>{tr("guestbook.approve")}</button><button type="button" className="w98-btn small" onClick={() => void moderate(entry, "rejected")}>{tr("guestbook.reject")}</button>{(entry.openReportCount ?? 0) > 0 ? <button type="button" className="w98-btn small" onClick={() => void moderate(entry, "resolve")}>{tr("guestbook.reportHandled")}</button> : null}<button type="button" className="w98-btn small danger" onClick={() => void moderate(entry, "delete")}>{tr("links.delete")}</button></div></article>)}
      {!entries.length ? <p>{tr("guestbook.noMessagesYet")}</p> : null}
    </section>
  </div>;
}

export function GuestbookView(props: ModuleProps<"guestbook">) {
  const preview = useGuestbookPreview();
  return preview ? <PreviewGuestbook window={props.window} /> : <VisitorGuestbook {...props} />;
}
export function GuestbookInlineEditor(props: ModuleProps<"guestbook">) {
  const preview = useGuestbookPreview();
  return preview ? <PreviewGuestbook window={props.window} /> : <OwnerGuestbook {...props} />;
}
