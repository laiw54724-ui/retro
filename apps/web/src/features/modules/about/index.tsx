import { useState } from "react";
import { normalizeImageUrl, type ImageCrop } from "@retrodesk/shared";
import { AvatarImage } from "../../../components/AvatarImage";
import { CropEditor } from "../../editor/CropEditor";
import { FilePick, ImageUrlField, MiniBtn } from "../ui";
import { opensNewTab, safeHref, type ModuleProps } from "../types";

const clock = () => new Date().toTimeString().slice(0, 5);

export function AboutView({ window, ctx }: ModuleProps<"about">) {
  const { tv } = ctx;
  const content = window.content;
  const fields = content.fields.filter((field) => field.key || field.value);
  return (
    <div className="about" style={{ background: tv.face }}>
      <div className="about-socials">
        {content.socials.map((social) => (
          <a key={social.id} href={safeHref(social.url)} target={opensNewTab(social.url) ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: tv.text }}
            onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: social.url, label: social.label }); }}>
            <u>{social.label.slice(0, 1)}</u>{social.label.slice(1)}
          </a>
        ))}
      </div>
      <div className="about-main" style={{ boxShadow: tv.sunken, gridTemplateColumns: ctx.mobile ? "1fr" : "minmax(110px, 38%) minmax(0, 1fr)" }}>
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
        <div className="about-bar" style={{ boxShadow: tv.sunken }}><span>‹ {content.nickname}</span><span style={{ flex: 1 }} /><span className="about-time">Time: {clock()}</span></div>
        {content.banner ? <div className="about-banner">{content.banner}</div> : null}
      </div>
    </div>
  );
}

export function AboutInlineEditor({ window, ctx, update }: ModuleProps<"about">) {
  const { tv } = ctx;
  const [cropping, setCropping] = useState(false);
  const content = window.content;
  const patch = (change: Partial<typeof content>, key?: string) => update((current) => ({ ...current, content: { ...current.content, ...change } }), key);
  const setFields = (recipe: (list: typeof content.fields) => typeof content.fields, key?: string) => patch({ fields: recipe(content.fields) }, key);
  const setSocials = (recipe: (list: typeof content.socials) => typeof content.socials, key?: string) => patch({ socials: recipe(content.socials) }, key);
  const uid = () => crypto.randomUUID();

  async function uploadAvatar(file: File) {
    const url = await ctx.upload?.(file, "image");
    if (url) patch({ avatar: url, avatarUrl: "", avatarCrop: undefined });
  }

  return (
    <div className="about editing" style={{ background: tv.face }}>
      <div className="about-socials">
        {content.socials.map((social) => (
          <span key={social.id} className="ie-box row">
            <input className="ie small" style={{ width: 80 }} value={social.label} placeholder="名稱" aria-label="社群名稱" onChange={(event) => setSocials((list) => list.map((item) => item.id === social.id ? { ...item, label: event.target.value } : item), "sl" + social.id)} />
            <input className="ie small" style={{ width: 96 }} value={social.url} placeholder="https://" aria-label="社群網址" onChange={(event) => setSocials((list) => list.map((item) => item.id === social.id ? { ...item, url: event.target.value } : item), "su" + social.id)} />
            <MiniBtn label="刪除社群" danger onClick={() => setSocials((list) => list.filter((item) => item.id !== social.id))}>×</MiniBtn>
          </span>
        ))}
        <button type="button" className="ie-add small" onClick={() => setSocials((list) => [...list, { id: uid(), label: "", url: "https://" }])}>＋ 社群</button>
      </div>
      <div className="about-main" style={{ boxShadow: tv.sunken, gridTemplateColumns: ctx.mobile ? "1fr" : "minmax(110px, 38%) minmax(0, 1fr)" }}>
        <div className="about-edit-avatar">
          <div className="about-avatar ph" style={{ border: `1px solid ${tv.shadow}` }}>
            {content.avatar ? <AvatarImage src={content.avatar} crop={content.avatarCrop} alt="" /> : null}
          </div>
          <div className="ie-row">
            <FilePick onFiles={(files) => void uploadAvatar(files[0])}>{content.avatar ? "更換頭像" : "上傳頭像"}</FilePick>
            {content.avatar ? <MiniBtn label="調整位置" className="mini-btn wide" on={cropping} onClick={() => setCropping(!cropping)}>調整位置</MiniBtn> : null}
          </div>
          <ImageUrlField raw={content.avatarUrl} label="頭像網址" placeholder="或貼上頭像網址" onCommit={(raw, src) => patch({ avatarUrl: raw, avatar: src, avatarCrop: undefined })} />
          {cropping && content.avatar ? <CropEditor src={content.avatar} crop={content.avatarCrop as ImageCrop | undefined} onChange={(avatarCrop) => patch({ avatarCrop })} /> : null}
        </div>
        <div className="about-info">
          <label className="w98-field"><span className="w98-hint">暱稱</span><input className="ie" value={content.nickname} onChange={(event) => patch({ nickname: event.target.value }, "nn")} /></label>
          {content.fields.map((field) => (
            <div key={field.id} className="ie-box row">
              <input className="ie" style={{ width: "38%" }} value={field.key} placeholder="欄位" aria-label="欄位名稱" onChange={(event) => setFields((list) => list.map((item) => item.id === field.id ? { ...item, key: event.target.value } : item), "fk" + field.id)} />
              <span>:</span>
              <input className="ie" value={field.value} placeholder="內容" aria-label="欄位內容" onChange={(event) => setFields((list) => list.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item), "fv" + field.id)} />
              <MiniBtn label="刪除欄位" danger onClick={() => setFields((list) => list.filter((item) => item.id !== field.id))}>×</MiniBtn>
            </div>
          ))}
          <button type="button" className="ie-add small" onClick={() => setFields((list) => [...list, { id: uid(), key: "", value: "" }])}>＋ 欄位</button>
          <input className="ie underline" value={content.detailsTitle} aria-label="小標" onChange={(event) => patch({ detailsTitle: event.target.value }, "dt")} />
          <textarea className="ie" rows={4} value={content.bio} placeholder="自我介紹，每行一句" aria-label="簡介" onChange={(event) => patch({ bio: event.target.value }, "bio")} />
          <input className="ie italic" value={content.quote} placeholder="一句話（選填）" aria-label="引言" onChange={(event) => patch({ quote: event.target.value }, "quote")} />
        </div>
      </div>
      <div className="about-foot">
        <div className="about-bar" style={{ boxShadow: tv.sunken }}><span>‹ {content.nickname}</span><span style={{ flex: 1 }} /><span className="about-time">Time: {clock()}</span></div>
        <div className="about-banner"><input value={content.banner} placeholder="橫幅文字（留空隱藏）" aria-label="橫幅文字" onChange={(event) => patch({ banner: event.target.value }, "banner")} /></div>
      </div>
    </div>
  );
}
