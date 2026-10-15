import { useCallback, useEffect, useRef, useState } from "react";

export type IgScreen = "profile" | "feed" | "explore" | "saved" | "post";
export type IgComment = { id: string; user: string; text: string };

/** Visitor-only Instagram state. Lives in memory; never written to the document or the server. */
export function useIgSession(highlightCount: () => number) {
  const [screen, setScreen] = useState<IgScreen>("profile");
  const [postId, setPostId] = useState<string | null>(null);
  const [back, setBack] = useState<IgScreen>("profile");
  const [gridTab, setGridTab] = useState<"grid" | "list">("grid");
  const [followed, setFollowed] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [extraComments, setExtraComments] = useState<Record<string, IgComment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [slide, setSlide] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [story, setStory] = useState(-1);
  const [storyProgress, setStoryProgress] = useState(0);
  const timers = useRef<{ toast?: ReturnType<typeof setTimeout>; burst?: ReturnType<typeof setTimeout>; story?: ReturnType<typeof setInterval> }>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    clearTimeout(timers.current.toast);
    clearTimeout(timers.current.burst);
    clearInterval(timers.current.story);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [screen, postId]);

  const showToast = useCallback((message: string) => {
    clearTimeout(timers.current.toast);
    setToast(message);
    timers.current.toast = setTimeout(() => setToast(null), 1800);
  }, []);

  const go = (next: IgScreen) => { setScreen(next); setPostId(null); setSheetId(null); };
  const openPost = (id: string) => { setBack(screen === "post" ? back : screen); setScreen("post"); setPostId(id); setSheetId(null); };
  const toggleLike = (id: string) => setLiked((s) => ({ ...s, [id]: !s[id] }));
  const doubleLike = (id: string) => {
    setLiked((s) => ({ ...s, [id]: true }));
    setBurst(id);
    clearTimeout(timers.current.burst);
    timers.current.burst = setTimeout(() => setBurst(null), 700);
  };
  const toggleSave = (id: string) => {
    setSaved((s) => { const next = !s[id]; showToast(next ? "已加入收藏" : "已從收藏移除"); return { ...s, [id]: next }; });
  };
  const postComment = (id: string) => {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    setExtraComments((s) => ({ ...s, [id]: [...(s[id] ?? []), { id: crypto.randomUUID(), user: "你（訪客）", text }] }));
    setDrafts((s) => ({ ...s, [id]: "" }));
    setShowAll((s) => ({ ...s, [id]: true }));
  };

  const closeStory = () => { clearInterval(timers.current.story); setStory(-1); setStoryProgress(0); };
  const openStory = (index: number) => {
    if (!highlightCount()) return;
    setStory(index);
    setStoryProgress(0);
    clearInterval(timers.current.story);
    // 2.5% every 100ms = 4 seconds per story.
    timers.current.story = setInterval(() => {
      setStoryProgress((p) => (p + 2.5 < 100 ? p + 2.5 : 100));
    }, 100);
  };
  const stepStory = (delta: -1 | 1) => {
    const total = highlightCount();
    const next = story + delta;
    if (next < 0) { setStoryProgress(0); return; }
    if (next >= total) { closeStory(); return; }
    setStory(next);
    setStoryProgress(0);
  };
  // Auto-advance when a story's bar fills.
  useEffect(() => {
    if (story >= 0 && storyProgress >= 100) {
      if (story + 1 >= highlightCount()) closeStory(); else { setStory(story + 1); setStoryProgress(0); }
    }
  });

  return {
    screen, postId, back, gridTab, followed, liked, saved, extraComments, drafts, showAll, commentOpen, slide, query, sheetId, burst, toast, story, storyProgress, scrollRef,
    setGridTab, setFollowed, setDrafts, setShowAll, setCommentOpen, setSlide, setQuery, setSheetId, showToast,
    go, openPost, toggleLike, doubleLike, toggleSave, postComment, openStory, closeStory, stepStory
  };
}
