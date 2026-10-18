import { useState, type ReactNode } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { makeIgComment, makeIgHighlight, makeIgPost, normalizeImageUrl, type IgPost } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, patchById, type ModuleProps } from "../types";

type Profile = ModuleProps<"instagram">["window"]["content"]["profile"];

const textFieldDefs = (): Array<{ key: keyof Profile; label: string; wide?: boolean; placeholder?: string }> => [
  { key: "username", label: i18n.t("instagram:igEditForm.handle") },
  { key: "name", label: i18n.t("instagram:igEditForm.name") },
  { key: "alt", label: i18n.t("instagram:igEditForm.nicknameGrayText") },
  { key: "followers", label: i18n.t("instagram:igEditForm.followers") },
  { key: "following", label: i18n.t("instagram:igEditForm.following") },
  { key: "followedBy", label: i18n.t("instagram:igEditForm.followedByText"), wide: true },
  { key: "linkLabel", label: i18n.t("instagram:igEditForm.profileLinkText"), placeholder: "retrodesk.me/you" },
  { key: "linkUrl", label: i18n.t("instagram:igEditForm.profileLinkUrl"), placeholder: "https://" },
  { key: "dmUrl", label: i18n.t("instagram:igEditForm.messageButtonLinkLeaveBlank"), wide: true, placeholder: "https://ig.me/m/…" }
];

const toggleDefs = (): Array<[keyof Profile, string]> => [
  ["verified", i18n.t("instagram:igEditForm.verifiedBadge")], ["showCounts", i18n.t("instagram:igEditForm.showPostFollowerCounts")], ["showHighlights", i18n.t("instagram:igEditForm.showHighlightStories")], ["showFollowedBy", i18n.t("instagram:igEditForm.showFollowedBy")],
  ["showLikes", i18n.t("instagram:igEditForm.showLikeCounts")], ["allowLikes", i18n.t("instagram:igEditForm.visitorsCanLike")], ["allowComments", i18n.t("instagram:igEditForm.visitorsCanComment")]
];

const today = () => { const d = new Date(); return i18n.t("instagram:igEditForm.text", { v1: d.getMonth() + 1, v2: d.getDate() }); };

type FormSection = "all" | "profile" | "interaction" | "appearance";
const IDENTITY_KEYS: Array<keyof Profile> = ["username", "name"];
const SOCIAL_KEYS: Array<keyof Profile> = ["followers", "following", "followedBy"];
const INTERACTION_KEYS: Array<keyof Profile> = ["allowLikes", "allowComments"];

export function IgEditForm({ window, ctx, update, children, section = "all" }: ModuleProps<"instagram"> & { children?: ReactNode; section?: FormSection }) {
  const { t: tr } = useTranslation("instagram");
  const { profile, images: posts } = window.content;
  const canonicalProfile = !!(ctx.onProfileChange && ctx.profiles?.some((item) => item.id === ctx.profileId));
  const showProfile = section === "all" || section === "profile";
  const showInteraction = section === "all" || section === "interaction";
  const showAppearance = section === "all" || section === "appearance";
  const showIdentity = showProfile && !canonicalProfile;
  const textFields = textFieldDefs().filter((field) => {
    if (IDENTITY_KEYS.includes(field.key)) return showIdentity;
    return SOCIAL_KEYS.includes(field.key) ? showInteraction : showProfile;
  });
  const toggles = toggleDefs().filter(([key]) => INTERACTION_KEYS.includes(key) ? showInteraction : showAppearance);
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
      {showProfile || showInteraction ? <fieldset className="w98-fieldset"><legend>{section === "interaction" ? tr("igEditForm.legacyStatsAndInteractionText") : canonicalProfile ? tr("igEditForm.linksAndExtraInfo") : tr("igEditForm.accountInfo")}</legend>
        {showIdentity ? <div className="ig-edit-avatar">
          <span className="ig-thumb round ph">{profile.avatar ? <SafeImg src={profile.avatar} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
          <div className="ig-col">
            <FilePick onFiles={async (files) => { const url = await upload(files[0]); if (url) setProfile({ avatar: url, avatarUrl: "", avatarCrop: undefined }); }}>{tr("igEditForm.uploadAvatar")}</FilePick>
            <ImageUrlField raw={profile.avatarUrl} label={tr("igEditForm.avatarUrl")} placeholder={tr("igEditForm.orPasteAnImageUrl")} className="w98-input compact" onCommit={(raw, src) => setProfile({ avatarUrl: raw, avatar: src, avatarCrop: undefined })} />
          </div>
        </div> : null}
        <div className="ig-fields">
          {textFields.map((field) => (
            <label key={field.key} className="w98-field" style={{ gridColumn: field.wide ? "1 / -1" : undefined }}>
              <span className="w98-hint">{field.label}</span>
              <input className="w98-input compact" value={String(profile[field.key] ?? "")} placeholder={field.placeholder} onChange={(event) => setProfile({ [field.key]: event.target.value } as Partial<Profile>, "p" + field.key)} />
            </label>
          ))}
        </div>
        {showIdentity ? <label className="w98-field"><span className="w98-hint">{tr("igEditForm.bio")}</span><textarea className="w98-textarea" rows={3} value={profile.bio} onChange={(event) => setProfile({ bio: event.target.value }, "pbio")} /></label> : null}
      </fieldset> : null}

      {toggles.length ? <fieldset className="w98-fieldset"><legend>{section === "appearance" ? tr("igEditForm.display") : section === "interaction" ? tr("igEditForm.visitorInteraction") : tr("igEditForm.displayAndInteraction")}</legend>
        <div className="ig-toggles">
          {toggles.map(([key, label]) => (
            <label key={key} className="check-row"><input type="checkbox" checked={Boolean(profile[key])} onChange={(event) => setProfile({ [key]: event.target.checked } as Partial<Profile>)} />{label}</label>
          ))}
        </div>
      </fieldset> : null}

      {section === "all" && !ctx.updateContent ? <fieldset className="w98-fieldset"><legend>{tr("igEditForm.highlightStories")}</legend>
        {profile.highlights.map((highlight) => (
          <div key={highlight.id} className="ig-hl-edit">
            <span className="ig-thumb round ph">{highlight.src ? <SafeImg src={highlight.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
            <div className="ig-col">
              <input className="w98-input compact" value={highlight.title} placeholder={tr("canonicalPostEditor.heading")} aria-label={tr("canonicalHighlightEditor.highlightTitle")} onChange={(event) => setProfile({ highlights: profile.highlights.map((h) => h.id === highlight.id ? { ...h, title: event.target.value } : h) }, "hl" + highlight.id)} />
              <div className="ie-row">
                <ImageUrlField raw={highlight.srcUrl} label={tr("igEditForm.highlightImageUrl")} placeholder={tr("canonicalPostEditor.imageUrl")} className="w98-input compact grow" onCommit={(raw, src) => setProfile({ highlights: profile.highlights.map((h) => h.id === highlight.id ? { ...h, srcUrl: raw, src } : h) })} />
                <FilePick onFiles={async (files) => { const url = await upload(files[0]); if (url) setProfile({ highlights: profile.highlights.map((h) => h.id === highlight.id ? { ...h, src: url, srcUrl: "" } : h) }); }}>{tr("igEditForm.upload")}</FilePick>
              </div>
            </div>
            <MiniBtn label={tr("igEditForm.deleteHighlight")} danger onClick={() => setProfile({ highlights: profile.highlights.filter((h) => h.id !== highlight.id) })}>×</MiniBtn>
          </div>
        ))}
        <button type="button" className="w98-btn small" onClick={() => setProfile({ highlights: [...profile.highlights, makeIgHighlight()] })}>{tr("canonicalHighlightEditor.addHighlight")}</button>
      </fieldset> : null}

      {section === "all" && !ctx.updateContent ? <fieldset className="w98-fieldset"><legend>{tr("ig.legacyPostsCount", { count: posts.length })}</legend>
        <div className="ie-row">
          <FilePick multiple className="w98-btn small" onFiles={(files) => void addPosts(files)}><b>{tr("igEditForm.uploadPhotosMultipleAllowed")}</b></FilePick>
          <input className="w98-input compact grow" value={newUrl} placeholder={tr("canonicalHighlightEditor.orPasteAnImageUrl")} aria-label={tr("canonicalPostEditor.newPostImageUrl")} onChange={(event) => { setNewUrl(event.target.value); setNewUrlError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPostUrl(); } }} />
          <button type="button" className="w98-btn small" onClick={addPostUrl}>{tr("canonicalPostEditor.add")}</button>
        </div>
        {newUrlError ? <span role="alert" className="ie-error">{newUrlError}</span> : null}
        <span className="w98-hint">{tr("igEditForm.eachPhotoCreatesOnePost")}</span>
        {posts.map((post, index) => {
          const expanded = open === post.id;
          return (
            <div key={post.id} className="ig-post-edit">
              <div className="ig-post-row">
                <span className="ig-thumb sq ph">{post.src ? <SafeImg src={post.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
                <button type="button" className="ig-post-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : post.id)}>
                  <span>{expanded ? "▾" : "▸"} {(post.caption || post.title || tr("canonicalCollectionEditor.noTitle")).slice(0, 28)}</span>
                  <small>{tr("ig.legacyPostMeta", { date: post.date, likes: post.likes, comments: post.comments.length })}{post.extra.length ? tr("igEditForm.images", { v1: post.extra.length + 1 }) : ""}</small>
                </button>
                <MiniBtn label={tr("igEditForm.moveUp")} disabled={index === 0} onClick={() => setPosts((list) => moveById(list, post.id, -1))}>▲</MiniBtn>
                <MiniBtn label={tr("igEditForm.moveDown")} disabled={index === posts.length - 1} onClick={() => setPosts((list) => moveById(list, post.id, 1))}>▼</MiniBtn>
                <MiniBtn label={tr("canonicalPostEditor.deletePost")} danger onClick={() => setPosts((list) => list.filter((item) => item.id !== post.id))}>×</MiniBtn>
              </div>
              {expanded ? (
                <div className="ig-post-body">
                  <span className="w98-hint">{tr("igEditForm.mainImage")}</span>
                  <div className="ie-row">
                    <ImageUrlField raw={post.srcUrl} label={tr("igEditForm.mainImageUrl")} placeholder={tr("igEditForm.imageUrlPublicGoogleDrive")} className="w98-input compact grow" onCommit={(raw, src) => patchPost(post.id, { srcUrl: raw, src })} />
                    <FilePick onFiles={async (files) => { const url = await upload(files[0]); if (url) patchPost(post.id, { src: url, srcUrl: "" }); }}>{tr("igEditForm.upload")}</FilePick>
                  </div>
                  <span className="w98-hint">{tr("igEditForm.morePhotosCarouselUpTo")}</span>
                  <div className="ie-row">
                    {post.extra.map((extra) => (
                      <span key={extra.id} className="ig-thumb sq48 ph">
                        {extra.src ? <SafeImg src={extra.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                        <button type="button" className="ig-x" aria-label={tr("igEditForm.removeThisOne")} onClick={() => setPosts((list) => list.map((item) => item.id === post.id ? { ...item, extra: item.extra.filter((e) => e.id !== extra.id) } : item))}>×</button>
                      </span>
                    ))}
                    {post.extra.length < 9 ? <FilePick multiple className="ig-add-extra" title={tr("igEditForm.uploadCarouselPhotos")} onFiles={(files) => void addExtras(post.id, files)}>＋</FilePick> : null}
                  </div>
                  <div className="ie-row">
                    <input className="w98-input compact grow" value={extraUrl[post.id] ?? ""} placeholder={tr("igEditForm.carouselPhotoUrl")} aria-label={tr("igEditForm.carouselPhotoUrl")} onChange={(event) => setExtraUrl((o) => ({ ...o, [post.id]: event.target.value }))} />
                    <button type="button" className="w98-btn small" onClick={() => addExtraUrl(post.id)}>{tr("canonicalHighlightEditor.add")}</button>
                  </div>
                  {extraError[post.id] ? <span role="alert" className="ie-error">{extraError[post.id]}</span> : null}
                  <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.postContent")}</span><textarea className="w98-textarea" rows={3} value={post.caption} onChange={(event) => patchPost(post.id, { caption: event.target.value }, "c" + post.id)} /></label>
                  <div className="ig-trio">
                    <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.place")}</span><input className="w98-input compact" value={post.location} onChange={(event) => patchPost(post.id, { location: event.target.value }, "l" + post.id)} /></label>
                    <label className="w98-field"><span className="w98-hint">{tr("igEditForm.date")}</span><input className="w98-input compact" value={post.date} onChange={(event) => patchPost(post.id, { date: event.target.value }, "d" + post.id)} /></label>
                    <label className="w98-field"><span className="w98-hint">{tr("igEditForm.likes")}</span><input className="w98-input compact" inputMode="numeric" value={post.likes} onChange={(event) => patchPost(post.id, { likes: Math.min(1e9, Math.max(0, Number.parseInt(event.target.value.replace(/[^0-9]/g, ""), 10) || 0)) }, "k" + post.id)} /></label>
                  </div>
                  <span className="w98-hint">{tr("ig.legacyCommentsCount", { count: post.comments.length })}</span>
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="ie-row">
                      <input className="w98-input compact" style={{ width: 96, flexShrink: 0, fontWeight: 700 }} value={comment.user} placeholder={tr("igEditForm.handle")} aria-label={tr("igEditForm.commenterAccount")} onChange={(event) => patchPost(post.id, { comments: post.comments.map((c) => c.id === comment.id ? { ...c, user: event.target.value } : c) }, "cu" + comment.id)} />
                      <input className="w98-input compact grow" value={comment.text} placeholder={tr("igEditForm.commentText")} aria-label={tr("igEditForm.commentText")} onChange={(event) => patchPost(post.id, { comments: post.comments.map((c) => c.id === comment.id ? { ...c, text: event.target.value } : c) }, "ct" + comment.id)} />
                      <MiniBtn label={tr("igEditForm.deleteComment")} danger onClick={() => patchPost(post.id, { comments: post.comments.filter((c) => c.id !== comment.id) })}>×</MiniBtn>
                    </div>
                  ))}
                  <button type="button" className="w98-btn small" style={{ alignSelf: "flex-start" }} onClick={() => patchPost(post.id, { comments: [...post.comments, makeIgComment("friend", "")] })}>{tr("igEditForm.addComment")}</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </fieldset> : null}
      {children}
    </div>
  );
}
