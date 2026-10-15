import { describe, expect, it, vi } from "vitest";
import { createAssetResolver } from "./assetSource";

const ref = "retro-asset:11111111-1111-4111-8111-111111111111";

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
