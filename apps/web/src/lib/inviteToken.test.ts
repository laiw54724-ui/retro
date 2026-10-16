import { describe, expect, it } from "vitest";
import { captureInviteToken, clearInviteToken, readInviteToken } from "./inviteToken";

const token = "a".repeat(43);

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe("invite fragment capture", () => {
  it("stores a valid token in session storage and clears the URL fragment", () => {
    const storage = memoryStorage();
    const replacements: string[] = [];
    const result = captureInviteToken(
      { hash: `#token=${token}`, pathname: "/invite", search: "?source=email" },
      storage,
      (url) => replacements.push(url)
    );

    expect(result).toBe("captured");
    expect(readInviteToken(storage)).toBe(token);
    expect(replacements).toEqual(["/invite?source=email"]);
  });

  it("rejects malformed tokens, clears stale storage, and removes the fragment", () => {
    const storage = memoryStorage({ "retrodesk.pending-invite": token });
    const replacements: string[] = [];
    const result = captureInviteToken(
      { hash: "#token=too-short", pathname: "/invite", search: "" },
      storage,
      (url) => replacements.push(url)
    );

    expect(result).toBe("invalid");
    expect(readInviteToken(storage)).toBeNull();
    expect(replacements).toEqual(["/invite"]);
  });

  it("preserves an already captured token across the OAuth return", () => {
    const storage = memoryStorage({ "retrodesk.pending-invite": token });
    expect(captureInviteToken({ hash: "", pathname: "/invite", search: "" }, storage, () => undefined)).toBe("stored");
    expect(readInviteToken(storage)).toBe(token);
  });

  it("removes the token after success or a terminal error", () => {
    const storage = memoryStorage({ "retrodesk.pending-invite": token });
    clearInviteToken(storage);
    expect(readInviteToken(storage)).toBeNull();
  });
});
