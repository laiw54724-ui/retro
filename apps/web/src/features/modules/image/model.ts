import type { ImageContent } from "@retrodesk/shared";
import type { WindowOf } from "../types";
import type { WindowUploadOptions } from "../../media/windowMediaSession";

export const DEFAULT_IMAGE_CONTENT: ImageContent = {
  src: null,
  srcUrl: "",
  alt: "",
  caption: "",
  fit: "contain",
  background: "transparent",
  pixelated: false,
  showCaption: true,
  frameMode: "simple",
  interactionMode: "content"
};

export function createImageContent(): ImageContent {
  return { ...DEFAULT_IMAGE_CONTENT };
}

export function patchImageContent(window: WindowOf<"image">, change: Partial<ImageContent>): WindowOf<"image"> {
  return { ...window, content: { ...window.content, ...change } };
}

export function imageUploadOptions(window: WindowOf<"image">, filename?: string): WindowUploadOptions<"image"> {
  const { src, srcUrl } = window.content;
  return {
    kind: "image",
    slot: "source",
    isCurrent: (current) => current.content.src === src && current.content.srcUrl === srcUrl,
    apply: (current, stored) => patchImageContent(current, { src: stored, srcUrl: "", crop: undefined, alt: current.content.alt || (filename ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 300) })
  };
}
