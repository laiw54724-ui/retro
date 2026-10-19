import { SiteDocumentSchema, UsernameSchema, VersionedSiteDocumentSchema, parseSiteDocument, validateSiteDocumentScope } from "@retrodesk/shared";
import { z } from "zod";

export const CreateSiteSchema = z.object({
  username: UsernameSchema,
  siteName: z.string().trim().min(1).max(120),
  document: SiteDocumentSchema,
  clientAppearanceContract: z.literal(1).optional()
});

export const SaveDraftSchema = z.object({
  expectedVersion: z.number().int().min(0),
  document: VersionedSiteDocumentSchema,
  clientAppearanceContract: z.literal(1).optional()
}).superRefine((value, ctx) => {
  const parsed = parseSiteDocument(value.document);
  if (parsed.ok) return;
  if (parsed.code === "invalid") {
    for (const diagnostic of parsed.diagnostics) ctx.addIssue({ code: "custom", path: ["document", ...diagnostic.path], message: diagnostic.message });
  } else {
    ctx.addIssue({ code: "custom", path: ["document", "schemaVersion"], message: `Unsupported document version: ${parsed.version}` });
  }
});

export { validateSiteDocumentScope };

export const PublishSchema = z.object({
  expectedVersion: z.number().int().min(0)
});

export const CollaborationRoleSchema = z.enum(["editor", "viewer"]);

export const CreateInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: CollaborationRoleSchema,
  expiryHours: z.number().min(0.25).max(168).default(24)
}).strict();

export const UpdateMemberSchema = z.object({ role: CollaborationRoleSchema }).strict();

export const AcceptInviteSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();
