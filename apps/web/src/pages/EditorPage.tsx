import { ImageWriteProvider } from "../features/editor/ImageWriteContext";
import { AppearanceWriteProvider } from "../features/editor/AppearanceWriteContext";
import { DocumentUpgradeRecovery } from "../features/editor/DocumentUpgradeRecovery";
import type { AppearanceApiLoad } from "../lib/appearanceCompatibility";
import { useEffect, useMemo, useRef, useState } from "react";
import { trustedPublicAssetBaseUrls } from "../lib/publicAssets";
import { translateSystemMessage } from "../i18n/systemMessages";
import { translateError } from "../i18n/errors";
import { i18n } from "../i18n";
import { buildPublishChecks, CollectionEntityV2Schema, createProfile, deleteOrRetargetProfile, duplicateProfile, hasBlockingCheck, hasUnpublishedChanges as hasUnpublishedDraftChanges, loadVersionedSiteDocument, normalizeDocument, parseSiteDocument, PostEntityV2Schema, ProfileEntityV2Schema, projectV2ToLegacyDocument, updateProfile, type DesktopWindow, type SiteDocumentV2Input } from "@retrodesk/shared";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, API_URL, ApiError, type AssetRecord, type SiteRecord } from "../lib/api";
import { useEditorStore } from "../features/editor/store";
import { DesktopCanvas } from "../features/editor/DesktopCanvas";
import { MobileScreen } from "../features/site/MobileScreen";
import { LeftPanel } from "../features/editor/LeftPanel";
import { RightPanel } from "../features/editor/RightPanel";
import { buildPreviewModel, shareableEntities } from "../features/editor/previewModel";
import { HelpMenu } from "../features/help/HelpMenu";
import { VisitorPreview } from "../features/editor/VisitorPreview";
import { publicSiteLabel, publicSiteUrl } from "../lib/publicSiteUrl";
import { Icon } from "../components/Icon";
import { RetroButton } from "../components/RetroButton";
import { ModalDialog } from "../components/ModalDialog";
import { useAuth } from "../app/AuthProvider";
import { AssetSourceProvider } from "../lib/assetSource";
import { buildProfileDirectory } from "../features/modules/instagram/profileDirectory";
import { auditAssetReferences } from "../lib/asset-reference-audit";
import { collaborationActions } from "../lib/collaboration";
import { CollaborationDialog } from "../features/collaboration/CollaborationDialog";
import { SidebarToggle } from "../features/editor/SidebarToggle";
import { TransferDialog } from "../features/transfer/TransferDialog";
import { EditorMediaProvider } from "../features/media/editorMedia";
import { IntegrityDialog } from "../features/editor/IntegrityDialog";
import { stopAllMedia } from "../features/modules/music/mediaSession";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useLocaleFormatting } from "../i18n/format";
import { PaintEditorEntry } from "../features/paint/PaintEditorEntry";
import { useEditorLeaveGuard, useEditorSaveSession } from "../features/editor/editorSession";
import { useIgHasPendingDrafts } from "../features/modules/instagram/useIgSessionValue";



function validationMessage(document: unknown) {
  const parsed = parseSiteDocument(document);
  if (parsed.ok) return null;
  const first = parsed.code === "invalid" ? parsed.diagnostics[0] : { path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}` };
  const path = first?.path.length ? first.path.join(" → ") + "：" : "";
  return i18n.t("editor:editor.pleaseFixTheContentFormat") + (first ? " " + path + first.message : "");
}

const sameDocument = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function loadedLegacyDocument(loaded: ReturnType<typeof loadVersionedSiteDocument>) {
  if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? i18n.t("editor:editor.theDocumentFormatIsInvalid"));
  if (loaded.version === 1) return normalizeDocument(loaded.document);
  const legacy = projectV2ToLegacyDocument(loaded.document);
  if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? i18n.t("editor:editor.invalidCharacterReference"));
  return legacy.document;
}

const SIDEBAR_PREFERENCES_KEY = "retrodesk:editor-sidebars";

type SidebarPreferences = { leftExpanded: boolean; rightExpanded: boolean };
type ErrorFallback = "editor.saveFailed" | "editor.publishingFailed" | "editor.anUpdateFromAnotherTab" |
  "editor.reloadFailed" | "page.assetMigrationFailed" | "editor.failedToDeleteTheAsset" |
  "editor.thisAssetStillHasA" | "editor.couldntReScanAssets" | "editor.syncRetryFailed";
type EditorMessage = string | { code?: string; fallback: ErrorFallback; assetName?: string };

function loadSidebarPreferences(): SidebarPreferences {
  const fallback = { leftExpanded: true, rightExpanded: true };
  try {
    const raw = window.localStorage.getItem(SIDEBAR_PREFERENCES_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<SidebarPreferences>;
    return {
      leftExpanded: typeof value.leftExpanded === "boolean" ? value.leftExpanded : true,
      rightExpanded: typeof value.rightExpanded === "boolean" ? value.rightExpanded : true
    };
  } catch {
    return fallback;
  }
}

export function EditorPage({ site }: { site: SiteRecord }) {
  const { t } = useTranslation("editor");
  const { t: errorT } = useTranslation("errors");
  const { t: common } = useTranslation("common");
  const { formatNumber, formatList, fontFamily } = useLocaleFormatting();
  const siteId = site.id;
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const store = useEditorStore();
  const hasPendingIgDrafts = useIgHasPendingDrafts();
  const captureSaveSession = useEditorSaveSession(siteId);
  const leaveGuard = useEditorLeaveGuard(siteId);
  const saveInFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<EditorMessage>("");
  const [conflict, setConflict] = useState(false);
  // Dismissing recovery must not resume autosave against a conflicting version.
  const [conflictRecoveryOpen, setConflictRecoveryOpen] = useState(false);
  const upgradePaused = useRef(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [upgradeRecoveryOpen, setUpgradeRecoveryOpen] = useState(false);
  const [appearanceLoad, setAppearanceLoad] = useState<AppearanceApiLoad | null>(null);

  function stopForUpgrade(error: unknown): boolean {
    if (!(error instanceof ApiError) || (error.status !== 426 && error.code !== "client_upgrade_required")) return false;
    upgradePaused.current = true;
    setUpgradeRequired(true); setUpgradeRecoveryOpen(true); setAppearanceLoad(null);
    setConflict(false); setMessage("");
    setPublishPrompt(false);
    setPublishSuccess(null);
    setAssetInventoryOpen(false);
    store.setSaveStatus("error");
    return true;
  }
  // IME composition in progress anywhere on the page: autosave waits so a half-composed fragment is never written.
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    const start = () => setComposing(true);
    const end = () => setComposing(false);
    document.addEventListener("compositionstart", start, true);
    document.addEventListener("compositionend", end, true);
    return () => { document.removeEventListener("compositionstart", start, true); document.removeEventListener("compositionend", end, true); };
  }, []);
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
  const [transferOpen, setTransferOpen] = useState(false);
  const [sidebarPreferences, setSidebarPreferences] = useState(loadSidebarPreferences);
  const collaborationButtonRef = useRef<HTMLButtonElement | null>(null);
  const [versionedDraft, setVersionedDraft] = useState<SiteDocumentV2Input | null>(null);
  const versionedDraftRef = useRef<SiteDocumentV2Input | null>(null);
  versionedDraftRef.current = versionedDraft;
  const publishChecks = useMemo(() => store.document ? buildPublishChecks(store.document) : [], [store.document]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCES_KEY, JSON.stringify(sidebarPreferences));
    } catch {
      // Editor layout preferences are optional; storage failures must not block editing.
    }
  }, [sidebarPreferences]);

  function applyLoadedSite(site: SiteRecord) {
    const loadedDraft = loadVersionedSiteDocument(site.draft_document, { siteId: site.id, migrateV1: true });
    if (!loadedDraft.ok) throw new Error(loadedDraft.diagnostics[0]?.message ?? t("editor.theDraftFormatIsInvalid"));
    const loadedPublished = site.published_document ? loadVersionedSiteDocument(site.published_document, { siteId: site.id }) : null;
    if (loadedPublished && !loadedPublished.ok) throw new Error(loadedPublished.diagnostics[0]?.message ?? t("editor.thePublishedVersionsFormatIs"));
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
    store.setPublishedRaw(site.published_document ?? null);
    setAppearanceLoad({ siteId: site.id, apiOrigin: site.clientApiOrigin ?? "", writeCompatibility: site.writeCompatibility });
    if (loadedDraft.migrated) store.setSaveStatus("dirty");
  }

  function applyV2Document(next: SiteDocumentV2Input, historyKey?: string) {
    const projected = projectV2ToLegacyDocument(next);
    if (!projected.ok) { setMessage(projected.diagnostics[0]?.message ?? t("editor.invalidCharacterReference")); return; }
    versionedDraftRef.current = next;
    setVersionedDraft(next);
    store.replaceDocument(projected.document, historyKey, next);
    // An edit that would orphan Explorer shortcuts waits for confirmation; keep the draft in step with the store.
    const held = useEditorStore.getState();
    if (held.pendingIntegrity && held.versionedDocument) {
      versionedDraftRef.current = held.versionedDocument;
      setVersionedDraft(held.versionedDocument);
    }
  }

  function updateContent(recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, historyKey?: string) {
    const current = versionedDraftRef.current;
    if (!current) return;
    applyV2Document(recipe(structuredClone(current)), historyKey);
  }

  function profileError(result: { ok: false; diagnostics: Array<{ message: string }> }) {
    setMessage(translateSystemMessage(result.diagnostics[0]?.message ?? "") || t("editor.invalidCharacterData"));
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
    const result = createProfile(current, { handle: base, displayName: t("editor.newCharacter"), name: t("editor.newCharacter"), bio: "" }, { siteId, id: `profile:${crypto.randomUUID()}` });
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
      setLoadError(error instanceof Error ? error.message : t("editor.failedToLoad"));
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
    if (upgradePaused.current || !store.document || store.saveStatus !== "dirty" || store.siteId !== siteId || saveInFlight.current || conflict || composing) return;
    const isCurrentSession = captureSaveSession();

    const timer = window.setTimeout(async () => {
      if (upgradePaused.current || !isCurrentSession()) return;
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
        if (!isCurrentSession()) return;
        if (!upgradePaused.current) {
          store.markSaved(result.version, legacyDocumentToSave);
          setMessage(current => typeof current === "object" && current.fallback === "editor.saveFailed" ? "" : current);
        }
      } catch (error) {
        saveInFlight.current = false;
        if (!isCurrentSession()) return;
        store.setSaveStatus("error");
        if (stopForUpgrade(error)) return;
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          void leaveGuard.leaveAfterAccessLoss(() => navigate(`/auth?notice=${encodeURIComponent(t("page.lostEditAccess"))}`, { replace: true }));
        } else if (error instanceof ApiError && error.code === "version_conflict") {
          setConflict(true);
          setConflictRecoveryOpen(true);
          setMessage({ fallback: "editor.anUpdateFromAnotherTab" });
        } else {
          setMessage({ code: error instanceof ApiError ? error.code : undefined, fallback: "editor.saveFailed" });
        }
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [store.document, store.versionedDocument, versionedDraft, store.saveStatus, store.siteId, store.version, conflict, composing, upgradeRequired, siteId, captureSaveSession]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      // A modal can focus its own buttons while the editor behind it is inert.
      // Do not let window-level shortcuts mutate that background document.
      if (document.getElementById("root")?.hasAttribute("inert")) return;
      // Dialogs that render inside #root cannot make it inert; any open modal still owns the keyboard.
      if (document.querySelector('[aria-modal="true"]')) return;
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
    return hasUnpublishedDraftChanges({ siteId, assets: { username: store.username, trustedAssetBaseUrls: trustedPublicAssetBaseUrls() }, draftLegacy: store.document, publishedLegacy: store.publishedDocument, draftCanonical: store.versionedDocument, publishedRaw: store.publishedRaw });
  }, [siteId, store.username, store.document, store.publishedDocument, store.versionedDocument, store.publishedRaw]);

  // Preview data. Built only while a preview is open, from the same canonical snapshot the editor holds; read-only.
  const previewModels = useMemo(() => {
    if (!preview || !store.document) return null;
    const raw = store.versionedDocument ?? store.document;
    return {
      draft: buildPreviewModel("draft", raw, siteId),
      publishable: buildPreviewModel("publishable", raw, siteId),
      shareable: shareableEntities(store.publishedRaw, siteId)
    };
  }, [preview]);

  const legacyAssets = assetInventory.filter((asset) => asset.storageScope === "legacy_public");
  const pendingPublicCopyAssets = assetInventory.filter((asset) => asset.publicCopyRemaining);
  const assetAudits = useMemo(
    () => versionedDraft || store.document ? auditAssetReferences((versionedDraft ?? store.document)!, assetInventory) : [],
    [assetInventory, versionedDraft, store.document]
  );
  const migrationAudits = assetAudits.filter((entry) => entry.asset.storageScope === "legacy_public" || entry.asset.publicCopyRemaining);

  if (loadError) return <main className="not-found" style={{ fontFamily }}><div><h1 style={{ fontFamily }}>{t("shell.loadingError")}</h1><p>{loadError}</p><LanguageSwitcher /></div></main>;
  if (loading || !store.document) return <><div className="boot-screen" style={{ fontFamily }}>{common("app.loading")}</div>{leaveGuard.prompt}</>;

  async function uploadImage(file: File, kind: "image" | "icon" | "audio" = "image"): Promise<string | null> {
    const audio = kind === "audio";
    const allowed = audio ? ["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"] : ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setMessage(audio ? t("editor.cantUploadChooseAnMp3") : t("editor.cantUploadChooseAJpg"));
      return null;
    }
    if (file.size > (audio ? 16 : 8) * 1024 * 1024) {
      setMessage(audio ? t("editor.fileTooLargeEachTrack") : t("editor.fileTooLargeEachImage"));
      return null;
    }
    try {
      const { asset } = await api.uploadAsset(siteId, file, { kind, name: file.name.replace(/\.[^.]+$/, "") });
      return asset.url;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setMessage(code === "site_audio_quota_exceeded"
        ? t("editor.audioStorageIsFullEach")
        : code === "unsupported_media" || code === "invalid_image_bytes" || code === "invalid_audio_bytes"
        ? audio ? t("editor.cantUploadChooseAValid") : t("editor.cantUploadChooseAJpg")
        : code === "file_too_large"
          ? audio ? t("editor.fileTooLargeEachTrack") : t("editor.fileTooLargeEachImage")
          : t("editor.uploadFailedPleaseTryAgain"));
      return null;
    }
  }

  function requestPublish() {
    if (conflict) { setConflictRecoveryOpen(true); return; }
    if (store.themePreview) { setMessage(t("imageInput.previewPending")); return; }
    if (upgradePaused.current) { setUpgradeRecoveryOpen(true); return; }
    const invalid = validationMessage(store.document);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    if (store.saveStatus === "dirty" || store.saveStatus === "saving") {
      setMessage(t("editor.pleaseWaitForTheDraft"));
      return;
    }
    if (store.saveStatus === "error") {
      setMessage(t("editor.theDraftHasASave"));
      return;
    }
    setPublishPrompt(true);
  }

  async function confirmPublish() {
    if (useEditorStore.getState().themePreview) { setPublishPrompt(false); setMessage(t("imageInput.previewPending")); return; }
    if (upgradePaused.current) { setUpgradeRecoveryOpen(true); return; }
    const isCurrentSession = captureSaveSession();
    setPublishing(true);
    setMessage("");
    try {
      const result = await api.publish(siteId, store.version);
      if (!isCurrentSession() || upgradePaused.current) return;
      const absoluteUrl = new URL(result.url, window.location.origin).toString();
      store.markPublished(result.publishedVersion);
      setPublishPrompt(false);
      setPublishSuccess({ version: result.publishedVersion, url: absoluteUrl, artifactStatus: result.artifactStatus, retryable: result.retryable });
      await refreshAssetInventory();
    } catch (error) {
      if (!isCurrentSession()) return;
      if (stopForUpgrade(error)) return;
      if (error instanceof ApiError && error.code === "version_conflict") {
        setPublishPrompt(false);
        setConflict(true);
        setConflictRecoveryOpen(true);
      }
      setMessage({ code: error instanceof ApiError ? error.code : undefined, fallback: "editor.publishingFailed" });
    } finally {
      if (isCurrentSession()) setPublishing(false);
    }
  }

  async function reloadRemote() {
    const isCurrentSession = captureSaveSession();
    setLoading(true);
    try {
      const { site } = await api.getSite(siteId);
      if (!isCurrentSession()) return;
      if (site.access_role === "viewer") {
        void leaveGuard.leaveAfterAccessLoss(() => navigate(`/auth?notice=${encodeURIComponent(t("page.nowViewOnly"))}`, { replace: true }));
        return;
      }
      applyLoadedSite(site);
      setConflict(false);
      setMessage(t("editor.reloadedTheLatestCloudDraft"));
    } catch (error) {
      if (!isCurrentSession()) return;
      setMessage({ code: error instanceof ApiError ? error.code : undefined, fallback: "editor.reloadFailed" });
    } finally {
      if (isCurrentSession()) setLoading(false);
    }
  }

  async function copyLocalJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(store.versionedDocument ?? versionedDraft ?? store.document, null, 2));
      setMessage(t("editor.theCurrentLocalDraftJson"));
    } catch {
      setMessage(t("editor.theClipboardIsntAvailablePlease"));
    }
  }

  async function copyPublishedUrl() {
    if (!publishSuccess) return;
    try {
      await navigator.clipboard.writeText(publishSuccess.url);
      setMessage(t("editor.publicUrlCopied"));
    } catch {
      setMessage(t("editor.couldntCopyTheUrlAutomatically"));
    }
  }

  async function migrateLegacyAssets() {
    if (upgradePaused.current) { setUpgradeRecoveryOpen(true); return; }
    if (!store.document || migratingAssets) return;
    const isCurrentSession = captureSaveSession();
    setMigratingAssets(true);
    try {
      let version = store.version;
      if (store.saveStatus === "dirty") {
        const documentToSave = store.versionedDocument ?? versionedDraftRef.current ?? store.document;
        const saved = await api.saveDraft(siteId, version, documentToSave);
        // Another request may have paused this editor while the save was pending.
        if (upgradePaused.current || !isCurrentSession()) return;
        store.markSaved(saved.version, store.document);
        version = saved.version;
      }
      if (upgradePaused.current || !isCurrentSession()) return;
      const result = await api.migrateLegacyAssets(siteId, version);
      // A late migration response must never replace the retained local draft.
      if (upgradePaused.current || !isCurrentSession()) return;
      const loaded = loadVersionedSiteDocument(result.document, { siteId, migrateV1: true });
      if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? t("editor.theMigratedDraftsFormatIs"));
      const legacy = loadedLegacyDocument(loaded);
      const canonical = loaded.version === 2 ? loaded.document : null;
      store.setSite(store.siteId!, store.username, legacy, result.version, store.publishedDocument, store.publishedVersion, store.accessRole);
      versionedDraftRef.current = canonical;
      setVersionedDraft(canonical);
      store.setVersionedDocument(canonical);
      const refreshed = await refreshAssetInventory();
      if (upgradePaused.current || !isCurrentSession()) return;
      const stillLegacy = refreshed.filter((asset) => asset.storageScope === "legacy_public");
      setMessage(stillLegacy.length
        ? t("editor.migratedButLegacyAssetsAre", { migratedCount: result.migratedCount, length: stillLegacy.length })
        : result.cleanupWarnings.length
          ? t("editor.assetsWereConvertedToPrivate", { length: result.cleanupWarnings.length })
          : t("editor.convertedLegacyAssetsToPrivate", { migratedCount: result.migratedCount }));
      if (stillLegacy.length || result.cleanupWarnings.length) setAssetInventoryOpen(true);
    } catch (error) {
      if (!isCurrentSession() || stopForUpgrade(error) || upgradePaused.current) return;
      const assetId = error instanceof ApiError && error.details && typeof error.details === "object" && "assetId" in error.details ? String((error.details as { assetId: unknown }).assetId) : "";
      const asset = assetInventory.find((item) => item.id === assetId);
      setMessage({ code: error instanceof ApiError ? error.code : undefined, fallback: "page.assetMigrationFailed", assetName: asset ? asset.name || asset.id : undefined });
      setAssetInventoryOpen(true);
    }
    finally { setMigratingAssets(false); }
  }

  async function deleteUnusedAsset(asset: AssetRecord) {
    if (deletingAssetId || !window.confirm(t("editor.deleteTheAssetThisCant", { v1: asset.name || asset.id }))) return;
    setDeletingAssetId(asset.id);
    try {
      await api.deleteAsset(siteId, asset.id);
      await refreshAssetInventory();
      setMessage(t("editor.deletedTheUnusedAsset", { v1: asset.name || asset.id }));
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setMessage(code === "asset_public_copy_pending"
        ? { fallback: "editor.thisAssetStillHasA" }
        : { code: error instanceof ApiError ? error.code : undefined, fallback: "editor.failedToDeleteTheAsset" });
    } finally {
      setDeletingAssetId(null);
    }
  }

  function updateSelected(recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) {
    if (selected) store.updateWindow(selected.id, recipe, historyKey);
  }

  const publishState = !store.publishedDocument
    ? t("editor.notPublished")
    : hasUnpublishedChanges
      ? t("editor.hasUnpublishedChanges")
      : t("editor.publishedAndInSync");
  const badge = !store.publishedDocument
    ? { text: t("shell.unpublished"), bg: "#ffffe1", color: "#7a5b00" }
    : hasUnpublishedChanges
      ? { text: t("shell.unpublishedChanges"), bg: "#fff0e0", color: "#b35c00" }
      : { text: t("shell.published", { version: store.publishedVersion == null ? "" : formatNumber(store.publishedVersion) }), bg: "#e6f4ee", color: "#1f7a5c" };
  const savedWithPendingIgInput = store.saveStatus === "saved" && hasPendingIgDrafts;
  const saveText = store.saveStatus === "error" ? t("shell.saveFailed")
    : composing || savedWithPendingIgInput || (draftIssue && store.saveStatus === "dirty") ? t("shell.saveIncomplete")
      : store.saveStatus === "saving" ? t("shell.saving")
        : store.saveStatus === "dirty" ? t("shell.unsaved")
          : t("shell.saved");

  const layoutMode = store.layoutMode && store.device === "desktop";
  const actions = collaborationActions(store.accessRole);
  function closeCollaboration() {
    setCollaborationOpen(false);
    window.requestAnimationFrame(() => collaborationButtonRef.current?.focus());
  }

  return (
    <ImageWriteProvider siteId={siteId} apiOrigin={API_URL} load={appearanceLoad} blocked={upgradeRequired}>
    <AppearanceWriteProvider siteId={siteId} apiOrigin={API_URL} load={appearanceLoad} blocked={upgradeRequired}>
    <AssetSourceProvider siteId={siteId}>
    <EditorMediaProvider key={siteId} siteId={siteId}>
    <main className="editor-app">
      <header className="editor-topbar" style={{ height: "auto", minHeight: 46, flexWrap: "wrap", overflow: "visible", paddingBlock: 6, fontFamily }}>
        <Link to="/auth" className="brand" title={t("shell.backToDesktops")} style={{ fontFamily, flex: "0 0 auto" }}><Icon name="computer" size={22} />Retro Desktop</Link>
        <LanguageSwitcher compact />
        <span className="w98-vsep mobile-hide" />
        <div className="topbar-meta">
          <span className="site-url">{publicSiteLabel(store.username)}</span>
          <span className="status-badge" title={badge.text} style={{ background: badge.bg, color: badge.color, borderColor: badge.color }}>{badge.text}</span>
        </div>
        <span className="w98-vsep mobile-hide" />
        <div className="editor-history-controls">
          <RetroButton disabled={store.past.length === 0} onClick={store.undo} aria-label={t("shell.undo")} title={t("shell.undoTitle")}>↶ {t("shell.undo")}</RetroButton>
          <RetroButton disabled={store.future.length === 0} onClick={store.redo} aria-label={t("shell.redo")} title={t("shell.redoTitle")}>↷ {t("shell.redo")}</RetroButton>
          <span className={"save-text " + ((composing || savedWithPendingIgInput) && store.saveStatus !== "error" ? "dirty" : store.saveStatus)} title={draftIssue ?? undefined} role="status" aria-atomic="true">{saveText}</span>
          {store.saveStatus === "error" && !conflict && !upgradeRequired ? <RetroButton onClick={() => { setMessage(""); store.retrySave(); }}>{t("shell.retrySave")}</RetroButton> : null}
        </div>
        {store.accessRole === "editor" ? <span className="collaboration-role-note" title={t("shell.roleHint")}>{t("shell.roleNote")}</span> : null}
        <div className="top-spacer" />
        <div role="group" aria-label={t("shell.device")} className="device-toggle mobile-hide">
          <button type="button" aria-pressed={store.device === "desktop"} className={"w98-btn" + (store.device === "desktop" ? " on" : "")} onClick={() => store.setDevice("desktop")}>{t("shell.desktop")}</button>
          <button type="button" aria-pressed={store.device === "mobile"} className={"w98-btn" + (store.device === "mobile" ? " on" : "")} onClick={() => { store.setLayoutMode(false); store.setDevice("mobile"); }}>{t("shell.mobile")}</button>
        </div>
        <RetroButton data-help="preview" onClick={() => { stopAllMedia(); setPreview(true); }}>▶ {t("shell.preview")}</RetroButton>
        <PaintEditorEntry key={siteId} siteId={siteId} disabled={upgradeRequired || !actions.uploadAssets} />
        {actions.manageMembers ? <RetroButton ref={collaborationButtonRef} onClick={() => setCollaborationOpen(true)}>{t("shell.collaborators")}</RetroButton> : null}
        {actions.manageMembers ? <RetroButton onClick={() => setTransferOpen(true)}>{t("shell.transfer")}</RetroButton> : null}
        {store.publishedDocument ? <a className="w98-btn mobile-hide" href={publicSiteUrl(store.username)} target="_blank" rel="noreferrer">{t("shell.openPublished")}</a> : null}
        {actions.publish ? <RetroButton className="primary" data-help="publish" onClick={requestPublish} disabled={upgradeRequired || publishing || (!!store.publishedDocument && !hasUnpublishedChanges)}>
          {t(store.publishedDocument ? "shell.republish" : "shell.publish")}
        </RetroButton> : null}
        <HelpMenu />
        <Link className="retro-link mobile-hide" to="/">{t("shell.home")}</Link>
        <RetroButton className="mobile-hide" onClick={() => leaveGuard.requestLeave(async () => { await signOut(); await navigate("/"); })}>{t("shell.signOut")}</RetroButton>
      </header>

      {store.themePreview ? <div className="theme-preview-notice" role="status"><span>{t("imageInput.previewPending")}</span><button type="button" className="w98-btn primary" onClick={() => store.themePreview && store.setTheme(store.themePreview)}>{t("imageInput.applyDraft")}</button><button type="button" className="w98-btn" onClick={() => store.setThemePreview(null)}>{t("themeAppearanceEditor.cancelPreview")}</button></div> : null}

      {message ? (
        <div className="editor-message" role="alert">
          <span>{typeof message === "string" ? message : <>{translateError(message, errorT, t(message.fallback))}{message.assetName ? t("page.assetSuffix", { name: message.assetName }) : null}</>}</span>
          <button aria-label={t("shell.closeNotice")} onClick={() => setMessage("")}>×</button>
        </div>
      ) : null}

      {upgradeRequired ? <div className="editor-message" role="status"><span>{t("documentCompatibility.paused")}</span><button onClick={() => setUpgradeRecoveryOpen(true)}>{t("documentCompatibility.title")}</button></div> : null}
      {conflict ? <div className="editor-message conflict-notice" role="status"><span>{t("editor.anUpdateFromAnotherTab")}</span><RetroButton className="conflict-reopen" onClick={() => setConflictRecoveryOpen(true)}>{t("editor.versionConflict")}</RetroButton></div> : null}
      {upgradeRequired && upgradeRecoveryOpen && store.document ? <DocumentUpgradeRecovery key={siteId} siteId={siteId} localDocument={store.versionedDocument ?? versionedDraft ?? store.document} onClose={() => setUpgradeRecoveryOpen(false)} /> : null}

      {legacyAssets.length > 0 || pendingPublicCopyAssets.length > 0 ? <div className="editor-message asset-migration-message" role="status">
        <div className="asset-migration-summary">
          <span>{legacyAssets.length > 0 ? t("editor.legacyAssetsStillUsePublic", { length: legacyAssets.length }) : t("editor.legacyPublicCopiesAreTemporarily", { length: pendingPublicCopyAssets.length })}</span>
          {legacyAssets.length > 0 ? <span className="asset-migration-names" aria-label={t("editor.assetsNotYetConvertedTo")}>
            {legacyAssets.map((asset) => <code key={asset.id} title={asset.id}>{asset.name || asset.id.slice(0, 8)}</code>)}
          </span> : null}
        </div>
        <button type="button" onClick={() => setAssetInventoryOpen(true)}>{t("editor.seeWhichOnes")}</button>
        {legacyAssets.length > 0 && actions.migrateAssets ? <button disabled={upgradeRequired || migratingAssets || store.saveStatus === "saving" || store.saveStatus === "error" || conflict} onClick={migrateLegacyAssets}>{migratingAssets ? t("editor.migrating") : t("editor.convertToPrivateAssets")}</button> : null}
      </div> : null}

      {assetInventoryOpen ? <div className="modal-backdrop" role="presentation">
        <section className="retro-panel editor-dialog asset-inventory-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-inventory-title">
          <header className="landing-titlebar" id="asset-inventory-title">{t("editor.legacyAssetMigrationDetails")}</header>
          <div className="dialog-body">
            <p>{t("editor.thisListsEachAssetsName")}</p>
            {migrationAudits.length ? <ul className="asset-inventory-list">
              {migrationAudits.map(({ asset, references }) => <li key={asset.id}>
                <div className="asset-inventory-heading"><strong>{asset.name || t("editor.unnamedAsset")}</strong><code>{asset.id}</code></div>
                <span className={`asset-status ${asset.storageScope === "legacy_public" ? "needs-migration" : "pending-cleanup"}`}>{asset.storageScope === "legacy_public" ? t("editor.notYetConvertedToPrivate") : t("editor.privatePreviewIsReadyThe")}</span>
                <div className="asset-reference-list">{references.length ? t("page.usedAt", { locations: formatList(references.map((reference) => reference.label)) }) : t("editor.notReferencedInTheDraft")}</div>
                <div className="asset-source-url"><span>{t("editor.currentUrl")}</span><code>{asset.url}</code></div>
                {!references.length ? <div className="button-row end asset-item-actions">
                  <RetroButton className="danger" disabled={deletingAssetId === asset.id || !!asset.publicCopyRemaining} onClick={() => void deleteUnusedAsset(asset)}>
                    {deletingAssetId === asset.id ? t("editor.deleting") : asset.publicCopyRemaining ? t("editor.canBeDeletedAfterPublishing") : t("editor.deleteUnusedAsset")}
                  </RetroButton>
                </div> : <p className="asset-delete-hint">{t("editor.stillInUseFirstRemove")}</p>}
              </li>)}
            </ul> : <p role="status">{t("editor.noLegacyAssetsNeedMigration")}</p>}
            <div className="button-row end">
              <RetroButton onClick={() => void refreshAssetInventory().catch((error) => setMessage({ code: error instanceof ApiError ? error.code : undefined, fallback: "editor.couldntReScanAssets" }))}>{t("editor.reScan")}</RetroButton>
              {legacyAssets.length && actions.migrateAssets ? <RetroButton className="primary" disabled={upgradeRequired || migratingAssets || store.saveStatus === "saving" || store.saveStatus === "error" || conflict} onClick={migrateLegacyAssets}>{migratingAssets ? t("editor.migrating") : t("editor.convertToPrivate", { length: legacyAssets.length })}</RetroButton> : null}
              <RetroButton onClick={() => setAssetInventoryOpen(false)}>{t("editor.close")}</RetroButton>
            </div>
          </div>
        </section>
      </div> : null}

      <div className="editor-grid2">
        {!layoutMode && sidebarPreferences.leftExpanded ? (
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
        {!layoutMode ? <SidebarToggle side="left" expanded={sidebarPreferences.leftExpanded} onToggle={() => setSidebarPreferences((current) => ({ ...current, leftExpanded: !current.leftExpanded }))} /> : null}

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
            <MobileScreen document={store.document} mode="editor" framed siteId={siteId} upload={uploadImage} onPreview={() => { stopAllMedia(); setPreview(true); }} profiles={editorProfiles} posts={editorPosts} collections={editorCollections} profileIdsByWindow={profileIdsByWindow} onProfileSelect={selectProfile} onProfileAdd={addProfile} onProfileDuplicate={duplicateProfileForWindow} onProfileChange={changeProfile} onProfileDelete={deleteProfile} profileDeleteBlocked={selectedProfileReferenced} profileDeleteGuardById={profileDeleteGuardById} profileDirectory={profileDirectory} updateContent={updateContent} socialDocument={versionedDraft ?? undefined} />
          )}
        </section>

        {!layoutMode && store.device === "desktop" ? <SidebarToggle side="right" expanded={sidebarPreferences.rightExpanded} onToggle={() => setSidebarPreferences((current) => ({ ...current, rightExpanded: !current.rightExpanded }))} /> : null}
        {!layoutMode && store.device === "desktop" && sidebarPreferences.rightExpanded ? (
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
            indexing={versionedDraft?.seo?.indexing ?? true}
            onIndexing={store.setSeoIndexing}
            onColumns={store.setMobileColumns}
          />
        ) : null}
      </div>

      <footer className="editor-status2" style={{ height: "auto", minHeight: 26, flexWrap: "wrap", paddingBlock: 3, fontFamily }}>
        <span>{t(layoutMode ? "shell.layoutMode" : "shell.editMode")}</span>
        <span>{selected ? t("shell.selected", { title: selected.title }) : t("shell.noneSelected")}</span>
        <span className="top-spacer" />
        <span>{t("shell.windowsCount", { count: store.document.windows.length, formattedCount: formatNumber(store.document.windows.length) })} · {badge.text}</span>
      </footer>

      {preview && previewModels ? <VisitorPreview publishable={previewModels.publishable} draft={previewModels.draft} username={store.username} siteUrl={store.publishedDocument ? publicSiteUrl(store.username) : null} publishState={!store.publishedDocument ? "never" : hasUnpublishedChanges ? "changed" : "in-sync"} shareable={previewModels.shareable} onClose={() => setPreview(false)} /> : null}
      <IntegrityDialog />
      {collaborationOpen ? <CollaborationDialog siteId={siteId} onClose={closeCollaboration} /> : null}
      {transferOpen ? <TransferDialog siteId={siteId} username={store.username} published={!!store.publishedDocument} onClose={() => setTransferOpen(false)} onImported={(newSiteId) => navigate(`/editor/${newSiteId}`)} /> : null}

      {conflict && conflictRecoveryOpen ? (
        <ModalDialog role="alertdialog" title={t("editor.versionConflict")} className="publish-preflight" width={520} dismissOnBackdrop={false} onClose={() => setConflictRecoveryOpen(false)} actions={
          <>
            <RetroButton data-autofocus onClick={copyLocalJson}>{t("editor.copyLocalJson")}</RetroButton>
            <RetroButton onClick={() => setConflictRecoveryOpen(false)}>{t("editor.cancel")}</RetroButton>
            <RetroButton className="primary" onClick={reloadRemote}>{t("editor.reloadTheCloudVersion")}</RetroButton>
          </>
        }>
          <h2>{t("editor.aNewerVersionOfThe")}</h2>
          <p>{t("editor.autosaveWasStoppedToAvoid")}</p>
        </ModalDialog>
      ) : null}

      {publishPrompt ? (
        <ModalDialog title={t("editor.publishRetroDesktop")} className="publish-preflight" width={520} closeDisabled={publishing} onClose={() => setPublishPrompt(false)} actions={
          <>
            <RetroButton data-autofocus disabled={publishing} onClick={() => setPublishPrompt(false)}>{t("editor.cancel")}</RetroButton>
            <RetroButton className="primary" disabled={publishing || hasBlockingCheck(publishChecks)} onClick={confirmPublish}>{publishing ? t("editor.publishing2") : t("editor.confirmAndPublish")}</RetroButton>
          </>
        }>
          <h2>{t("editor.prePublishCheck")}</h2>
          <p>{t("editor.publicUrl")}<strong>{publicSiteLabel(store.username)}</strong></p>
          <ul className="publish-checks" aria-label={t("editor.prePublishCheckResults")}>
            {publishChecks.map((check, index) => <li key={index} className={check.level}><span aria-hidden="true">{check.level === "ok" ? "✓" : check.level === "warn" ? "!" : "×"}</span>{translateSystemMessage(check.text)}</li>)}
          </ul>
          <p>{hasBlockingCheck(publishChecks) ? t("editor.fixTheRedItemsFirst") : t("editor.yellowItemsAreSuggestionsAnd")}</p>
          {publishing ? <div className="publish-progress" role="progressbar" aria-label={t("editor.publishing")}><i /></div> : null}
        </ModalDialog>
      ) : null}

      {publishSuccess ? (
        <div className="modal-backdrop" role="presentation">
          <section className="retro-panel editor-dialog" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <header className="landing-titlebar" id="success-title">{t("editor.published")}</header>
            <div className="dialog-body">
              <h2>{t("page.publishedLive", { version: publishSuccess.version })}</h2>
              {publishSuccess.artifactStatus === "failed" ? <p role="alert">{t("editor.theDatabaseVersionIsPublished")}</p> : <p>{t("editor.publicFilesAreNowIn")}</p>}
              <input className="share-url" readOnly value={publishSuccess.url} onFocus={(event) => event.currentTarget.select()} />
              <div className="button-row end">
                <RetroButton onClick={copyPublishedUrl}>{t("editor.copyUrl")}</RetroButton>
                {publishSuccess.retryable && !upgradeRequired ? <RetroButton onClick={async () => {
                  if (upgradePaused.current) return;
                  try {
                    const result = await api.retryPublish(siteId);
                    setPublishSuccess((current) => current ? { ...current, artifactStatus: result.artifactStatus, retryable: result.retryable } : current);
                  } catch (error) { if (!stopForUpgrade(error)) setMessage({ code: error instanceof ApiError ? error.code : undefined, fallback: "editor.syncRetryFailed" }); }
                }}>{t("editor.retrySync")}</RetroButton> : null}
                <a className="retro-link" href={publishSuccess.url} target="_blank" rel="noreferrer">{t("editor.openSite")}</a>
                <RetroButton className="primary" onClick={() => setPublishSuccess(null)}>{t("editor.done")}</RetroButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {leaveGuard.prompt}
    </main>
    </EditorMediaProvider>
    </AssetSourceProvider>
    </AppearanceWriteProvider>
    </ImageWriteProvider>
  );
}
