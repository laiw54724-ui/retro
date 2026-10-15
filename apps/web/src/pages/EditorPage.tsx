import { useEffect, useMemo, useState } from "react";
import { SiteDocumentSchema, THEME_PRESETS, type DesktopWindow } from "@retrodesk/shared";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useEditorStore } from "../features/editor/store";
import { DesktopCanvas } from "../features/editor/DesktopCanvas";
import { MobilePreview } from "../features/editor/MobilePreview";
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

export function EditorPage() {
  const { siteId = "" } = useParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const store = useEditorStore();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getSite(siteId)
      .then(({ site }) => {
        if (!alive) return;
        store.setSite(site.id, site.username, site.draft_document, site.draft_version);
        setLoading(false);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "載入失敗");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [siteId]);

  useEffect(() => {
    if (!store.document || store.saveStatus !== "dirty" || !store.siteId) return;
    const timer = window.setTimeout(async () => {
      const invalid = validationMessage(store.document);
      if (invalid) {
        store.setSaveStatus("error");
        setMessage(invalid);
        return;
      }

      store.setSaveStatus("saving");
      try {
        const result = await api.saveDraft(store.siteId!, store.version, store.document!);
        store.setVersion(result.version);
        store.setSaveStatus("saved");
      } catch (error) {
        store.setSaveStatus("error");
        if (error instanceof ApiError && error.code === "version_conflict") {
          setMessage("這份草稿在其他地方被修改了。請重新整理後再繼續編輯。");
        } else {
          setMessage(error instanceof Error ? error.message : "儲存失敗");
        }
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [store.document, store.saveStatus, store.siteId, store.version]);

  const selected = useMemo(
    () => store.document?.windows.find((window) => window.id === store.selectedId) ?? null,
    [store.document, store.selectedId]
  );

  if (loading || !store.document) return <div className="boot-screen">Loading desktop...</div>;

  async function publish() {
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

    setPublishing(true);
    setMessage("");
    try {
      const result = await api.publish(siteId, store.version);
      setMessage("發布成功：v" + result.publishedVersion);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "發布失敗");
    } finally {
      setPublishing(false);
    }
  }

  function updateSelected(recipe: (window: DesktopWindow) => DesktopWindow) {
    if (selected) store.updateWindow(selected.id, recipe);
  }

  return (
    <main className="editor-app">
      <header className="editor-topbar">
        <Link to="/" className="brand">Retro Desktop</Link>
        <span className="site-url">retrodesk.me/{store.username}</span>
        <span className={"save-pill " + store.saveStatus}>
          {store.saveStatus === "saving" ? "儲存中" : store.saveStatus === "dirty" ? "尚未儲存" : store.saveStatus === "error" ? "請修正內容" : "已儲存"}
        </span>
        <div className="top-spacer" />
        <div className="device-toggle">
          <button className={store.device === "desktop" ? "active" : ""} onClick={() => store.setDevice("desktop")}>桌面版</button>
          <button className={store.device === "mobile" ? "active" : ""} onClick={() => store.setDevice("mobile")}>手機版</button>
        </div>
        <a className="retro-link" href={"/@" + store.username} target="_blank" rel="noreferrer">開啟已發布網站</a>
        <RetroButton className="primary" onClick={publish} disabled={publishing}>{publishing ? "發布中..." : "發布"}</RetroButton>
        <RetroButton onClick={async () => { await signOut(); navigate("/"); }}>登出</RetroButton>
      </header>

      {message ? <div className="editor-message">{message}<button onClick={() => setMessage("")}>×</button></div> : null}

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
              onMove={(id, x, y) => store.updateWindow(id, (window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, x, y } } }))}
            />
          ) : <MobilePreview document={store.document} />}
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
        {store.document.windows.length} 個視窗 · 草稿自動儲存
      </footer>
    </main>
  );
}
