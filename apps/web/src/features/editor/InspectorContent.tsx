import { useId, useState, type ChangeEvent } from "react";
import { translateSystemMessage } from "../../i18n/systemMessages";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { makeGalleryImage, makeIgPost, makeLink, normalizeImageUrl, type DesktopWindow, type DocumentBlock } from "@retrodesk/shared";
import { api } from "../../lib/api";
import { RetroButton } from "../../components/RetroButton";
import { CropEditor } from "./CropEditor";
import { useAssetSource } from "../../lib/assetSource";

type Props = {
  window: DesktopWindow;
  allWindows: DesktopWindow[];
  siteId: string;
  update: (recipe: (window: DesktopWindow) => DesktopWindow) => void;
  onMessage: (message: string) => void;
};

const makeId = () => crypto.randomUUID();

function InspectorImage({ src }: { src: string }) {
  const { t: tr } = useTranslation("editor");
  const resolved = useAssetSource(src);
  return resolved ? <img className="inspector-thumb" referrerPolicy="no-referrer" src={resolved} alt="" /> : <div className="inspector-thumb placeholder">{tr("inspectorContent.loading")}</div>;
}

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
      return { id, kind, text: i18n.t("editor:inspectorContent.newHeading") };
    case "text":
      return { id, kind, text: i18n.t("editor:inspectorContent.typeText"), align: "left", bold: false, italic: false };
    case "image":
      return { id, kind, src: null, srcUrl: "", alt: "" };
    case "button":
      return { id, kind, text: i18n.t("editor:inspectorContent.button"), url: "https://" };
    case "link":
      return { id, kind, text: i18n.t("editor:inspectorContent.link"), url: "https://" };
    case "list":
      return { id, kind, text: i18n.t("editor:inspectorContent.itemOneNitemTwo") };
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
  const { t: tr } = useTranslation("editor");
  return (
    <div className="item-actions">
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={tr("inspectorContent.moveUp")}>↑</button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(1)} aria-label={tr("inspectorContent.moveDown")}>↓</button>
      <button type="button" className="danger-text" onClick={onRemove}>{tr("inspectorContent.delete")}</button>
    </div>
  );
}

function fileTitle(file?: File) {
  return file ? file.name.replace(/\.[^.]+$/, "") : i18n.t("editor:inspectorContent.image");
}

function MediaUpload({ siteId, label, onUploaded, onMessage }: {
  siteId: string;
  label: string;
  onUploaded: (url: string, file?: File) => void;
  onMessage: (message: string) => void;
}) {
  const { t: tr } = useTranslation("editor");
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");

  function useLink() {
    const result = normalizeImageUrl(link);
    if (!result.ok) {
      onMessage(translateSystemMessage(result.reason));
      return;
    }
    onUploaded(result.url);
    onMessage(result.source === "google-drive" ? tr("inspectorContent.aGoogleDriveImageIs") : tr("inspectorContent.anImageLinkIsIn"));
    setLink("");
    setLinking(false);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      onMessage(tr("inspectorContent.onlyJpegPngWebpAnd"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      onMessage(tr("inspectorContent.imagesMustBeSmallerThan"));
      return;
    }

    setBusy(true);
    try {
      const { asset } = await api.uploadAsset(siteId, file);
      onUploaded(asset.url, file);
      onMessage(tr("inspectorContent.imageUploaded"));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : tr("inspectorContent.imageUploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-source">
      <label className={"media-upload " + (busy ? "busy" : "")} htmlFor={inputId}>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={upload} />
        <span>{busy ? tr("inspectorContent.uploading") : label}</span>
      </label>
      {linking ? (
        <div className="media-link">
          <input type="url" inputMode="url" placeholder={tr("inspectorContent.pasteAnImageOrGoogle")} value={link} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); useLink(); } }} />
          <RetroButton type="button" className="primary" onClick={useLink}>{tr("inspectorContent.useLink")}</RetroButton>
          <RetroButton type="button" onClick={() => setLinking(false)}>{tr("editor.cancel")}</RetroButton>
        </div>
      ) : (
        <button type="button" className="media-link-toggle" onClick={() => setLinking(true)}>{tr("inspectorContent.orPasteAnImageLink")}</button>
      )}
    </div>
  );
}

export function InspectorContent({ window, allWindows, siteId, update, onMessage }: Props) {
  const { t: tr } = useTranslation("editor");
  if (window.type === "document") {
    const blocks = window.content.blocks;
    const updateBlocks = (next: DocumentBlock[]) => update((current) => current.type === "document"
      ? { ...current, content: { ...current.content, blocks: next } }
      : current);

    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>{tr("inspectorContent.documentContent")}</strong><span>{tr("inspector.blockCount", { count: blocks.length })}</span></div>
        <div className="add-chip-row">
          {(["heading", "text", "image", "button", "link", "list", "divider"] as const).map((kind) => (
            <button key={kind} type="button" onClick={() => updateBlocks([...blocks, newBlock(kind)])}>
              + {kind === "heading" ? tr("inspectorContent.heading") : kind === "text" ? tr("inspectorContent.text") : kind === "image" ? tr("inspectorContent.image") : kind === "button" ? tr("inspectorContent.button") : kind === "link" ? tr("inspectorContent.link") : kind === "list" ? tr("inspectorContent.list") : tr("inspectorContent.divider")}
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
                    <option value="left">{tr("inspectorContent.alignLeft")}</option>
                    <option value="center">{tr("inspectorContent.center")}</option>
                    <option value="right">{tr("inspectorContent.alignRight")}</option>
                  </select>
                </>
              ) : null}

              {block.kind === "list" ? (
                <textarea rows={5} value={block.text} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, text: event.target.value } : item))} placeholder={tr("inspectorContent.oneItemPerLine")} />
              ) : null}

              {block.kind === "image" ? (
                <>
                  {block.src ? <InspectorImage src={block.src} /> : <div className="inspector-thumb placeholder">{tr("inspectorContent.notUploadedYet")}</div>}
                  <MediaUpload
                    siteId={siteId}
                    label={block.src ? tr("inspectorContent.replaceImage") : tr("inspectorContent.uploadImage")}
                    onMessage={onMessage}
                    onUploaded={(url) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, src: url } : item))}
                  />
                  <input placeholder={tr("inspectorContent.altText")} value={block.alt} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, alt: event.target.value } : item))} />
                </>
              ) : null}

              {block.kind === "button" || block.kind === "link" ? (
                <>
                  <input value={block.text} onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, text: event.target.value } : item))} />
                  <input
                    className={isSafeUrl(block.url) ? "" : "invalid-input"}
                    value={block.url}
                    onChange={(event) => updateBlocks(blocks.map((item) => item.id === block.id ? { ...block, url: event.target.value } : item))}
                    placeholder={tr("inspectorContent.httpsOrMailto")}
                  />
                  {!isSafeUrl(block.url) ? <small className="field-error">{tr("inspectorContent.onlyHttpHttpsOrMailto")}</small> : null}
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
        <div className="section-heading"><strong>{tr("inspectorContent.gallery")}</strong><span>{tr("inspector.imageCount", { count: images.length })}</span></div>
        <label>
          {tr("inspector.columnsPerRow")}
          <select value={window.content.columns} onChange={(event) => update((current) => current.type === "gallery" ? { ...current, content: { ...current.content, columns: Number(event.target.value) } } : current)}>
            {[1, 2, 3, 4, 5].map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </label>
        <MediaUpload
          siteId={siteId}
          label={tr("inspectorContent.uploadImage2")}
          onMessage={onMessage}
          onUploaded={(url, file) => updateImages([...images, makeGalleryImage({ src: url, title: fileTitle(file) })])}
        />
        <div className="inspector-items">
          {images.map((image, index) => (
            <div className="inspector-item media-item" key={image.id}>
              {image.src ? <InspectorImage src={image.src} /> : null}
              <div className="item-title">
                <strong>{tr("inspector.imageN", { n: index + 1 })}</strong>
                <ItemActions
                  index={index}
                  length={images.length}
                  onMove={(direction) => updateImages(moveItem(images, index, direction))}
                  onRemove={() => updateImages(images.filter((item) => item.id !== image.id))}
                />
              </div>
              <input placeholder={tr("inspectorContent.imageTitle")} value={image.title} onChange={(event) => updateImages(images.map((item) => item.id === image.id ? { ...item, title: event.target.value } : item))} />
              <textarea rows={3} placeholder={tr("inspectorContent.imageDescription")} value={image.caption} onChange={(event) => updateImages(images.map((item) => item.id === image.id ? { ...item, caption: event.target.value } : item))} />
              <MediaUpload siteId={siteId} label={tr("inspectorContent.replaceImage")} onMessage={onMessage} onUploaded={(url) => updateImages(images.map((item) => item.id === image.id ? { ...item, src: url } : item))} />
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
        <div className="section-heading"><strong>{tr("inspectorContent.link")}</strong><span>{tr("inspector.linkCount", { count: links.length })}</span></div>
        <RetroButton onClick={() => updateLinks([...links, makeLink({ url: "https://" })])}>{tr("inspectorContent.addLink")}</RetroButton>
        <div className="inspector-items">
          {links.map((link, index) => (
            <div className="inspector-item" key={link.id}>
              <div className="item-title">
                <strong>{link.label || tr("inspectorContent.untitledLink")}</strong>
                <ItemActions index={index} length={links.length} onMove={(direction) => updateLinks(moveItem(links, index, direction))} onRemove={() => updateLinks(links.filter((item) => item.id !== link.id))} />
              </div>
              <input placeholder={tr("inspectorContent.buttonText")} value={link.label} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} />
              <div className="inline-fields">
                <input placeholder={tr("inspectorContent.iconName")} value={link.icon} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, icon: event.target.value } : item))} />
                <input type="color" value={link.color} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, color: event.target.value } : item))} aria-label={tr("inspectorContent.linkColor")} />
              </div>
              <select value={link.target} onChange={(event) => {
                const target = event.target.value as "url" | "window";
                updateLinks(links.map((item) => item.id === link.id ? { ...item, target, url: target === "window" ? "" : item.url, windowId: target === "url" ? "" : item.windowId } : item));
              }}>
                <option value="url">{tr("inspectorContent.externalUrl")}</option>
                <option value="window">{tr("inspectorContent.inSiteWindow")}</option>
              </select>
              {link.target === "url" ? (
                <>
                  <input className={isSafeUrl(link.url) ? "" : "invalid-input"} value={link.url} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} placeholder={tr("inspectorContent.httpsOrMailto")} />
                  {!isSafeUrl(link.url) ? <small className="field-error">{tr("inspectorContent.onlyHttpHttpsOrMailto")}</small> : null}
                </>
              ) : (
                <select value={link.windowId} onChange={(event) => updateLinks(links.map((item) => item.id === link.id ? { ...item, windowId: event.target.value } : item))}>
                  <option value="">{tr("inspectorContent.chooseAWindow")}</option>
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
        <div className="section-heading"><strong>{tr("inspectorContent.cardContent")}</strong></div>
        {content.avatar ? <CropEditor src={content.avatar} crop={content.avatarCrop} onChange={(avatarCrop) => setContent({ ...content, avatarCrop })} /> : null}
        <MediaUpload siteId={siteId} label={content.avatar ? tr("inspectorContent.changeAvatar") : tr("inspectorContent.uploadAvatar")} onMessage={onMessage} onUploaded={(url) => setContent({ ...content, avatar: url, avatarCrop: undefined })} />
        <label>{tr("inspectorContent.nickname")}<input value={content.nickname} onChange={(event) => setContent({ ...content, nickname: event.target.value })} /></label>
        <label>{tr("inspectorContent.bannerText")}<input value={content.banner} onChange={(event) => setContent({ ...content, banner: event.target.value })} /></label>
        <label>{tr("inspectorContent.bio")}<textarea rows={6} value={content.bio} onChange={(event) => setContent({ ...content, bio: event.target.value })} /></label>
        <label>{tr("inspectorContent.quote")}<input value={content.quote} onChange={(event) => setContent({ ...content, quote: event.target.value })} /></label>

        <div className="section-heading compact"><strong>{tr("inspectorContent.customFields")}</strong><button type="button" onClick={() => setContent({ ...content, fields: [...content.fields, { id: makeId(), key: tr("inspectorContent.field"), value: "" }] })}>{tr("inspectorContent.add")}</button></div>
        {content.fields.map((field, index) => (
          <div className="inspector-item" key={field.id}>
            <div className="item-title"><strong>{tr("inspector.fieldN", { n: index + 1 })}</strong><ItemActions index={index} length={content.fields.length} onMove={(direction) => setContent({ ...content, fields: moveItem(content.fields, index, direction) })} onRemove={() => setContent({ ...content, fields: content.fields.filter((item) => item.id !== field.id) })} /></div>
            <input placeholder={tr("inspectorContent.fieldName")} value={field.key} onChange={(event) => setContent({ ...content, fields: content.fields.map((item) => item.id === field.id ? { ...item, key: event.target.value } : item) })} />
            <input placeholder={tr("inspectorContent.content")} value={field.value} onChange={(event) => setContent({ ...content, fields: content.fields.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item) })} />
          </div>
        ))}

        <div className="section-heading compact"><strong>{tr("inspectorContent.socialLinks")}</strong><button type="button" onClick={() => setContent({ ...content, socials: [...content.socials, { id: makeId(), label: tr("inspectorContent.newLink"), url: "https://" }] })}>{tr("inspectorContent.add")}</button></div>
        {content.socials.map((social, index) => (
          <div className="inspector-item" key={social.id}>
            <div className="item-title"><strong>{social.label}</strong><ItemActions index={index} length={content.socials.length} onMove={(direction) => setContent({ ...content, socials: moveItem(content.socials, index, direction) })} onRemove={() => setContent({ ...content, socials: content.socials.filter((item) => item.id !== social.id) })} /></div>
            <input value={social.label} onChange={(event) => setContent({ ...content, socials: content.socials.map((item) => item.id === social.id ? { ...item, label: event.target.value } : item) })} />
            <input className={isSafeUrl(social.url) ? "" : "invalid-input"} value={social.url} onChange={(event) => setContent({ ...content, socials: content.socials.map((item) => item.id === social.id ? { ...item, url: event.target.value } : item) })} placeholder={tr("inspectorContent.httpsOrMailto")} />
            {!isSafeUrl(social.url) ? <small className="field-error">{tr("inspectorContent.onlyHttpHttpsOrMailto")}</small> : null}
          </div>
        ))}
      </section>
    );
  }

  if (window.type === "music") {
    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>{tr("inspectorContent.musicPlayer")}</strong></div>
        <p>{tr("inspectorContent.goBackToTheWindow")}</p>
      </section>
    );
  }

  if (window.type === "moodboard") {
    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>{tr("inspectorContent.moodboard")}</strong></div>
        <p>{tr("inspectorContent.addSelectAndArrangeImages")}</p>
      </section>
    );
  }

  if (window.type === "explorer") {
    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>{tr("inspectorContent.worldBuildingFolders")}</strong></div>
        <p>{tr("inspectorContent.addFoldersAndShortcutsRight")}</p>
      </section>
    );
  }

  if (window.type === "minesweeper" || window.type === "character-dialog" || window.type === "guestbook") {
    return (
      <section className="inspector-section">
        <div className="section-heading"><strong>{window.type === "minesweeper" ? tr("inspectorContent.minesweeper") : window.type === "character-dialog" ? tr("inspectorContent.characterPopUp") : tr("inspectorContent.visitorGuestbook")}</strong></div>
        <p>{window.type === "guestbook" ? tr("inspectorContent.openMessagesInsideTheWindow") : tr("inspectorContent.adjustSettingsAndPreviewDirectly")}</p>
      </section>
    );
  }

  const content = window.content;
  const setContent = (next: typeof content) => update((current) => current.type === "instagram" ? { ...current, content: next } : current);
  const profile = content.profile;
  const images = content.images;

  return (
    <section className="inspector-section">
      <div className="section-heading"><strong>{tr("inspectorContent.retroIgProfile")}</strong></div>
      {profile.avatar ? <CropEditor src={profile.avatar} crop={profile.avatarCrop} onChange={(avatarCrop) => setContent({ ...content, profile: { ...profile, avatarCrop } })} /> : null}
      <MediaUpload siteId={siteId} label={profile.avatar ? tr("inspectorContent.changeAvatar") : tr("inspectorContent.uploadAvatar")} onMessage={onMessage} onUploaded={(url) => setContent({ ...content, profile: { ...profile, avatar: url, avatarCrop: undefined } })} />
      <label>{tr("inspectorContent.handle")}<input value={profile.username} onChange={(event) => setContent({ ...content, profile: { ...profile, username: event.target.value } })} /></label>
      <label>{tr("inspectorContent.displayName")}<input value={profile.name} onChange={(event) => setContent({ ...content, profile: { ...profile, name: event.target.value } })} /></label>
      <label>{tr("inspectorContent.extraText")}<input value={profile.alt} onChange={(event) => setContent({ ...content, profile: { ...profile, alt: event.target.value } })} /></label>
      <label>{tr("inspectorContent.bio")}<textarea rows={4} value={profile.bio} onChange={(event) => setContent({ ...content, profile: { ...profile, bio: event.target.value } })} /></label>
      <div className="geometry-grid">
        <label>Followers<input value={profile.followers} onChange={(event) => setContent({ ...content, profile: { ...profile, followers: event.target.value } })} /></label>
        <label>Following<input value={profile.following} onChange={(event) => setContent({ ...content, profile: { ...profile, following: event.target.value } })} /></label>
      </div>
      <label>Followed by<input value={profile.followedBy} onChange={(event) => setContent({ ...content, profile: { ...profile, followedBy: event.target.value } })} /></label>

      <div className="section-heading compact"><strong>{tr("inspector.postsHeading")}</strong><span>{tr("inspector.postCount", { count: images.length })}</span></div>
      <MediaUpload siteId={siteId} label={tr("inspectorContent.uploadPostImages")} onMessage={onMessage} onUploaded={(url, file) => setContent({ ...content, images: [...images, makeIgPost({ src: url, title: fileTitle(file) })] })} />
      {images.map((image, index) => (
        <div className="inspector-item media-item" key={image.id}>
          {image.src ? <InspectorImage src={image.src} /> : null}
          <div className="item-title"><strong>{tr("inspector.postN", { n: index + 1 })}</strong><ItemActions index={index} length={images.length} onMove={(direction) => setContent({ ...content, images: moveItem(images, index, direction) })} onRemove={() => setContent({ ...content, images: images.filter((item) => item.id !== image.id) })} /></div>
          <input placeholder={tr("inspectorContent.imageTitle")} value={image.title} onChange={(event) => setContent({ ...content, images: images.map((item) => item.id === image.id ? { ...item, title: event.target.value } : item) })} />
          <textarea rows={3} placeholder={tr("inspectorContent.postDescription")} value={image.caption} onChange={(event) => setContent({ ...content, images: images.map((item) => item.id === image.id ? { ...item, caption: event.target.value } : item) })} />
          <MediaUpload siteId={siteId} label={tr("inspectorContent.replaceImage")} onMessage={onMessage} onUploaded={(url) => setContent({ ...content, images: images.map((item) => item.id === image.id ? { ...item, src: url } : item) })} />
        </div>
      ))}
    </section>
  );
}
