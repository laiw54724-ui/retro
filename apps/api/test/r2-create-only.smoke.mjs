// Disposable local R2 check using the locked Wrangler dependency's Miniflare.
// No remote bucket, credentials, persistence, or Wrangler deploy command.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");
const { build } = wranglerRequire("esbuild");
const scratch = await mkdtemp(join(tmpdir(), "retro-76-r2-fixture-"));
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: 'export default { fetch() { return new Response("local fixture"); } };',
  compatibilityDate: "2026-10-01",
  r2Buckets: ["ASSETS"],
  r2Persist: false,
  cf: false
}));

try {
  const bucket = await runtime.getR2Bucket("ASSETS");
  const options = { onlyIf: new Headers({ "If-None-Match": "*" }) };
  assert.ok(await bucket.put("draft/local-fixture.png", "original", options));
  assert.equal(await bucket.put("draft/local-fixture.png", "replacement", options), null);
  assert.equal(await (await bucket.get("draft/local-fixture.png")).text(), "original");
  const raced = await Promise.all([
    bucket.put("published/local-fixture.png", "A", options),
    bucket.put("published/local-fixture.png", "B", options)
  ]);
  assert.equal(raced.filter(Boolean).length, 1);
  assert.equal(raced.filter((value) => value === null).length, 1);
  assert.ok(["A", "B"].includes(await (await bucket.get("published/local-fixture.png")).text()));

  // Exercise the actual TypeScript helpers against Miniflare R2, not just a mock.
  // Bundle only this checkout's code into our disposable directory.
  const bundle = join(scratch, "publish.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../src/lib/publish.ts", import.meta.url))], outfile: bundle, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  const { copyReferencedAssets, promotePublishedAssets, publicationAssetStageKey } = await import(pathToFileURL(bundle).href);
  const id = "11111111-1111-4111-8111-111111111111";
  const sourceKey = `draft/users/owner-local/sites/site-local/${id}.png`;
  const publicKey = `published/local-fixture/assets/${id}.png`;
  await bucket.put(sourceKey, "synthetic bytes", { httpMetadata: { contentType: "image/png" } });
  const client = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id, owner_id: "owner-local", site_id: "site-local", object_key: sourceKey, storage_scope: "draft_private", mime_type: "image/png" }], error: null }) }) }) };
  const env = { ASSETS: bucket, PUBLIC_ASSET_BASE_URL: "https://assets.example.invalid" };
  const prepared = await copyReferencedAssets(env, client, { ownerId: "owner-local", siteId: "site-local", username: "local-fixture", document: { icon: `retro-asset:${id}` } });
  assert.equal(prepared.ok, true);
  assert.equal(await bucket.head(publicKey), null);
  const stage = await bucket.head(publicationAssetStageKey("site-local", `${id}.png`));
  assert.equal(stage.httpMetadata.cacheControl, "private, no-store");
  const promoted = await promotePublishedAssets(env, { siteId: "site-local", username: "local-fixture", document: prepared.document });
  assert.equal(promoted.ok, true);
  const visible = await bucket.get(publicKey);
  assert.equal(await visible.text(), "synthetic bytes");
  assert.equal(visible.httpMetadata.contentType, "image/png");
  assert.equal(visible.httpMetadata.cacheControl, "public, max-age=31536000, immutable");
  console.log("PASS: local R2 create-only, exactly one concurrent writer, actual private staging/public promotion helpers and metadata");
} finally {
  await runtime.dispose();
  await rm(scratch, { recursive: true, force: true });
}
