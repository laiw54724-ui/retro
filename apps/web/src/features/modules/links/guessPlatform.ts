/** User-entered shortcuts are accepted only as complete HTTP(S) or mail destinations. */
export function normalizeLinkInput(input: string): string | null {
  let value = input.trim();
  if (!value || /\s/.test(value)) return null;
  if (/^[^@:/]+@[^@:/]+\.[^@:/]+$/.test(value)) value = `mailto:${value}`;
  else if (/^[\w-]+(?:\.[\w-]+)+(?:[/?#:]|$)/.test(value)) value = `https://${value}`;
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "mailto:") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url.pathname) ? value : null;
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname ? value : null;
  } catch { return null; }
}

const PLATFORMS: Array<[string[], string, string, string]> = [
  [["instagram.com"], "Instagram", "camera", "#c2185b"],
  [["x.com", "twitter.com"], "X / Twitter", "star", "#111111"],
  [["threads.net", "threads.com"], "Threads", "star", "#111111"],
  [["youtube.com", "youtu.be"], "YouTube", "music", "#cc0000"],
  [["pixiv.net"], "Pixiv", "palette", "#0096fa"],
  [["facebook.com", "fb.me"], "Facebook", "user", "#1877f2"],
  [["tiktok.com"], "TikTok", "music", "#111111"],
  [["discord.gg", "discord.com"], "Discord", "mail", "#5865f2"],
  [["spotify.com"], "Spotify", "music", "#1db954"],
  [["github.com"], "GitHub", "computer", "#24292f"],
  [["plurk.com"], "Plurk", "heart", "#ff574d"],
  [["ko-fi.com"], "Ko-fi", "heart", "#29abe0"],
  [["patreon.com"], "Patreon", "heart", "#f96854"],
  [["bsky.app"], "Bluesky", "star", "#1185fe"],
  [["booth.pm"], "BOOTH", "folder", "#fc4d50"],
];

export function guessPlatform(value: string) {
  const url = new URL(value);
  if (url.protocol === "mailto:") return { label: "", icon: "mail", color: "#000080" };
  const host = url.hostname.replace(/^www\./, "");
  const platform = PLATFORMS.find(([domains]) => domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
  return platform ? { label: platform[1], icon: platform[2], color: platform[3] } : { label: host, icon: "link", color: "#000080" };
}
