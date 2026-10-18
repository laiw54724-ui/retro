import { describe, expect, it } from "vitest";
import { PostEntityV2Schema } from "@retrodesk/shared";
import {
  DEFAULT_POST_EDITOR_FILTERS,
  hasPostEditorFilters,
  normalizePostEditorQuery,
  selectPostEditorRows,
  type PostEditorFilters,
} from "./postEditorFilters";

const createPost = (id: string, fields: Record<string, unknown> = {}) => PostEntityV2Schema.parse({
  kind: "post",
  id,
  siteId: "site-a",
  authorProfileId: "profile:a",
  visibility: "draft",
  title: "",
  caption: "",
  location: "",
  date: "",
  href: "",
  src: null,
  srcUrl: "",
  extra: [],
  comments: [],
  likes: 0,
  ...fields,
});

const filters = (patch: Partial<PostEditorFilters>): PostEditorFilters => ({ ...DEFAULT_POST_EDITOR_FILTERS, ...patch });

describe("canonical Instagram editor filters", () => {
  it("normalizes fullwidth text, composed Unicode, case and whitespace", () => {
    expect(normalizePostEditorQuery("  ＮＥＫＯ　Cafe\u0301\n ")).toBe("neko café");
    const posts = [createPost("post:one", { title: "NEKO Café" })];
    expect(selectPostEditorRows(posts, filters({ query: "ｎｅｋｏ ＣＡＦÉ" })).matchCount).toBe(1);
    expect(hasPostEditorFilters(filters({ query: " \t　\n" }))).toBe(false);
  });

  it.each([
    ["title", "Title match"],
    ["caption", "Caption match"],
    ["location", "Location match"],
    ["date", "Date match"],
    ["worldDateLabel", "World date match"],
  ])("searches %s without requiring an expanded post", (field, value) => {
    const post = createPost("post:match", { [field]: value });
    expect(selectPostEditorRows([post], filters({ query: value.toUpperCase() })).rows[0]?.post).toBe(post);
  });

  it("searches every media alt and supports terms across metadata fields", () => {
    const post = createPost("post:carousel", {
      location: "夜市",
      worldDateLabel: "霜月 12 日",
      media: [
        { id: "media:one", src: null, alt: "封面" },
        { id: "media:two", src: null, alt: "Blue ribbon" },
      ],
    });
    expect(selectPostEditorRows([post], filters({ query: "夜市 ribbon 霜月" })).matchCount).toBe(1);
    expect(selectPostEditorRows([post], filters({ query: "不存在" })).matchCount).toBe(0);
  });

  it("combines status and pinned filters independently while keeping authored indexes", () => {
    const posts = [
      createPost("post:draft"),
      createPost("post:pinned-public", { visibility: "published", pinned: true }),
      createPost("post:public", { visibility: "published" }),
      createPost("post:pinned-draft", { pinned: true }),
    ];
    const before = structuredClone(posts);
    expect(selectPostEditorRows(posts, filters({ visibility: "published" })).rows.map((row) => row.authoredIndex)).toEqual([1, 2]);
    expect(selectPostEditorRows(posts, filters({ pinnedOnly: true })).rows.map((row) => row.authoredIndex)).toEqual([1, 3]);
    const selected = selectPostEditorRows(posts, filters({ visibility: "draft", pinnedOnly: true }));
    expect(selected).toMatchObject({ matchCount: 1, retainedCount: 0 });
    expect(selected.rows.map((row) => row.authoredIndex)).toEqual([3]);
    expect(selected.rows[0]?.post).toBe(posts[3]);
    expect(posts).toEqual(before);
    expect(hasPostEditorFilters(filters({ visibility: "draft" }))).toBe(true);
    expect(hasPostEditorFilters(filters({ pinnedOnly: true }))).toBe(true);
  });

  it("keeps an actively edited row that stops matching without including it in the result count", () => {
    const posts = [
      createPost("post:edited", { title: "改名後", visibility: "published" }),
      createPost("post:match", { title: "草稿" }),
      createPost("post:other", { title: "其他" }),
    ];
    const active = filters({ query: "草稿", visibility: "draft" });
    const retained = selectPostEditorRows(posts, active, "post:edited");
    expect(retained).toMatchObject({ matchCount: 1, retainedCount: 1 });
    expect(retained.rows.map(({ post, authoredIndex, matchesFilters }) => [post.id, authoredIndex, matchesFilters])).toEqual([
      ["post:edited", 0, false],
      ["post:match", 1, true],
    ]);
    const collapsed = selectPostEditorRows(posts, active);
    expect(collapsed).toMatchObject({ matchCount: 1, retainedCount: 0 });
    expect(collapsed.rows.map((row) => row.post.id)).toEqual(["post:match"]);
  });

  it("does not synthesize stale rows and restores all authored posts when reset", () => {
    const posts = [createPost("post:one"), createPost("post:two")];
    expect(selectPostEditorRows(posts, filters({ query: "missing" }), "post:deleted")).toEqual({ rows: [], matchCount: 0, retainedCount: 0 });
    expect(selectPostEditorRows(posts, DEFAULT_POST_EDITOR_FILTERS).rows.map((row) => row.post.id)).toEqual(["post:one", "post:two"]);
    expect(hasPostEditorFilters(DEFAULT_POST_EDITOR_FILTERS)).toBe(false);
    expect(selectPostEditorRows([], DEFAULT_POST_EDITOR_FILTERS)).toEqual({ rows: [], matchCount: 0, retainedCount: 0 });
  });
});
