import { beforeEach, describe, expect, it } from "vitest";
import { writePublishedArtifact } from "../src/lib/publish";

const input = { siteId: "site-a", username: "demo", version: 1, document: { siteName: "Own fixture", windows: [] }, publishedAt: "2026-10-18T00:00:00.000Z" };
const key = "published/demo/versions/1/site.json";
type Stored = { bytes: string; customMetadata?: Record<string, string> };
const objects = new Map<string, Stored>();
const writes: string[] = [];
const attempts: string[] = [];
const env = { ASSETS: {
  put: async (destination: string, bytes: string, options: R2PutOptions) => {
    attempts.push(destination);
    expect(options.onlyIf).toBeInstanceOf(Headers);
    expect((options.onlyIf as Headers).get("If-None-Match")).toBe("*");
    if (objects.has(destination)) return null;
    writes.push(destination);
    objects.set(destination, { bytes, customMetadata: options.customMetadata });
    return { key: destination };
  },
  get: async (destination: string) => {
    const stored = objects.get(destination);
    return stored ? { body: new Blob([stored.bytes]).stream(), customMetadata: stored.customMetadata } : null;
  },
} } as never;

beforeEach(() => { objects.clear(); writes.length = 0; attempts.length = 0; });

describe("immutable artifact retry storage", () => {
  it("ignores a supplied foreign destination at the lowest writing boundary", async () => {
    const victim = "published/other/versions/9/site.json";
    objects.set(victim, { bytes: "SITE-B-FIXTURE" });
    const result = await writePublishedArtifact(env, { ...input, artifactKey: victim });
    expect(result).toMatchObject({ artifactStatus: "synced", artifactKey: key });
    expect(objects.get(victim)?.bytes).toBe("SITE-B-FIXTURE");
    expect(attempts).toEqual([key]);
    expect(JSON.parse(objects.get(key)!.bytes)).toMatchObject({ artifactKey: key });
    expect(objects.get(key)?.customMetadata).toMatchObject({ siteId: "site-a" });
  });

  it("accepts an equivalent legacy artifact without rewriting bytes despite jsonb field order and date formatting", async () => {
    const legacy = JSON.stringify({ document: { windows: [], siteName: "Own fixture" }, publishedAt: "2026-10-18T00:00:00+00:00", version: 1, username: "demo" });
    objects.set(key, { bytes: legacy });
    const result = await writePublishedArtifact(env, input);
    expect(result).toMatchObject({ artifactStatus: "synced", retryable: false });
    expect(objects.get(key)?.bytes).toBe(legacy);
    expect(writes).toEqual([]);
  });

  it("rejects a different siteId even if all public payload fields happen to match", async () => {
    const bytes = JSON.stringify({ ...input, artifactKey: key });
    objects.set(key, { bytes, customMetadata: { siteId: "site-b" } });
    const result = await writePublishedArtifact(env, input);
    expect(result).toMatchObject({ artifactStatus: "failed", retryable: true });
    expect(objects.get(key)?.bytes).toBe(bytes);
    expect(writes).toEqual([]);
  });

  it("fails safely for a same-site/version artifact with different content", async () => {
    const bytes = JSON.stringify({ ...input, document: { siteName: "Earlier public fixture" }, artifactKey: key });
    objects.set(key, { bytes, customMetadata: { siteId: "site-a" } });
    const result = await writePublishedArtifact(env, input);
    expect(result).toMatchObject({ artifactStatus: "failed", retryable: true });
    expect(objects.get(key)?.bytes).toBe(bytes);
    expect(writes).toEqual([]);
  });

  it("does not echo malformed existing object contents in the error", async () => {
    objects.set(key, { bytes: "UNRELATED-CONTENT-FIXTURE" });
    const result = await writePublishedArtifact(env, input);
    expect(result).toMatchObject({ artifactStatus: "failed", retryable: true });
    expect(JSON.stringify(result)).not.toContain("UNRELATED-CONTENT-FIXTURE");
    expect(writes).toEqual([]);
  });

  it("allows concurrent identical retries but only one immutable artifact creation", async () => {
    const results = await Promise.all([writePublishedArtifact(env, input), writePublishedArtifact(env, input)]);
    expect(results.map((result) => result.artifactStatus)).toEqual(["synced", "synced"]);
    expect(writes).toEqual([key]);
    expect(objects.get(key)?.customMetadata?.siteId).toBe("site-a");
  });
});
