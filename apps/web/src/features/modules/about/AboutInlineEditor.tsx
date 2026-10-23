import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { AvatarImage } from "../../../components/AvatarImage";
import { CropEditor } from "../../editor/CropEditor";
import { useWindowMedia, UploadProgressList } from "../../media/editorMedia";
import { FileUploadButton, ImageUrlInput, CompactButton } from "../ui";
import { safeHref, type ModuleProps } from "../types";
import { normalizeSocial, reorderFields } from "./inlineModel";

// Reset transient drafts/focus when a host reuses the editor for another window.
export function AboutInlineEditor(props: ModuleProps<"about">) {
  return <AboutCardEditor key={props.window.id} {...props} />;
}

function AboutCardEditor({ window, ctx, update }: ModuleProps<"about">) {
  const { t: tr, i18n } = useTranslation("modules");
  const { t: editorTr } = useTranslation("editor");
  const { tv } = ctx;
  const content = window.content;
  const media = useWindowMedia(window, ctx);
  const feedbackPrefix = useId();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [avatarOver, setAvatarOver] = useState(false);
  const [socialDraft, setSocialDraft] = useState("");
  const [newField, setNewField] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string | null; after: boolean } | null>(null);
  const avatarButton = useRef<HTMLButtonElement>(null);
  const restoreAvatarFocus = useRef(false);
  const newFieldInput = useRef<HTMLInputElement>(null);
  const socialInput = useRef<HTMLInputElement>(null);
  const fieldValues = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingField = useRef<string | null>(null);
  const pendingAddFocus = useRef<"field" | "social" | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  // Locale deltas are merged by the integration branch; retain translated legacy fallbacks.
  const text = (key: string, fallback: ParseKeys<"modules">): string => {
    const candidate = `about.inline.${key}` as ParseKeys<"modules">;
    return String(i18n.exists(candidate, { ns: "modules" }) ? tr(candidate) : tr(fallback));
  };
  const historyKey = (key?: string) => key ? `about:${window.id}:${key}` : undefined;
  const patch = (change: Partial<typeof content>, key?: string) => update(current => ({ ...current, content: { ...current.content, ...change } }), historyKey(key));
  const setFields = (recipe: (list: typeof content.fields) => typeof content.fields, key?: string) => update(current => ({ ...current, content: { ...current.content, fields: recipe(current.content.fields) } }), historyKey(key));
  const setSocials = (recipe: (list: typeof content.socials) => typeof content.socials, key?: string) => update(current => ({ ...current, content: { ...current.content, socials: recipe(current.content.socials) } }), historyKey(key));
  useLayoutEffect(() => {
    if (pendingField.current) { fieldValues.current.get(pendingField.current)?.focus(); pendingField.current = null; }
    if (pendingAddFocus.current) {
      (pendingAddFocus.current === "field" ? newFieldInput : socialInput).current?.focus();
      pendingAddFocus.current = null;
    }
  }, [content.fields, content.socials]);
  useLayoutEffect(() => {
    editor.current?.querySelectorAll("textarea").forEach(field => { field.style.height = "auto"; field.style.height = `${field.scrollHeight}px`; });
  }, [content.bio, content.quote, content.banner, content.fields, ctx.mobile]);
  const enter = (event: KeyboardEvent) => event.key === "Enter" && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229;
  useLayoutEffect(() => {
    if (!avatarOpen && restoreAvatarFocus.current) { restoreAvatarFocus.current = false; avatarButton.current?.focus(); }
  }, [avatarOpen]);
  function closeAvatar() { restoreAvatarFocus.current = true; setAvatarOpen(false); setCropping(false); }
  function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) { setError(editorTr("inspectorContent.onlyJpegPngWebpAnd")); return; }
    if (file.size > 8 * 1024 * 1024) { setError(editorTr("editor.fileTooLargeEachImage")); return; }
    setError("");
    const capturedAvatar = content.avatar;
    const capturedUrl = content.avatarUrl;
    media.upload(file, {
      kind: "image", slot: "avatar",
      isCurrent: current => current.content.avatar === capturedAvatar && current.content.avatarUrl === capturedUrl,
      apply: (current, stored) => ({ ...current, content: { ...current.content, avatar: stored, avatarUrl: "", avatarCrop: undefined } }),
    });
    closeAvatar();
  }
  function addField() {
    if (!newField.trim() || content.fields.length >= 50) return;
    const id = crypto.randomUUID();
    pendingField.current = id;
    setFields(list => list.length < 50 ? [...list, { id, key: newField.trim(), value: "" }] : list);
    setNewField("");
  }
  function addSocial() {
    if (!socialDraft.trim() || content.socials.length >= 50) return;
    const result = normalizeSocial(socialDraft);
    if (!result) { setError(tr("document.enterAFullHttpHttps")); return; }
    setSocials(list => list.length < 50 ? [...list, { id: crypto.randomUUID(), ...result }] : list);
    setSocialDraft(""); setError("");
  }
  function reorder(id: string, target: string | null, after = false) { setFields(list => reorderFields(list, id, target, after)); }
  function moveWithKeyboard(event: KeyboardEvent, id: string, index: number) {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const offset = event.key === "ArrowUp" ? -1 : 1;
    const target = content.fields[index + offset];
    if (target) reorder(id, target.id, offset === 1);
  }
  function drop(target: string | null, after = false) {
    if (dragId) reorder(dragId, target, after);
    setDragId(null); setOver(null);
  }
  const status = dragId ? text("dragStatus", "about.forExampleAFormOf") : focus?.startsWith("social:") ? text("socialStatus", "about.visitorsCanOpenThisLink") : text("editStatus", "about.editTheCardContentExpand");
  return (
    <div ref={editor} onFocusCapture={event => {
      const target = event.target as HTMLElement;
      requestAnimationFrame(() => {
        if (document.activeElement !== target || !editor.current?.contains(target)) return;
        const host = ctx.mobile ? editor.current.closest(".m-win-body") : editor.current.querySelector(".about-editor-scroll");
        if (!host) return;
        const bounds = host.getBoundingClientRect(), field = target.getBoundingClientRect();
        if (field.bottom > bounds.bottom - 4) host.scrollTop += field.bottom - bounds.bottom + 4;
        else if (field.top < bounds.top + 4) host.scrollTop -= bounds.top - field.top + 4;
      });
    }} onKeyDown={event => { if (avatarOpen && event.key === "Escape" && event.currentTarget.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation(); closeAvatar(); } }} className="about editing about-editor" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} data-mobile={ctx.mobile || undefined} style={{ background: tv.face, color: tv.text }}>
      <div className="about-editor-scroll">
        <div className="about-socials">
          {content.socials.map((social, index) => {
            const invalid = safeHref(social.url) === "#";
            return <span key={social.id} className="about-social-edit" data-open={invalid || focus === `social:${social.id}` || undefined}
              onFocus={() => setFocus(`social:${social.id}`)}>
              <input className="about-direct about-social-name" value={social.label} size={Math.min(24, Math.max(4, social.label.length + 1))} maxLength={100} aria-label={tr("about.socialName")} onChange={event => { const value = event.currentTarget.value; setSocials(list => list.map(item => item.id === social.id ? { ...item, label: value } : item), `social:${social.id}:label`); }} />
              <span className="about-social-tools">
                <input className="about-direct about-social-url" value={social.url} maxLength={2048} placeholder="https://" aria-label={tr("about.socialUrl")} aria-invalid={invalid} aria-describedby={`${feedbackPrefix}-${index}`} onChange={event => { const value = event.currentTarget.value; setSocials(list => list.map(item => item.id === social.id ? { ...item, url: value } : item), `social:${social.id}:url`); }} />
                <CompactButton label={tr("about.deleteSocialLink")} danger onClick={() => { pendingAddFocus.current = "social"; setSocials(list => list.filter(item => item.id !== social.id)); }}>×</CompactButton>
                {invalid ? <span id={`${feedbackPrefix}-${index}`} className="ie-error">{tr("document.enterAFullHttpHttps")}</span> : null}
              </span>
            </span>;
          })}
          <input ref={socialInput} className="about-direct about-add-social" value={socialDraft} maxLength={2048} disabled={content.socials.length >= 50} aria-label={tr("about.addSocialLink")} placeholder={text("pasteSocial", "about.addSocialLink")} onChange={event => setSocialDraft(event.currentTarget.value)} onKeyDown={event => { if (enter(event)) { event.preventDefault(); addSocial(); } }} />
          {content.socials.length >= 50 ? <span>{tr("about.youveReachedTheLimitOf2")}</span> : null}
        </div>
        <div className="about-main" style={{ boxShadow: tv.sunken }}>
          <div className="about-avatar-column">
            <div className="about-avatar about-avatar-drop" data-over={avatarOver || undefined} style={{ border: `1px solid ${tv.shadow}` }}
              onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setAvatarOver(true); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAvatarOver(false); }}
              onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); setAvatarOver(false); uploadAvatar(event.dataTransfer.files[0]); }}>
              {content.avatar ? <AvatarImage src={content.avatar} crop={content.avatarCrop} alt={tr("about.avatarPreview")} /> : <span className="about-avatar-empty">{text("dropAvatar", "about.noAvatarSetYet")}</span>}
              <button ref={avatarButton} type="button" className="mini-btn wide about-avatar-toggle" aria-expanded={avatarOpen} onMouseDown={event => { if (avatarOpen) event.preventDefault(); }} onClick={event => { if (avatarOpen) closeAvatar(); else { event.currentTarget.focus({ preventScroll: true }); setAvatarOpen(true); } }}>{content.avatar ? tr("about.changeAvatar") : tr("about.uploadAvatar")}</button>
            </div>
            {avatarOpen ? <div className="about-avatar-panel" role="group" aria-label={tr("about.avatarSettings")} style={{ background: tv.face, boxShadow: tv.bevel }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeAvatar(); } }}>
              <FileUploadButton onFiles={files => uploadAvatar(files[0])}>{content.avatar ? tr("about.changeAvatar") : tr("about.uploadAvatar")}</FileUploadButton>
              <ImageUrlInput visibleLabel onEdit={() => media.cancel("avatar")} raw={content.avatarUrl} label={tr("about.avatarUrl")} placeholder={tr("about.orPasteAnAvatarUrl")} onCommit={(raw, src) => { media.cancel("avatar"); setCropping(false); patch({ avatarUrl: raw, avatar: src, avatarCrop: undefined }); }} />
              {content.avatar ? <>
                <CompactButton label={tr("about.adjustPosition")} className="mini-btn wide" aria-pressed={cropping} onClick={() => setCropping(!cropping)}>{tr("about.adjustPosition")}</CompactButton>
                <CompactButton label={tr("about.removeAvatar")} className="mini-btn wide danger" onMouseDown={event => event.preventDefault()} onClick={() => { media.cancel("avatar"); patch({ avatar: null, avatarUrl: "", avatarCrop: undefined }); closeAvatar(); }}>{tr("about.removeAvatar")}</CompactButton>
              </> : null}
              {cropping && content.avatar ? <CropEditor key={content.avatar} src={content.avatar} crop={content.avatarCrop} onChange={avatarCrop => { media.cancel("avatar"); patch({ avatarCrop }, "avatar-crop"); }} /> : null}
              <CompactButton label={text("close", "iconPicker.cancel")} className="mini-btn wide" onMouseDown={event => event.preventDefault()} onClick={closeAvatar}>{text("close", "iconPicker.cancel")}</CompactButton>
            </div> : null}
          </div>
          <div className="about-info">
            {content.fields.map((field, index) => <div key={field.id} className="about-field-row" data-field-id={field.id} data-dragging={dragId === field.id || undefined} data-drop={over?.id === field.id ? over.after ? "after" : "before" : undefined}
              onKeyDown={event => moveWithKeyboard(event, field.id, index)}
              onDragOver={event => { if (!dragId) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setOver({ id: field.id, after: event.clientY > rect.top + rect.height / 2 }); }}
              onDrop={event => { if (!dragId) return; event.preventDefault(); event.stopPropagation(); drop(field.id, over?.after); }}>
              <button type="button" className="about-drag" draggable aria-label={text("reorder", "about.fieldName")} title={text("reorder", "about.fieldName")} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", field.id); setDragId(field.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}>⋮⋮</button>
              <div className="about-field" style={{ border: `1px solid ${tv.shadow}` }}>
                <input className="about-direct about-field-key" value={field.key} size={Math.min(12, Math.max(3, field.key.length + 1))} maxLength={100} aria-label={tr("about.fieldName")} placeholder={tr("about.fieldName")} onChange={event => { const value = event.currentTarget.value; setFields(list => list.map(item => item.id === field.id ? { ...item, key: value } : item), `field:${field.id}:key`); }} onKeyDown={event => { if (enter(event)) { event.preventDefault(); fieldValues.current.get(field.id)?.focus(); } }} />
                <span>: </span>
                <textarea rows={1} ref={element => { if (element) fieldValues.current.set(field.id, element); else fieldValues.current.delete(field.id); }} className="about-direct about-field-value" value={field.value} maxLength={500} aria-label={tr("about.fieldContent")} placeholder={tr("about.content")} onChange={event => { const value = event.currentTarget.value; setFields(list => list.map(item => item.id === field.id ? { ...item, value } : item), `field:${field.id}:value`); }} onKeyDown={event => { if (enter(event) && !event.shiftKey) { event.preventDefault(); newFieldInput.current?.focus(); } }} />
              </div>
              <CompactButton label={tr("about.deleteField")} danger onClick={() => { pendingAddFocus.current = "field"; setFields(list => list.filter(item => item.id !== field.id)); }}>×</CompactButton>
            </div>)}
            <div className="about-field-add" data-drop={over?.id === null ? "before" : undefined} onDragOver={event => { if (dragId) { event.preventDefault(); setOver({ id: null, after: true }); } }} onDrop={event => { if (dragId) { event.preventDefault(); drop(null); } }}>
              <input ref={newFieldInput} className="about-direct" value={newField} maxLength={100} disabled={content.fields.length >= 50} aria-label={tr("about.addField")} placeholder={text("addField", "about.addField")} onChange={event => setNewField(event.currentTarget.value)} onKeyDown={event => { if (enter(event)) { event.preventDefault(); addField(); } }} />
            </div>
            {content.fields.length >= 50 ? <span>{tr("about.youveReachedTheLimitOf")}</span> : null}
            <input className="about-direct about-details-title" value={content.detailsTitle} maxLength={100} aria-label={tr("about.tagline")} onChange={event => patch({ detailsTitle: event.currentTarget.value }, "details-title")} />
            <textarea className="about-direct about-bio" rows={2} value={content.bio} maxLength={5000} placeholder={tr("about.introduceYourselfOneLinePer")} aria-label={tr("about.bio")} onChange={event => patch({ bio: event.currentTarget.value }, "bio")} />
            <textarea rows={1} className="about-direct about-quote" value={content.quote} maxLength={500} placeholder={tr("about.aLineYoudLikeTo")} aria-label={tr("about.quote")} onChange={event => patch({ quote: event.currentTarget.value }, "quote")} />
          </div>
        </div>
        <div className="about-foot">
          <div className="about-bar" style={{ boxShadow: tv.sunken }}><span>‹</span><input className="about-direct about-nickname" value={content.nickname} maxLength={160} aria-label={tr("about.nickname")} onChange={event => patch({ nickname: event.currentTarget.value }, "nickname")} /><span className="about-time">{new Date().toTimeString().slice(0, 5)}</span></div>
          <div className="about-banner" data-empty={!content.banner || undefined}><textarea rows={1} className="about-direct" value={content.banner} maxLength={500} placeholder={text("addBanner", "about.bannerTextOptional")} aria-label={tr("about.bannerText")} onChange={event => patch({ banner: event.currentTarget.value }, "banner")} /></div>
        </div>
        <UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      </div>
      {error ? <div className="about-inline-error" role="alert"><span>{error}</span><CompactButton label={text("close", "iconPicker.cancel")} onClick={() => setError("")}>×</CompactButton></div> : null}
      <div className="about-editor-status" style={{ boxShadow: tv.sunken }} role="status">{status}</div>
    </div>
  );
}
