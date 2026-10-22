import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ImageCrop } from "@retrodesk/shared";
import { AvatarImage } from "../../../components/AvatarImage";
import { CropEditor } from "../../editor/CropEditor";
import { useWindowMedia, UploadTaskList } from "../../media/editorMedia";
import { FilePick, ImageUrlField, MiniBtn } from "../ui";
import { opensNewTab, safeHref, type ModuleProps } from "../types";
import "./editor.css";

const clock = () => new Date().toTimeString().slice(0, 5);

export function AboutView({ window, ctx }: ModuleProps<"about">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const content = window.content;
  const fields = content.fields.filter((field) => field.key || field.value);
  return (
    <div className="about about-view" data-mobile={ctx.mobile || undefined} style={{ background: tv.face }}>
      <div className="about-socials">
        {content.socials.map((social) => (
          <a key={social.id} href={safeHref(social.url)} target={opensNewTab(social.url) ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: tv.text }}
            onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: social.url, label: social.label }); }}>
            <u>{social.label.slice(0, 1)}</u>{social.label.slice(1)}
          </a>
        ))}
      </div>
      <div className="about-main" style={{ boxShadow: tv.sunken }}>
        <div className="about-avatar ph" style={{ border: `1px solid ${tv.shadow}`, ["--ph-a" as string]: tv.light, ["--ph-b" as string]: tv.face }}>
          {content.avatar ? <AvatarImage src={content.avatar} crop={content.avatarCrop} alt={tr("about.sAvatar", { nickname: content.nickname })} /> : null}
        </div>
        <div className="about-info">
          {fields.map((field) => <div key={field.id} className="about-field" style={{ border: `1px solid ${tv.shadow}` }}>{field.key}: {field.value}</div>)}
          <u>{content.detailsTitle}</u>
          <div className="about-bio">{content.bio}</div>
          {content.quote ? <div className="about-quote">"{content.quote}"</div> : null}
        </div>
      </div>
      <div className="about-foot">
        <div className="about-bar" style={{ boxShadow: tv.sunken }}><span className="about-nickname">‹ {content.nickname}</span><span className="about-time">Time: {clock()}</span></div>
        {content.banner ? <div className="about-banner">{content.banner}</div> : null}
      </div>
    </div>
  );
}

export function AboutInlineEditor({ window, ctx, update }: ModuleProps<"about">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const [cropping, setCropping] = useState(false);
  const feedbackPrefix = useId();
  const media = useWindowMedia(window, ctx);
  const content = window.content;
  const historyKey = (key?: string) => key ? `about:${window.id}:${key}` : undefined;
  const patch = (change: Partial<typeof content>, key?: string) => update((current) => ({ ...current, content: { ...current.content, ...change } }), historyKey(key));
  const setFields = (recipe: (list: typeof content.fields) => typeof content.fields, key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, fields: recipe(current.content.fields) } }), historyKey(key));
  const setSocials = (recipe: (list: typeof content.socials) => typeof content.socials, key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, socials: recipe(current.content.socials) } }), historyKey(key));

  function uploadAvatar(file: File) {
    const capturedAvatar = content.avatar;
    const capturedUrl = content.avatarUrl;
    media.upload(file, {
      kind: "image",
      slot: "avatar",
      isCurrent: (current) => current.content.avatar === capturedAvatar && current.content.avatarUrl === capturedUrl,
      apply: (current, stored) => ({ ...current, content: { ...current.content, avatar: stored, avatarUrl: "", avatarCrop: undefined } }),
    });
  }

  return (
    <div className="about editing about-editor" style={{ background: tv.face }}>
      <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      <details className="about-editor-section" open>
        <summary>{tr("about.basicInfo")}</summary>
        <div className="about-editor-section-body about-editor-basics">
          <div className="about-editor-heading">
            <div className="about-avatar ph" style={{ border: `1px solid ${tv.shadow}` }}>
              {content.avatar ? <AvatarImage src={content.avatar} crop={content.avatarCrop} alt={tr("about.avatarPreview")} /> : <span className="about-avatar-empty">{tr("about.noAvatarSetYet")}</span>}
            </div>
            <label><span>{tr("about.nickname")}</span><input className="ie" value={content.nickname} maxLength={160} onChange={(event) => patch({ nickname: event.currentTarget.value }, "nickname")} /></label>
          </div>
          <label><span>{tr("about.bio")}</span><textarea className="ie" rows={3} value={content.bio} maxLength={5000} placeholder={tr("about.introduceYourselfOneLinePer")} aria-label={tr("about.bio")} onChange={(event) => patch({ bio: event.currentTarget.value }, "bio")} /></label>
          <details className="about-avatar-settings">
            <summary>{tr("about.avatarSettings")}</summary>
            <div className="about-edit-avatar">
              <div className="ie-row">
                <FilePick onFiles={(files) => uploadAvatar(files[0])}>{content.avatar ? tr("about.changeAvatar") : tr("about.uploadAvatar")}</FilePick>
                {content.avatar ? <MiniBtn label={tr("about.adjustPosition")} className="mini-btn wide" on={cropping} aria-pressed={cropping} onClick={() => setCropping(!cropping)}>{tr("about.adjustPosition")}</MiniBtn> : null}
                {content.avatar ? <MiniBtn label={tr("about.removeAvatar")} className="mini-btn wide" onClick={() => { setCropping(false); patch({ avatar: null, avatarUrl: "", avatarCrop: undefined }); }}>{tr("about.removeAvatar")}</MiniBtn> : null}
              </div>
              <ImageUrlField visibleLabel onEdit={() => media.cancel("avatar")} key={window.id} raw={content.avatarUrl} label={tr("about.avatarUrl")} placeholder={tr("about.orPasteAnAvatarUrl")} onCommit={(raw, src) => { setCropping(false); patch({ avatarUrl: raw, avatar: src, avatarCrop: undefined }); }} />
              {cropping && content.avatar ? <CropEditor key={content.avatar} src={content.avatar} crop={content.avatarCrop as ImageCrop | undefined} onChange={(avatarCrop) => patch({ avatarCrop }, "avatar-crop")} /> : null}
            </div>
          </details>
          <label><span>{tr("about.bioTagline")}</span><input className="ie" value={content.detailsTitle} maxLength={100} aria-label={tr("about.tagline")} onChange={(event) => patch({ detailsTitle: event.currentTarget.value }, "details-title")} /></label>
          <label><span>{tr("about.quoteOptional")}</span><textarea className="ie" rows={2} value={content.quote} maxLength={500} placeholder={tr("about.aLineYoudLikeTo")} aria-label={tr("about.quote")} onChange={(event) => patch({ quote: event.currentTarget.value }, "quote")} /></label>
          <label><span>{tr("about.bannerTextOptional")}</span><textarea className="ie" rows={2} value={content.banner} maxLength={500} placeholder={tr("about.leaveBlankToHideThe")} aria-label={tr("about.bannerText")} onChange={(event) => patch({ banner: event.currentTarget.value }, "banner")} /></label>
        </div>
      </details>
      <details className="about-editor-section">
        <summary>{tr("about.customFieldsCount", { count: content.fields.length })}</summary>
        <div className="about-editor-section-body">
          <p className="about-editor-hint">{tr("about.forExampleAFormOf")}</p>
          {!content.fields.length ? <p className="about-editor-empty">{tr("about.noCustomFieldsYetAdd")}</p> : null}
          {content.fields.map((field, index) => (
            <fieldset key={field.id} className="about-editor-item">
              <legend>{tr("about.fieldN", { n: index + 1 })}</legend>
              <label><span>{tr("about.fieldName")}</span><input className="ie" value={field.key} maxLength={100} placeholder={tr("about.eGTypeOfCreator")} aria-label={tr("about.fieldName")} onChange={(event) => { const value = event.currentTarget.value; setFields((list) => list.map((item) => item.id === field.id ? { ...item, key: value } : item), `field:${field.id}:key`); }} /></label>
              <label><span>{tr("about.fieldContent")}</span><textarea className="ie" rows={2} value={field.value} maxLength={500} placeholder={tr("about.content")} aria-label={tr("about.fieldContent")} onChange={(event) => { const value = event.currentTarget.value; setFields((list) => list.map((item) => item.id === field.id ? { ...item, value } : item), `field:${field.id}:value`); }} /></label>
              <MiniBtn label={tr("about.deleteField")} danger onClick={() => setFields((list) => list.filter((item) => item.id !== field.id))}>{tr("about.deleteField")}</MiniBtn>
            </fieldset>
          ))}
          <button type="button" className="ie-add" disabled={content.fields.length >= 50} onClick={() => setFields((list) => list.length < 50 ? [...list, { id: crypto.randomUUID(), key: "", value: "" }] : list)}>{tr("about.addField")}</button>
          {content.fields.length >= 50 ? <p className="about-editor-hint">{tr("about.youveReachedTheLimitOf")}</p> : null}
        </div>
      </details>
      <details className="about-editor-section">
        <summary>{tr("about.socialsCount", { count: content.socials.length })}</summary>
        <div className="about-editor-section-body">
          {!content.socials.length ? <p className="about-editor-empty">{tr("about.addYourSocialAccountsOr")}</p> : null}
          {content.socials.map((social, index) => {
            const invalid = !!social.url && !["https://", "http://"].includes(social.url) && safeHref(social.url) === "#";
            const hintId = `${feedbackPrefix}-social-${index}`;
            return (
              <fieldset key={social.id} className="about-editor-item">
                <legend>{tr("about.socialN", { n: index + 1 })}</legend>
                <label><span>{tr("about.socialName")}</span><input className="ie" value={social.label} maxLength={100} placeholder={tr("about.eGPortfolio")} aria-label={tr("about.socialName")} onChange={(event) => { const value = event.currentTarget.value; setSocials((list) => list.map((item) => item.id === social.id ? { ...item, label: value } : item), `social:${social.id}:label`); }} /></label>
                <label><span>{tr("about.socialUrl")}</span><input className="ie" value={social.url} maxLength={2048} placeholder="https://" aria-label={tr("about.socialUrl")} aria-invalid={invalid} aria-describedby={hintId} onChange={(event) => { const value = event.currentTarget.value; setSocials((list) => list.map((item) => item.id === social.id ? { ...item, url: value } : item), `social:${social.id}:url`); }} /></label>
                <span id={hintId} className={invalid ? "ie-error" : "about-editor-hint"}>{invalid ? tr("document.enterAFullHttpHttps") : safeHref(social.url) === "#" ? tr("about.noFullUrlSetYet") : tr("about.visitorsCanOpenThisLink")}</span>
                <MiniBtn label={tr("about.deleteSocialLink")} danger onClick={() => setSocials((list) => list.filter((item) => item.id !== social.id))}>{tr("about.deleteSocialLink")}</MiniBtn>
              </fieldset>
            );
          })}
          <button type="button" className="ie-add" disabled={content.socials.length >= 50} onClick={() => setSocials((list) => list.length < 50 ? [...list, { id: crypto.randomUUID(), label: "", url: "" }] : list)}>{tr("about.addSocialLink")}</button>
          {content.socials.length >= 50 ? <p className="about-editor-hint">{tr("about.youveReachedTheLimitOf2")}</p> : null}
        </div>
      </details>
    </div>
  );
}
