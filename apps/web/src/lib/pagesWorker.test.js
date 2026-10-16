import { describe, expect, it } from "vitest";
import worker, { handleRequest, injectMetadata, parsePublicPath } from "../../edge/pages-worker.mjs";

const index = "<!doctype html><html><head><meta name=\"description\" content=\"old\"><title>Old</title></head><body><div id=\"root\"></div></body></html>";
const metadata = { title: "貝貝 <script> & 朋友", description: "描述 \"測試\"", image: "", canonicalPath: "/@bei/oc/a%2Fb", robots: "noindex,nofollow", publishedVersion: 8, cacheKey: "published:8:oc:a/b" };

function assets() {
  return { fetch: async (request) => new URL(request.url).pathname === "/runtime-config.json"
    ? Response.json({ apiUrl: "https://api.example.com" })
    : new Response(index, { headers: { "Content-Type": "text/html" } }) };
}

describe("Pages metadata worker", () => {
  it("parses only canonical public paths", () => {
    expect(parsePublicPath("/@bei/post/post%3A1")).toEqual({ username: "bei", kind: "post", id: "post:1" });
    expect(parsePublicPath("/editor/site-a")).toBeNull();
    expect(parsePublicPath("/@bei/unknown/x")).toBeNull();
  });

  it("escapes authored text and replaces default metadata", () => {
    const result = injectMetadata(index, metadata, "https://retro.example/@bei/oc/a%2Fb");
    expect(result).toContain("貝貝 &lt;script&gt; &amp; 朋友");
    expect(result).not.toContain("貝貝 <script>");
    expect(result).toContain('rel="canonical" href="https://retro.example/@bei/oc/a%2Fb"');
    expect(result).toContain('content="noindex,nofollow"');
    expect(result.match(/name="description"/g)).toHaveLength(1);
  });

  it("serves metadata in first HTML and returns a real generic 404", async () => {
    const ok = await handleRequest(new Request("https://retro.example/@bei/oc/a%2Fb"), { ASSETS: assets() }, async () => Response.json({ metadata }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-retro-published-version")).toBe("8");
    expect(await ok.text()).toContain("貝貝 &lt;script&gt;");

    const missing = await handleRequest(new Request("https://retro.example/@bei/post/missing"), { ASSETS: assets() }, async () => Response.json({ error: { code: "not_found" } }, { status: 404 }));
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("missing");
  });

  it("does not mistake the Worker execution context for fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ metadata });
    try {
      const response = await worker.fetch(new Request("https://retro.example/@bei"), { ASSETS: assets() }, { waitUntil() {} });
      expect(response.status).toBe(200);
    } finally { globalThis.fetch = originalFetch; }
  });
});
