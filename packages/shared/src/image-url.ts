export type ImageUrlResult = { ok: true; url: string; source: "direct" | "google-drive" } | { ok: false; reason: string };

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

function driveFileId(url: URL): string | null {
  const fromPath = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
  const candidate = fromPath ?? url.searchParams.get("id");
  return candidate && DRIVE_ID.test(candidate) ? candidate : null;
}

/**
 * Turns a pasted image link into a URL that can be used in an <img>.
 * Only https is accepted. Google Drive share links are converted to the
 * thumbnail endpoint (the file must be shared as "anyone with the link").
 */
export function normalizeImageUrl(input: string): ImageUrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "請貼上圖片連結。" };
  if (raw.length > 2048) return { ok: false, reason: "連結太長。" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "這不是有效的網址。" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "只支援 https:// 開頭的連結。" };

  if (DRIVE_HOSTS.has(url.hostname)) {
    if (url.pathname.includes("/folders/")) return { ok: false, reason: "請貼上圖片檔案的連結，不是資料夾。" };
    const id = driveFileId(url);
    if (!id) return { ok: false, reason: "無法辨識這個 Google 雲端連結，請使用檔案的「共用」連結。" };
    return { ok: true, url: `https://drive.google.com/thumbnail?id=${id}&sz=w2000`, source: "google-drive" };
  }

  return { ok: true, url: url.toString(), source: "direct" };
}
