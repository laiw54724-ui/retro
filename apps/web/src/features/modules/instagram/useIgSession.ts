import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type IgScreen = "profile" | "feed" | "explore" | "saved" | "directory" | "collection" | "post" | "people";
export type IgComment = { id: string; user: string; text: string };
export type IgGridTab = "grid" | "list" | "collections";
export type Route = { screen: IgScreen; profileId: string; postId: string | null; collectionId: string | null; peopleKind: "followers" | "following" | "likers" | null };
export type HistoryFrame = { route: Route; scrollTop: number };

/** Visitor-only Instagram state. Lives in memory; never writes the document or API. */
export function useIgSession(highlightCount: (profileId: string) => number, entryProfileId = "entry", sessionScope = "ig", initialPostId: string | null = null, persist?: { restore: { route: Route; history: HistoryFrame[] } | null; save: (state: { route: Route; history: HistoryFrame[] }) => void }) {
  const { t: tr } = useTranslation("instagram");
  // A route handed over by a previous renderer (rotation) is used for this mount only; a real scope change starts fresh.
  const restored = useRef(persist?.restore ?? null);
  const initialRoute = (): Route => restored.current?.route ?? ({ screen: initialPostId ? "post" : "profile", profileId: entryProfileId, postId: initialPostId, collectionId: null, peopleKind: null });
  const [route, setRoute] = useState<Route>(initialRoute);
  const history = useRef<HistoryFrame[]>(restored.current?.history.map((frame) => ({ ...frame })) ?? []);
  const pendingScroll = useRef<number | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => { persist?.save({ route, history: history.current.map((frame) => ({ ...frame })) }); }, [route, historyVersion]);
  const [gridTabs, setGridTabs] = useState<Record<string, IgGridTab>>({});
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
  const [storyPaused, setStoryPaused] = useState(false);
  const timers = useRef<{ toast?: ReturnType<typeof setTimeout>; burst?: ReturnType<typeof setTimeout>; story?: ReturnType<typeof setInterval> }>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const closeStory = useCallback(() => {
    clearInterval(timers.current.story);
    setStory(-1);
    setStoryProgress(0);
    setStoryPaused(false);
  }, []);

  useEffect(() => () => {
    clearTimeout(timers.current.toast);
    clearTimeout(timers.current.burst);
    clearInterval(timers.current.story);
  }, []);

  const scopeKey = `${entryProfileId}|${initialPostId ?? ""}|${sessionScope}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return; // mount (or a StrictMode re-run): keep the initial/restored route
    lastScope.current = scopeKey;
    restored.current = null;
    history.current = [];
    pendingScroll.current = 0;
    setRoute(initialRoute());
    setHistoryVersion((value) => value + 1);
    closeStory();
  }, [entryProfileId, initialPostId, sessionScope, closeStory]);

  useEffect(() => {
    const top = pendingScroll.current ?? 0;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      const node = scrollRef.current;
      if (node) {
        node.scrollTop = top;
        if (top === 0 || node.scrollTop > 0 || attempts >= 10) {
          if (pendingScroll.current === top) pendingScroll.current = null;
          return;
        }
      }
      attempts += 1;
      frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [route.screen, route.postId, route.collectionId, route.peopleKind, route.profileId]);

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
  const go = (screen: Exclude<IgScreen, "post" | "directory" | "collection" | "people">) => {
    history.current = [];
    pendingScroll.current = 0;
    setRoute({ screen, profileId: route.profileId, postId: null, collectionId: null, peopleKind: null });
    setHistoryVersion((value) => value + 1);
    setSheetId(null);
    closeStory();
  };
  const openDirectory = () => push({ screen: "directory", profileId: route.profileId, postId: null, collectionId: null, peopleKind: null });
  const navigateProfile = (profileId: string) => push({ screen: "profile", profileId, postId: null, collectionId: null, peopleKind: null });
  const openCollection = (collectionId: string) => push({ screen: "collection", profileId: route.profileId, postId: null, collectionId, peopleKind: null });
  const openPost = (postId: string) => push({ screen: "post", profileId: route.profileId, postId, collectionId: null, peopleKind: null });
  const openPeople = (peopleKind: Route["peopleKind"], postId: string | null = null) => push({ screen: "people", profileId: route.profileId, postId, collectionId: null, peopleKind });
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
    setSaved((state) => { const next = !state[key]; showToast(next ? tr("useIgSession.addedToSaved") : tr("useIgSession.removedFromSaved")); return { ...state, [key]: next }; });
  };
  const postComment = (id: string) => {
    const key = interactionKey(id);
    const text = (drafts[key] ?? "").trim();
    if (!text) return;
    setExtraComments((state) => ({ ...state, [key]: [...(state[key] ?? []), { id: crypto.randomUUID(), user: tr("useIgSession.youVisitor"), text }] }));
    setDrafts((state) => ({ ...state, [key]: "" }));
    setShowAll((state) => ({ ...state, [key]: true }));
  };

  const openStory = (index: number) => {
    if (!highlightCount(route.profileId)) return;
    setStory(index);
    setStoryProgress(0);
    setStoryPaused(false);
  };
  const stepStory = (delta: -1 | 1) => {
    const total = highlightCount(route.profileId);
    const next = story + delta;
    if (next < 0) { setStoryProgress(0); return; }
    if (next >= total) { closeStory(); return; }
    setStory(next);
    setStoryProgress(0);
    setStoryPaused(false);
  };
  useEffect(() => {
    clearInterval(timers.current.story);
    if (story >= 0 && !storyPaused) timers.current.story = setInterval(() => setStoryProgress((progress) => (progress + 2.5 < 100 ? progress + 2.5 : 100)), 100);
    return () => clearInterval(timers.current.story);
  }, [story, storyPaused]);
  useEffect(() => {
    if (story >= 0 && storyProgress >= 100) {
      if (story + 1 >= highlightCount(route.profileId)) closeStory();
      else { setStory(story + 1); setStoryProgress(0); }
    }
  }, [story, storyProgress, route.profileId, highlightCount, closeStory]);

  const activeProfileId = route.profileId;
  return {
    screen: route.screen, postId: route.postId, collectionId: route.collectionId, peopleKind: route.peopleKind, activeProfileId,
    previousScreen: history.current.at(-1)?.route.screen ?? "profile", historyDepth: history.current.length,
    interactionKey, gridTab: gridTabs[profileKey] ?? "grid", followed: !!followedProfiles[profileKey],
    liked, saved, extraComments, drafts, showAll, commentOpen, slide, query: queries[profileKey] ?? "", sheetId, burst, toast, story, storyProgress, storyPaused, scrollRef,
    setGridTab: (value: IgGridTab) => setGridTabs((state) => ({ ...state, [profileKey]: value })),
    setFollowed: (value: boolean) => setFollowedProfiles((state) => ({ ...state, [profileKey]: value })),
    setDrafts, setShowAll, setCommentOpen, setSlide,
    setQuery: (value: string) => setQueries((state) => ({ ...state, [profileKey]: value })),
    setSheetId, showToast, go, openDirectory, openCollection, openPost, openPeople, navigateProfile, back,
    toggleLike, doubleLike, toggleSave, postComment, openStory, closeStory, stepStory, toggleStoryPause: () => setStoryPaused((value) => !value)
  };
}
