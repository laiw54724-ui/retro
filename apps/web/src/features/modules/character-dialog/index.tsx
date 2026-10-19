import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { restoreFocusUnlessMoved } from "../../../lib/restoreFocus";
import type { ModuleProps } from "../types";
import { FilePick, ImageUrlField, SafeImg } from "../ui";
import { UploadTaskList, useWindowMedia } from "../../media/editorMedia";
import { safeHref } from "../types";

function CharacterDialog({ window, ctx, update, editing }: ModuleProps<"character-dialog"> & { editing: boolean }) {
  const { t: tr } = useTranslation("modules");
  const content = window.content;
  const media = useWindowMedia(window, ctx);
  const [linkUrl, setLinkUrl] = useState(content.linkUrl);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLinkUrl(content.linkUrl), [content.linkUrl]);
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
  const upload = (file: File) => media.upload(file, {
    kind: "image", slot: "image",
    isCurrent: (current) => current.content.image === content.image && current.content.imageUrl === content.imageUrl,
    apply: (current, image) => ({ ...current, content: { ...current.content, image, imageUrl: "" } })
  });
  return <div ref={rootRef} tabIndex={editing ? undefined : -1} className="character-dialog-app">
    {content.image ? <SafeImg src={content.image} alt={content.characterName} className="character-dialog-image" /> : <div className="character-dialog-placeholder" aria-hidden="true">☺</div>}
    <div className="character-dialog-copy"><strong>{content.characterName || tr("characterDialog.character")}</strong><p>{content.message || "……"}</p>{content.linkLabel && safeHref(content.linkUrl) !== "#" ? <a href={safeHref(content.linkUrl)} onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: content.linkUrl, label: content.linkLabel }); }}>{content.linkLabel}</a> : null}</div>
    {editing ? <fieldset className="character-dialog-settings"><legend>{tr("characterDialog.characterPopUp")}</legend><label>{tr("characterDialog.characterName")}<input value={content.characterName} onChange={(event) => patch({ characterName: event.target.value }, `character-name-${window.id}`)} /></label><label>{tr("characterDialog.message")}<textarea value={content.message} onChange={(event) => patch({ message: event.target.value }, `character-message-${window.id}`)} /></label><div className="button-row"><FilePick className="w98-btn" onFiles={(files) => void upload(files[0])}>{tr("characterDialog.uploadCharacterImage")}</FilePick>{content.image ? <button type="button" className="w98-btn danger" onClick={() => { media.cancel("image"); patch({ image: null, imageUrl: "" }); }}>{tr("characterDialog.removeCharacterImage")}</button> : null}</div><ImageUrlField visibleLabel raw={content.imageUrl} label={tr("document.imageUrl")} placeholder="https://" onEdit={() => media.cancel("image")} onCommit={(imageUrl, image) => patch({ imageUrl, image })} /><UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} /><label>{tr("document.linkText")}<input value={content.linkLabel} onChange={(event) => patch({ linkLabel: event.target.value })} /></label><label>{tr("characterDialog.safeLink")}<input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onBlur={() => { if (!linkUrl || safeHref(linkUrl) !== "#") patch({ linkUrl }); else setLinkUrl(content.linkUrl); }} placeholder="https://" /></label><label className="check-row"><input type="checkbox" checked={content.autoShow} onChange={(event) => patch({ autoShow: event.target.checked })} />{tr("characterDialog.shownOnceAutomaticallyForEach")}</label></fieldset> : null}
  </div>;
}

export function CharacterDialogView(props: ModuleProps<"character-dialog">) { return <CharacterDialog {...props} editing={false} />; }
export function CharacterDialogInlineEditor(props: ModuleProps<"character-dialog">) { return <CharacterDialog {...props} editing />; }
