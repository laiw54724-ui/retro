/** Normalize pasted social destinations without accepting executable/custom schemes. */
export function normalizeSocial(raw: string): { url: string; label: string } | null {
  let url = raw.trim();
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(url)) url = `mailto:${url}`;
  else if (!/^[a-z][a-z\d+.-]*:/i.test(url)) url = `https://${url}`;
  if (url.length > 2048 || /\s/.test(url)) return null;
  if (/^mailto:/i.test(url)) return /^mailto:[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(url) ? { url, label: "Email" } : null;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname.includes(".") || parsed.username || parsed.password) return null;
    const host = parsed.hostname.replace(/^www\./, "");
    const platforms: [string[], string][] = [
      [["instagram.com"], "Instagram"], [["twitter.com", "x.com"], "Twitter"], [["discord.com", "discord.gg"], "Discord"],
      [["pinterest.com"], "Pinterest"], [["spotify.com"], "Spotify"], [["youtube.com", "youtu.be"], "YouTube"],
      [["pixiv.net"], "Pixiv"], [["threads.net", "threads.com"], "Threads"], [["tiktok.com"], "TikTok"],
      [["bsky.app"], "Bluesky"], [["github.com"], "GitHub"],
    ];
    const label = platforms.find(([hosts]) => hosts.some((base) => host === base || host.endsWith(`.${base}`)))?.[1] ?? host.split(".")[0];
    return { url, label: label.slice(0, 100) };
  } catch { return null; }
}

export function reorderFields<T extends { id: string }>(list: T[], id: string, target: string | null, after = false): T[] {
  if (id === target || !list.some((item) => item.id === id) || (target !== null && !list.some((item) => item.id === target))) return list;
  const moved = list.find((item) => item.id === id)!;
  const rest = list.filter((item) => item.id !== id);
  const index = target === null ? rest.length : rest.findIndex((item) => item.id === target) + Number(after);
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}
