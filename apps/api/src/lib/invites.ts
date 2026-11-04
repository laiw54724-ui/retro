const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function digestInviteToken(token: string): Promise<string> {
  if (!INVITE_TOKEN_PATTERN.test(token)) throw new Error("invalid_invite_token");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
