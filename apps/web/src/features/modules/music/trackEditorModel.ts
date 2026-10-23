import type { MusicTrack } from "@retrodesk/shared";
import { classifyPastedUrl, type PastedSource } from "./sourceClassifier";

export const MAX_TRACKS = 100;
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_MAX_BYTES = 8 * 1024 * 1024;

/** The new-track bar requires HTTPS; existing saved external sources are left intact. */
export function classifyNewTrack(raw: string): PastedSource {
  let value = raw.trim();
  if (!/^[a-z][\w+.-]*:/i.test(value) && /^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(value)) value = `https://${value}`;
  const classified = classifyPastedUrl(value);
  return classified.type === "web-page" && !value.startsWith("https://") ? { type: "invalid", reason: "not-https" } : classified;
}
export function sourceForNewTrack(guess: PastedSource): MusicTrack["source"] | null {
  if (guess.type === "embed") return guess.source;
  if (guess.type === "audio-file" || guess.type === "video-file") return { kind: "audioUrl", url: guess.url };
  if (guess.type === "web-page") return { kind: "externalLink", url: guess.url };
  return null;
}
export const titleFromAudioFilename = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_\-/]+/g, " ").trim().slice(0, 200);
export const availableTrackSlots = (current: number, requested: number) => Math.max(0, Math.min(requested, MAX_TRACKS - current));
