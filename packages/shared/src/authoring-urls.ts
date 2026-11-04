// These fields preserve author input independently of the accepted render source.
// Keep empty strings (rather than removing keys) for v1/v2 schema compatibility.
const rawAuthoringKeys = new Set(["srcUrl", "avatarUrl", "coverUrl", "coverSrcUrl", "imageUrl", "iconUrl", "originalUrl"]);

/** Clone a validated document at the public/export boundary; never alter a draft. */
export function cloneWithoutRawAuthoringUrls<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneWithoutRawAuthoringUrls(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rawAuthoringKeys.has(key) && typeof item === "string" ? "" : cloneWithoutRawAuthoringUrls(item)])) as T;
}
