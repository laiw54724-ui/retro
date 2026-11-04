import { describe, expect, it, vi } from "vitest";
import { buildPublicEntityUrl, sharePublicUrl } from "./publicShare";

describe("public entity sharing", () => {
  it("builds encoded canonical OC and post routes", () => {
    expect(buildPublicEntityUrl("https://retro.example/", "@bei", "oc", "profile:角色 1")).toBe("https://retro.example/@bei/oc/profile%3A%E8%A7%92%E8%89%B2%201");
    expect(buildPublicEntityUrl("https://retro.example", "bei", "post", "post/1")).toBe("https://retro.example/@bei/post/post%2F1");
  });

  it("reports only completed native or clipboard operations as success", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await sharePublicUrl("https://x", "OC", { share })).toBe("shared");
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sharePublicUrl("https://x", "OC", { share: vi.fn().mockRejectedValue(new Error("cancel")), clipboard: { writeText } })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://x");
    expect(await sharePublicUrl("https://x", "OC", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })).toBe("manual");
  });
});
