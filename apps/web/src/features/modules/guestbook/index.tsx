import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocaleFormatting } from "../../../i18n/format";
import { api, ApiError, type GuestbookEntry } from "../../../lib/api";
import type { ModuleProps } from "../types";
import { PreviewGuestbook } from "./PreviewGuestbook";
import { useGuestbookPreview } from "./previewContext";

type ModerationFilter = "all" | "pending" | "approved" | "reported" | "rejected";

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

function OwnerGuestbook({ window, ctx, update }: ModuleProps<"guestbook">) {
  const { t: tr } = useTranslation("modules");
  const [loaded, setLoaded] = useState<{ siteId: string; entries: GuestbookEntry[] }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<ModerationFilter>("all");
  const [busyRows, setBusyRows] = useState<Set<string>>(new Set());
  const rowLocks = useRef(new Set<string>());
  const loadEpoch = useRef(0);
  const mounted = useRef(false);
  const siteRef = useRef(ctx.siteId);
  siteRef.current = ctx.siteId;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadEpoch.current++; };
  }, []);

  useEffect(() => {
    const siteId = ctx.siteId;
    if (!siteId) return;
    const epoch = ++loadEpoch.current;
    setLoading(true);
    setLoadError("");
    void api.listGuestbookEntries(siteId).then(({ entries }) => {
      if (mounted.current && siteRef.current === siteId && loadEpoch.current === epoch) setLoaded({ siteId, entries });
    }).catch((reason) => {
      if (mounted.current && siteRef.current === siteId && loadEpoch.current === epoch) setLoadError(reason instanceof ApiError && reason.status === 403 ? tr("guestbook.onlyTheDesktopOwnerCan") : tr("guestbook.couldntLoadTheModerationList"));
    }).finally(() => {
      if (mounted.current && siteRef.current === siteId && loadEpoch.current === epoch) setLoading(false);
    });
    return () => { loadEpoch.current++; };
  }, [ctx.siteId, reload, tr]);

  const patch = (change: Partial<typeof window.content>, key?: string) => update((current) => ({ ...current, content: { ...current.content, ...change } }), key);
  const moderate = async (entry: GuestbookEntry, action: "approved" | "rejected" | "delete" | "resolve") => {
    const siteId = ctx.siteId;
    if (!siteId) return;
    const rowKey = `${siteId}:${entry.id}`;
    if (rowLocks.current.has(rowKey)) return;
    rowLocks.current.add(rowKey);
    loadEpoch.current++; // A list read started before this action must not restore an older row.
    setLoading(false);
    setBusyRows(new Set(rowLocks.current));
    setMessage("");
    try {
      if (action === "delete") await api.deleteGuestbookEntry(siteId, entry.id);
      else if (action === "resolve") await api.resolveGuestbookReports(siteId, entry.id);
      else await api.moderateGuestbookEntry(siteId, entry.id, action);
      if (mounted.current && siteRef.current === siteId) {
        setLoaded((current) => current?.siteId === siteId ? { siteId, entries: current.entries.flatMap((row) => row.id !== entry.id ? [row] : action === "delete" ? [] : [{ ...row, status: action === "approved" || action === "rejected" ? action : row.status, openReportCount: action === "resolve" ? 0 : row.openReportCount }]) } : current);
        setReload((value) => value + 1);
      }
    } catch {
      if (mounted.current && siteRef.current === siteId) setMessage(tr("guestbook.theModerationActionFailedPlease"));
    } finally {
      rowLocks.current.delete(rowKey);
      if (mounted.current && siteRef.current === siteId) setBusyRows(new Set(rowLocks.current));
    }
  };

  const entries = loaded && loaded.siteId === ctx.siteId ? loaded.entries : [];
  const filtered = entries.filter((entry) => filter === "all" || (filter === "reported" ? (entry.openReportCount ?? 0) > 0 : entry.status === filter));
  const filters: ModerationFilter[] = ["all", "pending", "approved", "reported", "rejected"];
  return <div className="guestbook-app owner">
    <fieldset className="guestbook-settings"><legend>{tr("guestbook.publicSettings")}</legend><label className="check-row"><input type="checkbox" checked={window.content.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />{tr("guestbook.allowVisitorsToSubmitMessages")}</label><label>{tr("guestbook.note")}<textarea value={window.content.intro} onChange={(event) => patch({ intro: event.target.value }, `guestbook-intro-${window.id}`)} /></label></fieldset>
    <p className="guestbook-note">{tr("guestbook.whenOffTheServerRejects")}</p>
    {message ? <p role="alert" className="guestbook-status">{message}</p> : null}
    <section className="guestbook-moderation" aria-label={tr("guestbook.messageModerationList")}>
      <div className="button-row" role="group" aria-label={tr("guestbook.messageModerationList")}>{filters.map((choice) => <button key={choice} type="button" className="w98-btn small" aria-pressed={filter === choice} onClick={() => setFilter(choice)}>{tr(`guestbook.${choice === "approved" ? "public" : choice}`)}</button>)}</div>
      {loadError ? <p role="alert">{loadError} <button type="button" className="w98-btn small" onClick={() => setReload((value) => value + 1)}>{tr("guestbook.retry")}</button></p> : null}
      {loading || loaded?.siteId !== ctx.siteId && !loadError ? <p role="status">{tr("guestbook.loading")}</p> : null}
      {filtered.map((entry) => <article key={entry.id}><header><strong>{entry.displayName}</strong><span>{tr(`guestbook.${entry.status === "approved" ? "public" : entry.status}`)} · {tr("guestbook.reports", { count: entry.openReportCount ?? 0 })}</span></header><p>{entry.body}</p><div className="button-row"><button type="button" className="w98-btn small" disabled={busyRows.has(`${ctx.siteId}:${entry.id}`) || entry.status === "approved"} onClick={() => void moderate(entry, "approved")}>{tr("guestbook.approve")}</button><button type="button" className="w98-btn small" disabled={busyRows.has(`${ctx.siteId}:${entry.id}`) || entry.status === "rejected"} onClick={() => void moderate(entry, "rejected")}>{tr("guestbook.reject")}</button>{(entry.openReportCount ?? 0) > 0 ? <button type="button" className="w98-btn small" disabled={busyRows.has(`${ctx.siteId}:${entry.id}`)} onClick={() => void moderate(entry, "resolve")}>{tr("guestbook.reportHandled")}</button> : null}<button type="button" className="w98-btn small danger" disabled={busyRows.has(`${ctx.siteId}:${entry.id}`)} onClick={() => void moderate(entry, "delete")}>{tr("links.delete")}</button></div></article>)}
      {!loading && !loadError && loaded?.siteId === ctx.siteId && !filtered.length ? <p>{entries.length ? tr("guestbook.noMatchingMessages") : tr("guestbook.noMessagesYet")}</p> : null}
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
