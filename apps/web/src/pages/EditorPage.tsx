import { useEffect, useMemo, useRef, useState } from "react";
import { buildPublishChecks, hasBlockingCheck, loadVersionedSiteDocument, mergeLegacyDocumentIntoV2, normalizeDocument, parseSiteDocument, projectV2ToLegacyDocument, type DesktopWindow, type SiteDocumentV2Input } from "@retrodesk/shared";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useEditorStore } from "../features/editor/store";
import { DesktopCanvas } from "../features/editor/DesktopCanvas";
import { MobileScreen } from "../features/site/MobileScreen";
import { LeftPanel } from "../features/editor/LeftPanel";
import { RightPanel } from "../features/editor/RightPanel";
import { VisitorPreview } from "../features/editor/VisitorPreview";
import { Icon } from "../components/Icon";
import { RetroButton } from "../components/RetroButton";
import { useAuth } from "../app/AuthProvider";
import { AssetSourceProvider } from "../lib/assetSource";



function validationMessage(document: unknown) {
  const parsed = parseSiteDocument(document);
  if (parsed.ok) return null;
  const first = parsed.code === "invalid" ? parsed.diagnostics[0] : { path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}` };
  const path = first?.path.length ? first.path.join(" → ") + "：" : "";
  return "請先修正內容格式。" + (first ? " " + path + first.message : "");
}

const sameDocument = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function loadedLegacyDocument(loaded: ReturnType<typeof loadVersionedSiteDocument>) {
  if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? "文件格式無效");
  if (loaded.version === 1) return normalizeDocument(loaded.document);
  const legacy = projectV2ToLegacyDocument(loaded.document);
  if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? "角色引用無效");
  return legacy.document;
}

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
  const [publishSuccess, setPublishSuccess] = useState<{ version: number; url: string; artifactStatus: "synced" | "failed"; retryable: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [legacyAssetCount, setLegacyAssetCount] = useState(0);
  const [pendingPublicCopyCount, setPendingPublicCopyCount] = useState(0);
  const [migratingAssets, setMigratingAssets] = useState(false);
  const [versionedDraft, setVersionedDraft] = useState<SiteDocumentV2Input | null>(null);
  const publishChecks = useMemo(() => store.document ? buildPublishChecks(store.document) : [], [store.document]);

  function applyLoadedSite(site: Awaited<ReturnType<typeof api.getSite>>["site"]) {
    const loadedDraft = loadVersionedSiteDocument(site.draft_document, { siteId: site.id, migrateV1: true });
    if (!loadedDraft.ok) throw new Error(loadedDraft.diagnostics[0]?.message ?? "草稿格式無效");
    const loadedPublished = site.published_document ? loadVersionedSiteDocument(site.published_document, { siteId: site.id }) : null;
    if (loadedPublished && !loadedPublished.ok) throw new Error(loadedPublished.diagnostics[0]?.message ?? "發布版本格式無效");
    store.setSite(
      site.id,
      site.username,
      loadedLegacyDocument(loadedDraft),
      site.draft_version,
      loadedPublished ? loadedLegacyDocument(loadedPublished) : null,
      site.published_version ?? null
    );
    // Set the canonical v2 state in the same transaction as the legacy render
    // adapter, so an autosave can never observe a stale v2 document after reload.
    setVersionedDraft(loadedDraft.version === 2 ? loadedDraft.document : null);
    if (loadedDraft.migrated) store.setSaveStatus("dirty");
  }

  useEffect(() => {
    let alive = true;
    api.getSite(siteId)
      .then(({ site }) => {
        if (!alive) return;
        applyLoadedSite(site);
        setLoading(false);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "載入失敗");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [siteId]);

  // Keep the persisted v2 entity document in sync with the existing legacy-shaped
  // module editor until the full v2 module UI cutover lands.
  useEffect(() => {
    if (!versionedDraft || !store.document) return;
    setVersionedDraft((current) => current ? mergeLegacyDocumentIntoV2(current, store.document!, { siteId: store.siteId! }) : current);
  }, [store.document]);

  const refreshAssetInventory = () => api.listAssets(siteId).then(({ assets }) => {
    setLegacyAssetCount(assets.filter((asset) => asset.storageScope === "legacy_public").length);
    setPendingPublicCopyCount(assets.filter((asset) => asset.publicCopyRemaining).length);
  }).catch(() => undefined);
  useEffect(() => { refreshAssetInventory(); }, [siteId]);

  useEffect(() => {
    if (!store.document || store.saveStatus !== "dirty" || !store.siteId || saveInFlight.current || conflict) return;

    const timer = window.setTimeout(async () => {
      const documentToSave = versionedDraft ?? store.document!;
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
        store.markSaved(result.version, store.document!);
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
  }, [store.document, versionedDraft, store.saveStatus, store.siteId, store.version, conflict]);

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
      setPublishSuccess({ version: result.publishedVersion, url: absoluteUrl, artifactStatus: result.artifactStatus, retryable: result.retryable });
      await refreshAssetInventory();
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
      applyLoadedSite(site);
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

  async function migrateLegacyAssets() {
    if (!store.document || migratingAssets) return;
    setMigratingAssets(true);
    try {
      let version = store.version;
      if (store.saveStatus === "dirty") {
        const saved = await api.saveDraft(siteId, version, store.document);
        store.markSaved(saved.version, store.document);
        version = saved.version;
      }
      const result = await api.migrateLegacyAssets(siteId, version);
      store.setSite(store.siteId!, store.username, result.document, result.version, store.publishedDocument, store.publishedVersion);
      await refreshAssetInventory();
      setMessage(result.cleanupWarnings.length ? `素材已轉為私有預覽；${result.cleanupWarnings.length} 個舊公開副本仍需保留或清理。` : "舊素材已轉為私有預覽。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "素材遷移失敗"); }
    finally { setMigratingAssets(false); }
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
    <AssetSourceProvider siteId={siteId}>
    <main className="editor-app">
      <header className="editor-topbar">
        <Link to="/" className="brand" title="回到首頁"><Icon name="computer" size={22} />Retro Desktop</Link>
        <span className="w98-vsep mobile-hide" />
        <div className="topbar-meta">
          <span className="site-url">retrodesk.me/{store.username}</span>
          <span className="status-badge" title={badge.text} style={{ background: badge.bg, color: badge.color, borderColor: badge.color }}>{badge.text}</span>
        </div>
        <span className="w98-vsep mobile-hide" />
        <RetroButton className="mobile-hide" disabled={store.past.length === 0} onClick={store.undo} aria-label="復原" title="復原 (Ctrl+Z)">↶ 復原</RetroButton>
        <RetroButton className="mobile-hide" disabled={store.future.length === 0} onClick={store.redo} aria-label="重做" title="重做 (Ctrl+Shift+Z)">↷ 重做</RetroButton>
        <span className={"save-text mobile-hide " + store.saveStatus} title={draftIssue ?? undefined} role="status">{saveText}</span>
        <div className="top-spacer" />
        <div role="group" aria-label="裝置" className="device-toggle mobile-hide">
          <button type="button" aria-pressed={store.device === "desktop"} className={"w98-btn" + (store.device === "desktop" ? " on" : "")} onClick={() => store.setDevice("desktop")}>桌面版</button>
          <button type="button" aria-pressed={store.device === "mobile"} className={"w98-btn" + (store.device === "mobile" ? " on" : "")} onClick={() => { store.setLayoutMode(false); store.setDevice("mobile"); }}>手機版</button>
        </div>
        <RetroButton onClick={() => setPreview(true)}>▶ 訪客預覽</RetroButton>
        {store.publishedDocument ? <a className="w98-btn mobile-hide" href={"/@" + store.username} target="_blank" rel="noreferrer">開啟已發布網站</a> : null}
        <RetroButton className="primary" onClick={requestPublish} disabled={publishing || (!!store.publishedDocument && !hasUnpublishedChanges)}>
          {store.publishedDocument ? "重新發布" : "發布"}
        </RetroButton>
        <RetroButton className="mobile-hide" onClick={async () => { await signOut(); navigate("/"); }}>登出</RetroButton>
      </header>

      {message ? (
        <div className="editor-message" role="alert">
          <span>{message}</span>
          {store.saveStatus === "error" && !conflict ? <button onClick={store.retrySave}>重試儲存</button> : null}
          <button aria-label="關閉通知" onClick={() => setMessage("")}>×</button>
        </div>
      ) : null}

      {legacyAssetCount > 0 || pendingPublicCopyCount > 0 ? <div className="editor-message" role="status"><span>{legacyAssetCount > 0 ? `有 ${legacyAssetCount} 個舊素材仍是公開網址，尚未轉為私有。` : `有 ${pendingPublicCopyCount} 個舊公開副本因目前發布版本仍在使用，暫時保留。`}</span>{legacyAssetCount > 0 ? <button disabled={migratingAssets || store.saveStatus === "saving" || store.saveStatus === "error" || conflict} onClick={migrateLegacyAssets}>{migratingAssets ? "遷移中…" : "轉為私有素材"}</button> : null}</div> : null}

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
            <MobileScreen document={store.document} mode="editor" framed siteId={siteId} upload={uploadImage} onPreview={() => setPreview(true)} />
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
              <h2>發布前檢查</h2>
              <p>公開網址：<strong>retrodesk.me/{store.username}</strong></p>
              <ul className="publish-checks" aria-label="發布前檢查結果">
                {publishChecks.map((check, index) => <li key={index} className={check.level}><span aria-hidden="true">{check.level === "ok" ? "✓" : check.level === "warn" ? "!" : "×"}</span>{check.text}</li>)}
              </ul>
              <p>{hasBlockingCheck(publishChecks) ? "請先修正紅色項目，再重新發布。" : "黃色項目是建議，不會阻擋發布。發布後仍可繼續編輯下一版草稿。"}</p>
              {publishing ? <div className="publish-progress" role="progressbar" aria-label="發布中"><i /></div> : null}
              <div className="button-row end">
                <RetroButton disabled={publishing} onClick={() => setPublishPrompt(false)}>取消</RetroButton>
                <RetroButton className="primary" disabled={publishing || hasBlockingCheck(publishChecks)} onClick={confirmPublish}>{publishing ? "發布中…" : "確認發布"}</RetroButton>
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
              {publishSuccess.artifactStatus === "failed" ? <p role="alert">資料庫版本已發布，但 CDN 檔案同步失敗。公開網站仍可使用；你可以重試同步。</p> : <p>公開檔案已同步完成。</p>}
              <input className="share-url" readOnly value={publishSuccess.url} onFocus={(event) => event.currentTarget.select()} />
              <div className="button-row end">
                <RetroButton onClick={copyPublishedUrl}>複製網址</RetroButton>
                {publishSuccess.retryable ? <RetroButton onClick={async () => {
                  try {
                    const result = await api.retryPublish(siteId);
                    setPublishSuccess((current) => current ? { ...current, artifactStatus: result.artifactStatus, retryable: result.retryable } : current);
                  } catch (error) { setMessage(error instanceof Error ? error.message : "同步重試失敗"); }
                }}>重試同步</RetroButton> : null}
                <a className="retro-link" href={publishSuccess.url} target="_blank" rel="noreferrer">開啟網站</a>
                <RetroButton className="primary" onClick={() => setPublishSuccess(null)}>完成</RetroButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
    </AssetSourceProvider>
  );
}
