import type { CSSProperties } from "react";
import type { IgPost } from "@retrodesk/shared";
import { AvatarImage } from "../../../components/AvatarImage";
import { SafeImg } from "../ui";
import { safeHref, type ModuleProps } from "../types";
import { igIcons } from "./igIcons";
import { useIgSession } from "./useIgSession";

const Ic = ({ bg, size = 24 }: { bg: string; size?: number }) => <span aria-hidden="true" className="ig-ic" style={{ width: size, height: size, background: bg }} />;

/** The "real app" experience. State is per visit only. */
export function IgPreview({ window, ctx }: Pick<ModuleProps<"instagram">, "window" | "ctx">) {
  const { tv } = ctx;
  const profile = window.content.profile;
  const posts = window.content.images;
  const highlights = profile.highlights;
  const I = igIcons(tv.text);
  const session = useIgSession(() => highlights.length);
  const s = session;
  const showHighlights = profile.showHighlights && highlights.length > 0;
  const ringBg = showHighlights ? `conic-gradient(${tv.titleFrom}, ${tv.accent}, ${tv.titleTo}, ${tv.titleFrom})` : "transparent";
  const followers = Number.parseInt(profile.followers.replace(/[^0-9]/g, ""), 10) || 0;
  const followersText = s.followed ? String(followers + 1) : profile.followers || "0";
  const phStyle: CSSProperties = { ["--ph-a" as string]: tv.light, ["--ph-b" as string]: tv.face };

  const avatar = (size: number, ring?: string) => (
    <span className="ig-avatar ph" style={{ width: size, height: size, border: ring, ...phStyle }}>
      {profile.avatar ? <AvatarImage src={profile.avatar} crop={profile.avatarCrop} /> : null}
    </span>
  );

  const slideOf = (post: IgPost) => {
    const sources = [post.src, ...post.extra.map((extra) => extra.src)];
    const index = Math.min(s.slide[post.id] ?? 0, sources.length - 1);
    return { sources, index };
  };

  const sheetPost = s.sheetId ? posts.find((post) => post.id === s.sheetId) : undefined;
  const open = (post: IgPost) => s.openPost(post.id);

  const renderCard = (post: IgPost, single = false) => {
    const { sources, index } = slideOf(post);
    const comments = [...post.comments, ...(s.extraComments[post.id] ?? [])];
    const all = s.showAll[post.id];
    const visible = all ? comments : comments.slice(-2);
    const likes = post.likes + (s.liked[post.id] ? 1 : 0);
    const inputOpen = profile.allowComments && (single || s.commentOpen[post.id]);
    const draft = s.drafts[post.id] ?? "";
    const current = sources[index];
    return (
      <article key={post.id} className="ig-card">
        <div className="ig-card-head">
          {avatar(32)}
          <span className="ig-card-who"><strong>{profile.username}</strong>{post.location ? <span>{post.location}</span> : null}</span>
          <button type="button" className="ig-icbtn" aria-label="更多選項" onClick={() => s.setSheetId(post.id)}><Ic bg={I.more} size={20} /></button>
        </div>
        <div className="ig-media ph" style={phStyle} onDoubleClick={() => { if (profile.allowLikes) s.doubleLike(post.id); }}>
          {current ? <SafeImg src={current} alt={post.caption} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
          {sources.length > 1 ? (
            <>
              <span className="ig-count">{index + 1}/{sources.length}</span>
              {index > 0 ? <button type="button" className="ig-nav l" aria-label="上一張" onClick={() => s.setSlide((o) => ({ ...o, [post.id]: index - 1 }))}>‹</button> : null}
              {index < sources.length - 1 ? <button type="button" className="ig-nav r" aria-label="下一張" onClick={() => s.setSlide((o) => ({ ...o, [post.id]: index + 1 }))}>›</button> : null}
            </>
          ) : null}
          {s.burst === post.id ? <span aria-hidden="true" className="ig-burst" style={{ background: I.heartWhite }} /> : null}
        </div>
        {sources.length > 1 ? <div className="ig-dots">{sources.map((_, i) => <span key={i} style={{ background: i === index ? "#0095f6" : "#c7c7c7" }} />)}</div> : null}
        <div className="ig-actions">
          {profile.allowLikes ? <button type="button" className="ig-icbtn lg" aria-pressed={!!s.liked[post.id]} aria-label="讚" onClick={() => s.toggleLike(post.id)}><Ic bg={s.liked[post.id] ? I.heartFill : I.heart} /></button> : null}
          {profile.allowComments ? <button type="button" className="ig-icbtn lg" aria-label="留言" onClick={() => (single ? undefined : s.setCommentOpen((o) => ({ ...o, [post.id]: !o[post.id] })))}><Ic bg={I.comment} /></button> : null}
          <button type="button" className="ig-icbtn lg" aria-label="分享" onClick={() => s.showToast("已複製貼文連結")}><Ic bg={I.send} /></button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ig-icbtn lg" aria-pressed={!!s.saved[post.id]} aria-label="收藏" onClick={() => s.toggleSave(post.id)}><Ic bg={s.saved[post.id] ? I.bookmarkFill : I.bookmark} /></button>
        </div>
        <div className="ig-text">
          {profile.showLikes ? <strong>{likes.toLocaleString()} 個讚</strong> : null}
          {post.caption ? <span className="ig-pre"><strong>{profile.username}</strong> {post.caption}</span> : null}
          {!all && comments.length > 2 ? <button type="button" className="ig-linkbtn" onClick={() => s.setShowAll((o) => ({ ...o, [post.id]: true }))}>查看全部 {comments.length} 則留言</button> : null}
          {profile.allowComments ? visible.map((c) => <span key={c.id} className="ig-wrap"><strong>{c.user}</strong> {c.text}</span>) : null}
          {post.date ? <span className="ig-date">{post.date}</span> : null}
        </div>
        {inputOpen ? (
          <div className="ig-comment-box">
            <input value={draft} placeholder="以訪客身分留言……" aria-label="留言" autoFocus={!single} onChange={(event) => s.setDrafts((o) => ({ ...o, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") s.postComment(post.id); }} />
            <button type="button" disabled={!draft.trim()} onClick={() => s.postComment(post.id)} style={{ color: draft.trim() ? "#0095f6" : "#9aa" }}>發佈</button>
          </div>
        ) : null}
      </article>
    );
  };

  const renderGrid = (list: IgPost[]) => (
    <div className="ig-grid3">
      {list.map((post) => (
        <button key={post.id} type="button" className="ig-cell ph" style={phStyle} aria-label={`開啟貼文：${post.caption || post.title}`} onClick={() => open(post)}>
          {post.src ? <SafeImg src={post.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
          {post.extra.length ? <span className="ig-multi" style={{ background: I.multi }} /> : null}
        </button>
      ))}
    </div>
  );

  const renderHighlights = (ring: boolean) => (
    <div className="ig-hls">
      {highlights.map((h, i) => (
        <button key={h.id} type="button" className="ig-hl" onClick={() => s.openStory(i)}>
          <span className="ig-hl-ring" style={ring ? { background: ringBg } : { border: "2px solid #c7c7c7", background: "#fff" }}>
            <span className="ig-hl-in ph" style={phStyle}>{h.src ? <SafeImg src={h.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}</span>
          </span>
          <span className="ig-hl-title">{h.title}</span>
        </button>
      ))}
    </div>
  );

  const q = s.query.trim().toLowerCase();
  const explored = q ? posts.filter((post) => `${post.caption} ${post.location} ${post.title}`.toLowerCase().includes(q)) : posts;
  const savedPosts = posts.filter((post) => s.saved[post.id]);
  const postFor = s.postId ? posts.find((post) => post.id === s.postId) : undefined;

  const headTitle = { profile: profile.username || "username", feed: "Instagram", explore: "探索", saved: "已收藏", post: "貼文" }[s.screen];
  const nav: Array<{ id: "feed" | "explore" | "saved" | "profile"; label: string; icon?: string }> = [
    { id: "feed", label: "首頁", icon: s.screen === "feed" ? I.homeFill : I.home },
    { id: "explore", label: "探索", icon: I.search },
    { id: "saved", label: "已收藏", icon: s.screen === "saved" ? I.bookmarkFill : I.bookmark },
    { id: "profile", label: "個人" }
  ];
  const activeNav = s.screen === "post" ? s.back : s.screen;
  const story = s.story >= 0 ? highlights[s.story] : undefined;

  return (
    <div className={`ig-app ig-skin-${window.content.skin}`} style={{ background: "#fff", boxShadow: tv.sunken }}>
      <div className="ig-top">
        {s.screen === "post" ? <button type="button" className="ig-icbtn lg" aria-label="返回" onClick={() => s.go(s.back)}><Ic bg={I.back} size={22} /></button> : null}
        <span className="ig-title">
          <strong style={{ fontSize: s.screen === "feed" ? 20 : 15 }}>{headTitle}</strong>
          {s.screen === "profile" && profile.verified ? <span role="img" aria-label="已認證" className="ig-verified">✓</span> : null}
        </span>
        {s.screen === "profile" ? <button type="button" className="ig-icbtn lg" aria-label="分享個人檔案" onClick={() => s.showToast("已複製個人檔案連結")}><Ic bg={I.send} size={22} /></button> : null}
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
                    <div><strong>{followersText}</strong><span>粉絲</span></div>
                    <div><strong>{profile.following}</strong><span>追蹤中</span></div>
                  </div>
                ) : null}
              </div>
              <div className="ig-bio">
                <span><strong>{profile.name}</strong> <span className="ig-gray">{profile.alt}</span></span>
                {profile.bio ? <span className="ig-pre">{profile.bio}</span> : null}
                {profile.linkLabel ? <a href={safeHref(profile.linkUrl)} className="ig-link" onClick={(event) => { event.preventDefault(); ctx.onLink({ target: "url", url: profile.linkUrl, label: profile.linkLabel }); }}>↗ {profile.linkLabel}</a> : null}
                {profile.showFollowedBy && profile.followedBy ? <span className="ig-followed">{profile.followedBy}</span> : null}
              </div>
              <div className="ig-btns">
                <button type="button" aria-pressed={s.followed} className="ig-btn" style={s.followed ? { background: tv.face, color: tv.text, boxShadow: tv.pressed } : { background: tv.accent, color: "#fff", boxShadow: tv.bevel }} onClick={() => s.setFollowed(!s.followed)}>{s.followed ? "✓ Following" : "+ Follow"}</button>
                {profile.dmUrl ? <button type="button" className="ig-btn" style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }} onClick={() => ctx.onLink({ target: "url", url: profile.dmUrl, label: "訊息" })}>訊息</button> : null}
                <button type="button" className="ig-btn" style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }} onClick={() => s.showToast("已複製個人檔案連結")}>分享</button>
              </div>
              {showHighlights ? renderHighlights(false) : null}
            </div>
            <div role="tablist" className="ig-ptabs">
              {(["grid", "list"] as const).map((id) => (
                <button key={id} role="tab" type="button" aria-selected={s.gridTab === id} aria-label={id === "grid" ? "格狀" : "列表"} style={{ boxShadow: s.gridTab === id ? `inset 0 -2px ${tv.text}` : "none" }} onClick={() => s.setGridTab(id)}>
                  <Ic bg={id === "grid" ? I.grid : I.list} size={22} />
                </button>
              ))}
            </div>
            {posts.length === 0 ? <div className="ig-empty"><Ic bg={I.camera} size={44} /><strong>還沒有貼文</strong><span>在編輯分頁上傳照片就會出現在這裡。</span></div>
              : s.gridTab === "grid" ? renderGrid(posts) : <div>{posts.map((post) => renderCard(post))}</div>}
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
            <button role="menuitem" type="button" style={{ color: tv.text }} onClick={() => { s.toggleSave(sheetPost.id); s.setSheetId(null); }}>{s.saved[sheetPost.id] ? "取消收藏" : "收藏"}</button>
            <button role="menuitem" type="button" style={{ color: tv.text }} onClick={() => { s.showToast("已複製貼文連結"); s.setSheetId(null); }}>複製連結</button>
            {s.screen !== "post" ? <button role="menuitem" type="button" style={{ color: tv.text }} onClick={() => open(sheetPost)}>前往貼文</button> : null}
            <button role="menuitem" type="button" style={{ color: tv.text, fontWeight: 700 }} onClick={() => s.setSheetId(null)}>取消</button>
          </div>
        </>
      ) : null}

      {story ? (
        <div role="dialog" aria-label="精選動態" className="ig-story">
          <div className="ig-bars">{highlights.map((_, i) => <span key={i}><span style={{ width: i < s.story ? "100%" : i === s.story ? `${s.storyProgress}%` : "0%" }} /></span>)}</div>
          <div className="ig-story-head">{avatar(28)}<strong>{profile.username}</strong><span className="ig-story-title">{story.title}</span><button type="button" aria-label="關閉" onClick={s.closeStory}>×</button></div>
          <div className="ig-story-body">
            {story.src ? <SafeImg src={story.src} alt={story.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} /> : <div className="ph" style={{ height: "100%", aspectRatio: "9 / 16", ...phStyle }} />}
            <button type="button" aria-label="上一則" className="ig-story-l" onClick={() => s.stepStory(-1)} />
            <button type="button" aria-label="下一則" className="ig-story-r" onClick={() => s.stepStory(1)} />
          </div>
        </div>
      ) : null}

      {s.toast ? <div role="status" className="ig-toast">{s.toast}</div> : null}
    </div>
  );
}
