import { describe, expect, it } from "vitest";
import { createInviteToken, digestInviteToken } from "../src/lib/invites";

describe("invite secrets", () => {
  it("creates 256-bit base64url tokens without padding", () => {
    const first = createInviteToken();
    const second = createInviteToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("returns only a stable SHA-256 digest and rejects malformed input", async () => {
    const token = createInviteToken();
    await expect(digestInviteToken(token)).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(digestInviteToken(token)).resolves.toBe(await digestInviteToken(token));
    await expect(digestInviteToken("raw-token")).rejects.toThrow("invalid_invite_token");
  });
});
