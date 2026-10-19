import { describe, expect, it } from "vitest";
import { publicSiteLabel, publicSiteUrl } from "./publicSiteUrl";

describe("public site URL", () => {
  it("is the reachable address on the current environment, not a fixed brand domain", () => {
    expect(publicSiteUrl("mochi", "https://retrodesk-staging.pages.dev")).toBe("https://retrodesk-staging.pages.dev/@mochi");
    expect(publicSiteUrl("mochi", "https://retrodesk.me/")).toBe("https://retrodesk.me/@mochi");
    expect(publicSiteUrl("mochi", "http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173/@mochi");
  });
  it("normalises a leading @ and encodes the handle", () => {
    expect(publicSiteUrl("@mochi", "https://x.test")).toBe("https://x.test/@mochi");
    expect(publicSiteUrl("a b/c", "https://x.test")).toBe("https://x.test/@a%20b%2Fc");
  });
  it("labels without the scheme", () => {
    expect(publicSiteLabel("mochi", "https://retrodesk-staging.pages.dev")).toBe("retrodesk-staging.pages.dev/@mochi");
  });
});
