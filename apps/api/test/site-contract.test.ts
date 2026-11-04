import { describe, expect, it } from "vitest";
import { THEME_PRESETS, createStarterDocument } from "@retrodesk/shared";
import { CreateSiteSchema, SaveDraftSchema } from "../src/lib/site";

describe("site document API contract", () => {
  it("keeps site creation on v1 while accepting validated v2 drafts", () => {
    const v1 = createStarterDocument("Demo", "classic98", "instagram");
    expect(CreateSiteSchema.safeParse({ username: "demo", siteName: "Demo", document: v1 }).success).toBe(true);
    const v2 = {
      schemaVersion: 2 as const,
      siteName: "Demo",
      theme: THEME_PRESETS.classic98,
      windows: [],
      mobileColumns: 4,
      entities: { profiles: [], posts: [] }
    };
    expect(CreateSiteSchema.safeParse({ username: "demo", siteName: "Demo", document: v2 }).success).toBe(false);
    expect(SaveDraftSchema.safeParse({ expectedVersion: 1, document: v2 }).success).toBe(true);
  });

  it("rejects malformed v2 drafts and keeps diagnostics at the document boundary", () => {
    const result = SaveDraftSchema.safeParse({ expectedVersion: 1, document: { schemaVersion: 2, siteName: "Demo" } });
    expect(result.success).toBe(false);
  });
});
