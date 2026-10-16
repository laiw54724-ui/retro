import { useCallback, useEffect, useRef, useState } from "react";

export type IgScreen = "profile" | "feed" | "explore" | "saved" | "directory" | "post";
export type IgComment = { id: string; user: string; text: string };
type Route = { screen: IgScreen; profileId: string; postId: string | null };
type HistoryFrame = { route: Route; scrollTop: number };

/** Visitor-only Instagram state. Lives in memory; never writes the document or API. */
export function useIgSession(highlightCount: (profileId: string) => number, entryProfileId = "entry", sessionScope = "ig") {
  const [route, setRoute] = useState<Route>({ screen: "profile", profileId: entryProfileId, postId: null });
  const history = useRef<HistoryFrame[]>([]);
  const pendingScroll = useRef<number | null>(null);
  const [, setHistoryVersion] = useState(0);
  const [gridTabs, setGridTabs] = useState<Record<string, "grid" | "list">>({});
  const [followedProfiles, setFollowedProfiles] = useState<Record<string, boolean>>({});
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [extraComments, setExtraComments] = useState<Record<string, IgComment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [slide, setSlide] = useState<Record<string, number>>({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [story, setStory] = useState(-1);
  const [storyProgress, setStoryProgress] = useState(0);
  const timers = useRef<{ toast?: ReturnType<typeof setTimeout>; burst?: ReturnType<typeof setTimeout>; story?: ReturnType<typeof setInterval> }>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const closeStory = useCallback(() => {
    clearInterval(timers.current.story);
    setStory(-1);
    setStoryProgress(0);
  }, []);

  useEffect(() => () => {
    clearTimeout(timers.current.toast);
    clearTimeout(timers.current.burst);
    clearInterval(timers.current.story);
  }, []);

  useEffect(() => {
    history.current = [];
    pendingScroll.current = 0;
    setRoute({ screen: "profile", profileId: entryProfileId, postId: null });
    setHistoryVersion((value) => value + 1);
    closeStory();
  }, [entryProfileId, sessionScope, closeStory]);

  useEffect(() => {
    const top = pendingScroll.current ?? 0;
    let innerFrame = 0;
    const frame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = top;
        if (pendingScroll.current === top) pendingScroll.current = null;
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(innerFrame); };
  }, [route.screen, route.postId, route.profileId]);

  const showToast = useCallback((message: string) => {
    clearTimeout(timers.current.toast);
    setToast(message);
    timers.current.toast = setTimeout(() => setToast(null), 1800);
  }, []);

  const profileKey = `${sessionScope}:${route.profileId}`;
  const interactionKey = (id: string) => `${profileKey}:${id}`;
  const push = (next: Route) => {
    history.current.push({ route, scrollTop: scrollRef.current?.scrollTop ?? 0 });
    pendingScroll.current = 0;
    setRoute(next);
    setHistoryVersion((value) => value + 1);
    setSheetId(null);
    closeStory();
  };
  const go = (screen: Exclude<IgScreen, "post" | "directory">) => {
    history.current = [];
    pendingScroll.current = 0;
    setRoute({ screen, profileId: route.profileId, postId: null });
    setHistoryVersion((value) => value + 1);
    setSheetId(null);
    closeStory();
  };
  const openDirectory = () => push({ screen: "directory", profileId: route.profileId, postId: null });
  const navigateProfile = (profileId: string) => push({ screen: "profile", profileId, postId: null });
  const openPost = (postId: string) => push({ screen: "post", profileId: route.profileId, postId });
  const back = () => {
    const previous = history.current.pop();
    if (!previous) return;
    pendingScroll.current = previous.scrollTop;
    setRoute(previous.route);
    setHistoryVersion((value) => value + 1);
    setSheetId(null);
    closeStory();
  };

  const toggleLike = (id: string) => { const key = interactionKey(id); setLiked((state) => ({ ...state, [key]: !state[key] })); };
  const doubleLike = (id: string) => {
    const key = interactionKey(id);
    setLiked((state) => ({ ...state, [key]: true }));
    setBurst(key);
    clearTimeout(timers.current.burst);
    timers.current.burst = setTimeout(() => setBurst(null), 700);
  };
  const toggleSave = (id: string) => {
    const key = interactionKey(id);
    setSaved((state) => { const next = !state[key]; showToast(next ? "已加入收藏" : "已從收藏移除"); return { ...state, [key]: next }; });
  };
  const postComment = (id: string) => {
    const key = interactionKey(id);
    const text = (drafts[key] ?? "").trim();
    if (!text) return;
    setExtraComments((state) => ({ ...state, [key]: [...(state[key] ?? []), { id: crypto.randomUUID(), user: "你（訪客）", text }] }));
    setDrafts((state) => ({ ...state, [key]: "" }));
    setShowAll((state) => ({ ...state, [key]: true }));
  };

  const openStory = (index: number) => {
    if (!highlightCount(route.profileId)) return;
    setStory(index);
    setStoryProgress(0);
    clearInterval(timers.current.story);
    timers.current.story = setInterval(() => setStoryProgress((progress) => (progress + 2.5 < 100 ? progress + 2.5 : 100)), 100);
  };
  const stepStory = (delta: -1 | 1) => {
    const total = highlightCount(route.profileId);
    const next = story + delta;
    if (next < 0) { setStoryProgress(0); return; }
    if (next >= total) { closeStory(); return; }
    setStory(next);
    setStoryProgress(0);
  };
  useEffect(() => {
    if (story >= 0 && storyProgress >= 100) {
      if (story + 1 >= highlightCount(route.profileId)) closeStory();
      else { setStory(story + 1); setStoryProgress(0); }
    }
  }, [story, storyProgress, route.profileId, highlightCount, closeStory]);

  const activeProfileId = route.profileId;
  return {
    screen: route.screen, postId: route.postId, activeProfileId,
    previousScreen: history.current.at(-1)?.route.screen ?? "profile", historyDepth: history.current.length,
    interactionKey, gridTab: gridTabs[profileKey] ?? "grid", followed: !!followedProfiles[profileKey],
    liked, saved, extraComments, drafts, showAll, commentOpen, slide, query: queries[profileKey] ?? "", sheetId, burst, toast, story, storyProgress, scrollRef,
    setGridTab: (value: "grid" | "list") => setGridTabs((state) => ({ ...state, [profileKey]: value })),
    setFollowed: (value: boolean) => setFollowedProfiles((state) => ({ ...state, [profileKey]: value })),
    setDrafts, setShowAll, setCommentOpen, setSlide,
    setQuery: (value: string) => setQueries((state) => ({ ...state, [profileKey]: value })),
    setSheetId, showToast, go, openDirectory, openPost, navigateProfile, back,
    toggleLike, doubleLike, toggleSave, postComment, openStory, closeStory, stepStory
  };
}
