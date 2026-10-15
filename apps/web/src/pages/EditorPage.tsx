import { useEffect, useMemo, useRef, useState } from "react";
import { SiteDocumentSchema, THEME_PRESETS, type DesktopWindow } from "@retrodesk/shared";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useEditorStore } from "../features/editor/store";
import { DesktopCanvas } from "../features/editor/DesktopCanvas";
import { MobileEditor } from "../features/editor/MobileEditor";
import { InspectorContent } from "../features/editor/InspectorContent";
import { RetroButton } from "../components/RetroButton";
import { useAuth } from "../app/AuthProvider";

const moduleTypes: Array<{ type: DesktopWindow["type"]; label: string; desc: string }> = [
  { type: "document", label: "文件視窗", desc: "標題、段落、圖片、按鈕、清單" },
  { type: "gallery", label: "相簿視窗", desc: "多張圖片網格" },
  { type: "links", label: "連結視窗", desc: "社群與外部連結" },
  { type: "about", label: "名片／關於我", desc: "頭像、簡介與欄位" },
  { type: "instagram", label: "復古 IG", desc: "個人頁與貼文格狀" }
];

function validationMessage(document: unknown) {
  const parsed = SiteDocumentSchema.safeParse(document);
  if (parsed.success) return null;
  const first = parsed.error.issues[0];
  const path = first?.path.length ? first.path.join(" → ") + "：" : "";
  return "請先修正內容格式。" + (first ? " " + path + first.message : "");
}

const sameDocument = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function EditorPage() {
  const { siteId = "" } = useParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const store = useEditorStore();
  const saveInFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  // Transient invalid drafts (e.g. a field cleared mid-edit) pause autosave quietly instead of raising a popup.
  const [draftIssue, setDraftIssue] = useState<string | null>(null);
  const [publishPrompt, setPublishPrompt] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<{ version: number; url: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getSite(siteId)
      .then(({ site }) => {
        if (!alive) return;
        store.setSite(
          site.id,
          site.username,
          site.draft_document,
          site.draft_version,
          site.published_document ?? null,
          site.published_version ?? null
        );
        setLoading(false);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "載入失敗");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [siteId]);

  useEffect(() => {
    if (!store.document || store.saveStatus !== "dirty" || !store.siteId || saveInFlight.current || conflict) return;

    const timer = window.setTimeout(async () => {
      const documentToSave = store.document!;
      const versionToSave = store.version;
      const invalid = validationMessage(documentToSave);
      if (invalid) {
        setDraftIssue(invalid);
        return;
      }
      setDraftIssue(null);

      saveInFlight.current = true;
      store.setSaveStatus("saving");
      try {
        const result = await api.saveDraft(store.siteId!, versionToSave, documentToSave);
        store.markSaved(result.version, documentToSave);
      } catch (error) {
        store.setSaveStatus("error");
        if (error instanceof ApiError && error.code === "version_conflict") {
          setConflict(true);
          setMessage("偵測到另一個分頁或裝置有更新，已停止自動儲存以避免覆蓋。");
        } else {
          setMessage(error instanceof Error ? error.message : "儲存失敗");
        }
      } finally {
        saveInFlight.current = false;
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [store.document, store.saveStatus, store.siteId, store.version, conflict]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redo();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [store.undo, store.redo]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    if (query.matches) store.setDevice("mobile");
    const change = (event: MediaQueryListEvent) => {
      if (event.matches) store.setDevice("mobile");
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [store.setDevice]);

  const selected = useMemo(
    () => store.document?.windows.find((window) => window.id === store.selectedId) ?? null,
    [store.document, store.selectedId]
  );

  const hasUnpublishedChanges = useMemo(() => {
    if (!store.document) return false;
    if (!store.publishedDocument) return true;
    return !sameDocument(store.document, store.publishedDocument);
  }, [store.document, store.publishedDocument]);

  if (loading || !store.document) return <div className="boot-screen">Loading desktop...</div>;

  function requestPublish() {
    const invalid = validationMessage(store.document);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    if (store.saveStatus === "dirty" || store.saveStatus === "saving") {
      setMessage("請等草稿儲存完成後再發布。");
      return;
    }
    if (store.saveStatus === "error") {
      setMessage("目前草稿有儲存或格式錯誤，請先修正後再發布。");
      return;
    }
    setPublishPrompt(true);
  }

  async function confirmPublish() {
    setPublishing(true);
    setMessage("");
    try {
      const result = await api.publish(siteId, store.version);
      const absoluteUrl = new URL(result.url, window.location.origin).toString();
      store.markPublished(result.publishedVersion);
      setPublishPrompt(false);
      setPublishSuccess({ version: result.publishedVersion, url: absoluteUrl });
    } catch (error) {
      if (error instanceof ApiError && error.code === "version_conflict") {
        setConflict(true);
      }
      setMessage(error instanceof Error ? error.message : "發布失敗");
    } finally {
      setPublishing(false);
    }
  }

  async function reloadRemote() {
    setLoading(true);
    try {
      const { site } = await api.getSite(siteId);
      store.setSite(
        site.id,
        site.username,
        site.draft_document,
        site.draft_version,
        site.published_document ?? null,
        site.published_version ?? null
      );
      setConflict(false);
      setMessage("已重新載入雲端最新草稿。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新載入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function copyLocalJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(store.document, null, 2));
      setMessage("目前本機草稿 JSON 已複製，可以先備份後再重新載入。");
    } catch {
      setMessage("無法使用剪貼簿，請先不要重新整理頁面。");
    }
  }

  async function copyPublishedUrl() {
    if (!publishSuccess) return;
    try {
      await navigator.clipboard.writeText(publishSuccess.url);
      setMessage("公開網址已複製。");
    } catch {
      setMessage("無法自動複製網址。");
    }
  }

  function updateSelected(recipe: (window: DesktopWindow) => DesktopWindow) {
    if (selected) store.updateWindow(selected.id, recipe);
  }

  const publishState = !store.publishedDocument
    ? "尚未發布"
    : hasUnpublishedChanges
      ? "有未發布變更"
      : "已同步發布";

  return (
    <main className="editor-app">
      <header className="editor-topbar">
        <Link to="/" className="brand">Retro Desktop</Link>
        <span className="site-url">retrodesk.me/{store.username}</span>
        <RetroButton className="history-button" disabled={store.past.length === 0} onClick={store.undo}>↶ 復原</RetroButton>
        <RetroButton className="history-button" disabled={store.future.length === 0} onClick={store.redo}>↷ 重做</RetroButton>
        <span className={"save-pill " + store.saveStatus} title={draftIssue ?? undefined}>
          {draftIssue && store.saveStatus === "dirty" ? "有欄位未完成，暫不儲存" : store.saveStatus === "saving" ? "儲存中" : store.saveStatus === "dirty" ? "尚未儲存" : store.saveStatus === "error" ? "儲存需處理" : "已儲存"}
        </span>
        <span className={"publish-pill " + (hasUnpublishedChanges ? "changed" : "synced")}>{publishState}</span>
        <div className="top-spacer" />
        <div className="device-toggle">
          <button className={store.device === "desktop" ? "active" : ""} onClick={() => store.setDevice("desktop")}>桌面版</button>
          <button className={store.device === "mobile" ? "active" : ""} onClick={() => store.setDevice("mobile")}>手機版</button>
        </div>
        <a className="retro-link" href={"/@" + store.username} target="_blank" rel="noreferrer">開啟已發布網站</a>
        <RetroButton
          className="primary"
          onClick={requestPublish}
          disabled={publishing || (!!store.publishedDocument && !hasUnpublishedChanges)}
        >
          發布
        </RetroButton>
        <RetroButton onClick={async () => { await signOut(); navigate("/"); }}>登出</RetroButton>
      </header>

      {message ? (
        <div className="editor-message">
          <span>{message}</span>
          {store.saveStatus === "error" && !conflict ? <button onClick={store.retrySave}>重試儲存</button> : null}
          <button aria-label="關閉通知" onClick={() => setMessage("")}>×</button>
        </div>
      ) : null}

      <div className="editor-grid">
        <aside className="left-panel retro-panel">
          <div className="panel-tabs"><b>新增</b><span>視窗</span><span>主題</span></div>
          <p className="panel-help">點一下加到桌面上。</p>
          {moduleTypes.map((item) => (
            <button className="module-card" key={item.type} onClick={() => store.addWindow(item.type)}>
              <span className="module-icon" />
              <span><strong>{item.label}</strong><small>{item.desc}</small></span>
            </button>
          ))}
          <hr />
          <strong>主題</strong>
          <div className="theme-list">
            {Object.values(THEME_PRESETS).map((theme) => (
              <button key={theme.id} onClick={() => store.setTheme(theme)} className={store.document?.theme.id === theme.id ? "selected" : ""}>
                <i style={{ background: theme.wall }} />
                <span>{theme.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-stage">
          {store.device === "desktop" ? (
            <DesktopCanvas
              document={store.document}
              selectedId={store.selectedId}
              onSelect={store.select}
              onFocus={store.focusWindow}
              onMove={(id, x, y) => store.updateWindow(id, (window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, x, y } } }))}
              onResize={(id, w, h) => store.updateWindow(id, (window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, w, h } } }))}
              onIconMove={(id, iconX, iconY) => store.updateWindow(id, (window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, iconX, iconY } } }))}
            />
          ) : (
            <MobileEditor
              document={store.document}
              siteId={siteId}
              selectedId={store.selectedId}
              onSelect={store.select}
              onAdd={store.addWindow}
              onUpdate={store.updateWindow}
              onDelete={store.deleteWindow}
              onTheme={store.setTheme}
              onReorder={store.reorderMobile}
              onColumns={store.setMobileColumns}
              onMessage={setMessage}
            />
          )}
        </section>

        <aside className="right-panel retro-panel">
          {selected ? (
            <>
              <div className="inspector-title"><span className="module-icon" /><strong>{selected.title}</strong></div>
              <label>視窗標題<input value={selected.title} onChange={(event) => updateSelected((window) => ({ ...window, title: event.target.value }))} /></label>
              <label>桌面圖示<input value={selected.icon} onChange={(event) => updateSelected((window) => ({ ...window, icon: event.target.value }))} /></label>
              <label className="check-row"><input type="checkbox" checked={selected.defaultOpen} onChange={(event) => updateSelected((window) => ({ ...window, defaultOpen: event.target.checked }))} />訪客打開網站時預設開啟</label>
              <div className="geometry-grid">
                <label>X<input type="number" value={selected.layout.desktop.x} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, x: Number(event.target.value) } } }))} /></label>
                <label>Y<input type="number" value={selected.layout.desktop.y} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, y: Number(event.target.value) } } }))} /></label>
                <label>寬<input min={220} max={1400} type="number" value={selected.layout.desktop.w} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, w: Number(event.target.value) } } }))} /></label>
                <label>高<input min={140} max={1200} type="number" value={selected.layout.desktop.h} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, h: Number(event.target.value) } } }))} /></label>
              </div>
              <InspectorContent
                window={selected}
                allWindows={store.document.windows}
                siteId={siteId}
                update={updateSelected}
                onMessage={setMessage}
              />
              <RetroButton className="danger" onClick={() => store.deleteWindow(selected.id)}>刪除視窗</RetroButton>
            </>
          ) : (
            <div className="empty-inspector">
              <span className="module-icon" />
              <strong>尚未選取視窗</strong>
              <p>點畫布上的視窗來選取。</p>
              <label>桌面名稱<input value={store.document.siteName} onChange={(event) => store.setSiteName(event.target.value)} /></label>
            </div>
          )}
        </aside>
      </div>

      <footer className="editor-status">
        <span>編輯模式</span>
        <span>{selected ? "已選取：" + selected.title : "未選取"}</span>
        <span className="top-spacer" />
        {store.document.windows.length} 個視窗 · {publishState}
      </footer>

      {conflict ? (
        <div className="modal-backdrop" role="presentation">
          <section className="retro-panel editor-dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title">
            <header className="landing-titlebar" id="conflict-title">版本衝突</header>
            <div className="dialog-body">
              <h2>雲端草稿已經有較新的版本</h2>
              <p>為了避免蓋掉另一個分頁或裝置的修改，自動儲存已停止。你可以先複製目前本機草稿，再重新載入雲端版本。</p>
              <div className="button-row end">
                <RetroButton onClick={copyLocalJson}>複製本機 JSON</RetroButton>
                <RetroButton className="primary" onClick={reloadRemote}>重新載入雲端版本</RetroButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {publishPrompt ? (
        <div className="modal-backdrop" role="presentation">
          <section className="retro-panel editor-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title">
            <header className="landing-titlebar" id="publish-title">發布 Retro Desktop</header>
            <div className="dialog-body">
              <h2>要把目前草稿發布給訪客嗎？</h2>
              <p>公開網址：<strong>retrodesk.me/{store.username}</strong></p>
              <p>發布只會更新公開版本，你仍然可以繼續編輯下一版草稿。</p>
              <div className="button-row end">
                <RetroButton disabled={publishing} onClick={() => setPublishPrompt(false)}>取消</RetroButton>
                <RetroButton className="primary" disabled={publishing} onClick={confirmPublish}>{publishing ? "發布中…" : "確認發布"}</RetroButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {publishSuccess ? (
        <div className="modal-backdrop" role="presentation">
          <section className="retro-panel editor-dialog" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <header className="landing-titlebar" id="success-title">發布完成</header>
            <div className="dialog-body">
              <h2>公開版本 v{publishSuccess.version} 已上線</h2>
              <input className="share-url" readOnly value={publishSuccess.url} onFocus={(event) => event.currentTarget.select()} />
              <div className="button-row end">
                <RetroButton onClick={copyPublishedUrl}>複製網址</RetroButton>
                <a className="retro-link" href={publishSuccess.url} target="_blank" rel="noreferrer">開啟網站</a>
                <RetroButton className="primary" onClick={() => setPublishSuccess(null)}>完成</RetroButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
