import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPost, normalizeImageUrl, type PostMediaV2 } from "@retrodesk/shared";
import type { ModuleProps } from "../types";
import { FallbackImage, FileUploadButton } from "../ui";
import { UploadProgressList, useMediaQueue } from "../../media/editorMedia";
import { useEditorStore } from "../../editor/store";
import { registerEditorLocalWork } from "../../editor/editorLocalWork";
import { getIgDraftSession } from "./igDraftSession";
import { translateSystemMessage } from "../../../i18n/systemMessages";
import styles from "./IgPostComposer.module.css";

type Draft = { media: PostMediaV2[]; url: string; title: string; caption: string; location: string; date: string; private: boolean };
export function IgPostComposer({ props, draftId, onClose }: { props: ModuleProps<"instagram">; draftId: string; onClose: () => void }) {
  const { t } = useTranslation("instagram");
  const { ctx, window } = props;
  const { queue, tasks } = useMediaQueue();
  const scope = `ig-compose:${ctx.siteId}:${window.id}:${ctx.profileId}:${draftId}`;
  const [draft, setDraft] = useState<Draft>({ media: [], url: "", title: "", caption: "", location: "", date: "", private: true });
  const latest = useRef(draft);
  // Retry completion must not change the carousel order or its cover image.
  const selectionOrder = useRef(new Map<string, number>());
  const nextSelection = useRef(0);
  const rememberSelection = (id: string) => selectionOrder.current.set(id, nextSelection.current++);
  const withSelectedMedia = (item: PostMediaV2) => [...latest.current.media, item].sort((a, b) => selectionOrder.current.get(a.id)! - selectionOrder.current.get(b.id)!);
  const active = useRef(true);
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const change = (patch: Partial<Draft>) => { latest.current = { ...latest.current, ...patch }; setDraft(latest.current); };
  const scopedTasks = tasks.filter(task => task.scope === scope);
  const reserved = () => queue?.getSnapshot().filter(task => task.scope === scope && (task.status === "queued" || task.status === "uploading" || task.retryable)).length ?? 0;
  const available = () => Math.max(0, 10 - latest.current.media.length - reserved());
  const pending = scopedTasks.some(task => task.status === "queued" || task.status === "uploading" || task.retryable);
  const current = () => {
    const state = useEditorStore.getState();
    return active.current && ctx.editing && state.siteId === ctx.siteId && state.accessRole !== "viewer"
      && state.versionedDocument?.windows.some(item => item.id === window.id && item.type === "instagram")
      && state.versionedDocument.entities.profiles.some(profile => profile.id === ctx.profileId && profile.siteId === ctx.siteId);
  };
  const close = () => { active.current = false; queue?.invalidate(t("batchMedia.cancelled"), entry => entry.options.scope === scope); onClose(); };
  useEffect(() => {
    active.current = true;
    const session = getIgDraftSession();
    const unregister = registerEditorLocalWork(ctx.siteId ?? "", () => !!(latest.current.media.length || latest.current.url || latest.current.title || latest.current.caption || latest.current.location || latest.current.date || reserved()));
    const stopEpoch = session.subscribe(close);
    heading.current?.focus();
    return () => {
      active.current = false; stopEpoch(); unregister();
      queue?.invalidate(t("batchMedia.cancelled"), entry => entry.options.scope === scope);
      session.controls.delete(scope); session.notifyControls();
    };
  }, [scope]);
  useEffect(() => {
    const session = getIgDraftSession();
    session.controls.set(scope, { base: "", text: draft.media.length || draft.url || draft.title || draft.caption || draft.location || draft.date || pending ? "pending" : "" });
    session.notifyControls();
  }, [draft, pending, scope]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  function addUrl() {
    if (!current()) return;
    if (!available()) { setError(t("composer.limit")); return; }
    const normalized = normalizeImageUrl(latest.current.url);
    if (!normalized.ok) { setError(translateSystemMessage(normalized.reason)); return; }
    const mediaId = crypto.randomUUID();
    rememberSelection(mediaId);
    change({ media: withSelectedMedia({ id: mediaId, src: normalized.url, srcUrl: latest.current.url, alt: "" }), url: "" });
    setError("");
  }
  function upload(files: File[]) {
    if (!queue || !ctx.upload || !current()) return;
    const accepted = files.slice(0, available());
    setError(accepted.length < files.length ? t("composer.limit") : "");
    for (const file of accepted) {
      const mediaId = crypto.randomUUID();
      rememberSelection(mediaId);
      queue.enqueue({ file, scope, slot: mediaId, upload: file => ctx.upload!(file, "image"), isCurrent: () => !!current(), apply: src => {
        if (!current() || latest.current.media.length >= 10) return false;
        change({ media: withSelectedMedia({ id: mediaId, src, srcUrl: "", alt: "" }) });
        return true;
      } });
    }
  }
  function finish() {
    if (!current() || !ctx.siteId || !ctx.profileId || !ctx.updateContent || !draft.media.length || pending || draft.url.trim()) return;
    let created = false;
    ctx.updateContent(document => {
      if (!current() || !document.windows.some(item => item.id === window.id && item.type === "instagram")) return document;
      const result = createPost(document, { id: draftId, authorProfileId: ctx.profileId!, media: draft.media, title: draft.title, caption: draft.caption, location: draft.location, date: draft.date, visibility: draft.private ? "draft" : "published" }, { siteId: ctx.siteId! });
      if (!result.ok) { setError(translateSystemMessage(result.diagnostics[0]?.message ?? "") || t("inlineApp.createFailed")); return document; }
      created = true; return result.document;
    });
    if (created) close();
  }
  return <section className={styles.composer} aria-label={t("composer.newPost")} onKeyDown={event => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <header className={styles.header}>
      <button type="button" className="w98-btn" onClick={close}>{t("composer.cancel")}</button>
      <h3 ref={heading} tabIndex={-1}>{t("composer.newPost")}</h3>
      <button type="button" className="w98-btn primary" disabled={!draft.media.length || pending || !!draft.url.trim()} onClick={() => step === "pick" ? setStep("details") : finish()}>{step === "pick" ? t("composer.next") : t("composer.finish")}</button>
    </header>
    <div className={styles.navigation}>
      <button type="button" className="w98-btn" onClick={close}>{t("inlineApp.backToApp")}</button>
      {step === "details" ? <button type="button" className="w98-btn" onClick={() => setStep("pick")}>{t("composer.backToPhotos")}</button> : null}
      <span>@{ctx.profiles?.find(profile => profile.id === ctx.profileId)?.handle}</span>
    </div>
    <div className={styles.body}>
      {step === "pick" ? <>
        <FileUploadButton multiple disabled={!ctx.upload || !available()} className={styles.pick} onFiles={upload}><strong>{t("composer.choosePhotos")}</strong><span>{t("composer.photoHint")}</span></FileUploadButton>
        <div className={styles.url}><input className="w98-input" maxLength={2048} aria-label={t("canonicalPostEditor.imageUrl")} placeholder="https://" value={draft.url} onChange={event => change({ url: event.target.value })} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addUrl(); } }} /><button type="button" className="w98-btn" disabled={!available()} onClick={addUrl}>{t("composer.add")}</button></div>
      </> : null}
      <div className={styles.media} aria-label={t("composer.photos")}>
        {draft.media.map((item, index) => <div key={item.id} className={styles.photo}>
          {item.src ? <FallbackImage compact src={item.src} alt={t("composer.photo", { n: index + 1 })} /> : null}
          <button type="button" className="w98-btn danger" aria-label={t("composer.removePhoto", { n: index + 1 })} onClick={() => { change({ media: latest.current.media.filter(media => media.id !== item.id) }); }}>{t("composer.remove")}</button>
        </div>)}
      </div>
      <UploadProgressList tasks={scopedTasks} onRetry={id => queue?.retry(id)} onDismiss={id => queue?.dismiss(id)} onCancel={id => queue?.invalidate(t("batchMedia.cancelled"), entry => entry.view.id === id && entry.options.scope === scope)} />
      {step === "details" ? <>
        <label>{t("canonicalPostEditor.heading")}<input className="w98-input" maxLength={200} value={draft.title} onChange={event => change({ title: event.target.value })} /></label>
        <label>{t("canonicalPostEditor.postContent")}<textarea className="w98-textarea" rows={4} maxLength={1000} value={draft.caption} onChange={event => change({ caption: event.target.value })} /></label>
        <label>{t("canonicalPostEditor.place")}<input className="w98-input" maxLength={120} value={draft.location} onChange={event => change({ location: event.target.value })} /></label>
        <label>{t("composer.date")}<input className="w98-input" maxLength={40} value={draft.date} onChange={event => change({ date: event.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={draft.private} onChange={event => change({ private: event.target.checked })} />{t("composer.keepDraft")}</label>
        <p>{t("composer.saveHint")}</p>
      </> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </section>;
}
