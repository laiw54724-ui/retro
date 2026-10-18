import { describe, expect, it, vi } from "vitest";
import { createAssetResolver, initialAssetSourceValue } from "./assetSource";

const ref = "retro-asset:11111111-1111-4111-8111-111111111111";

describe("asset source rendering", () => {
  it("does not expose a protected reference as the initial image source", () => {
    expect(initialAssetSourceValue(ref)).toBeNull();
    expect(initialAssetSourceValue("https://example.test/image.png")).toBe("https://example.test/image.png");
  });

  it("produces a resolved URL after the protected reference load completes", async () => {
    let release!: (blob: Blob) => void;
    const resolver = createAssetResolver({
      fetchBlob: () => new Promise<Blob>((resolve) => { release = resolve; }),
      createUrl: () => "blob:resolved",
    });
    const pending = resolver.resolve(ref);
    expect(initialAssetSourceValue(ref)).toBeNull();
    release(new Blob(["image"]));
    await expect(pending).resolves.toBe("blob:resolved");
  });
});

describe("asset resolver cache", () => {
  it("deduplicates authenticated loads and revokes cached/in-flight URLs on dispose", async () => {
    let release!: (blob: Blob) => void;
    const fetchBlob = vi.fn(() => new Promise<Blob>((resolve) => { release = resolve; }));
    const revoke = vi.fn();
    const resolver = createAssetResolver({ fetchBlob, createUrl: () => "blob:one", revokeUrl: revoke });
    const first = resolver.resolve(ref);
    const second = resolver.resolve(ref);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    resolver.dispose();
    release(new Blob(["x"]));
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("reuses a resolved URL and revokes it on disposal", async () => {
    const revoke = vi.fn();
    const resolver = createAssetResolver({ fetchBlob: vi.fn(async () => new Blob(["x"])), createUrl: () => "blob:one", revokeUrl: revoke });
    await expect(resolver.resolve(ref)).resolves.toBe("blob:one");
    await expect(resolver.resolve(ref)).resolves.toBe("blob:one");
    resolver.dispose();
    expect(revoke).toHaveBeenCalledWith("blob:one");
  });

  it("keeps a disposed lifecycle terminal while a fresh setup resolves the same reference", async () => {
    let releaseOld!: (blob: Blob) => void;
    let releaseCurrent!: (blob: Blob) => void;
    const oldFetch = vi.fn(() => new Promise<Blob>((resolve) => { releaseOld = resolve; }));
    const oldCreate = vi.fn(() => "blob:old");
    const oldRevoke = vi.fn();
    const old = createAssetResolver({ fetchBlob: oldFetch, createUrl: oldCreate, revokeUrl: oldRevoke });
    const late = old.resolve(ref);
    old.dispose();

    const currentFetch = vi.fn(() => new Promise<Blob>((resolve) => { releaseCurrent = resolve; }));
    const currentRevoke = vi.fn();
    const current = createAssetResolver({ fetchBlob: currentFetch, createUrl: () => "blob:current", revokeUrl: currentRevoke });
    const active = current.resolve(ref);
    releaseOld(new Blob(["old site response"]));
    releaseCurrent(new Blob(["current site response"]));

    await expect(late).resolves.toBeNull();
    await expect(active).resolves.toBe("blob:current");
    await expect(old.resolve(ref)).resolves.toBeNull();
    await expect(old.resolve("retro-asset:22222222-2222-4222-8222-222222222222")).resolves.toBeNull();
    await expect(current.resolve(ref)).resolves.toBe("blob:current");
    expect(oldFetch).toHaveBeenCalledTimes(1);
    expect(oldCreate).not.toHaveBeenCalled();
    expect(currentFetch).toHaveBeenCalledTimes(1);

    old.dispose();
    expect(oldRevoke).not.toHaveBeenCalled();
    expect(currentRevoke).not.toHaveBeenCalled();
    current.dispose();
    current.dispose();
    expect(currentRevoke).toHaveBeenCalledExactlyOnceWith("blob:current");
  });

  it("reports failed loads as null without caching the failure", async () => {
    const fetchBlob = vi.fn<() => Promise<Blob | null>>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Blob(["recovered"]));
    const revoke = vi.fn();
    const resolver = createAssetResolver({ fetchBlob, createUrl: () => "blob:recovered", revokeUrl: revoke });

    await expect(resolver.resolve(ref)).resolves.toBeNull();
    await expect(resolver.resolve(ref)).resolves.toBeNull();
    await expect(resolver.resolve(ref)).resolves.toBe("blob:recovered");
    await expect(resolver.resolve(ref)).resolves.toBe("blob:recovered");
    expect(fetchBlob).toHaveBeenCalledTimes(3);
    resolver.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:recovered");
  });
});
