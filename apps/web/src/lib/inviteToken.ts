const INVITE_STORAGE_KEY = "retrodesk.pending-invite";
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type InviteLocation = Pick<Location, "hash" | "pathname" | "search">;
type InviteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CaptureResult = "captured" | "stored" | "missing" | "invalid";

export function readInviteToken(storage: InviteStorage): string | null {
  const token = storage.getItem(INVITE_STORAGE_KEY);
  return token && INVITE_TOKEN_PATTERN.test(token) ? token : null;
}

export function clearInviteToken(storage: InviteStorage): void {
  storage.removeItem(INVITE_STORAGE_KEY);
}

export function captureInviteToken(
  location: InviteLocation,
  storage: InviteStorage,
  replaceUrl: (url: string) => void
): CaptureResult {
  if (!location.hash) return readInviteToken(storage) ? "stored" : "missing";

  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const candidate = params.get("token") ?? "";
  replaceUrl(location.pathname + location.search);

  if (!INVITE_TOKEN_PATTERN.test(candidate)) {
    clearInviteToken(storage);
    return "invalid";
  }

  storage.setItem(INVITE_STORAGE_KEY, candidate);
  return "captured";
}
