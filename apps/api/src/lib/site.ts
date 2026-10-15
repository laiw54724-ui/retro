import { SiteDocumentSchema, UsernameSchema } from "@retrodesk/shared";
import { z } from "zod";

export const CreateSiteSchema = z.object({
  username: UsernameSchema,
  siteName: z.string().trim().min(1).max(120),
  document: SiteDocumentSchema
});

export const SaveDraftSchema = z.object({
  expectedVersion: z.number().int().min(0),
  document: SiteDocumentSchema
});

export const PublishSchema = z.object({
  expectedVersion: z.number().int().min(0)
});
