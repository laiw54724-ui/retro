import { describe, expect, it } from "vitest";
import type { AssetRecord } from "./api";
import { auditAssetReferences } from "./asset-reference-audit";

const image = (id: string, url = `https://cdn.test/${id}.png`): AssetRecord => ({ id, url, mimeType: "image/png", size: 1, kind: "image", name: `${id}.png`, createdAt: "2026-10-16T00:00:00.000Z" });

const document = {
  schemaVersion: 1,
  siteName: "Desk",
  theme: { id: "x", name: "x", wall: "#000000", pattern: "image", patternColor: "#ffffff", wallImage: "retro-asset:11111111-1111-4111-8111-111111111111", face: "#000000", light: "#ffffff", shadow: "#888888", dark: "#000000", text: "#000000", titleFrom: "#000000", titleTo: "#000000", taskbar: "#ffffff", accent: "#000000", font: "noto", iconStyle: "classic" },
  mobileColumns: 4,
  windows: [{ id: "ig", type: "instagram", title: "Instagram.exe", icon: "retro-asset:22222222-2222-4222-8222-222222222222", defaultOpen: true, layout: { desktop: { x: 0, y: 0, w: 400, h: 400, z: 1, iconX: 0, iconY: 0 }, mobile: { order: 0 } }, content: { skin: "win98", profile: { username: "bei", avatar: "retro-asset:33333333-3333-4333-8333-333333333333", name: "Bei", highlights: [{ id: "h", title: "Trip", src: "retro-asset:44444444-4444-4444-8444-444444444444" }], images: [{ id: "p", title: "Sunset", src: "retro-asset:55555555-5555-4555-8555-555555555555", extra: [{ id: "e", src: "retro-asset:55555555-5555-4555-8555-555555555555" }] }] } } }]
} as never;

describe("auditAssetReferences", () => {
  it("reports known locations and keeps unreferenced assets", () => {
    const assets = [image("11111111-1111-4111-8111-111111111111"), image("22222222-2222-4222-8222-222222222222"), image("33333333-3333-4333-8333-333333333333"), image("44444444-4444-4444-8444-444444444444"), image("55555555-5555-4555-8555-555555555555"), image("66666666-6666-4666-8666-666666666666")];
    const result = auditAssetReferences(document, assets);
    expect(result.find((item) => item.asset.id === assets[0].id)?.references[0]).toMatchObject({ label: "桌面背景", path: ["theme", "wallImage"] });
    expect(result.find((item) => item.asset.id === assets[1].id)?.references[0]?.label).toBe("Instagram.exe 的圖示");
    expect(result.find((item) => item.asset.id === assets[2].id)?.references[0]?.label).toBe("Instagram.exe 的頭像");
    expect(result.find((item) => item.asset.id === assets[3].id)?.references[0]?.label).toContain("精選");
    expect(result.find((item) => item.asset.id === assets[4].id)?.references.map((ref) => ref.label)).toEqual(expect.arrayContaining([expect.stringContaining("貼文主圖"), expect.stringContaining("輪播第 2 張")]));
    expect(result.find((item) => item.asset.id === assets[5].id)).toMatchObject({ referenced: false, references: [] });
  });

  it("matches direct asset URLs and preserves unknown paths", () => {
    const asset = image("77777777-7777-4777-8777-777777777777");
    const input = { custom: { artwork: asset.url } };
    const result = auditAssetReferences(input as never, [asset]);
    expect(result[0]).toMatchObject({ referenced: true, references: [{ path: ["custom", "artwork"], label: "結構化路徑：custom.artwork" }] });
  });

  it("uses canonical v2 profile, post and highlight names in details", () => {
    const assets = [image("11111111-1111-4111-8111-111111111111"), image("22222222-2222-4222-8222-222222222222"), image("33333333-3333-4333-8333-333333333333")];
    const input = {
      schemaVersion: 2,
      entities: {
        profiles: [{ displayName: "被被子", avatar: `retro-asset:${assets[0].id}` }],
        posts: [{ title: "雪國速寫", media: [{ src: `retro-asset:${assets[1].id}` }] }],
        highlights: [{ title: "冬日旅行", frames: [{ src: `retro-asset:${assets[2].id}` }] }]
      }
    };
    const result = auditAssetReferences(input as never, assets);
    expect(result[0].references[0]?.label).toBe("角色「被被子」的頭像");
    expect(result[1].references[0]?.label).toBe("「雪國速寫」媒體第 1 張");
    expect(result[2].references[0]?.label).toBe("精選「冬日旅行」第 1 頁");
  });

  it("names uploaded music assets by window and track", () => {
    const asset = { ...image("77777777-7777-4777-8777-777777777777"), kind: "audio" as const, mimeType: "audio/mpeg", name: "theme.mp3" };
    const input = { schemaVersion: 1, windows: [{ title: "Music Player.exe", type: "music", content: { tracks: [{ title: "被被子的主題曲", source: { kind: "uploadedAudio", asset: `retro-asset:${asset.id}` } }] } }] };
    expect(auditAssetReferences(input as never, [asset])[0].references[0]?.label).toBe("Music Player.exe 的曲目「被被子的主題曲」音訊");
  });
});
