import { documentFixture } from "./fixture";

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id, src: null, title: id, caption: `caption ${id}`, srcUrl: "", href: "", location: id === "p1" ? "Taipei" : "", date: "10月15日", likes: 10, comments: [{ id: id + "c1", user: "ann", text: "nice" }], extra: [] as unknown[], ...extra
});

export const igWindow = (profile: Record<string, unknown> = {}) => ({
  id: "ig", type: "instagram", title: "Instagram.exe", icon: "camera", defaultOpen: true,
  layout: { desktop: { x: 60, y: 10, w: 420, h: 700, z: 1, iconX: 16, iconY: 18 }, mobile: { order: 0 } },
  content: {
    profile: {
      username: "retro", avatar: null, name: "Retro User", alt: "", bio: "hello bio", followers: "100", following: "5", followedBy: "followed by x",
      avatarUrl: "", linkLabel: "my site", linkUrl: "https://example.com", dmUrl: "https://example.com/dm", verified: true,
      showCounts: true, showHighlights: true, showFollowedBy: true, showLikes: true, allowLikes: true, allowComments: true,
      highlights: [{ id: "h1", title: "Trip", src: null, srcUrl: "" }, { id: "h2", title: "Food", src: null, srcUrl: "" }],
      ...profile
    },
    images: [
      post("p1", { extra: [{ id: "e1", src: null, srcUrl: "" }, { id: "e2", src: null, srcUrl: "" }] }),
      post("p2", { caption: "second sunset" })
    ]
  }
});

export const igDocument = (profile: Record<string, unknown> = {}) => ({ ...documentFixture, windows: [igWindow(profile)] });
