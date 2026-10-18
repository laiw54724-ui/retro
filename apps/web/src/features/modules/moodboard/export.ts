import type { DesktopWindow, MoodboardElement } from "@retrodesk/shared";
import { i18n } from "../../../i18n";

type Content = Extract<DesktopWindow, { type: "moodboard" }>["content"];
export type MoodboardExportResult = { ok: true; blob: Blob } | { ok: false; blocked: string[] };

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

function wrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of paragraph) {
      const next = line + character;
      if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = character; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function drawText(context: CanvasRenderingContext2D, element: Extract<MoodboardElement, { kind: "text" }>, fontFamily: string) {
  context.save();
  context.beginPath(); context.rect(element.x, element.y, element.width, element.height); context.clip();
  context.fillStyle = element.color;
  context.font = `${element.fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = element.align;
  const x = element.align === "left" ? element.x : element.align === "center" ? element.x + element.width / 2 : element.x + element.width;
  const lineHeight = element.fontSize * 1.15;
  wrappedLines(context, element.content, element.width).forEach((line, index) => context.fillText(line, x, element.y + index * lineHeight, element.width));
  context.restore();
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, element: Extract<MoodboardElement, { kind: "image" }>) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = element.width / element.height;
  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
  if (sourceRatio > targetRatio) { sw = image.naturalHeight * targetRatio; sx = (image.naturalWidth - sw) / 2; }
  else { sh = image.naturalWidth / targetRatio; sy = (image.naturalHeight - sh) / 2; }
  context.drawImage(image, sx, sy, sw, sh, element.x, element.y, element.width, element.height);
}

function canExportImage(image: HTMLImageElement) {
  try {
    const probe = document.createElement("canvas"); probe.width = 1; probe.height = 1;
    const context = probe.getContext("2d");
    if (!context) return false;
    context.drawImage(image, 0, 0, 1, 1);
    probe.toDataURL("image/png");
    return true;
  } catch { return false; }
}

export async function exportMoodboardPng(content: Content, stage: HTMLElement): Promise<MoodboardExportResult> {
  await document.fonts?.ready;
  const images = new Map<string, HTMLImageElement>();
  stage.querySelectorAll<HTMLElement>("[data-moodboard-id]").forEach((node) => {
    const image = node.querySelector("img");
    if (node.dataset.moodboardId && image) images.set(node.dataset.moodboardId, image);
  });
  const blocked = content.elements.flatMap((element) => {
    if (element.kind !== "image" || !element.src) return [];
    const image = images.get(element.id);
    return !image || !image.complete || !image.naturalWidth || !canExportImage(image) ? [element.alt || element.id] : [];
  });
  if (blocked.length) return { ok: false, blocked };

  const canvas = document.createElement("canvas"); canvas.width = content.width; canvas.height = content.height;
  const context = canvas.getContext("2d");
  if (!context) return { ok: false, blocked: [i18n.t("modules:export.thisBrowserDoesntSupportCanvas")] };
  context.fillStyle = content.background; context.fillRect(0, 0, content.width, content.height);
  const fontFamily = getComputedStyle(stage).fontFamily || "sans-serif";
  for (const element of [...content.elements].sort((a, b) => a.zOrder - b.zOrder)) {
    if (element.kind === "color") { context.fillStyle = element.color; context.fillRect(element.x, element.y, element.width, element.height); }
    else if (element.kind === "text") drawText(context, element, fontFamily);
    else if (element.src) drawCover(context, images.get(element.id)!, element);
  }
  try {
    const blob = await canvasBlob(canvas);
    return blob ? { ok: true, blob } : { ok: false, blocked: [i18n.t("modules:export.theBrowserCouldntCreateA")] };
  } catch {
    return { ok: false, blocked: [i18n.t("modules:export.theImageSourceDoesntAllow")] };
  }
}

export function downloadMoodboardPng(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${name.replace(/[^\p{L}\p{N}._-]+/gu, "-") || "moodboard"}.png`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
