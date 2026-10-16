import { useEffect, useMemo, useRef, useState } from "react";
import { buildPublishChecks, CollectionEntityV2Schema, createProfile, deleteOrRetargetProfile, duplicateProfile, hasBlockingCheck, loadVersionedSiteDocument, normalizeDocument, parseSiteDocument, PostEntityV2Schema, ProfileEntityV2Schema, projectV2ToLegacyDocument, updateProfile, type DesktopWindow, type SiteDocumentV2Input } from "@retrodesk/shared";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type AssetRecord, type SiteRecord } from "../lib/api";
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
import { buildProfileDirectory } from "../features/modules/instagram/profileDirectory";
import { auditAssetReferences } from "../lib/asset-reference-audit";
import { collaborationActions } from "../lib/collaboration";
import { CollaborationDialog } from "../features/collaboration/CollaborationDialog";



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

export function EditorPage({ site }: { site: SiteRecord }) {
  const siteId = site.id;
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const store = useEditorStore();
  const saveInFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  // Transient invalid drafts (e.g. a field cleared mid-edit) pause autosave quietly instead of raising a popup.
  const [draftIssue, setDraftIssue] = useState<string | null>(null);
  const [publishPrompt, setPublishPrompt] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<{ version: number; url: string; artifactStatus: "synced" | "failed"; retryable: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [assetInventory, setAssetInventory] = useState<AssetRecord[]>([]);
  const [assetInventoryOpen, setAssetInventoryOpen] = useState(false);
  const [migratingAssets, setMigratingAssets] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const collaborationButtonRef = useRef<HTMLButtonElement | null>(null);
  const [versionedDraft, setVersionedDraft] = useState<SiteDocumentV2Input | null>(null);
  const versionedDraftRef = useRef<SiteDocumentV2Input | null>(null);
  versionedDraftRef.current = versionedDraft;
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
      site.published_version ?? null,
      site.access_role
    );
    // Set the canonical v2 state in the same transaction as the legacy render
    // adapter, so an autosave can never observe a stale v2 document after reload.
    setVersionedDraft(loadedDraft.version === 2 ? loadedDraft.document : null);
    store.setVersionedDocument(loadedDraft.version === 2 ? loadedDraft.document : null);
    if (loadedDraft.migrated) store.setSaveStatus("dirty");
  }

  function applyV2Document(next: SiteDocumentV2Input, historyKey?: string) {
    const projected = projectV2ToLegacyDocument(next);
    if (!projected.ok) { setMessage(projected.diagnostics[0]?.message ?? "角色引用無效"); return; }
    versionedDraftRef.current = next;
    setVersionedDraft(next);
    store.replaceDocument(projected.document, historyKey, next);
  }

  function updateContent(recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, historyKey?: string) {
    const current = versionedDraftRef.current;
    if (!current) return;
    applyV2Document(recipe(structuredClone(current)), historyKey);
  }

  function profileError(result: { ok: false; diagnostics: Array<{ message: string }> }) {
    setMessage(result.diagnostics[0]?.message ?? "角色資料無效");
  }

  function selectProfile(profileId: string, windowId?: string) {
    const current = versionedDraftRef.current;
    if (!current || !windowId) return;
    const next = structuredClone(current);
    const target = next.windows.find((window) => window.id === windowId);
    const profile = next.entities.profiles.find((item) => item.id === profileId && item.siteId === siteId);
    if (!target || target.type !== "instagram" || !profile) return;
    target.content.profileRef = { kind: "profile", id: profile.id, siteId: profile.siteId };
    applyV2Document(next);
  }

  function addProfile(windowId?: string) {
    const current = versionedDraftRef.current;
    if (!current || !windowId) return;
    const base = `oc-${current.entities.profiles.length + 1}`;
    const result = createProfile(current, { handle: base, displayName: "新角色", name: "新角色", bio: "" }, { siteId, id: `profile:${crypto.randomUUID()}` });
    if (!result.ok) return profileError(result);
    const target = result.document.windows.find((window) => window.id === windowId);
    if (target?.type === "instagram") target.content.profileRef = { kind: "profile", id: result.profile.id, siteId };
    applyV2Document(result.document);
  }

  function duplicateProfileForWindow(profileId: string, windowId?: string) {
    const current = versionedDraftRef.current;
    if (!current) return;
    const source = current.entities.profiles.find((profile) => profile.id === profileId);
    if (!source) return;
    const baseHandle = source.handle ?? source.username;
    const used = new Set(current.entities.profiles.map((profile) => (profile.handle ?? profile.username).toLowerCase()));
    let handle = `${baseHandle}-copy`;
    let suffix = 2;
    while (used.has(handle.toLowerCase())) handle = `${baseHandle}-copy-${suffix++}`;
    const result = duplicateProfile(current, profileId, { siteId, id: `profile:${crypto.randomUUID()}`, handle });
    if (!result.ok) return profileError(result);
    const target = windowId ? result.document.windows.find((window) => window.id === windowId) : undefined;
    if (target?.type === "instagram") target.content.profileRef = { kind: "profile", id: result.profile.id, siteId };
    applyV2Document(result.document);
  }

  function changeProfile(profileId: string, patch: Record<string, unknown>, historyKey?: string) {
    const current = versionedDraftRef.current;
    if (!current) return;
    const result = updateProfile(current, profileId, patch, { siteId });
    if (!result.ok) return profileError(result);
    applyV2Document(result.document, historyKey);
  }

  function deleteProfile(profileId: string, retargetProfileId?: string) {
    const current = versionedDraftRef.current;
    if (!current) return;
    const result = deleteOrRetargetProfile(current, profileId, { siteId, retargetProfileId: retargetProfileId || undefined });
    if (!result.ok) return profileError(result);
    applyV2Document(result.document);
  }

  useEffect(() => {
    try {
      applyLoadedSite(site);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    if (store.versionedDocument && !sameDocument(store.versionedDocument, versionedDraft)) {
      versionedDraftRef.current = store.versionedDocument;
      setVersionedDraft(store.versionedDocument);
    }
  }, [store.versionedDocument]);

  const refreshAssetInventory = () => api.listAssets(siteId).then(({ assets }) => {
    setAssetInventory(assets);
    return assets;
  });
  useEffect(() => { void refreshAssetInventory().catch(() => undefined); }, [siteId]);

  useEffect(() => {
    if (!store.document || store.saveStatus !== "dirty" || !store.siteId || saveInFlight.current || conflict) return;

    const timer = window.setTimeout(async () => {
      const legacyDocumentToSave = store.document!;
      const documentToSave = store.versionedDocument ?? versionedDraft ?? store.document!;
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
        // Release the in-flight guard before updating the store. If the user
        // edited while this request was pending, markSaved leaves the draft
        // dirty and the resulting render must be allowed to schedule the next
        // autosave immediately.
        saveInFlight.current = false;
        store.markSaved(result.version, legacyDocumentToSave);
      } catch (error) {
        saveInFlight.current = false;
        store.setSaveStatus("error");
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          navigate(`/auth?notice=${encodeURIComponent("你已失去這個桌面的編輯權限；草稿未再送出。")}`, { replace: true });
        } else if (error instanceof ApiError && error.code === "version_conflict") {
          setConflict(true);
          setMessage("偵測到另一個分頁或裝置有更新，已停止自動儲存以避免覆蓋。");
        } else {
          setMessage(error instanceof Error ? error.message : "儲存失敗");
        }
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [store.document, store.versionedDocument, versionedDraft, store.saveStatus, store.siteId, store.version, conflict]);

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
  const editorProfiles = versionedDraft?.entities.profiles.flatMap((profile) => { const parsed = ProfileEntityV2Schema.safeParse(profile); return parsed.success ? [parsed.data] : []; }) ?? [];
  const editorPosts = versionedDraft?.entities.posts.flatMap((post) => { const parsed = PostEntityV2Schema.safeParse(post); return parsed.success ? [parsed.data] : []; }) ?? [];
  const editorCollections = (versionedDraft?.entities.collections ?? []).flatMap((collection) => { const parsed = CollectionEntityV2Schema.safeParse(collection); return parsed.success ? [parsed.data] : []; });
  const selectedV2Window = selected ? versionedDraft?.windows.find((window) => window.id === selected.id) : undefined;
  const selectedProfileId = selectedV2Window?.type === "instagram" ? selectedV2Window.content.profileRef.id : undefined;
  const profileIdsByWindow = Object.fromEntries((versionedDraft?.windows ?? []).flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : []));
  const profileDirectory = versionedDraft ? buildProfileDirectory(versionedDraft, false) : [];
  const selectedProfileReferenced = !!selectedProfileId && !!versionedDraft && (
    versionedDraft.windows.some((window) => window.type === "instagram" ? window.content.profileRef.id === selectedProfileId : window.type === "music" ? window.content.tracks.some((track) => track.characterRef?.id === selectedProfileId) : false) ||
    versionedDraft.entities.posts.some((post) => post.authorProfileId === selectedProfileId)
  );
  const profileDeleteGuardById = Object.fromEntries(editorProfiles.map((profile) => [profile.id, {
    windowTitles: (versionedDraft?.windows ?? []).filter((window) => window.type === "instagram" ? window.content.profileRef.id === profile.id : window.type === "music" ? window.content.tracks.some((track) => track.characterRef?.id === profile.id) : false).map((window) => store.document?.windows.find((legacy) => legacy.id === window.id)?.title ?? window.id),
    postIds: (versionedDraft?.entities.posts ?? []).filter((post) => post.authorProfileId === profile.id).map((post) => post.id)
  }]));

  const hasUnpublishedChanges = useMemo(() => {
    if (!store.document) return false;
    if (!store.publishedDocument) return true;
    return !sameDocument(store.document, store.publishedDocument);
  }, [store.document, store.publishedDocument]);

  const legacyAssets = assetInventory.filter((asset) => asset.storageScope === "legacy_public");
  const pendingPublicCopyAssets = assetInventory.filter((asset) => asset.publicCopyRemaining);
  const assetAudits = useMemo(
    () => versionedDraft || store.document ? auditAssetReferences((versionedDraft ?? store.document)!, assetInventory) : [],
    [assetInventory, versionedDraft, store.document]
  );
  const migrationAudits = assetAudits.filter((entry) => entry.asset.storageScope === "legacy_public" || entry.asset.publicCopyRemaining);

  if (loadError) return <main className="not-found"><div><h1>無法開啟編輯器</h1><p>{loadError}</p></div></main>;
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
      if (site.access_role === "viewer") {
        navigate(`/auth?notice=${encodeURIComponent("你的權限已改為只能查看；請從桌面清單重新開啟私人草稿。")}`, { replace: true });
        return;
      }
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
        const documentToSave = store.versionedDocument ?? versionedDraftRef.current ?? store.document;
        const saved = await api.saveDraft(siteId, version, documentToSave);
        store.markSaved(saved.version, store.document);
        version = saved.version;
      }
      const result = await api.migrateLegacyAssets(siteId, version);
      const loaded = loadVersionedSiteDocument(result.document, { siteId, migrateV1: true });
      if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? "遷移後的草稿格式無效");
      const legacy = loadedLegacyDocument(loaded);
      const canonical = loaded.version === 2 ? loaded.document : null;
      store.setSite(store.siteId!, store.username, legacy, result.version, store.publishedDocument, store.publishedVersion, store.accessRole);
      versionedDraftRef.current = canonical;
      setVersionedDraft(canonical);
      store.setVersionedDocument(canonical);
      const refreshed = await refreshAssetInventory();
      const stillLegacy = refreshed.filter((asset) => asset.storageScope === "legacy_public");
      setMessage(stillLegacy.length
        ? `已遷移 ${result.migratedCount} 個，但仍有 ${stillLegacy.length} 個舊素材未完成；請開啟明細查看。`
        : result.cleanupWarnings.length
          ? `素材已轉為私有預覽；${result.cleanupWarnings.length} 個舊公開副本仍因已發布版本引用而暫時保留。`
          : `已將 ${result.migratedCount} 個舊素材轉為私有。`);
      if (stillLegacy.length || result.cleanupWarnings.length) setAssetInventoryOpen(true);
    } catch (error) {
      const assetId = error instanceof ApiError && error.details && typeof error.details === "object" && "assetId" in error.details ? String((error.details as { assetId: unknown }).assetId) : "";
      const asset = assetInventory.find((item) => item.id === assetId);
      setMessage(`${error instanceof Error ? error.message : "素材遷移失敗"}${asset ? `（${asset.name || asset.id}）` : ""}`);
      setAssetInventoryOpen(true);
    }
    finally { setMigratingAssets(false); }
  }

  async function deleteUnusedAsset(asset: AssetRecord) {
    if (deletingAssetId || !window.confirm(`確定刪除素材「${asset.name || asset.id}」？刪除後無法復原。`)) return;
    setDeletingAssetId(asset.id);
    try {
      await api.deleteAsset(siteId, asset.id);
      await refreshAssetInventory();
      setMessage(`已刪除未使用素材「${asset.name || asset.id}」。`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setMessage(code === "asset_public_copy_pending"
        ? "這個素材仍有已發布的舊公開副本；請先重新發布，再刪除。"
        : error instanceof Error ? error.message : "刪除素材失敗");
    } finally {
      setDeletingAssetId(null);
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
  const actions = collaborationActions(store.accessRole);
  function closeCollaboration() {
    setCollaborationOpen(false);
    window.requestAnimationFrame(() => collaborationButtonRef.current?.focus());
  }

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
        {store.accessRole === "editor" ? <span className="collaboration-role-note" title="只有桌面擁有者可以發布與管理協作者">編輯者 · 只有擁有者可以發布</span> : null}
        <div className="top-spacer" />
        <div role="group" aria-label="裝置" className="device-toggle mobile-hide">
          <button type="button" aria-pressed={store.device === "desktop"} className={"w98-btn" + (store.device === "desktop" ? " on" : "")} onClick={() => store.setDevice("desktop")}>桌面版</button>
          <button type="button" aria-pressed={store.device === "mobile"} className={"w98-btn" + (store.device === "mobile" ? " on" : "")} onClick={() => { store.setLayoutMode(false); store.setDevice("mobile"); }}>手機版</button>
        </div>
        <RetroButton onClick={() => setPreview(true)}>▶ 訪客預覽</RetroButton>
        {actions.manageMembers ? <RetroButton ref={collaborationButtonRef} onClick={() => setCollaborationOpen(true)}>協作者</RetroButton> : null}
        {store.publishedDocument ? <a className="w98-btn mobile-hide" href={"/@" + store.username} target="_blank" rel="noreferrer">開啟已發布網站</a> : null}
        {actions.publish ? <RetroButton className="primary" onClick={requestPublish} disabled={publishing || (!!store.publishedDocument && !hasUnpublishedChanges)}>
          {store.publishedDocument ? "重新發布" : "發布"}
        </RetroButton> : null}
        <RetroButton className="mobile-hide" onClick={async () => { await signOut(); navigate("/"); }}>登出</RetroButton>
      </header>

      {message ? (
        <div className="editor-message" role="alert">
          <span>{message}</span>
          {store.saveStatus === "error" && !conflict ? <button onClick={store.retrySave}>重試儲存</button> : null}
          <button aria-label="關閉通知" onClick={() => setMessage("")}>×</button>
        </div>
      ) : null}

      {legacyAssets.length > 0 || pendingPublicCopyAssets.length > 0 ? <div className="editor-message asset-migration-message" role="status">
        <div className="asset-migration-summary">
          <span>{legacyAssets.length > 0 ? `有 ${legacyAssets.length} 個舊素材仍是公開網址。` : `${pendingPublicCopyAssets.length} 個舊公開副本因已發布版本仍在使用，暫時保留。`}</span>
          {legacyAssets.length > 0 ? <span className="asset-migration-names" aria-label="尚未轉為私有的素材">
            {legacyAssets.map((asset) => <code key={asset.id} title={asset.id}>{asset.name || asset.id.slice(0, 8)}</code>)}
          </span> : null}
        </div>
        <button type="button" onClick={() => setAssetInventoryOpen(true)}>查看是哪幾個</button>
        {legacyAssets.length > 0 && actions.migrateAssets ? <button disabled={migratingAssets || store.saveStatus === "saving" || store.saveStatus === "error" || conflict} onClick={migrateLegacyAssets}>{migratingAssets ? "遷移中…" : "轉為私有素材"}</button> : null}
      </div> : null}

      {assetInventoryOpen ? <div className="modal-backdrop" role="presentation">
        <section className="retro-panel editor-dialog asset-inventory-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-inventory-title">
          <header className="landing-titlebar" id="asset-inventory-title">舊素材遷移明細</header>
          <div className="dialog-body">
            <p>這裡會列出素材名稱、目前狀態，以及草稿中正在使用它的位置。未被草稿引用的素材也會明確標示。</p>
            {migrationAudits.length ? <ul className="asset-inventory-list">
              {migrationAudits.map(({ asset, references }) => <li key={asset.id}>
                <div className="asset-inventory-heading"><strong>{asset.name || "未命名素材"}</strong><code>{asset.id}</code></div>
                <span className={`asset-status ${asset.storageScope === "legacy_public" ? "needs-migration" : "pending-cleanup"}`}>{asset.storageScope === "legacy_public" ? "尚未轉為私有" : "私有預覽已完成，舊公開副本待清理"}</span>
                <div className="asset-reference-list">{references.length ? <>使用位置：{references.map((reference) => reference.label).join("、")}</> : "草稿中沒有引用（可考慮刪除）"}</div>
                <div className="asset-source-url"><span>目前網址：</span><code>{asset.url}</code></div>
                {!references.length ? <div className="button-row end asset-item-actions">
                  <RetroButton className="danger" disabled={deletingAssetId === asset.id || !!asset.publicCopyRemaining} onClick={() => void deleteUnusedAsset(asset)}>
                    {deletingAssetId === asset.id ? "刪除中…" : asset.publicCopyRemaining ? "重新發布後可刪除" : "刪除未使用素材"}
                  </RetroButton>
                </div> : <p className="asset-delete-hint">仍在使用中；請先從上列位置移除或替換圖片。</p>}
              </li>)}
            </ul> : <p role="status">目前沒有需要遷移或清理的舊素材。</p>}
            <div className="button-row end">
              <RetroButton onClick={() => void refreshAssetInventory().catch((error) => setMessage(error instanceof Error ? error.message : "無法重新盤點素材"))}>重新盤點</RetroButton>
              {legacyAssets.length && actions.migrateAssets ? <RetroButton className="primary" disabled={migratingAssets || store.saveStatus === "saving" || store.saveStatus === "error" || conflict} onClick={migrateLegacyAssets}>{migratingAssets ? "遷移中…" : `轉為私有（${legacyAssets.length}）`}</RetroButton> : null}
              <RetroButton onClick={() => setAssetInventoryOpen(false)}>關閉</RetroButton>
            </div>
          </div>
        </section>
      </div> : null}

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
            <DesktopCanvas
              siteId={siteId}
              upload={uploadImage}
              profiles={editorProfiles}
              posts={editorPosts}
              collections={editorCollections}
              profileId={selectedProfileId}
              profileIdsByWindow={profileIdsByWindow}
              onProfileSelect={selectProfile}
              onProfileAdd={addProfile}
              onProfileDuplicate={duplicateProfileForWindow}
              onProfileChange={changeProfile}
              onProfileDelete={deleteProfile}
              profileDeleteBlocked={selectedProfileReferenced}
              profileDeleteGuardById={profileDeleteGuardById}
              profileDirectory={profileDirectory}
              updateContent={updateContent}
              socialDocument={versionedDraft ?? undefined}
            />
          ) : (
            <MobileScreen document={store.document} mode="editor" framed siteId={siteId} upload={uploadImage} onPreview={() => setPreview(true)} profiles={editorProfiles} posts={editorPosts} collections={editorCollections} profileIdsByWindow={profileIdsByWindow} onProfileSelect={selectProfile} onProfileAdd={addProfile} onProfileDuplicate={duplicateProfileForWindow} onProfileChange={changeProfile} onProfileDelete={deleteProfile} profileDeleteBlocked={selectedProfileReferenced} profileDeleteGuardById={profileDeleteGuardById} profileDirectory={profileDirectory} updateContent={updateContent} socialDocument={versionedDraft ?? undefined} />
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
      {collaborationOpen ? <CollaborationDialog siteId={siteId} onClose={closeCollaboration} /> : null}

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
