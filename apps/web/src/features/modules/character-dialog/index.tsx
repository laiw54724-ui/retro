import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { restoreFocusUnlessMoved } from "../../../lib/restoreFocus";
import type { ModuleProps } from "../types";
import { FileUploadButton, ImageUrlInput, FallbackImage } from "../ui";
import { UploadProgressList, useWindowMedia } from "../../media/editorMedia";
import { safeHref } from "../types";
import { DestinationChip, EditorStatusBar, FileDropZone, InlineErrorBanner, InlineTextArea, InlineTextField, PopoverPanel } from "../../../components/editing";
import "./editor.css";

function CharacterDialog({ window, ctx, update, editing }: ModuleProps<"character-dialog"> & { editing: boolean }) {
  const { t: tr } = useTranslation("modules");
  const { t: editorText } = useTranslation("editor");
  const content = window.content;
  const media = useWindowMedia(window, ctx);
  const [linkUrl, setLinkUrl] = useState(content.linkUrl);
  const [panel, setPanel] = useState<"image" | "link" | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const canUpload = !!(ctx.editing && ctx.siteId && ctx.upload);
  useEffect(() => setLinkUrl(content.linkUrl), [content.linkUrl]);
  useEffect(() => {
    if (panel === "link") linkInput.current?.focus();
    if (panel === "image") rootRef.current?.querySelector<HTMLInputElement>("[data-character-panel='image'] input:not([type=file])")?.focus();
  }, [panel]);
  useEffect(() => {
    if (editing) return;
    const root = rootRef.current;
    const dialog = root?.closest<HTMLElement>('[role="dialog"]');
    const surface = root?.closest<HTMLElement>(".visitor-desktop, .visitor-mobile");
    if (!root || !dialog || !surface) return;
    const iconClass = surface.classList.contains("visitor-mobile") ? ".m-icon" : ".visitor-icon";
    const opener = Array.from(surface.querySelectorAll<HTMLButtonElement>(iconClass)).find((icon) => icon.dataset.windowId === window.id);
    const focusBeforeOpen = document.activeElement;
    let focusFrame = 0;
    const removePointerListeners = () => {
      document.removeEventListener("pointerdown", cancelEntryFocus, true);
      document.removeEventListener("touchstart", cancelEntryFocus, true);
    };
    const cancelEntryFocus = (event: Event) => {
      if (dialog.contains(event.target as Node)) return;
      cancelAnimationFrame(focusFrame);
      removePointerListeners();
    };
    document.addEventListener("pointerdown", cancelEntryFocus, true);
    document.addEventListener("touchstart", cancelEntryFocus, true);
    focusFrame = requestAnimationFrame(() => {
      removePointerListeners();
      // Desktop and phone trees can coexist; only the visible character dialog receives focus.
      if (dialog.isConnected && dialog.getClientRects().length && document.activeElement === focusBeforeOpen && (focusBeforeOpen === document.body || focusBeforeOpen === opener)) root.focus();
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      removePointerListeners();
      if (dialog.contains(document.activeElement) || document.activeElement === document.body) {
        restoreFocusUnlessMoved(() => !dialog.isConnected ? opener : null);
      }
    };
  }, [editing, window.id, window.title]);
  const patch = (change: Partial<typeof content>, key?: string) => update((current) => ({ ...current, content: { ...current.content, ...change } }), key);
  const upload = (file: File) => {
    if (!canUpload) return;
    if (!file.type.startsWith("image/")) { setError(editorText("inspectorContent.onlyJpegPngWebpAnd")); return; }
    if (file.size > 8 * 1024 * 1024) { setError(editorText("editor.fileTooLargeEachImage")); return; }
    setError("");
    media.upload(file, {
      kind: "image", slot: "image",
      isCurrent: (current) => current.content.image === content.image && current.content.imageUrl === content.imageUrl,
      apply: (current, image) => ({ ...current, content: { ...current.content, image, imageUrl: "" } })
    });
  };
  const closePanel = () => { setPanel(null); setLinkUrl(content.linkUrl); };
  const applyLink = () => {
    const url = linkUrl.trim();
    if (url && safeHref(url) === "#") { setError(tr("document.enterAFullHttpHttps")); return; }
    patch({ linkUrl: url }); setError(""); setPanel(null);
    requestAnimationFrame(() => linkButton.current?.focus({ preventScroll: true }));
  };
  const preview = <>
    {content.image ? <FallbackImage src={content.image} alt={content.characterName} className="character-dialog-image" /> : <div className="character-dialog-placeholder" aria-hidden="true">☺</div>}
    <div className="character-dialog-copy"><strong>{content.characterName || tr("characterDialog.character")}</strong><p>{content.message || "……"}</p>{content.linkLabel && safeHref(content.linkUrl) !== "#" ? <a href={safeHref(content.linkUrl)} onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: content.linkUrl, label: content.linkLabel }); }}>{content.linkLabel}</a> : null}</div>
  </>;
  return <div ref={rootRef} tabIndex={editing ? undefined : -1} data-mobile={editing && ctx.mobile || undefined} className={"character-dialog-app" + (editing ? " character-dialog-editor character-message-editor" : "")}>
    {editing ? <>
      <div className="character-message-body">
        <FileDropZone className="character-image-drop" accept="image" maxBytes={8 * 1024 * 1024} disabled={!canUpload} tv={ctx.tv} mobile={ctx.mobile} overlayText={tr("characterDialog.dropImage")} onError={setError} onFiles={files => upload(files[0])}>
          {content.image ? <FallbackImage src={content.image} alt={content.characterName} className="character-dialog-image" /> : <div className="character-dialog-placeholder" aria-hidden="true">☺</div>}
          <button ref={imageButton} type="button" className="character-image-toggle w98-btn" aria-label={tr("characterDialog.imageTools")} title={tr("characterDialog.imageTools")} aria-expanded={panel === "image"} onClick={() => { setLinkUrl(content.linkUrl); setPanel(panel === "image" ? null : "image"); }}>✎</button>
        </FileDropZone>
        <div className="character-dialog-copy">
          <InlineTextField className="character-name-input" aria-label={tr("characterDialog.characterName")} placeholder={tr("characterDialog.character")} value={content.characterName} maxLength={120} historyKey={`character-name-${window.id}`} onValueChange={(characterName, key) => patch({ characterName }, key)} />
          <InlineTextArea className="character-message-input" aria-label={tr("characterDialog.message")} value={content.message} maxLength={2000} historyKey={`character-message-${window.id}`} onValueChange={(message, key) => patch({ message }, key)} />
          <div className="character-action-row">
            <InlineTextField className="character-button-input" aria-label={tr("document.linkText")} placeholder={tr("characterDialog.addButton")} value={content.linkLabel} maxLength={120} historyKey={`character-link-label-${window.id}`} onValueChange={(linkLabel, key) => patch({ linkLabel }, key)} />
            <DestinationChip ref={linkButton} aria-label={tr("characterDialog.safeLink")} text={content.linkUrl || tr("characterDialog.safeLink")} missing={!!content.linkLabel && !content.linkUrl} expanded={panel === "link"} mobile={ctx.mobile} tv={ctx.tv} onClick={() => { setLinkUrl(content.linkUrl); setPanel(panel === "link" ? null : "link"); }} />
          </div>
        </div>
      </div>
      <PopoverPanel open={panel === "image"} onClose={closePanel} triggerRef={imageButton} scopeRef={rootRef} keepMounted label={tr("characterDialog.imageTools")} tv={ctx.tv} mobile={ctx.mobile} data-character-panel="image">
        <div className="button-row"><FileUploadButton className="w98-btn" disabled={!canUpload} onFiles={files => upload(files[0])}>{tr("characterDialog.uploadCharacterImage")}</FileUploadButton>{content.image ? <button type="button" className="w98-btn danger" onClick={() => { media.cancel("image"); patch({ image: null, imageUrl: "" }); }}>{tr("characterDialog.removeCharacterImage")}</button> : null}</div>
        <ImageUrlInput visibleLabel raw={content.imageUrl} label={tr("document.imageUrl")} placeholder="https://" onEdit={() => media.cancel("image")} onCommit={(imageUrl, image) => patch({ imageUrl, image })} />
      </PopoverPanel>
      <PopoverPanel open={panel === "link"} onClose={closePanel} triggerRef={linkButton} scopeRef={rootRef} showDone={false} label={tr("characterDialog.safeLink")} tv={ctx.tv} mobile={ctx.mobile}>
        <label className="character-link-field">{tr("characterDialog.safeLink")}<input ref={linkInput} className="ie" value={linkUrl} maxLength={2048} onChange={event => setLinkUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); applyLink(); } }} placeholder="https://" /></label>
        <div className="button-row"><button type="button" className="w98-btn" onClick={applyLink}>{tr("navigationTargets.apply")}</button><button type="button" className="w98-btn" onClick={() => { closePanel(); requestAnimationFrame(() => linkButton.current?.focus({ preventScroll: true })); }}>{editorText("editor.cancel")}</button></div>
      </PopoverPanel>
      <UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      <label className="character-auto-show"><input type="checkbox" checked={content.autoShow} onChange={event => patch({ autoShow: event.target.checked })} />{tr("characterDialog.shownOnceAutomaticallyForEach")}</label>
      <InlineErrorBanner message={error} onClose={() => setError("")} tv={ctx.tv} mobile={ctx.mobile} />
      <EditorStatusBar message={tr("characterDialog.editHint")} tv={ctx.tv} mobile={ctx.mobile} />
    </> : preview}
  </div>;
}

export function CharacterDialogView(props: ModuleProps<"character-dialog">) { return <CharacterDialog {...props} editing={false} />; }
export function CharacterDialogInlineEditor(props: ModuleProps<"character-dialog">) { return <CharacterDialog key={props.window.id} {...props} editing />; }
