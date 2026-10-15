import { useId, useState, type ChangeEvent } from "react";
import { normalizeImageUrl, type DesktopWindow, type DocumentBlock } from "@retrodesk/shared";
import { api } from "../../lib/api";
import { RetroButton } from "../../components/RetroButton";
import { CropEditor } from "./CropEditor";

type Props = {
  window: DesktopWindow;
  allWindows: DesktopWindow[];
  siteId: string;
  update: (recipe: (window: DesktopWindow) => DesktopWindow) => void;
  onMessage: (message: string) => void;
};

const makeId = () => crypto.randomUUID();

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  return copy;
}

function isSafeUrl(value: string) {
  if (!value) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function newBlock(kind: DocumentBlock["kind"]): DocumentBlock {
  const id = makeId();
  switch (kind) {
    case "heading":
      return { id, kind, text: "新標題" };
    case "text":
      return { id, kind, text: "輸入文字…", align: "left" };
    case "image":
      return { id, kind, src: null, alt: "" };
    case "button":
      return { id, kind, text: "按鈕", url: "https://" };
    case "link":
      return { id, kind, text: "連結", url: "https://" };
    case "list":
      return { id, kind, text: "第一項\n第二項" };
    case "divider":
      return { id, kind };
  }
}

function ItemActions({ index, length, onMove, onRemove }: {
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="item-actions">
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="往上移">↑</button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(1)} aria-label="往下移">↓</button>
      <button type="button" className="danger-text" onClick={onRemove}>刪除</button>
    </div>
  );
}

function fileTitle(file?: File) {
  return file ? file.name.replace(/\.[^.]+$/, "") : "圖片";
}

function MediaUpload({ siteId, label, onUploaded, onMessage }: {
  siteId: string;
  label: string;
  onUploaded: (url: string, file?: File) => void;
  onMessage: (message: string) => void;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");

  function useLink() {
    const result = normalizeImageUrl(link);
    if (!result.ok) {
      onMessage(result.reason);
      return;
    }
    onUploaded(result.url);
    onMessage(result.source === "google-drive" ? "已使用 Google 雲端圖片。請確認檔案共用權限是「知道連結的任何人都能檢視」。" : "已使用圖片連結。");
    setLink("");
    setLinking(false);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      onMessage("只支援 JPEG、PNG、WebP、GIF 圖片。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      onMessage("圖片必須小於 8 MB。");
      return;
    }

    setBusy(true);
    try {
      const { asset } = await api.uploadAsset(siteId, file);
      onUploaded(asset.url, file);
      onMessage("圖片已上傳。");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "圖片上傳失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-source">
      <label className={"media-upload " + (busy ? "busy" : "")} htmlFor={inputId}>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={upload} />
        <span>{busy ? "上傳中…" : label}</span>
      </label>
      {linking ? (
        <div className="media-link">
          <input type="url" inputMode="url" placeholder="貼上圖片或 Google 雲端連結" value={link} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); useLink(); } }} />
          <RetroButton type="button" className="primary" onClick={useLink}>使用連結</RetroButton>
          <RetroButton type="button" onClick={() => setLinking(false)}>取消</RetroButton>
        </div>
      ) : (
        <button type="button" className="media-link-toggle" onClick={() => setLinking(true)}>或貼上圖片連結（含 Google 雲端）</button>
      )}
    </div>
  );
}

export function InspectorContent({ window, allWindows, siteId, update, onMessage }: Props) {
  if (window.type === "document") {
    const blocks = window.content.blocks;
    const updateBlocks = (next: DocumentBlock[]) => update((current) => current.type === "document"
      ? { ...current, content: { ...current.content, blocks: next } }
      : current);

    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>文件內容</strong><span>{blocks.length} 個區塊</span></div>
        <div className="add-chip-row">
          {(["heading", "text", "image", "button", "link", "list", "divider"] as const).map((kind) => (
            <button key={kind} type="button" onClick={() => updateBlocks([...blocks, newBlock(kind)])}>
              + {kind === "heading" ? "標題" : kind === "text" ? "文字" : kind === "image" ? "圖片" : kind === "button" ? "按鈕" : kind === "link" ? "連結" : kind === "list" ? "清單" : "分隔線"}
            </button>
          ))}
        </div>

        <div className="inspector-items">
          {blocks.map((block, index) => (
            <div className="inspector-item" key={block.id}>
              <div className="item-title">
                <strong>{block.kind}</strong>
                <ItemActions
                  index={index}
                  length={blocks.length}
                  onMove={(direction) => updateBlocks(moveItem(blocks, index, direction))}
                  onRemove={() => updateBlocks(blocks.filter((item) => item.id !== block.id))}
                />
              </div>

              {block.kind === "heading" ? (
                <textarea rows={2} value={block.text} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, text: event.target.value } : item))} />
              ) : null}

              {block.kind === "text" ? (
                <>
                  <textarea rows={4} value={block.text} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, text: event.target.value } : item))} />
                  <select value={block.align} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, align: event.target.value as "left" | "center" | "right" } : item))}>
                    <option value="left">靠左</option>
                    <option value="center">置中</option>
                    <option value="right">靠右</option>
                  </select>
                </>
              ) : null}

              {block.kind === "list" ? (
                <textarea rows={5} value={block.text} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, text: event.target.value } : item))} placeholder="每行一項" />
              ) : null}

              {block.kind === "image" ? (
                <>
                  {block.src ? <img className="inspector-thumb" referrerPolicy="no-referrer" src={block.src} alt="" /> : <div className="inspector-thumb placeholder">尚未上傳</div>}
                  <MediaUpload
                    siteId={siteId}
                    label={block.src ? "更換圖片" : "上傳圖片"}
                    onMessage={onMessage}
                    onUploaded={(url) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, src: url } : item))}
                  />
                  <input placeholder="替代文字" value={block.alt} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, alt: event.target.value } : item))} />
                </>
              ) : null}

              {block.kind === "button" || block.kind === "link" ? (
                <>
                  <input value={block.text} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, text: event.target.value } : item))} />
                  <input
                    className={isSafeUrl(block.url) ? "" : "invalid-input"}
                    value={block.url}
                    onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, url: event.target.value } : item))}
                    placeholder="https:// 或 mailto:"
                  />
                  {!isSafeUrl(block.url) ? <small className="field-error">網址只允許 http、https 或 mailto。</small> : null}
                </>
              ) : null}

              {block.kind === "divider" ? <div className="divider-preview" /> : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (window.type === "gallery") {
    const images = window.content.images;
    const updateImages = (next: typeof images) => update((current) => current.type === "gallery"
      ? { ...current, content: { ...current.content, images: next } }
      : current);

    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>相簿</strong><span>{images.length} 張</span></div>
        <label>
          每列欄數
          <select value={window.content.columns} onChange={(event) => update((current) => current.type === "gallery" ? { ...current, content: { ...current.content, columns: Number(event.target.value) } } : current)}>
            {[1, 2, 3, 4, 5].map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </label>
        <MediaUpload
          siteId={siteId}
          label="+ 上傳圖片"
          onMessage={onMessage}
          onUploaded={(url, file) => updateImages([...images, { id: makeId(), src: url, title: fileTitle(file), caption: "" }])}
        />
        <div className="inspector-items">
          {images.map((image, index) => (
            <div className="inspector-item media-item" key={image.id}>
              {image.src ? <img className="inspector-thumb" referrerPolicy="no-referrer" src={image.src} alt="" /> : null}
              <div className="item-title">
                <strong>圖片 {index + 1}</strong>
                <ItemActions
                  index={index}
                  length={images.length}
                  onMove={(direction) => updateImages(moveItem(images, index, direction))}
                  onRemove={() => updateImages(images.filter((item) => item.id !== image.id))}
                />
              </div>
              <input placeholder="圖片標題" value={image.title} onChange={(event) => updateImages(images.map((item) => item.id === image.id ? { ...item, title: event.target.value } : item))} />
              <textarea rows={3} placeholder="圖片說明" value={image.caption} onChange={(event) => updateImages(images.map((item) => item.id === image.id ? { ...item, caption: event.target.value } : item))} />
              <MediaUpload siteId={siteId} label="更換圖片" onMessage={onMessage} onUploaded={(url) => updateImages(images.map((item) => item.id === image.id ? { ...item, src: url } : item))} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (window.type === "links") {
    const links = window.content.links;
    const updateLinks = (next: typeof links) => update((current) => current.type === "links"
      ? { ...current, content: { ...current.content, links: next } }
      : current);

    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>連結</strong><span>{links.length} 個</span></div>
        <RetroButton onClick={() => updateLinks([...links, { id: makeId(), label: "新連結", icon: "link", color: "#000080", target: "url", url: "https://", windowId: "" }])}>+ 新增連結</RetroButton>
        <div className="inspector-items">
          {links.map((link, index) => (
            <div className="inspector-item" key={link.id}>
              <div className="item-title">
                <strong>{link.label || "未命名連結"}</strong>
                <ItemActions index={index} length={links.length} onMove={(direction) => updateLinks(moveItem(links, index, direction))} onRemove={() => updateLinks(links.filter((item) => item.id !== link.id))} />
              </div>
              <input placeholder="按鈕文字" value={link.label} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} />
              <div className="inline-fields">
                <input placeholder="圖示名稱" value={link.icon} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, icon: event.target.value } : item))} />
                <input type="color" value={link.color} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, color: event.target.value } : item))} aria-label="連結顏色" />
              </div>
              <select value={link.target} onChange={(event) => {
                const target = event.target.value as "url" | "window";
                updateLinks(links.map((item) => item.id === link.id ? { ...item, target, url: target === "window" ? "" : item.url, windowId: target === "url" ? "" : item.windowId } : item));
              }}>
                <option value="url">外部網址</option>
                <option value="window">站內視窗</option>
              </select>
              {link.target === "url" ? (
                <>
                  <input className={isSafeUrl(link.url) ? "" : "invalid-input"} value={link.url} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} placeholder="https:// 或 mailto:" />
                  {!isSafeUrl(link.url) ? <small className="field-error">網址只允許 http、https 或 mailto。</small> : null}
                </>
              ) : (
                <select value={link.windowId} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, windowId: event.target.value } : item))}>
                  <option value="">選擇視窗</option>
                  {allWindows.filter((candidate) => candidate.id !== window.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (window.type === "about") {
    const content = window.content;
    const setContent = (next: typeof content) => update((current) => current.type === "about" ? { ...current, content: next } : current);
    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>名片內容</strong></div>
        {content.avatar ? <CropEditor src={content.avatar} crop={content.avatarCrop} onChange={(avatarCrop) => setContent({ ...content, avatarCrop })} /> : null}
        <MediaUpload siteId={siteId} label={content.avatar ? "更換頭像" : "上傳頭像"} onMessage={onMessage} onUploaded={(url) => setContent({ ...content, avatar: url, avatarCrop: undefined })} />
        <label>暱稱<input value={content.nickname} onChange={(event) => setContent({ ...content, nickname: event.target.value })} /></label>
        <label>橫幅文字<input value={content.banner} onChange={(event) => setContent({ ...content, banner: event.target.value })} /></label>
        <label>簡介<textarea rows={6} value={content.bio} onChange={(event) => setContent({ ...content, bio: event.target.value })} /></label>
        <label>引言<input value={content.quote} onChange={(event) => setContent({ ...content, quote: event.target.value })} /></label>

        <div className="section-heading compact"><strong>自訂欄位</strong><button type="button" onClick={() => setContent({ ...content, fields: [...content.fields, { id: makeId(), key: "欄位", value: "" }] })}>+ 新增</button></div>
        {content.fields.map((field, index) => (
          <div className="inspector-item" key={field.id}>
            <div className="item-title"><strong>欄位 {index + 1}</strong><ItemActions index={index} length={content.fields.length} onMove={(direction) => setContent({ ...content, fields: moveItem(content.fields, index, direction) })} onRemove={() => setContent({ ...content, fields: content.fields.filter((item) => item.id !== field.id) })} /></div>
            <input placeholder="欄位名稱" value={field.key} onChange={(event) => setContent({ ...content, fields: content.fields.map((item) => item.id === field.id ? { ...item, key: event.target.value } : item) })} />
            <input placeholder="內容" value={field.value} onChange={(event) => setContent({ ...content, fields: content.fields.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item) })} />
          </div>
        ))}

        <div className="section-heading compact"><strong>社群連結</strong><button type="button" onClick={() => setContent({ ...content, socials: [...content.socials, { id: makeId(), label: "新連結", url: "https://" }] })}>+ 新增</button></div>
        {content.socials.map((social, index) => (
          <div className="inspector-item" key={social.id}>
            <div className="item-title"><strong>{social.label}</strong><ItemActions index={index} length={content.socials.length} onMove={(direction) => setContent({ ...content, socials: moveItem(content.socials, index, direction) })} onRemove={() => setContent({ ...content, socials: content.socials.filter((item) => item.id !== social.id) })} /></div>
            <input value={social.label} onChange={(event) => setContent({ ...content, socials: content.socials.map((item) => item.id === social.id ? { ...item, label: event.target.value } : item) })} />
            <input className={isSafeUrl(social.url) ? "" : "invalid-input"} value={social.url} onChange={(event) => setContent({ ...content, socials: content.socials.map((item) => item.id === social.id ? { ...item, url: event.target.value } : item) })} placeholder="https:// 或 mailto:" />
            {!isSafeUrl(social.url) ? <small className="field-error">網址只允許 http、https 或 mailto。</small> : null}
          </div>
        ))}
      </section>
    );
  }

  const content = window.content;
  const setContent = (next: typeof content) => update((current) => current.type === "instagram" ? { ...current, content: next } : current);
  const profile = content.profile;
  const images = content.images;

  return (
    <section className="inspector-section">
      <div className="section-heading"><strong>Retro IG 個人頁</strong></div>
      {profile.avatar ? <CropEditor src={profile.avatar} crop={profile.avatarCrop} onChange={(avatarCrop) => setContent({ ...content, profile: { ...profile, avatarCrop } })} /> : null}
      <MediaUpload siteId={siteId} label={profile.avatar ? "更換頭像" : "上傳頭像"} onMessage={onMessage} onUploaded={(url) => setContent({ ...content, profile: { ...profile, avatar: url, avatarCrop: undefined } })} />
      <label>帳號<input value={profile.username} onChange={(event) => setContent({ ...content, profile: { ...profile, username: event.target.value } })} /></label>
      <label>顯示名稱<input value={profile.name} onChange={(event) => setContent({ ...content, profile: { ...profile, name: event.target.value } })} /></label>
      <label>補充文字<input value={profile.alt} onChange={(event) => setContent({ ...content, profile: { ...profile, alt: event.target.value } })} /></label>
      <label>簡介<textarea rows={4} value={profile.bio} onChange={(event) => setContent({ ...content, profile: { ...profile, bio: event.target.value } })} /></label>
      <div className="geometry-grid">
        <label>Followers<input value={profile.followers} onChange={(event) => setContent({ ...content, profile: { ...profile, followers: event.target.value } })} /></label>
        <label>Following<input value={profile.following} onChange={(event) => setContent({ ...content, profile: { ...profile, following: event.target.value } })} /></label>
      </div>
      <label>Followed by<input value={profile.followedBy} onChange={(event) => setContent({ ...content, profile: { ...profile, followedBy: event.target.value } })} /></label>

      <div className="section-heading compact"><strong>貼文</strong><span>{images.length} 張</span></div>
      <MediaUpload siteId={siteId} label="+ 上傳貼文圖片" onMessage={onMessage} onUploaded={(url, file) => setContent({ ...content, images: [...images, { id: makeId(), src: url, title: fileTitle(file), caption: "" }] })} />
      {images.map((image, index) => (
        <div className="inspector-item media-item" key={image.id}>
          {image.src ? <img className="inspector-thumb" referrerPolicy="no-referrer" src={image.src} alt="" /> : null}
          <div className="item-title"><strong>貼文 {index + 1}</strong><ItemActions index={index} length={images.length} onMove={(direction) => setContent({ ...content, images: moveItem(images, index, direction) })} onRemove={() => setContent({ ...content, images: images.filter((item) => item.id !== image.id) })} /></div>
          <input placeholder="圖片標題" value={image.title} onChange={(event) => setContent({ ...content, images: images.map((item) => item.id === image.id ? { ...item, title: event.target.value } : item) })} />
          <textarea rows={3} placeholder="貼文說明" value={image.caption} onChange={(event) => setContent({ ...content, images: images.map((item) => item.id === image.id ? { ...item, caption: event.target.value } : item) })} />
          <MediaUpload siteId={siteId} label="更換圖片" onMessage={onMessage} onUploaded={(url) => setContent({ ...content, images: images.map((item) => item.id === image.id ? { ...item, src: url } : item) })} />
        </div>
      ))}
    </section>
  );
}
