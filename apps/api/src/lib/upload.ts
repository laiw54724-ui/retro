const ascii = (bytes: Uint8Array, start: number, text: string) =>
  text.split("").every((char, index) => bytes[start + index] === char.charCodeAt(0));

export function imageBytesMatchMime(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }

  if (mimeType === "image/gif") {
    return bytes.length >= 6 && (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a"));
  }

  if (mimeType === "image/webp") {
    return bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
  }

  return false;
}

export const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"]);

export function normalizeAudioMime(mimeType: string): "audio/mpeg" | "audio/ogg" | "audio/wav" | null {
  if (mimeType === "audio/x-wav") return "audio/wav";
  return mimeType === "audio/mpeg" || mimeType === "audio/ogg" || mimeType === "audio/wav" ? mimeType : null;
}

export function audioBytesMatchMime(bytes: Uint8Array, mimeType: string) {
  const normalized = normalizeAudioMime(mimeType);
  if (normalized === "audio/ogg") {
    if (bytes.length < 12 || !ascii(bytes, 0, "OggS")) return false;
    const probe = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 128)));
    return probe.includes("OpusHead") || probe.includes("vorbis") || probe.includes("Speex   ");
  }
  if (normalized === "audio/wav") return bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE");
  if (normalized === "audio/mpeg") {
    if (bytes.length >= 3 && ascii(bytes, 0, "ID3")) return true;
    // MPEG audio frame sync: eleven set bits, a supported layer, and a valid bitrate index.
    return bytes.length >= 4
      && bytes[0] === 0xff
      && (bytes[1] & 0xe0) === 0xe0
      && (bytes[1] & 0x06) !== 0
      && (bytes[2] & 0xf0) !== 0
      && (bytes[2] & 0xf0) !== 0xf0;
  }
  return false;
}

export function extensionForMime(mimeType: string): "jpg" | "png" | "webp" | "gif" | "mp3" | "ogg" | "wav" | null {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  const audio = normalizeAudioMime(mimeType);
  if (audio === "audio/mpeg") return "mp3";
  if (audio === "audio/ogg") return "ogg";
  if (audio === "audio/wav") return "wav";
  return null;
}
