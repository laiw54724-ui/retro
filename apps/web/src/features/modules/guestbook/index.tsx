import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type GuestbookEntry, type GuestbookStatus } from "../../../lib/api";
import type { ModuleProps } from "../types";

const statusLabel: Record<GuestbookStatus, string> = { pending: "待審", approved: "已公開", rejected: "已拒絕" };

function VisitorGuestbook({ window, ctx }: ModuleProps<"guestbook">) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    if (!window.content.enabled || !ctx.siteHandle) return;
    try { setEntries((await api.publicGuestbook(ctx.siteHandle)).entries); }
    catch { setMessage("目前無法載入留言，請稍後再試。"); }
  }, [ctx.siteHandle, window.content.enabled]);
  useEffect(() => { void load(); }, [load]);
  if (!window.content.enabled) return <div className="guestbook-empty"><strong>留言簿尚未開放</strong><p>站長目前不接受新留言。</p></div>;
  if (!ctx.siteHandle) return <div className="guestbook-empty">發布網站後即可使用真實留言簿。</div>;
  const submit = async () => {
    setBusy(true); setMessage("");
    try {
      await api.submitGuestbook(ctx.siteHandle!, { displayName, body, requestId: requestId.current });
      setDisplayName(""); setBody(""); requestId.current = crypto.randomUUID();
      setMessage("已送出待審；站長核准後才會公開。");
    } catch (reason) {
      setMessage(reason instanceof ApiError && reason.code === "rate_limited" ? "送出太頻繁，請稍後再試。內容已保留。" : "送出失敗，請稍後重試。內容已保留。");
    } finally { setBusy(false); }
  };
  const report = async (entryId: string) => {
    try { await api.reportGuestbookEntry(ctx.siteHandle!, entryId, { requestId: crypto.randomUUID(), reason: "訪客檢舉" }); setMessage("已收到檢舉，站長會進行審核。"); }
    catch { setMessage("檢舉未送出，請稍後再試。"); }
  };
  return <div className="guestbook-app">
    <p className="guestbook-intro">{window.content.intro}</p>
    <form className="guestbook-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label>暱稱（不驗證身分）<input required minLength={1} maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>留言<textarea required minLength={1} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <button type="submit" className="w98-btn" disabled={busy}>{busy ? "送出中…" : "送出審核"}</button>
      <small>只收暱稱、純文字留言與時間；不收 email 或附件。為防濫用，伺服器會使用不可逆摘要限制頻率。</small>
      {message ? <p role="status" className="guestbook-status">{message}</p> : null}
    </form>
    <section className="guestbook-list" aria-label="已核准留言">
      {entries.map((entry) => <article key={entry.id}><header><strong>{entry.displayName}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString()}</time></header><p>{entry.body}</p><button type="button" className="w98-btn small" onClick={() => void report(entry.id)}>檢舉</button></article>)}
      {!entries.length ? <p>目前還沒有已核准的留言。</p> : null}
    </section>
  </div>;
}

function OwnerGuestbook({ window, ctx, update }: ModuleProps<"guestbook">) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!ctx.siteId) return;
    try { setEntries((await api.listGuestbookEntries(ctx.siteId)).entries); setMessage(""); }
    catch (reason) { setMessage(reason instanceof ApiError && reason.status === 403 ? "只有桌面擁有者可以審核留言。" : "無法載入審核列表。"); }
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
    } catch { setMessage("審核操作失敗，請稍後再試。"); }
  };
  return <div className="guestbook-app owner">
    <fieldset className="guestbook-settings"><legend>公開設定</legend><label className="check-row"><input type="checkbox" checked={window.content.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />允許訪客送出待審留言</label><label>說明<textarea value={window.content.intro} onChange={(event) => patch({ intro: event.target.value }, `guestbook-intro-${window.id}`)} /></label></fieldset>
    <p className="guestbook-note">關閉後伺服器會拒絕新留言；既有已核准留言仍保留，重新開啟後可見。</p>
    {message ? <p role="status" className="guestbook-status">{message}</p> : null}
    <section className="guestbook-moderation" aria-label="留言審核列表">
      {entries.map((entry) => <article key={entry.id}><header><strong>{entry.displayName}</strong><span>{statusLabel[entry.status]} · 檢舉 {entry.openReportCount ?? 0}</span></header><p>{entry.body}</p><div className="button-row"><button type="button" className="w98-btn small" onClick={() => void moderate(entry, "approved")}>核准</button><button type="button" className="w98-btn small" onClick={() => void moderate(entry, "rejected")}>拒絕</button>{(entry.openReportCount ?? 0) > 0 ? <button type="button" className="w98-btn small" onClick={() => void moderate(entry, "resolve")}>檢舉已處理</button> : null}<button type="button" className="w98-btn small danger" onClick={() => void moderate(entry, "delete")}>刪除</button></div></article>)}
      {!entries.length ? <p>目前沒有留言。</p> : null}
    </section>
  </div>;
}

export function GuestbookView(props: ModuleProps<"guestbook">) { return <VisitorGuestbook {...props} />; }
export function GuestbookInlineEditor(props: ModuleProps<"guestbook">) { return <OwnerGuestbook {...props} />; }
