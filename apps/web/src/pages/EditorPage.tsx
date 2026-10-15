import { useEffect, useMemo, useState } from "react";
import { THEME_PRESETS, type DesktopWindow } from "@retrodesk/shared";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useEditorStore } from "../features/editor/store";
import { DesktopCanvas } from "../features/editor/DesktopCanvas";
import { MobilePreview } from "../features/editor/MobilePreview";
import { RetroButton } from "../components/RetroButton";
import { useAuth } from "../app/AuthProvider";

const moduleTypes: Array<{ type: DesktopWindow["type"]; label: string; desc: string }> = [
  { type: "document", label: "文件視窗", desc: "標題、段落、圖片、按鈕、清單" },
  { type: "gallery", label: "相簿視窗", desc: "多張圖片網格" },
  { type: "links", label: "連結視窗", desc: "社群與外部連結" },
  { type: "about", label: "名片／關於我", desc: "頭像、簡介與欄位" },
  { type: "instagram", label: "復古 IG", desc: "個人頁與貼文格狀" }
];

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
    if (store.saveStatus === "dirty" || store.saveStatus === "saving") {
      setMessage("請等草稿儲存完成後再發布。");
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
          {store.saveStatus === "saving" ? "儲存中" : store.saveStatus === "dirty" ? "尚未儲存" : store.saveStatus === "error" ? "儲存失敗" : "已儲存"}
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
              <div className="geometry-grid">
                <label>X<input type="number" value={selected.layout.desktop.x} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, x: Number(event.target.value) } } }))} /></label>
                <label>Y<input type="number" value={selected.layout.desktop.y} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, y: Number(event.target.value) } } }))} /></label>
                <label>寬<input type="number" value={selected.layout.desktop.w} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, w: Number(event.target.value) } } }))} /></label>
                <label>高<input type="number" value={selected.layout.desktop.h} onChange={(event) => updateSelected((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, h: Number(event.target.value) } } }))} /></label>
              </div>
              <InspectorContent window={selected} update={updateSelected} />
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

function InspectorContent({ window, update }: { window: DesktopWindow; update: (recipe: (window: DesktopWindow) => DesktopWindow) => void }) {
  if (window.type === "about") {
    return (
      <>
        <hr />
        <strong>內容</strong>
        <label>暱稱<input value={window.content.nickname} onChange={(event) => update((current) => current.type === "about" ? { ...current, content: { ...current.content, nickname: event.target.value } } : current)} /></label>
        <label>簡介<textarea rows={6} value={window.content.bio} onChange={(event) => update((current) => current.type === "about" ? { ...current, content: { ...current.content, bio: event.target.value } } : current)} /></label>
      </>
    );
  }

  if (window.type === "document") {
    return (
      <>
        <hr />
        <strong>文件內容</strong>
        {window.content.blocks.map((block, index) => block.kind === "heading" || block.kind === "text" ? (
          <label key={block.id}>
            {block.kind === "heading" ? "標題" : "段落"}
            <textarea rows={block.kind === "heading" ? 2 : 4} value={block.text} onChange={(event) => update((current) => current.type === "document" ? {
              ...current,
              content: { blocks: current.content.blocks.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) }
            } : current)} />
          </label>
        ) : null)}
      </>
    );
  }

  if (window.type === "links") {
    return (
      <>
        <hr />
        <strong>連結</strong>
        {window.content.links.map((link, index) => (
          <div className="link-editor" key={link.id}>
            <input value={link.label} onChange={(event) => update((current) => current.type === "links" ? {
              ...current,
              content: { links: current.content.links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }
            } : current)} />
            <input value={link.url} onChange={(event) => update((current) => current.type === "links" ? {
              ...current,
              content: { links: current.content.links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) }
            } : current)} />
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <hr />
      <p className="panel-help">相簿與復古 IG 的完整圖片管理會接到 R2 上傳流程；目前標題、位置與大小已會真實儲存。</p>
    </>
  );
}
