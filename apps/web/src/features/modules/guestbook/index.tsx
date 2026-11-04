import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocaleFormatting } from "../../../i18n/format";
import { api, ApiError, type GuestbookEntry } from "../../../lib/api";
import type { ModuleProps } from "../types";
import { PreviewGuestbook } from "./PreviewGuestbook";
import { useGuestbookPreview } from "./previewContext";

import { OwnerGuestbook } from "./OwnerGuestbook";

function VisitorGuestbook({ window, ctx }: ModuleProps<"guestbook">) {
  const { t: tr } = useTranslation("modules");
  const { formatDate } = useLocaleFormatting();
  const [loaded, setLoaded] = useState<{ handle: string; entries: GuestbookEntry[] }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<Set<string>>(new Set());
  const submitLock = useRef(false);
  const reportLocks = useRef(new Set<string>());
  const requestId = useRef(crypto.randomUUID());
  const mounted = useRef(false);
  const handleRef = useRef(ctx.siteHandle);
  handleRef.current = ctx.siteHandle;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const handle = ctx.siteHandle;
    if (!window.content.enabled || !handle) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    void api.publicGuestbook(handle).then(({ entries }) => {
      if (!active || handleRef.current !== handle) return;
      // The public route is authoritative; never display a non-public row even if a response is malformed.
      setLoaded({ handle, entries: entries.filter((entry) => entry.status === "approved") });
    }).catch(() => {
      if (active && handleRef.current === handle) setLoadError(true);
    }).finally(() => {
      if (active && handleRef.current === handle) setLoading(false);
    });
    return () => { active = false; };
  }, [ctx.siteHandle, window.content.enabled, reload]);

  if (!window.content.enabled) return <div className="guestbook-empty"><strong>{tr("guestbook.theGuestbookIsntOpenYet")}</strong><p>{tr("guestbook.theSiteOwnerIsntAccepting")}</p></div>;
  if (!ctx.siteHandle) return <div className="guestbook-empty">{tr("guestbook.publishTheSiteToUse")}</div>;

  const submit = async () => {
    const handle = ctx.siteHandle;
    if (!handle || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await api.submitGuestbook(handle, { displayName, body, requestId: requestId.current });
      if (mounted.current && handleRef.current === handle) {
        setDisplayName("");
        setBody("");
        requestId.current = crypto.randomUUID();
        setMessage(tr("guestbook.sentForReviewItBecomes"));
      }
    } catch (reason) {
      if (mounted.current && handleRef.current === handle) setMessage(reason instanceof ApiError && reason.code === "rate_limited" ? tr("guestbook.sendingTooOftenPleaseTry") : tr("guestbook.couldntSendPleaseTryAgain"));
    } finally {
      submitLock.current = false;
      if (mounted.current && handleRef.current === handle) setBusy(false);
    }
  };

  const report = async (entryId: string) => {
    const handle = ctx.siteHandle;
    if (!handle) return;
    const rowKey = `${handle}:${entryId}`;
    if (reportLocks.current.has(rowKey)) return;
    reportLocks.current.add(rowKey);
    setReporting(new Set(reportLocks.current));
    try {
      await api.reportGuestbookEntry(handle, entryId, { requestId: crypto.randomUUID(), reason: tr("guestbook.reportByAVisitor") });
      if (mounted.current && handleRef.current === handle) setMessage(tr("guestbook.reportReceivedTheSiteOwner"));
    } catch {
      if (mounted.current && handleRef.current === handle) setMessage(tr("guestbook.theReportWasntSentPlease"));
    } finally {
      reportLocks.current.delete(rowKey);
      if (mounted.current && handleRef.current === handle) setReporting(new Set(reportLocks.current));
    }
  };

  const entries = loaded?.handle === ctx.siteHandle ? loaded.entries : [];
  const listLoading = loading || loaded?.handle !== ctx.siteHandle && !loadError;
  return <div className="guestbook-app">
    <p className="guestbook-intro">{window.content.intro}</p>
    <form className="guestbook-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label>{tr("guestbook.nicknameIdentityIsntVerified")}<input aria-label={tr("guestbook.nicknameIdentityIsntVerified")} required minLength={1} maxLength={40} value={displayName} disabled={busy} onChange={(event) => setDisplayName(event.target.value)} /><small>{displayName.length}/40</small></label>
      <label>{tr("guestbook.message")}<textarea aria-label={tr("guestbook.message")} required minLength={1} maxLength={1000} value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} /><small>{body.length}/1000</small></label>
      <button type="submit" className="w98-btn" disabled={busy}>{busy ? tr("guestbook.sending") : tr("guestbook.submitForReview")}</button>
      <small>{tr("guestbook.onlyANicknamePlainText")}</small>
      {message ? <p role="status" className="guestbook-status">{message}</p> : null}
    </form>
    <section className="guestbook-list" aria-label={tr("guestbook.approvedMessages")}>
      {loadError ? <p role="alert">{tr("guestbook.couldntLoadMessagesRightNow")} <button type="button" className="w98-btn small" onClick={() => setReload((value) => value + 1)}>{tr("guestbook.retry")}</button></p> : null}
      {listLoading ? <p role="status">{tr("guestbook.loading")}</p> : null}
      {entries.map((entry) => <article key={entry.id}><header><strong>{entry.displayName}</strong><time dateTime={entry.createdAt}>{formatDate(new Date(entry.createdAt))}</time></header><p>{entry.body}</p><button type="button" className="w98-btn small" disabled={reporting.has(`${ctx.siteHandle}:${entry.id}`)} onClick={() => void report(entry.id)}>{tr("guestbook.report")}</button></article>)}
      {!listLoading && !loadError && !entries.length ? <p>{tr("guestbook.noApprovedMessagesYet")}</p> : null}
    </section>
  </div>;
}

export function GuestbookView(props: ModuleProps<"guestbook">) {
  const preview = useGuestbookPreview();
  return preview ? <PreviewGuestbook window={props.window} /> : <VisitorGuestbook {...props} />;
}
export function GuestbookInlineEditor(props: ModuleProps<"guestbook">) {
  const preview = useGuestbookPreview();
  return preview ? <PreviewGuestbook window={props.window} /> : <OwnerGuestbook key={`${props.ctx.siteId}:${props.window.id}`} {...props} />;
}
