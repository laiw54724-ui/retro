import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeDocument, SiteDocumentSchema, THEME_PRESETS, type DesktopWindow } from "@retrodesk/shared";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useEditorStore } from "../features/editor/store";
import { DesktopCanvas } from "../features/editor/DesktopCanvas";
import { MobileEditor } from "../features/editor/MobileEditor";
import { LeftPanel } from "../features/editor/LeftPanel";
import { RightPanel } from "../features/editor/RightPanel";
import { VisitorPreview } from "../features/editor/VisitorPreview";
import { Icon } from "../components/Icon";
import { RetroButton } from "../components/RetroButton";
import { useAuth } from "../app/AuthProvider";



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
  const [preview, setPreview] = useState(false);
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
          normalizeDocument(site.draft_document),
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

  async function uploadImage(file: File, kind: "image" | "icon" = "image"): Promise<string | null> {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setMessage("無法上傳：請選擇 JPG、PNG、GIF 或 WebP。");
      return null;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage("檔案太大：單張 8 MB 以內。");
      return null;
    }
    try {
      const { asset } = await api.uploadAsset(siteId, file, { kind, name: file.name.replace(/\.[^.]+$/, "") });
      return asset.url;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setMessage(code === "unsupported_media" || code === "invalid_image_bytes"
        ? "無法上傳：請選擇 JPG、PNG、GIF 或 WebP。"
        : code === "file_too_large"
          ? "檔案太大：單張 8 MB 以內。"
          : "上傳失敗，請再試一次。");
      return null;
    }
  }

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
        normalizeDocument(site.draft_document),
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

  function updateSelected(recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) {
    if (selected) store.updateWindow(selected.id, recipe, historyKey);
  }

  const publishState = !store.publishedDocument
    ? "尚未發布"
    : hasUnpublishedChanges
      ? "有未發布變更"
      : "已同步發布";
  const badge = !store.publishedDocument
    ? { text: "尚未發布", bg: "#ffffe1", color: "#7a5b00" }
    : hasUnpublishedChanges
      ? { text: "草稿有未發布的變更", bg: "#fff0e0", color: "#b35c00" }
      : { text: `已發布 v${store.publishedVersion ?? ""}`, bg: "#e6f4ee", color: "#1f7a5c" };
  const saveText = draftIssue && store.saveStatus === "dirty"
    ? "有欄位未完成，暫不儲存"
    : store.saveStatus === "saving" ? "儲存中…"
      : store.saveStatus === "dirty" ? "尚未儲存"
        : store.saveStatus === "error" ? "儲存失敗"
          : "已儲存";

  const layoutMode = store.layoutMode && store.device === "desktop";

  return (
    <main className="editor-app">
      <header className="editor-topbar">
        <Link to="/" className="brand" title="回到首頁"><Icon name="computer" size={22} />Retro Desktop</Link>
        <span className="w98-vsep" />
        <div className="topbar-meta">
          <span className="site-url">retrodesk.me/{store.username}</span>
          <span className="status-badge" title={badge.text} style={{ background: badge.bg, color: badge.color, borderColor: badge.color }}>{badge.text}</span>
        </div>
        <span className="w98-vsep" />
        <RetroButton disabled={store.past.length === 0} onClick={store.undo} aria-label="復原" title="復原 (Ctrl+Z)">↶ 復原</RetroButton>
        <RetroButton disabled={store.future.length === 0} onClick={store.redo} aria-label="重做" title="重做 (Ctrl+Shift+Z)">↷ 重做</RetroButton>
        <span className={"save-text " + store.saveStatus} title={draftIssue ?? undefined} role="status">{saveText}</span>
        <div className="top-spacer" />
        <div role="group" aria-label="裝置" className="device-toggle">
          <button type="button" aria-pressed={store.device === "desktop"} className={"w98-btn" + (store.device === "desktop" ? " on" : "")} onClick={() => store.setDevice("desktop")}>桌面版</button>
          <button type="button" aria-pressed={store.device === "mobile"} className={"w98-btn" + (store.device === "mobile" ? " on" : "")} onClick={() => { store.setLayoutMode(false); store.setDevice("mobile"); }}>手機版</button>
        </div>
        <RetroButton onClick={() => setPreview(true)}>▶ 訪客預覽</RetroButton>
        {store.publishedDocument ? <a className="w98-btn" href={"/@" + store.username} target="_blank" rel="noreferrer">開啟已發布網站</a> : null}
        <RetroButton className="primary" onClick={requestPublish} disabled={publishing || (!!store.publishedDocument && !hasUnpublishedChanges)}>
          {store.publishedDocument ? "重新發布" : "發布"}
        </RetroButton>
        <RetroButton onClick={async () => { await signOut(); navigate("/"); }}>登出</RetroButton>
      </header>

      {message ? (
        <div className="editor-message" role="alert">
          <span>{message}</span>
          {store.saveStatus === "error" && !conflict ? <button onClick={store.retrySave}>重試儲存</button> : null}
          <button aria-label="關閉通知" onClick={() => setMessage("")}>×</button>
        </div>
      ) : null}

      <div className="editor-grid2">
        {!layoutMode ? (
          <LeftPanel
            document={store.document}
            selectedId={store.selectedId}
            view={store.viewState}
            onAdd={store.addWindow}
            onSelect={(id) => { store.setViewState(id, null); store.focusWindow(id); }}
            onToggleVisible={(id) => store.setViewState(id, store.viewState[id] ? null : "closed")}
            onMoveLayer={store.moveLayer}
            onTheme={store.setTheme}
            upload={uploadImage}
          />
        ) : null}

        <section className="editor-stage2">
          {store.device === "desktop" ? (
            <DesktopCanvas siteId={siteId} upload={uploadImage} />
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

        {!layoutMode && store.device === "desktop" ? (
          <RightPanel
            document={store.document}
            selected={selected}
            siteId={siteId}
            upload={uploadImage}
            onUpdate={updateSelected}
            onDelete={() => selected && store.deleteWindow(selected.id)}
            onDuplicate={() => selected && store.duplicateWindow(selected.id)}
            onBringToFront={() => selected && store.bringToFront(selected.id)}
            onEnterLayout={() => store.setLayoutMode(true)}
            onSiteName={store.setSiteName}
            onColumns={store.setMobileColumns}
          />
        ) : null}
      </div>

      <footer className="editor-status2">
        <span>{layoutMode ? "排版模式" : "編輯模式"}</span>
        <span>{selected ? "已選取：" + selected.title : "未選取"}</span>
        <span className="top-spacer" />
        <span>{store.document.windows.length} 個視窗 · {badge.text}</span>
      </footer>

      {preview ? <VisitorPreview document={store.document} username={store.username} published={!!store.publishedDocument && !hasUnpublishedChanges} onClose={() => setPreview(false)} /> : null}

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
