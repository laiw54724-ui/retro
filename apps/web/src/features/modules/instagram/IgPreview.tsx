import { useState, type CSSProperties } from "react";
import type { IgPost } from "@retrodesk/shared";
import { AvatarImage } from "../../../components/AvatarImage";
import { SafeImg } from "../ui";
import { safeHref, type ModuleProps, type ProfileDirectoryPost } from "../types";
import { igIcons } from "./igIcons";
import { useIgSession } from "./useIgSession";
import { buildPublicEntityUrl, sharePublicUrl } from "../../../lib/publicShare";

const Ic = ({ bg, size = 24 }: { bg: string; size?: number }) => <span aria-hidden="true" className="ig-ic" style={{ width: size, height: size, background: bg }} />;

/** The "real app" experience. State is per visit only. */
export function IgPreview({ window, ctx }: Pick<ModuleProps<"instagram">, "window" | "ctx">) {
  const entryProfileId = ctx.profileId ?? "entry";
  const profileDirectory = ctx.profileDirectory ?? [];
  const entrySiteId = profileDirectory.find((entry) => entry.id === entryProfileId)?.siteId ?? ctx.siteId ?? "public";
  const storyFramesFor = (profileId: string) => {
    const entry = profileDirectory.find((item) => item.id === profileId);
    if (entry?.highlights.length) return entry.highlights.flatMap((highlight) => {
      const frames = highlight.frames.length ? highlight.frames : [{ id: `${highlight.id}:cover`, src: highlight.coverSrc, srcUrl: highlight.coverSrcUrl, alt: highlight.coverAlt, text: "" }];
      return frames.map((frame, frameIndex) => ({ ...frame, highlightId: highlight.id, highlightTitle: highlight.title, frameIndex, frameCount: frames.length }));
    });
    const legacy = entry?.profile.highlights ?? (profileId === entryProfileId ? window.content.profile.highlights : []);
    return legacy.map((highlight) => ({ id: highlight.id, src: highlight.src, srcUrl: highlight.srcUrl, alt: highlight.title, text: "", highlightId: highlight.id, highlightTitle: highlight.title, frameIndex: 0, frameCount: 1 }));
  };
  const session = useIgSession((profileId) => storyFramesFor(profileId).length, entryProfileId, `${entrySiteId}:${window.id}`, ctx.initialPostId ?? null);
  const s = session;
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const shareEntity = async (kind: "oc" | "post", id: string, title: string) => {
    if (!ctx.publicShareBaseUrl) { s.showToast("發布後才能分享"); return; }
    const base = new URL(ctx.publicShareBaseUrl, globalThis.location?.origin ?? "https://retro.invalid");
    const handle = decodeURIComponent(base.pathname.replace(/^\/@/, "").split("/")[0] ?? "");
    const url = buildPublicEntityUrl(base.origin, handle, kind, id);
    const result = await sharePublicUrl(url, title, navigator);
    if (result === "manual") setShareFallback(url);
    else s.showToast(result === "shared" ? "已開啟分享" : "已複製連結");
  };
  const directoryEntry = ctx.profileDirectory?.find((entry) => entry.id === s.activeProfileId);
  const profile = directoryEntry?.profile ?? window.content.profile;
  const posts = directoryEntry?.posts ?? window.content.images;
  const collections = directoryEntry?.collections ?? [];
  const postById = new Map(posts.map((post) => [post.id, post]));
  const visibleCollections = collections
    .map((collection) => ({ ...collection, postIds: collection.postIds.filter((postId) => postById.has(postId)) }))
    .filter((collection) => collection.postIds.length > 0);
  const pinnedPosts = posts.filter((post) => !!(post as Partial<ProfileDirectoryPost>).pinned);
  const regularPosts = posts.filter((post) => !(post as Partial<ProfileDirectoryPost>).pinned);
  const canonicalHighlights = directoryEntry?.highlights ?? [];
  const highlights = canonicalHighlights.length ? canonicalHighlights.map((highlight) => ({ id: highlight.id, title: highlight.title, src: highlight.coverSrc, srcUrl: highlight.coverSrcUrl })) : profile.highlights;
  const storyFrames = storyFramesFor(s.activeProfileId);
  const profileThemeOverride = directoryEntry?.themeOverride ?? (s.activeProfileId === entryProfileId ? ctx.profileThemeOverride : undefined);
  const tv = profileThemeOverride ? { ...ctx.tv, face: profileThemeOverride.background, accent: profileThemeOverride.accent } : ctx.tv;
  const I = igIcons(tv.text);
  const showHighlights = profile.showHighlights && highlights.length > 0;
  const ringBg = showHighlights ? `conic-gradient(${tv.titleFrom}, ${tv.accent}, ${tv.titleTo}, ${tv.titleFrom})` : "transparent";
  const followersText = directoryEntry?.followerCount ?? directoryEntry?.legacyFollowerLabel ?? (profile.followers || "0");
  const followingText = directoryEntry?.followingCount ?? directoryEntry?.legacyFollowingLabel ?? (profile.following || "0");
  const phStyle: CSSProperties = { ["--ph-a" as string]: tv.light, ["--ph-b" as string]: tv.face };
  const appStyle: CSSProperties = {
    background: "#fff",
    boxShadow: tv.sunken,
    ...(profileThemeOverride ? {
      ["--ig-profile-accent" as string]: profileThemeOverride.accent,
      ["--ig-profile-accent-text" as string]: "#fff"
    } : {})
  };

  const avatar = (size: number, ring?: string) => (
    <span className="ig-avatar ph" style={{ width: size, height: size, border: ring, ...phStyle }}>
      {profile.avatar ? <AvatarImage src={profile.avatar} crop={profile.avatarCrop} /> : null}
    </span>
  );

  const slideOf = (post: IgPost) => {
    const sources = [post.src, ...post.extra.map((extra) => extra.src)];
    const index = Math.min(s.slide[s.interactionKey(post.id)] ?? 0, sources.length - 1);
    return { sources, index };
  };

  const sheetPost = s.sheetId ? posts.find((post) => post.id === s.sheetId) : undefined;
  const open = (post: IgPost) => s.openPost(post.id);

  const renderCard = (post: IgPost, single = false) => {
    const key = s.interactionKey(post.id);
    const { sources, index } = slideOf(post);
    const comments = [...post.comments, ...(s.extraComments[key] ?? [])];
    const actorComments = (post as Partial<ProfileDirectoryPost>).actorComments ?? [];
    const all = s.showAll[key];
    const visible = all ? comments : comments.slice(-2);
    const socialPost = post as Partial<ProfileDirectoryPost>;
    const namedLikerIds = socialPost.namedLikerIds ?? [];
    const hasStructuredLikes = Array.isArray(socialPost.namedLikerIds) || socialPost.otherLikeCount !== undefined;
    const baseLikes = hasStructuredLikes ? namedLikerIds.length + (socialPost.otherLikeCount ?? 0) : post.likes;
    const likes = baseLikes + (s.liked[key] ? 1 : 0);
    const inputOpen = profile.allowComments && (single || s.commentOpen[key]);
    const draft = s.drafts[key] ?? "";
    const current = sources[index];
    const currentMedia = (post as Partial<ProfileDirectoryPost>).media?.[index];
    const mediaStyle: CSSProperties = single && currentMedia?.aspectRatio
      ? { ...phStyle, aspectRatio: currentMedia.aspectRatio }
      : phStyle;
    const imageStyle: CSSProperties = single
      ? currentMedia?.aspectRatio
        ? { width: "100%", height: "100%", objectFit: "contain", display: "block" }
        : { width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }
      : { width: "100%", height: "100%", objectFit: "cover", display: "block" };
    return (
      <article key={post.id} className="ig-card">
        <div className="ig-card-head">
          {avatar(32)}
          <span className="ig-card-who"><strong>{profile.username}</strong>{post.location ? <span>{post.location}</span> : null}</span>
          <button type="button" className="ig-icbtn" aria-label="更多選項" onClick={() => s.setSheetId(post.id)}><Ic bg={I.more} size={20} /></button>
        </div>
        <div className={`ig-media ph${single ? ` detail${currentMedia?.aspectRatio ? " has-ratio" : ""}` : ""}`} style={mediaStyle} onDoubleClick={() => { if (profile.allowLikes) s.doubleLike(post.id); }}>
          {current ? <SafeImg src={current} alt={currentMedia?.alt || post.caption} style={imageStyle} /> : null}
          {sources.length > 1 ? (
            <>
              <span className="ig-count">{index + 1}/{sources.length}</span>
              {index > 0 ? <button type="button" className="ig-nav l" aria-label="上一張" onClick={() => s.setSlide((o) => ({ ...o, [key]: index - 1 }))}>‹</button> : null}
              {index < sources.length - 1 ? <button type="button" className="ig-nav r" aria-label="下一張" onClick={() => s.setSlide((o) => ({ ...o, [key]: index + 1 }))}>›</button> : null}
            </>
          ) : null}
          {s.burst === key ? <span aria-hidden="true" className="ig-burst" style={{ background: I.heartWhite }} /> : null}
        </div>
        {sources.length > 1 ? <div className="ig-dots">{sources.map((_, i) => <span key={i} style={{ background: i === index ? "#0095f6" : "#c7c7c7" }} />)}</div> : null}
        <div className="ig-actions">
          {profile.allowLikes ? <button type="button" className="ig-icbtn lg" aria-pressed={!!s.liked[key]} aria-label="讚" onClick={() => s.toggleLike(post.id)}><Ic bg={s.liked[key] ? I.heartFill : I.heart} /></button> : null}
          {profile.allowComments ? <button type="button" className="ig-icbtn lg" aria-label="留言" onClick={() => (single ? undefined : s.setCommentOpen((o) => ({ ...o, [key]: !o[key] })))}><Ic bg={I.comment} /></button> : null}
          <button type="button" className="ig-icbtn lg" aria-label="分享" onClick={() => void shareEntity("post", post.id, post.title || "OC 貼文")}><Ic bg={I.send} /></button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ig-icbtn lg" aria-pressed={!!s.saved[key]} aria-label="收藏" onClick={() => s.toggleSave(post.id)}><Ic bg={s.saved[key] ? I.bookmarkFill : I.bookmark} /></button>
        </div>
        <div className="ig-text">
          {profile.showLikes ? hasStructuredLikes
            ? <button type="button" className="ig-linkbtn ig-like-count" onClick={() => s.openPeople("likers", post.id)}><strong>{likes.toLocaleString()} 個讚</strong></button>
            : <strong className="ig-like-count">{likes.toLocaleString()} 個讚</strong>
          : null}
          {post.caption ? <span className="ig-pre"><strong>{profile.username}</strong> {post.caption}</span> : null}
          {!all && comments.length > 2 ? <button type="button" className="ig-linkbtn" onClick={() => s.setShowAll((o) => ({ ...o, [key]: true }))}>查看全部 {comments.length} 則留言</button> : null}
          {profile.allowComments ? visible.map((c) => <span key={c.id} className="ig-wrap"><strong>{c.user}</strong> {c.text}</span>) : null}
          {profile.allowComments ? actorComments.map((comment) => {
            const actor = comment.authorKind === "profile" ? profileDirectory.find((entry) => entry.id === comment.authorProfileId) : undefined;
            return <span key={comment.id} className="ig-wrap ig-actor-comment">{actor ? <button type="button" className="ig-linkbtn" onClick={() => s.navigateProfile(actor.id)}><strong>{actor.profile.name || actor.profile.username}</strong></button> : <strong>{comment.authorKind === "legacy" ? comment.legacyAuthorText : "角色"}</strong>} {comment.text}</span>;
          }) : null}
          {post.date ? <span className="ig-date">{post.date}</span> : null}
        </div>
        {inputOpen ? (
          <div className="ig-comment-box">
            <input value={draft} placeholder="以訪客身分留言……" aria-label="留言" autoFocus={!single} onChange={(event) => s.setDrafts((o) => ({ ...o, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") s.postComment(post.id); }} />
            <button type="button" disabled={!draft.trim()} onClick={() => s.postComment(post.id)} style={{ color: draft.trim() ? "#0095f6" : "#9aa" }}>發佈</button>
            <small>僅本次瀏覽，不會儲存到作者網站。</small>
          </div>
        ) : null}
      </article>
    );
  };

  const renderGrid = (list: IgPost[]) => (
    <div className="ig-grid3">
      {list.map((post) => (
        <button key={post.id} type="button" className="ig-cell ph" style={phStyle} aria-label={`開啟貼文：${post.caption || post.title}`} onClick={() => open(post)}>
          {post.src ? <AvatarImage src={post.src} crop={(post as Partial<ProfileDirectoryPost>).media?.[0]?.crop} alt="" /> : null}
          {post.extra.length ? <span className="ig-multi" style={{ background: I.multi }} /> : null}
        </button>
      ))}
    </div>
  );

  const renderHighlights = (ring: boolean) => (
    <div className="ig-hls">
      {highlights.map((h, i) => {
        const storyIndex = canonicalHighlights.length ? canonicalHighlights.slice(0, i).reduce((total, item) => total + Math.max(1, item.frames.length), 0) : i;
        return (
        <button key={h.id} type="button" className="ig-hl" onClick={() => s.openStory(storyIndex)}>
          <span className="ig-hl-ring" style={ring ? { background: ringBg } : { border: "2px solid #c7c7c7", background: "#fff" }}>
            <span className="ig-hl-in ph" style={phStyle}>{h.src ? <SafeImg src={h.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
          </span>
          <span className="ig-hl-title">{h.title}</span>
        </button>
      )})}
    </div>
  );

  const renderCollections = () => (
    <ul className="ig-collection-list" aria-label="作品合集">
      {visibleCollections.map((collection) => {
        const coverPost = collection.postIds.length ? postById.get(collection.postIds[0]) : undefined;
        return (
          <li key={collection.id}>
            <button
              type="button"
              className="ig-collection-card"
              aria-label={`開啟合集：${collection.title}`}
              onClick={() => s.openCollection(collection.id)}
            >
              <span className="ig-collection-cover ph" style={phStyle}>
                {coverPost?.src ? <AvatarImage src={coverPost.src} crop={(coverPost as Partial<ProfileDirectoryPost>).media?.[0]?.crop} alt="" /> : <Ic bg={I.collections} size={30} />}
              </span>
              <span className="ig-collection-copy">
                <strong>{collection.title}</strong>
                {collection.description ? <span>{collection.description}</span> : null}
                <small>{collection.postIds.length} 篇作品</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const q = s.query.trim().toLowerCase();
  const explored = q ? posts.filter((post) => `${post.caption} ${post.location} ${post.title}`.toLowerCase().includes(q)) : posts;
  const savedPosts = posts.filter((post) => s.saved[s.interactionKey(post.id)]);
  const postFor = s.postId ? posts.find((post) => post.id === s.postId) : undefined;
  const collectionFor = s.collectionId ? visibleCollections.find((collection) => collection.id === s.collectionId) : undefined;
  const collectionPosts = collectionFor?.postIds.flatMap((postId) => {
    const post = postById.get(postId);
    return post ? [post] : [];
  }) ?? [];
  const peoplePost = s.peopleKind === "likers" && s.postId ? posts.find((post) => post.id === s.postId) as ProfileDirectoryPost | undefined : undefined;
  const peopleIds = s.peopleKind === "followers" ? directoryEntry?.followerIds ?? [] : s.peopleKind === "following" ? directoryEntry?.followingIds ?? [] : peoplePost?.namedLikerIds ?? [];
  const peopleEntries = peopleIds.flatMap((id) => { const entry = profileDirectory.find((candidate) => candidate.id === id); return entry ? [entry] : []; });
  const peopleExtra = s.peopleKind === "followers" ? Math.max(0, (directoryEntry?.followerCount ?? peopleIds.length) - peopleIds.length) : s.peopleKind === "following" ? Math.max(0, (directoryEntry?.followingCount ?? peopleIds.length) - peopleIds.length) : peoplePost?.otherLikeCount ?? 0;
  const legacyPeopleLabel = s.peopleKind === "followers" && directoryEntry?.followerCount === null
    ? directoryEntry.legacyFollowerLabel
    : s.peopleKind === "following" && directoryEntry?.followingCount === null
      ? directoryEntry.legacyFollowingLabel
      : "";

  const headTitle = s.screen === "collection"
    ? collectionFor?.title ?? "合集"
    : { profile: profile.username || "username", feed: "Instagram", explore: "探索", saved: "已收藏", directory: "此桌面的角色", post: "貼文", people: s.peopleKind === "followers" ? "粉絲" : s.peopleKind === "following" ? "追蹤中" : "喜歡者" }[s.screen];
  const nav: Array<{ id: "feed" | "explore" | "saved" | "profile"; label: string; icon?: string }> = [
    { id: "feed", label: "首頁", icon: s.screen === "feed" ? I.homeFill : I.home },
    { id: "explore", label: "探索", icon: I.search },
    { id: "saved", label: "已收藏", icon: s.screen === "saved" ? I.bookmarkFill : I.bookmark },
    { id: "profile", label: "個人" }
  ];
  const activeNav = s.screen === "post"
    ? s.previousScreen === "collection" ? "profile" : s.previousScreen
    : s.screen === "collection" || s.screen === "people" ? "profile" : s.screen;
  const story = s.story >= 0 ? storyFrames[s.story] : undefined;

  return (
    <div className={`ig-app ig-skin-${window.content.skin}`} style={appStyle}>
      <div className="ig-top">
        {s.historyDepth > 0 ? <button type="button" className="ig-icbtn lg" aria-label="返回" onClick={s.back}><Ic bg={I.back} size={22} /></button> : null}
        <span className="ig-title">
          <strong style={{ fontSize: s.screen === "feed" ? 20 : 15 }}>{headTitle}</strong>
          {s.screen === "profile" && profile.verified ? <span role="img" aria-label="已認證" className="ig-verified">✓</span> : null}
        </span>
        {s.screen === "profile" ? <button type="button" className="ig-icbtn lg" aria-label="分享個人檔案" onClick={() => void shareEntity("oc", s.activeProfileId, profile.name || profile.username)}><Ic bg={I.send} size={22} /></button> : null}
      </div>

      <div className="ig-scroll w98-scroll" ref={s.scrollRef} tabIndex={0} aria-label="Instagram 內容">
        {s.screen === "profile" ? (
          <>
            <div className="ig-profile2">
              <div className="ig-row">
                <button type="button" className="ig-avatar-ring" style={{ background: ringBg, cursor: showHighlights ? "pointer" : "default" }} aria-label={showHighlights ? "觀看精選動態" : "頭像"} onClick={() => { if (showHighlights) s.openStory(0); }}>
                  {avatar(78, "3px solid #fff")}
                </button>
                {profile.showCounts ? (
                  <div className="ig-counts3">
                    <div><strong>{posts.length}</strong><span>貼文</span></div>
                    {directoryEntry ? <button type="button" className="ig-stat-button" onClick={() => s.openPeople("followers")}><strong>{followersText}</strong><span>粉絲</span></button> : <div><strong>{followersText}</strong><span>粉絲</span></div>}
                    {directoryEntry ? <button type="button" className="ig-stat-button" onClick={() => s.openPeople("following")}><strong>{followingText}</strong><span>追蹤中</span></button> : <div><strong>{followingText}</strong><span>追蹤中</span></div>}
                  </div>
                ) : null}
              </div>
              <div className="ig-bio">
                <span className="ig-world-label">角色世界觀內容</span>
                <span><strong>{profile.name}</strong> <span className="ig-gray">{profile.alt}</span></span>
                {profile.bio ? <span className="ig-pre">{profile.bio}</span> : null}
                {profile.linkLabel ? <a href={safeHref(profile.linkUrl)} className="ig-link" onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: profile.linkUrl, label: profile.linkLabel }); }}>↗ {profile.linkLabel}</a> : null}
                {profile.showFollowedBy && profile.followedBy ? <span className="ig-followed">{profile.followedBy}</span> : null}
              </div>
              <div className="ig-btns">
                <button type="button" aria-pressed={s.followed} className="ig-btn ig-follow-btn" title="僅本次瀏覽" style={s.followed ? { background: tv.face, color: tv.text, boxShadow: tv.pressed } : { background: tv.accent, color: tv.accentText, boxShadow: tv.bevel }} onClick={() => s.setFollowed(!s.followed)}>{s.followed ? "✓ Following（僅本次瀏覽）" : "+ Follow（僅本次瀏覽）"}</button>
                {profile.dmUrl ? <button type="button" className="ig-btn" style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }} onClick={() => ctx.onLink({ target: "url", url: profile.dmUrl, label: "訊息" })}>訊息</button> : null}
                {profileDirectory.length > 1 ? <button type="button" className="ig-btn" style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }} onClick={s.openDirectory}>所有角色</button> : null}
                <button type="button" className="ig-btn" style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }} onClick={() => void shareEntity("oc", s.activeProfileId, profile.name || profile.username)}>分享</button>
              </div>
              {showHighlights ? renderHighlights(false) : null}
            </div>
            <div role="tablist" className="ig-ptabs" style={{ gridTemplateColumns: `repeat(${visibleCollections.length ? 3 : 2}, minmax(0, 1fr))` }}>
              {(["grid", "list", ...(visibleCollections.length ? ["collections" as const] : [])] as const).map((id) => (
                <button key={id} role="tab" type="button" aria-selected={s.gridTab === id} aria-label={id === "grid" ? "格狀" : id === "list" ? "列表" : "合集"} style={{ boxShadow: s.gridTab === id ? `inset 0 -2px ${tv.text}` : "none" }} onClick={() => s.setGridTab(id)}>
                  <Ic bg={id === "grid" ? I.grid : id === "list" ? I.list : I.collections} size={22} />
                </button>
              ))}
            </div>
            {posts.length === 0 ? <div className="ig-empty"><Ic bg={I.camera} size={44} /><strong>還沒有貼文</strong><span>在編輯分頁上傳照片就會出現在這裡。</span></div>
              : s.gridTab === "collections" ? renderCollections() : <>
                {pinnedPosts.length ? <section className="ig-pinned" aria-labelledby={`pinned-${s.activeProfileId}`}><h2 id={`pinned-${s.activeProfileId}`}>置頂作品</h2>{renderGrid(pinnedPosts)}</section> : null}
                {regularPosts.length ? s.gridTab === "grid" ? renderGrid(regularPosts) : <div>{regularPosts.map((post) => renderCard(post))}</div> : null}
              </>}
          </>
        ) : null}

        {s.screen === "feed" ? (
          <>
            {showHighlights ? <div className="ig-feed-hls">{renderHighlights(true)}</div> : null}
            {posts.length === 0 ? <div className="ig-empty"><Ic bg={I.camera} size={44} /><strong>首頁還是空的</strong><span>新增貼文後會顯示在這裡。</span></div> : posts.map((post) => renderCard(post))}
          </>
        ) : null}

        {s.screen === "explore" ? (
          <>
            <div className="ig-search"><input value={s.query} onChange={(event) => s.setQuery(event.target.value)} placeholder="搜尋貼文內容或地點" aria-label="搜尋貼文" style={{ boxShadow: tv.sunken }} /></div>
            {explored.length ? renderGrid(explored) : <div className="ig-empty"><Ic bg={I.search} size={44} /><strong>找不到相符的貼文</strong><span>試試別的關鍵字。</span></div>}
          </>
        ) : null}

        {s.screen === "saved" ? (
          <>
            <div className="ig-note">只有你看得到收藏的貼文（僅限這次瀏覽）</div>
            {savedPosts.length ? renderGrid(savedPosts) : <div className="ig-empty"><Ic bg={I.bookmark} size={44} /><strong>還沒有收藏</strong><span>點貼文的書籤圖示就會收藏在這裡。</span></div>}
          </>
        ) : null}

        {s.screen === "directory" ? (
          <div className="ig-directory"><h2>此桌面的角色</h2><p className="ig-note">這是創作者在此桌面公開的角色清單。</p>{(ctx.profileDirectory ?? []).map((entry) => <button type="button" className="ig-directory-row" key={entry.id} onClick={() => s.navigateProfile(entry.id)}><span className="ig-avatar ph" style={{ width: 48, height: 48, ...phStyle }}>{entry.profile.avatar ? <AvatarImage src={entry.profile.avatar} crop={entry.profile.avatarCrop} /> : null}</span><span><strong>{entry.profile.name || entry.profile.username}</strong><small>@{entry.profile.username}</small></span></button>)}</div>
        ) : null}

        {s.screen === "people" ? (
          <section className="ig-people" aria-label={String(headTitle)}><p className="ig-note">角色世界觀內容</p>{peopleEntries.map((entry) => <button type="button" className="ig-directory-row" key={entry.id} onClick={() => s.navigateProfile(entry.id)}><span className="ig-avatar ph" style={{ width: 44, height: 44, ...phStyle }}>{entry.profile.avatar ? <AvatarImage src={entry.profile.avatar} crop={entry.profile.avatarCrop} /> : null}</span><span><strong>{entry.profile.name || entry.profile.username}</strong><small>@{entry.profile.username}</small></span></button>)}{peopleExtra > 0 ? <p>另有 {peopleExtra} 位虛構角色（未設定名單）</p> : null}{legacyPeopleLabel ? <p>舊顯示：{legacyPeopleLabel}（尚未轉為角色名單數字）</p> : null}{peopleEntries.length === 0 && peopleExtra === 0 && !legacyPeopleLabel ? <div className="ig-empty"><strong>目前沒有設定角色名單</strong></div> : null}</section>
        ) : null}

        {s.screen === "collection" ? (
          collectionFor ? <section className="ig-collection-view" aria-label={`合集：${collectionFor.title}`}>
            <header><strong>{collectionFor.title}</strong>{collectionFor.description ? <p>{collectionFor.description}</p> : null}<span>{collectionPosts.length} 篇作品</span></header>
            {collectionPosts.length ? renderGrid(collectionPosts) : <div className="ig-empty"><Ic bg={I.collections} size={44} /><strong>這個合集目前沒有公開作品</strong></div>}
          </section> : <div className="ig-empty"><strong>找不到這個合集</strong></div>
        ) : null}

        {s.screen === "post" ? (postFor ? renderCard(postFor, true) : <div className="ig-empty"><strong>找不到這篇貼文</strong></div>) : null}
      </div>

      <div className="ig-nav4">
        {nav.map((item) => (
          <button key={item.id} type="button" aria-label={item.label} aria-current={activeNav === item.id ? "page" : undefined} style={{ background: activeNav === item.id ? "#f2f2f2" : "#fff" }} onClick={() => s.go(item.id)}>
            {item.icon ? <Ic bg={item.icon} /> : avatar(26, activeNav === item.id ? `2px solid ${tv.text}` : "1px solid #dbdbdb")}
          </button>
        ))}
      </div>

      {sheetPost ? (
        <>
          <div className="ig-scrim" onClick={() => s.setSheetId(null)} />
          <div role="menu" className="ig-sheet" style={{ background: tv.face, boxShadow: tv.bevel }}>
          <button role="menuitem" type="button" style={{ color: tv.text }} onClick={() => { s.toggleSave(sheetPost.id); s.setSheetId(null); }}>{s.saved[s.interactionKey(sheetPost.id)] ? "取消收藏" : "收藏"}</button>
            <button role="menuitem" type="button" style={{ color: tv.text }} onClick={() => { const post = posts.find((item) => item.id === s.sheetId); if (post) void shareEntity("post", post.id, post.title || "OC 貼文"); s.setSheetId(null); }}>複製連結</button>
            {s.screen !== "post" ? <button role="menuitem" type="button" style={{ color: tv.text }} onClick={() => open(sheetPost)}>前往貼文</button> : null}
            <button role="menuitem" type="button" style={{ color: tv.text, fontWeight: 700 }} onClick={() => s.setSheetId(null)}>取消</button>
          </div>
        </>
      ) : null}

      {story ? (
        <div role="dialog" aria-label="精選動態" className="ig-story" tabIndex={-1} autoFocus onKeyDown={(event) => {
          if (event.key === "ArrowLeft") s.stepStory(-1);
          if (event.key === "ArrowRight") s.stepStory(1);
          if (event.key === " " || event.key === "Spacebar") { event.preventDefault(); s.toggleStoryPause(); }
          if (event.key === "Escape") s.closeStory();
        }}>
          <div className="ig-bars">{storyFrames.map((frame, i) => <span key={frame.id}><span style={{ width: i < s.story ? "100%" : i === s.story ? `${s.storyProgress}%` : "0%" }} /></span>)}</div>
          <div className="ig-story-head">{avatar(28)}<strong>{profile.username}</strong><span className="ig-story-title">{story.highlightTitle}{story.frameCount > 1 ? ` · ${story.frameIndex + 1}/${story.frameCount}` : ""}</span><button type="button" aria-label={s.storyPaused ? "繼續播放" : "暫停播放"} onClick={s.toggleStoryPause}>{s.storyPaused ? "▶" : "Ⅱ"}</button><button type="button" aria-label="關閉" onClick={s.closeStory}>×</button></div>
          <div className="ig-story-body">
            {story.src ? <SafeImg src={story.src} alt={story.alt || story.highlightTitle} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} /> : <div className="ph" style={{ height: "100%", aspectRatio: "9 / 16", ...phStyle }} />}
            {story.text ? <div className="ig-story-text">{story.text}</div> : null}
            <button type="button" aria-label="上一則" className="ig-story-l" onClick={() => s.stepStory(-1)} />
            <button type="button" aria-label="下一則" className="ig-story-r" onClick={() => s.stepStory(1)} />
          </div>
        </div>
      ) : null}

      {shareFallback ? <div role="dialog" aria-label="手動複製分享連結" className="ig-share-fallback"><strong>無法自動複製</strong><span>請選取下方網址手動複製。</span><input aria-label="分享網址" readOnly value={shareFallback} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="w98-btn" onClick={() => setShareFallback(null)}>關閉</button></div> : null}
      {s.toast ? <div role="status" className="ig-toast">{s.toast}</div> : null}
    </div>
  );
}
