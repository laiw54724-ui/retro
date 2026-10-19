import { expect, it } from "vitest";
import { ProfileEntityV2Schema, createStarterDocument, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { validateCountDraft, validateLinkDraft, validateProfileDraft } from "./igDraftValidation";

it("keeps required identity validation and normalizes only the committed candidate", () => {
  for (const field of ["handle", "displayName", "fieldName"] as const) expect(validateProfileDraft(field, "  ")).toEqual({ ok: false, error: "required" });
  expect(validateProfileDraft("handle", "next-")).toEqual({ ok: false, error: "handle" });
  expect(validateProfileDraft("handle", " NEXT-ID ")).toEqual({ ok: true, value: "next-id" });
  expect(validateProfileDraft("displayName", " A full name ")).toEqual({ ok: true, value: "A full name" });
  expect(validateProfileDraft("displayName", "x".repeat(161))).toMatchObject({ ok: false });
  expect(validateProfileDraft("fieldName", "x".repeat(81))).toMatchObject({ ok: false });
});
it("checks duplicate handles with the same shared normalization", () => {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Test", "classic98", "instagram"), { siteId: "site" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const profile = ProfileEntityV2Schema.parse(migrated.document.entities.profiles[0]);
  expect(validateProfileDraft("handle", ` ${profile.handle!.toUpperCase()} `, [profile], "other")).toEqual({ ok: false, error: "duplicate" });
  expect(validateProfileDraft("handle", profile.handle!, [profile], profile.id).ok).toBe(true);
});
it("validates tag list and lengths without changing input text", () => {
  expect(validateProfileDraft("tags", " First, Second tag, ")).toEqual({ ok: true, value: "First, Second tag" });
  expect(validateProfileDraft("tags", "")).toEqual({ ok: true, value: "" });
  expect(validateProfileDraft("tags", "x".repeat(65)).ok).toBe(false);
  expect(validateProfileDraft("tags", Array(31).fill("a").join(",")).ok).toBe(false);
});
it("does not coerce empty, partial, negative, decimal or out-of-range counts to zero", () => {
  for (const value of ["", " ", "-", "1e", "-2", "1.5", "1000000001", "Infinity"]) expect(validateCountDraft(value).ok).toBe(false);
  expect(validateCountDraft("0")).toEqual({ ok: true, value: "0" });
  expect(validateCountDraft("0012")).toEqual({ ok: true, value: "12" });
});
it("rejects incomplete and unsafe links while preserving optional blank links", () => {
  for (const value of ["https:", "https://", "javascript:alert(1)", "example.com"]) expect(validateLinkDraft(value).ok).toBe(false);
  for (const value of ["", "https://example.com", "http://example.com", "mailto:hello@example.com"]) expect(validateLinkDraft(value)).toEqual({ ok: true, value });
});
