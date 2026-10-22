import { useTranslation } from "react-i18next";
import { AvatarImage } from "../../../components/AvatarImage";
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

export { AboutInlineEditor } from "./AboutInlineEditor";
