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
});
