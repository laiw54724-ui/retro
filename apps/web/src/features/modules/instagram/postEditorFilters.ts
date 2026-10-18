import type { PostEntityV2 } from "@retrodesk/shared";

export type PostEditorFilters = {
  query: string;
  visibility: "all" | "draft" | "published";
  pinnedOnly: boolean;
};

export const DEFAULT_POST_EDITOR_FILTERS: PostEditorFilters = {
  query: "",
  visibility: "all",
  pinnedOnly: false,
};

/** Search changes the local editor list only; it never changes canonical order. */
export function normalizePostEditorQuery(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function hasPostEditorFilters(filters: PostEditorFilters): boolean {
  return !!normalizePostEditorQuery(filters.query) || filters.visibility !== "all" || filters.pinnedOnly;
}

export type PostEditorRow = {
  post: PostEntityV2;
  /** Index in this author's complete list, before search/status/pinned filtering. */
  authoredIndex: number;
  matchesFilters: boolean;
};

/**
 * Call with this author's posts, in canonical order. Keep the expanded editor
 * mounted if editing its content makes it stop matching; explicit filter
 * changes clear expandedPostId in the component so new searches apply normally.
 */
export function selectPostEditorRows(
  posts: readonly PostEntityV2[],
  filters: PostEditorFilters,
  expandedPostId: string | null = null,
): { rows: PostEditorRow[]; matchCount: number; retainedCount: number } {
  const terms = normalizePostEditorQuery(filters.query).split(" ").filter(Boolean);
  let matchCount = 0;
  let retainedCount = 0;
  const rows = posts.flatMap((post, authoredIndex): PostEditorRow[] => {
    const matchesStatus = filters.visibility === "all" || post.visibility === filters.visibility;
    const matchesPinned = !filters.pinnedOnly || post.pinned;
    const matchesQuery = !terms.length || (() => {
      const searchable = normalizePostEditorQuery([
        post.title,
        post.caption,
        post.location,
        post.date,
        post.worldDateLabel,
        ...post.media.map((media) => media.alt),
      ].join(" "));
      return terms.every((term) => searchable.includes(term));
    })();
    const matchesFilters = matchesStatus && matchesPinned && matchesQuery;
    if (matchesFilters) matchCount += 1;
    else if (post.id === expandedPostId) retainedCount += 1;
    else return [];
    return [{ post, authoredIndex, matchesFilters }];
  });
  return { rows, matchCount, retainedCount };
}
