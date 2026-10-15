import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";

function safeHref(url: string) {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "#";
  } catch {
    return "#";
  }
}

export function WindowRenderer({ window, theme, onOpenWindow }: { window: DesktopWindow; theme: RetroTheme; onOpenWindow?: (id: string) => void }) {
  if (window.type === "document") {
    return <div className="document-content">{window.content.blocks.map((block) => {
      if (block.kind === "heading") return <h2 key={block.id}>{block.text}</h2>;
      if (block.kind === "text") return <p key={block.id} style={{ textAlign: block.align }}>{block.text}</p>;
      if (block.kind === "divider") return <hr key={block.id} />;
      if (block.kind === "list") return <ul key={block.id}>{block.text.split("\n").filter(Boolean).map((item, index) => <li key={block.id + "-" + index}>{item}</li>)}</ul>;
      if (block.kind === "image") return block.src ? <img key={block.id} className="content-image" src={block.src} alt={block.alt} loading="lazy" decoding="async" /> : <div key={block.id} className="image-placeholder">圖片</div>;
      if (block.kind === "button") return <a key={block.id} className="content-button" href={safeHref(block.url)} target={block.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{block.text}</a>;
      return <a key={block.id} href={safeHref(block.url)} target={block.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{block.text}</a>;
    })}</div>;
  }

  if (window.type === "gallery") {
    return <div className="gallery-grid" style={{ gridTemplateColumns: `repeat(${window.content.columns}, minmax(0, 1fr))` }}>{window.content.images.length ? window.content.images.map((image) => <figure key={image.id}><div className="gallery-image">{image.src ? <img src={image.src} alt={image.title} loading="lazy" decoding="async" /> : <span>PHOTO</span>}</div><figcaption>{image.title}</figcaption></figure>) : <div className="empty-module">還沒有圖片</div>}</div>;
  }

  if (window.type === "links") {
    return <div className="links-list">{window.content.links.map((link) => link.target === "window" ? <button key={link.id} type="button" onClick={() => onOpenWindow?.(link.windowId)}>{link.label}</button> : <a key={link.id} href={safeHref(link.url)} target={link.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={{ borderLeftColor: link.color }}>{link.label}</a>)}</div>;
  }

  if (window.type === "instagram") {
    const profile = window.content.profile;
    return <div className="ig-profile"><div className="ig-head"><div className="avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : null}</div><div><strong>{profile.username}</strong><div className="ig-counts"><span>{window.content.images.length} posts</span><span>{profile.followers} followers</span><span>{profile.following} following</span></div></div></div><p>{profile.name} {profile.alt}</p><p className="preline">{profile.bio}</p><div className="ig-grid">{window.content.images.map((image) => <div key={image.id}>{image.src ? <img src={image.src} alt={image.title} loading="lazy" decoding="async" /> : null}</div>)}</div></div>;
  }

  const content = window.content;
  return <div className="about-card"><div className="avatar large">{content.avatar ? <img src={content.avatar} alt="" /> : null}</div><h2>{content.nickname}</h2>{content.banner ? <strong className="about-banner">{content.banner}</strong> : null}<p className="preline">{content.bio}</p>{content.quote ? <blockquote>{content.quote}</blockquote> : null}<dl>{content.fields.map((field) => <div key={field.id}><dt>{field.key}</dt><dd>{field.value}</dd></div>)}</dl><div className="socials">{content.socials.map((social) => <a key={social.id} href={safeHref(social.url)} target="_blank" rel="noreferrer">{social.label}</a>)}</div></div>;
}
