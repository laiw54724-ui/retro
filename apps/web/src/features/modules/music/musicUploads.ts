import type { MusicTrack } from "@retrodesk/shared";
import type { WindowUploadOptions } from "../../media/windowMediaSession";

export type MusicUploadField = "cover" | "audio";
export const musicUploadScope = (windowId: string, trackId: string) => `window:${windowId}:music:${trackId}`;

/** Capture only the replaced field. Later metadata edits and ordering must survive. */
export function musicUploadOptions(track: MusicTrack, field: MusicUploadField): WindowUploadOptions<"music"> {
  const captured = field === "audio" ? JSON.stringify(track.source) : JSON.stringify([track.cover, track.coverUrl]);
  return {
    kind: field === "audio" ? "audio" : "image",
    slot: field,
    isCurrent: (current) => current.content.tracks.some((item) => item.id === track.id &&
      (field === "audio" ? JSON.stringify(item.source) : JSON.stringify([item.cover, item.coverUrl])) === captured),
    apply: (current, stored) => ({
      ...current,
      content: { ...current.content, tracks: current.content.tracks.map((item) => item.id !== track.id ? item : {
        ...item,
        ...(field === "audio" ? { source: { kind: "uploadedAudio" as const, asset: stored } } : { cover: stored, coverUrl: "" }),
      }) },
    }),
  };
}
