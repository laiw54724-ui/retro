import { useState } from "react";
import { makeIgComment, makeIgHighlight, makeIgPost, normalizeImageUrl, type IgPost } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, patchById, type ModuleProps } from "../types";

type Profile = ModuleProps<"instagram">["window"]["content"]["profile"];

const TEXT_FIELDS: Array<{ key: keyof Profile; label: string; wide?: boolean; placeholder?: string }> = [
  { key: "username", label: "帳號" },
  { key: "name", label: "名稱" },
  { key: "alt", label: "暱稱（灰字）" },
  { key: "followers", label: "粉絲數" },
  { key: "following", label: "追蹤中" },
  { key: "followedBy", label: "followed by 文字", wide: true },
  { key: "linkLabel", label: "個人連結文字", placeholder: "retrodesk.me/you" },
  { key: "linkUrl", label: "個人連結網址", placeholder: "https://" },
  { key: "dmUrl", label: "「訊息」按鈕連結（留空隱藏）", wide: true, placeholder: "https://ig.me/m/…" }
];

const TOGGLES: Array<[keyof Profile, string]> = [
  ["verified", "認證徽章"], ["showCounts", "顯示貼文／粉絲數"], ["showHighlights", "顯示精選動態"], ["showFollowedBy", "顯示 followed by"],
  ["showLikes", "顯示讚數"], ["allowLikes", "訪客可以按讚"], ["allowComments", "訪客可以留言"]
];

const today = () => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日`; };

export function IgEditForm({ window, ctx, update }: ModuleProps<"instagram">) {
  const { profile, images: posts } = window.content;
  const [open, setOpen] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newUrlError, setNewUrlError] = useState("");
  const [extraUrl, setExtraUrl] = useState<Record<string, string>>({});
  const [extraError, setExtraError] = useState<Record<string, string>>({});

  const setProfile = (change: Partial<Profile>, key?: string) => update((w) => ({ ...w, content: { ...w.content, profile: { ...w.content.profile, ...change } } }), key);
  const setPosts = (recipe: (list: IgPost[]) => IgPost[], key?: string) => update((w) => ({ ...w, content: { ...w.content, images: recipe(w.content.images) } }), key);
  const patchPost = (id: string, change: Partial<IgPost>, key?: string) => setPosts((list) => patchById(list, id, change), key);
  const upload = async (file: File) => (await ctx.upload?.(file, "image")) ?? null;

  async function addPosts(files: File[]) {
    for (const file of files) {
      const url = await upload(file);
      if (url) setPosts((list) => [...list, makeIgPost({ src: url, title: file.name.replace(/\.[^.]+$/, ""), date: today() })]);
    }
  }
  function addPostUrl() {
    const result = normalizeImageUrl(newUrl);
    if (!result.ok) { setNewUrlError(result.reason); return; }
    setPosts((list) => [...list, makeIgPost({ src: result.url, srcUrl: newUrl.trim(), date: today() })]);
    setNewUrl("");
    setNewUrlError("");
  }
  async function addExtras(id: string, files: File[]) {
    for (const file of files) {
      const url = await upload(file);
      if (url) setPosts((list) => list.map((post) => post.id === id && post.extra.length < 9 ? { ...post, extra: [...post.extra, { id: crypto.randomUUID(), src: url, srcUrl: "" }] } : post));
    }
  }
  function addExtraUrl(id: string) {
    const raw = extraUrl[id] ?? "";
    const result = normalizeImageUrl(raw);
    if (!result.ok) { setExtraError((o) => ({ ...o, [id]: result.reason })); return; }
    setPosts((list) => list.map((post) => post.id === id && post.extra.length < 9 ? { ...post, extra: [...post.extra, { id: crypto.randomUUID(), src: result.url, srcUrl: raw.trim() }] } : post));
    setExtraUrl((o) => ({ ...o, [id]: "" }));
    setExtraError((o) => ({ ...o, [id]: "" }));
  }

  return (
    <div className="ig-edit w98-scroll">
      <fieldset className="w98-fieldset"><legend>帳號資料</legend>
        <div className="ig-edit-avatar">
          <span className="ig-thumb round ph">{profile.avatar ? <SafeImg src={profile.avatar} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
          <div className="ig-col">
            <FilePick onFiles={async (files) => { const url = await upload(files[0]); if (url) setProfile({ avatar: url, avatarUrl: "", avatarCrop: undefined }); }}>上傳頭像…</FilePick>
            <ImageUrlField raw={profile.avatarUrl} label="頭像網址" placeholder="或貼上圖片網址 / Google 雲端連結" className="w98-input compact" onCommit={(raw, src) => setProfile({ avatarUrl: raw, avatar: src, avatarCrop: undefined })} />
          </div>
        </div>
        <div className="ig-fields">
          {TEXT_FIELDS.map((field) => (
            <label key={field.key} className="w98-field" style={{ gridColumn: field.wide ? "1 / -1" : undefined }}>
              <span className="w98-hint">{field.label}</span>
              <input className="w98-input compact" value={String(profile[field.key] ?? "")} placeholder={field.placeholder} onChange={(event) => setProfile({ [field.key]: event.target.value } as Partial<Profile>, "p" + field.key)} />
            </label>
          ))}
        </div>
        <label className="w98-field"><span className="w98-hint">簡介</span><textarea className="w98-textarea" rows={3} value={profile.bio} onChange={(event) => setProfile({ bio: event.target.value }, "pbio")} /></label>
      </fieldset>

      <fieldset className="w98-fieldset"><legend>顯示與互動</legend>
        <div className="ig-toggles">
          {TOGGLES.map(([key, label]) => (
            <label key={key} className="check-row"><input type="checkbox" checked={Boolean(profile[key])} onChange={(event) => setProfile({ [key]: event.target.checked } as Partial<Profile>)} />{label}</label>
          ))}
        </div>
      </fieldset>

      <fieldset className="w98-fieldset"><legend>精選動態</legend>
        {profile.highlights.map((highlight) => (
          <div key={highlight.id} className="ig-hl-edit">
            <span className="ig-thumb round ph">{highlight.src ? <SafeImg src={highlight.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
            <div className="ig-col">
              <input className="w98-input compact" value={highlight.title} placeholder="標題" aria-label="精選標題" onChange={(event) => setProfile({ highlights: profile.highlights.map((h) => h.id === highlight.id ? { ...h, title: event.target.value } : h) }, "hl" + highlight.id)} />
              <div className="ie-row">
                <ImageUrlField raw={highlight.srcUrl} label="精選圖片網址" placeholder="圖片網址" className="w98-input compact grow" onCommit={(raw, src) => setProfile({ highlights: profile.highlights.map((h) => h.id === highlight.id ? { ...h, srcUrl: raw, src } : h) })} />
                <FilePick onFiles={async (files) => { const url = await upload(files[0]); if (url) setProfile({ highlights: profile.highlights.map((h) => h.id === highlight.id ? { ...h, src: url, srcUrl: "" } : h) }); }}>上傳</FilePick>
              </div>
            </div>
            <MiniBtn label="刪除精選" danger onClick={() => setProfile({ highlights: profile.highlights.filter((h) => h.id !== highlight.id) })}>×</MiniBtn>
          </div>
        ))}
        <button type="button" className="w98-btn small" onClick={() => setProfile({ highlights: [...profile.highlights, makeIgHighlight()] })}>＋ 新增精選</button>
      </fieldset>

      <fieldset className="w98-fieldset"><legend>貼文（{posts.length}）</legend>
        <div className="ie-row">
          <FilePick multiple className="w98-btn small" onFiles={(files) => void addPosts(files)}><b>上傳照片（可多選）</b></FilePick>
          <input className="w98-input compact grow" value={newUrl} placeholder="或貼上圖片網址" aria-label="新貼文圖片網址" onChange={(event) => { setNewUrl(event.target.value); setNewUrlError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPostUrl(); } }} />
          <button type="button" className="w98-btn small" onClick={addPostUrl}>新增</button>
        </div>
        {newUrlError ? <span role="alert" className="ie-error">{newUrlError}</span> : null}
        <span className="w98-hint">每張照片建立一篇貼文。支援 Google 雲端硬碟「知道連結的任何人」公開分享的連結。點貼文展開編輯內文、留言與輪播照片。</span>
        {posts.map((post, index) => {
          const expanded = open === post.id;
          return (
            <div key={post.id} className="ig-post-edit">
              <div className="ig-post-row">
                <span className="ig-thumb sq ph">{post.src ? <SafeImg src={post.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
                <button type="button" className="ig-post-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : post.id)}>
                  <span>{expanded ? "▾" : "▸"} {(post.caption || post.title || "（無標題）").slice(0, 28)}</span>
                  <small>{post.date} · {post.likes} 讚 · {post.comments.length} 則留言{post.extra.length ? ` · ${post.extra.length + 1} 張` : ""}</small>
                </button>
                <MiniBtn label="往前" disabled={index === 0} onClick={() => setPosts((list) => moveById(list, post.id, -1))}>▲</MiniBtn>
                <MiniBtn label="往後" disabled={index === posts.length - 1} onClick={() => setPosts((list) => moveById(list, post.id, 1))}>▼</MiniBtn>
                <MiniBtn label="刪除貼文" danger onClick={() => setPosts((list) => list.filter((item) => item.id !== post.id))}>×</MiniBtn>
              </div>
              {expanded ? (
                <div className="ig-post-body">
                  <span className="w98-hint">主圖</span>
                  <div className="ie-row">
                    <ImageUrlField raw={post.srcUrl} label="主圖網址" placeholder="圖片網址 / Google 雲端公開連結" className="w98-input compact grow" onCommit={(raw, src) => patchPost(post.id, { srcUrl: raw, src })} />
                    <FilePick onFiles={async (files) => { const url = await upload(files[0]); if (url) patchPost(post.id, { src: url, srcUrl: "" }); }}>上傳</FilePick>
                  </div>
                  <span className="w98-hint">更多照片（輪播，最多 9 張）</span>
                  <div className="ie-row">
                    {post.extra.map((extra) => (
                      <span key={extra.id} className="ig-thumb sq48 ph">
                        {extra.src ? <SafeImg src={extra.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                        <button type="button" className="ig-x" aria-label="移除這張" onClick={() => setPosts((list) => list.map((item) => item.id === post.id ? { ...item, extra: item.extra.filter((e) => e.id !== extra.id) } : item))}>×</button>
                      </span>
                    ))}
                    {post.extra.length < 9 ? <FilePick multiple className="ig-add-extra" title="上傳輪播照片" onFiles={(files) => void addExtras(post.id, files)}>＋</FilePick> : null}
                  </div>
                  <div className="ie-row">
                    <input className="w98-input compact grow" value={extraUrl[post.id] ?? ""} placeholder="輪播照片網址" aria-label="輪播照片網址" onChange={(event) => setExtraUrl((o) => ({ ...o, [post.id]: event.target.value }))} />
                    <button type="button" className="w98-btn small" onClick={() => addExtraUrl(post.id)}>加入</button>
                  </div>
                  {extraError[post.id] ? <span role="alert" className="ie-error">{extraError[post.id]}</span> : null}
                  <label className="w98-field"><span className="w98-hint">貼文內容</span><textarea className="w98-textarea" rows={3} value={post.caption} onChange={(event) => patchPost(post.id, { caption: event.target.value }, "c" + post.id)} /></label>
                  <div className="ig-trio">
                    <label className="w98-field"><span className="w98-hint">地點</span><input className="w98-input compact" value={post.location} onChange={(event) => patchPost(post.id, { location: event.target.value }, "l" + post.id)} /></label>
                    <label className="w98-field"><span className="w98-hint">日期</span><input className="w98-input compact" value={post.date} onChange={(event) => patchPost(post.id, { date: event.target.value }, "d" + post.id)} /></label>
                    <label className="w98-field"><span className="w98-hint">讚數</span><input className="w98-input compact" inputMode="numeric" value={post.likes} onChange={(event) => patchPost(post.id, { likes: Math.min(1e9, Math.max(0, Number.parseInt(event.target.value.replace(/[^0-9]/g, ""), 10) || 0)) }, "k" + post.id)} /></label>
                  </div>
                  <span className="w98-hint">留言（{post.comments.length}）</span>
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="ie-row">
                      <input className="w98-input compact" style={{ width: 96, flexShrink: 0, fontWeight: 700 }} value={comment.user} placeholder="帳號" aria-label="留言帳號" onChange={(event) => patchPost(post.id, { comments: post.comments.map((c) => c.id === comment.id ? { ...c, user: event.target.value } : c) }, "cu" + comment.id)} />
                      <input className="w98-input compact grow" value={comment.text} placeholder="留言內容" aria-label="留言內容" onChange={(event) => patchPost(post.id, { comments: post.comments.map((c) => c.id === comment.id ? { ...c, text: event.target.value } : c) }, "ct" + comment.id)} />
                      <MiniBtn label="刪除留言" danger onClick={() => patchPost(post.id, { comments: post.comments.filter((c) => c.id !== comment.id) })}>×</MiniBtn>
                    </div>
                  ))}
                  <button type="button" className="w98-btn small" style={{ alignSelf: "flex-start" }} onClick={() => patchPost(post.id, { comments: [...post.comments, makeIgComment("friend", "")] })}>＋ 新增留言</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
