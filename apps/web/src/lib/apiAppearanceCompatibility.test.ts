import { afterEach, describe, expect, it, vi } from "vitest";
import { createRetroExport, createStarterDocument } from "@retrodesk/shared";
import { api, API_URL } from "./api";
import { APPEARANCE_P2_WRITER_ENABLED } from "./appearanceP2Writer";

vi.mock("./supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) } } }));
afterEach(() => vi.unstubAllGlobals());

describe("compatible senders with author controls off", () => {
  it("always sends preservation capability for create, save and both import calls", async () => {
    expect(APPEARANCE_P2_WRITER_ENABLED).toBe(false);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _request?: RequestInit) => new Response(JSON.stringify({ version: 2 }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const document = createStarterDocument("Desk", "classic98", "card");
    const exported = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "demo", siteName: "Desk", document });
    if (!exported.ok) throw new Error("export fixture");
    await api.createSite({ username: "desk", siteName: "Desk", document });
    await api.saveDraft("site-a", 1, document);
    await api.previewImport(exported.value);
    await api.confirmImport(exported.value, { digest: "0".repeat(64), username: "desk-copy", siteName: "Copy", allowMissingMedia: false });
    const calls = fetcher.mock.calls;
    for (const [, request] of calls.slice(0, 2)) {
      const body = JSON.parse(String(request?.body));
      expect(body.clientAppearanceContract).toBe(1);
      expect(body.document).not.toHaveProperty("clientAppearanceContract");
    }
    for (const [url] of calls.slice(2)) expect(new URL(String(url)).searchParams.get("clientAppearanceContract")).toBe("1");
  });
  it("requests a fresh site load and binds origin locally rather than trusting response metadata", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _request?: RequestInit) => new Response(JSON.stringify({ site: { id: "site-a", clientApiOrigin: "https://wrong.example", writeCompatibility: { appearanceP2: 1 } } })));
    vi.stubGlobal("fetch", fetcher);
    const result = await api.getSite("site-a");
    expect(result.site.clientApiOrigin).toBe(API_URL);
    expect(fetcher.mock.calls[0]).toEqual([`${API_URL}/api/sites/site-a`, expect.objectContaining({ cache: "no-store" })]);
  });
});
