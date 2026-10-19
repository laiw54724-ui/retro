import { useTranslation } from "react-i18next";
import type { ImageContent, ImageCrop } from "@retrodesk/shared";
import { FilePick, ImageUrlField } from "../ui";
import type { ModuleProps } from "../types";
import { UploadTaskList, useWindowMedia } from "../../media/editorMedia";
import { ImagePresentation } from "./presentation/ImagePresentation";
import { DEFAULT_IMAGE_CROP } from "./presentation/placement";
import { createImageContent, imageUploadOptions, patchImageContent } from "./model";
import styles from "./ImageEditor.module.css";

export { createImageContent };

export function ImageView({ window, ctx }: ModuleProps<"image">) {
  const content = window.content;
  return <ImagePresentation
    source={content.src} alt={content.alt} caption={content.caption}
    showCaption={content.showCaption} fit={content.fit} crop={content.crop}
    background={content.background} pixelated={content.pixelated}
    frame={content.frameMode} interaction={content.interactionMode}
    mode={ctx.editing ? "editor" : "visitor"}
  />;
}

const colorOf = (background: ImageContent["background"]) => typeof background === "object" ? background.color : "#ffffff";

export function ImageInlineEditor({ window, ctx, update }: ModuleProps<"image">) {
  const { t } = useTranslation("modules");
  const media = useWindowMedia(window, ctx);
  const content = window.content;
  const crop = content.crop ?? DEFAULT_IMAGE_CROP;
  const canUpload = !!(ctx.editing && ctx.siteId && ctx.upload);
  const key = (field: string) => `image:${window.id}:${field}`;
  const patch = (change: Partial<ImageContent>, field?: string) =>
    update((current) => patchImageContent(current, change), field ? key(field) : undefined);
  const patchCrop = (change: Partial<ImageCrop>, field: string) =>
    update((current) => patchImageContent(current, { crop: { ...(current.content.crop ?? DEFAULT_IMAGE_CROP), ...change } }), key(`crop:${field}`));

  return (
    <section className={styles.editor} aria-label={t("image.settings")}>
      <div className={styles.preview}>
        <ImagePresentation
          source={content.src} alt={content.alt} caption={content.caption}
          showCaption={content.showCaption} fit={content.fit} crop={content.crop}
          background={content.background} pixelated={content.pixelated}
          frame={content.frameMode} interaction={content.interactionMode} mode="editor"
        />
      </div>
      <div className={styles.controls}>
        <fieldset className={styles.group}>
          <legend>{t("image.source")}</legend>
          <div className={styles.row}>
            {canUpload ? <FilePick onFiles={(files) => { if (files[0]) media.upload(files[0], imageUploadOptions(window)); }}>
              {content.src ? t("image.replace") : t("image.upload")}
            </FilePick> : null}
            {content.src ? <button type="button" className="mini-btn wide" onClick={() => patch({ src: null, srcUrl: "" })}>{t("image.remove")}</button> : null}
          </div>
          <label className={styles.field}>{t("image.url")}
            <ImageUrlField raw={content.srcUrl} label={t("image.url")} placeholder="https://" onCommit={(srcUrl, src) => patch({ srcUrl, src })} />
          </label>
          <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{t("image.accessibility")}</legend>
          <label className={styles.field}>{t("image.interaction")}
            <select className="ie small" value={content.interactionMode} onChange={(event) => patch({ interactionMode: event.target.value as ImageContent["interactionMode"] })}>
              <option value="content">{t("image.content")}</option>
              <option value="decorative">{t("image.decorative")}</option>
            </select>
          </label>
          <label className={styles.field}>{t("image.alt")}
            <textarea className="ie small" rows={2} maxLength={300} value={content.alt} disabled={content.interactionMode === "decorative"} onChange={(event) => patch({ alt: event.target.value }, "alt")} />
          </label>
          <p className={styles.hint}>{content.interactionMode === "decorative" ? t("image.decorativeHint") : t("image.altHint")}</p>
          <label className={styles.field}>{t("image.caption")}
            <textarea className="ie small" rows={2} maxLength={300} value={content.caption} onChange={(event) => patch({ caption: event.target.value }, "caption")} />
          </label>
          <label className={styles.check}><input type="checkbox" checked={content.showCaption} onChange={(event) => patch({ showCaption: event.target.checked })} />{t("image.showCaption")}</label>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{t("image.placement")}</legend>
          <label className={styles.field}>{t("image.fit")}
            <select className="ie small" value={content.fit} onChange={(event) => patch({ fit: event.target.value as ImageContent["fit"] })}>
              <option value="contain">{t("image.contain")}</option>
              <option value="cover">{t("image.cover")}</option>
              <option value="original">{t("image.original")}</option>
            </select>
          </label>
          <div className={styles.sliders}>
            {(["x", "y", "zoom"] as const).map((field) => (
              <label key={field} className={styles.slider}>{t(`image.${field}`)} <output aria-hidden="true">{field === "zoom" ? `${crop.zoom.toFixed(1)}×` : `${crop[field]}%`}</output>
                <input type="range" aria-label={t(`image.${field}`)} min={field === "zoom" ? 1 : 0} max={field === "zoom" ? 4 : 100} step={field === "zoom" ? 0.1 : 1} value={crop[field]} onChange={(event) => patchCrop({ [field]: Number(event.target.value) }, field)} />
              </label>
            ))}
          </div>
          {content.crop ? <button type="button" className="mini-btn wide" onClick={() => patch({ crop: undefined })}>{t("image.resetCrop")}</button> : null}
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{t("image.appearance")}</legend>
          <label className={styles.field}>{t("image.frame")}
            <select className="ie small" value={content.frameMode} onChange={(event) => patch({ frameMode: event.target.value as ImageContent["frameMode"] })}>
              <option value="none">{t("image.frameless")}</option>
              <option value="simple">{t("image.simpleFrame")}</option>
            </select>
          </label>
          <label className={styles.field}>{t("image.background")}
            <select className="ie small" value={typeof content.background === "object" ? "color" : content.background} onChange={(event) => patch({ background: event.target.value === "color" ? { color: colorOf(content.background) } : event.target.value as "transparent" | "checker" })}>
              <option value="transparent">{t("image.transparent")}</option>
              <option value="checker">{t("image.checker")}</option>
              <option value="color">{t("image.solidColor")}</option>
            </select>
          </label>
          {typeof content.background === "object" ? <label className={styles.color}>{t("image.color")}<input type="color" value={content.background.color} onChange={(event) => patch({ background: { color: event.target.value } }, "backgroundColor")} /></label> : null}
          <label className={styles.check}><input type="checkbox" checked={content.pixelated} onChange={(event) => patch({ pixelated: event.target.checked })} />{t("image.pixelated")}</label>
        </fieldset>
      </div>
    </section>
  );
}
