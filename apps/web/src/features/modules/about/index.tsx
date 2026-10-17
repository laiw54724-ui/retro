import { useId, useState } from "react";
import { type ImageCrop } from "@retrodesk/shared";
import { AvatarImage } from "../../../components/AvatarImage";
import { CropEditor } from "../../editor/CropEditor";
import { useWindowMedia, UploadTaskList } from "../../media/editorMedia";
import { FilePick, ImageUrlField, MiniBtn } from "../ui";
import { opensNewTab, safeHref, type ModuleProps } from "../types";
import "./editor.css";

const clock = () => new Date().toTimeString().slice(0, 5);

export function AboutView({ window, ctx }: ModuleProps<"about">) {
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
          {content.avatar ? <AvatarImage src={content.avatar} crop={content.avatarCrop} alt={`${content.nickname} 的頭像`} /> : null}
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
      <p className="about-editor-intro">編輯名片內容，展開需要修改的區段。</p>
      <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      <details className="about-editor-section" open>
        <summary>基本資料</summary>
        <div className="about-editor-section-body about-editor-basics">
          <div className="about-edit-avatar">
            <div className="about-avatar ph" style={{ border: `1px solid ${tv.shadow}` }}>
              {content.avatar ? <AvatarImage src={content.avatar} crop={content.avatarCrop} alt="頭像預覽" /> : <span className="about-avatar-empty">尚未設定頭像</span>}
            </div>
            <div className="ie-row">
              <FilePick onFiles={(files) => uploadAvatar(files[0])}>{content.avatar ? "更換頭像" : "上傳頭像"}</FilePick>
              {content.avatar ? <MiniBtn label="調整位置" className="mini-btn wide" on={cropping} aria-pressed={cropping} onClick={() => setCropping(!cropping)}>調整位置</MiniBtn> : null}
              {content.avatar ? <MiniBtn label="移除頭像" className="mini-btn wide" onClick={() => { setCropping(false); patch({ avatar: null, avatarUrl: "", avatarCrop: undefined }); }}>移除頭像</MiniBtn> : null}
            </div>
            <ImageUrlField key={window.id} raw={content.avatarUrl} label="頭像網址" placeholder="或貼上頭像網址" onCommit={(raw, src) => { setCropping(false); patch({ avatarUrl: raw, avatar: src, avatarCrop: undefined }); }} />
            {cropping && content.avatar ? <CropEditor key={content.avatar} src={content.avatar} crop={content.avatarCrop as ImageCrop | undefined} onChange={(avatarCrop) => patch({ avatarCrop }, "avatar-crop")} /> : null}
          </div>
          <div className="about-info">
            <label><span>暱稱</span><input className="ie" value={content.nickname} maxLength={160} onChange={(event) => patch({ nickname: event.currentTarget.value }, "nickname")} /></label>
            <label><span>簡介小標</span><input className="ie" value={content.detailsTitle} maxLength={100} aria-label="小標" onChange={(event) => patch({ detailsTitle: event.currentTarget.value }, "details-title")} /></label>
            <label><span>簡介</span><textarea className="ie" rows={4} value={content.bio} maxLength={5000} placeholder="自我介紹，每行一句" aria-label="簡介" onChange={(event) => patch({ bio: event.currentTarget.value }, "bio")} /></label>
            <label><span>引言（選填）</span><textarea className="ie" rows={2} value={content.quote} maxLength={500} placeholder="想分享的一句話" aria-label="引言" onChange={(event) => patch({ quote: event.currentTarget.value }, "quote")} /></label>
            <label><span>橫幅文字（選填）</span><textarea className="ie" rows={2} value={content.banner} maxLength={500} placeholder="留空即隱藏橫幅" aria-label="橫幅文字" onChange={(event) => patch({ banner: event.currentTarget.value }, "banner")} /></label>
          </div>
        </div>
      </details>
      <details className="about-editor-section">
        <summary>自訂欄位（{content.fields.length}）</summary>
        <div className="about-editor-section-body">
          <p className="about-editor-hint">例如稱呼、創作類型或喜歡的作品，依這裡的順序展示。</p>
          {!content.fields.length ? <p className="about-editor-empty">還沒有自訂欄位，新增一組名稱與內容。</p> : null}
          {content.fields.map((field, index) => (
            <fieldset key={field.id} className="about-editor-item">
              <legend>欄位 {index + 1}</legend>
              <label><span>欄位名稱</span><input className="ie" value={field.key} maxLength={100} placeholder="例如：創作類型" aria-label="欄位名稱" onChange={(event) => { const value = event.currentTarget.value; setFields((list) => list.map((item) => item.id === field.id ? { ...item, key: value } : item), `field:${field.id}:key`); }} /></label>
              <label><span>欄位內容</span><textarea className="ie" rows={2} value={field.value} maxLength={500} placeholder="內容" aria-label="欄位內容" onChange={(event) => { const value = event.currentTarget.value; setFields((list) => list.map((item) => item.id === field.id ? { ...item, value } : item), `field:${field.id}:value`); }} /></label>
              <MiniBtn label="刪除欄位" danger onClick={() => setFields((list) => list.filter((item) => item.id !== field.id))}>刪除欄位</MiniBtn>
            </fieldset>
          ))}
          <button type="button" className="ie-add" disabled={content.fields.length >= 50} onClick={() => setFields((list) => list.length < 50 ? [...list, { id: crypto.randomUUID(), key: "", value: "" }] : list)}>＋ 新增欄位</button>
          {content.fields.length >= 50 ? <p className="about-editor-hint">已達 50 個欄位上限。</p> : null}
        </div>
      </details>
      <details className="about-editor-section">
        <summary>社群連結（{content.socials.length}）</summary>
        <div className="about-editor-section-body">
          {!content.socials.length ? <p className="about-editor-empty">加入你的社群或作品集，讓訪客更容易找到你。</p> : null}
          {content.socials.map((social, index) => {
            const invalid = !!social.url && !["https://", "http://"].includes(social.url) && safeHref(social.url) === "#";
            const hintId = `${feedbackPrefix}-social-${index}`;
            return (
              <fieldset key={social.id} className="about-editor-item">
                <legend>社群 {index + 1}</legend>
                <label><span>社群名稱</span><input className="ie" value={social.label} maxLength={100} placeholder="例如：作品集" aria-label="社群名稱" onChange={(event) => { const value = event.currentTarget.value; setSocials((list) => list.map((item) => item.id === social.id ? { ...item, label: value } : item), `social:${social.id}:label`); }} /></label>
                <label><span>社群網址</span><input className="ie" value={social.url} maxLength={2048} placeholder="https://" aria-label="社群網址" aria-invalid={invalid} aria-describedby={hintId} onChange={(event) => { const value = event.currentTarget.value; setSocials((list) => list.map((item) => item.id === social.id ? { ...item, url: value } : item), `social:${social.id}:url`); }} /></label>
                <span id={hintId} className={invalid ? "ie-error" : "about-editor-hint"}>{invalid ? "請輸入完整的 http://、https:// 或 mailto: 網址。" : safeHref(social.url) === "#" ? "尚未設定完整網址。" : "訪客可從名片上方開啟這個連結。"}</span>
                <MiniBtn label="刪除社群" danger onClick={() => setSocials((list) => list.filter((item) => item.id !== social.id))}>刪除社群</MiniBtn>
              </fieldset>
            );
          })}
          <button type="button" className="ie-add" disabled={content.socials.length >= 50} onClick={() => setSocials((list) => list.length < 50 ? [...list, { id: crypto.randomUUID(), label: "", url: "" }] : list)}>＋ 新增社群</button>
          {content.socials.length >= 50 ? <p className="about-editor-hint">已達 50 個社群連結上限。</p> : null}
        </div>
      </details>
    </div>
  );
}
