import { ProfileHandleSchema, ProfileCustomFieldSchema, ProfileEntityV2Schema, SafeUrlSchema, profileHandleKey, type ProfileEntityV2 } from "@retrodesk/shared";

export type DraftError = "required" | "handle" | "duplicate" | "nameLength" | "fieldLength" | "tags" | "count" | "url";
export type DraftResult = { ok: true; value: string } | { ok: false; error: DraftError };
export function validateProfileDraft(field: "handle" | "displayName" | "fieldName" | "tags", text: string, profiles: readonly ProfileEntityV2[] = [], profileId = ""): DraftResult {
  if (field === "tags") {
    const result = ProfileEntityV2Schema.shape.worldTags.safeParse(text.split(",").map((tag) => tag.trim()).filter(Boolean));
    return result.success ? { ok: true, value: result.data.join(", ") } : { ok: false, error: "tags" };
  }
  if (!text.trim()) return { ok: false, error: "required" };
  if (field === "handle") {
    const result = ProfileHandleSchema.safeParse(text);
    if (!result.success) return { ok: false, error: "handle" };
    if (profiles.some((profile) => profile.id !== profileId && profile.handle !== undefined && profileHandleKey(profile.handle) === profileHandleKey(result.data))) return { ok: false, error: "duplicate" };
    return { ok: true, value: result.data };
  }
  const result = (field === "fieldName" ? ProfileCustomFieldSchema.shape.key : ProfileEntityV2Schema.shape.displayName).safeParse(text);
  return result.success ? { ok: true, value: result.data! } : { ok: false, error: field === "fieldName" ? "fieldLength" : "nameLength" };
}
export function validateCountDraft(text: string): DraftResult {
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(Number(text)) || Number(text) > 1_000_000_000) return { ok: false, error: "count" };
  return { ok: true, value: String(Number(text)) };
}
export function validateLinkDraft(text: string): DraftResult {
  const value = text.trim();
  return !/^https?:\/\/$/.test(value) && SafeUrlSchema.safeParse(value).success ? { ok: true, value } : { ok: false, error: "url" };
}
