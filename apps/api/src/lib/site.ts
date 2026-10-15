import { SiteDocumentSchema, UsernameSchema, VersionedSiteDocumentSchema, parseSiteDocument } from "@retrodesk/shared";
import { z } from "zod";

export const CreateSiteSchema = z.object({
  username: UsernameSchema,
  siteName: z.string().trim().min(1).max(120),
  document: SiteDocumentSchema
});

export const SaveDraftSchema = z.object({
  expectedVersion: z.number().int().min(0),
  document: VersionedSiteDocumentSchema
}).superRefine((value, ctx) => {
  const parsed = parseSiteDocument(value.document);
  if (parsed.ok) return;
  if (parsed.code === "invalid") {
    for (const diagnostic of parsed.diagnostics) ctx.addIssue({ code: "custom", path: ["document", ...diagnostic.path], message: diagnostic.message });
  } else {
    ctx.addIssue({ code: "custom", path: ["document", "schemaVersion"], message: `Unsupported document version: ${parsed.version}` });
  }
});

export const PublishSchema = z.object({
  expectedVersion: z.number().int().min(0)
});
