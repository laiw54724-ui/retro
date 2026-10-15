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
