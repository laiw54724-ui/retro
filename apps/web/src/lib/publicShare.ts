export type PublicEntityKind = "oc" | "post";

export function buildPublicEntityUrl(origin: string, handle: string, kind: PublicEntityKind, id: string) {
  const cleanOrigin = origin.replace(/\/$/, "");
  const cleanHandle = handle.replace(/^@/, "");
  return `${cleanOrigin}/@${encodeURIComponent(cleanHandle)}/${kind}/${encodeURIComponent(id)}`;
}

type SharePlatform = {
  share?: (data: { title?: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

export async function sharePublicUrl(url: string, title: string, platform: SharePlatform): Promise<"shared" | "copied" | "manual"> {
  if (platform.share) {
    try {
      await platform.share({ title, url });
      return "shared";
    } catch {
      // Cancellation or platform rejection may still allow clipboard fallback.
    }
  }
  if (platform.clipboard) {
    try {
      await platform.clipboard.writeText(url);
      return "copied";
    } catch {
      // The caller must expose a selectable manual fallback.
    }
  }
  return "manual";
}
