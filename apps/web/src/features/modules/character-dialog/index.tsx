import { useEffect, useState } from "react";
import type { ModuleProps } from "../types";
import { FilePick, SafeImg } from "../ui";
import { safeHref } from "../types";

function CharacterDialog({ window, ctx, update, editing }: ModuleProps<"character-dialog"> & { editing: boolean }) {
  const content = window.content;
  const [linkUrl, setLinkUrl] = useState(content.linkUrl);
  useEffect(() => setLinkUrl(content.linkUrl), [content.linkUrl]);
  const patch = (change: Partial<typeof content>, key?: string) => update((current) => ({ ...current, content: { ...current.content, ...change } }), key);
  const upload = async (file: File) => { const image = await ctx.upload?.(file, "image"); if (image) patch({ image, imageUrl: "" }); };
  return <div className="character-dialog-app">
    {content.image ? <SafeImg src={content.image} alt={content.characterName} className="character-dialog-image" /> : <div className="character-dialog-placeholder" aria-hidden="true">☺</div>}
    <div className="character-dialog-copy"><strong>{content.characterName || "角色"}</strong><p>{content.message || "……"}</p>{content.linkLabel && safeHref(content.linkUrl) !== "#" ? <a href={safeHref(content.linkUrl)} onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: content.linkUrl, label: content.linkLabel }); }}>{content.linkLabel}</a> : null}</div>
    {editing ? <fieldset className="character-dialog-settings"><legend>角色彈窗</legend><label>角色名稱<input value={content.characterName} onChange={(event) => patch({ characterName: event.target.value }, `character-name-${window.id}`)} /></label><label>訊息<textarea value={content.message} onChange={(event) => patch({ message: event.target.value }, `character-message-${window.id}`)} /></label><FilePick className="w98-btn" onFiles={(files) => void upload(files[0])}>上傳角色圖片…</FilePick><label>連結文字<input value={content.linkLabel} onChange={(event) => patch({ linkLabel: event.target.value })} /></label><label>安全連結<input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onBlur={() => { if (!linkUrl || safeHref(linkUrl) !== "#") patch({ linkUrl }); else setLinkUrl(content.linkUrl); }} placeholder="https://" /></label><label className="check-row"><input type="checkbox" checked={content.autoShow} onChange={(event) => patch({ autoShow: event.target.checked })} />訪客每次瀏覽自動顯示一次</label></fieldset> : null}
  </div>;
}

export function CharacterDialogView(props: ModuleProps<"character-dialog">) { return <CharacterDialog {...props} editing={false} />; }
export function CharacterDialogInlineEditor(props: ModuleProps<"character-dialog">) { return <CharacterDialog {...props} editing />; }
