import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "vite";
import { IMAGE_STAGING_WEB_ORIGIN as webOrigin, IMAGE_STAGING_API_ORIGIN as apiOrigin, validateImageRelease, readImageRelease, resolveImageRollout, verifyImageArtifact } from "./image-rollout.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const enabled = { enabled: true, webOrigin, apiOrigin }, disabled = { ...enabled, enabled: false };
test("release input is strict and the committed configuration is disabled", () => {
  assert.deepEqual(readImageRelease(new URL("../config/image-staging-rollout.json", import.meta.url)), disabled);
  for (const config of [null, [], {}, { ...enabled, enabled: "true" }, { ...enabled, extra: true }, { ...enabled, webOrigin: "https://retrodesk.pages.dev" }, { ...enabled, apiOrigin: apiOrigin + "/" }]) {
    assert.throws(() => validateImageRelease(config), /Invalid Image release config/);
  }
  assert.equal(resolveImageRollout({ command: "serve", mode: "staging", config: enabled, apiOrigin }).enabled, false);
  assert.throws(() => resolveImageRollout({ command: "build", mode: "staging", config: enabled, apiOrigin: "https://other.test" }), /exact approved staging API/);
});

test("artifact checks reject staging mode/enabled bundles for production and malformed receipts", () => {
  const ordinary = { version: 1, mode: "production", enabled: false, webOrigin: null, apiOrigin: null };
  verifyImageArtifact(ordinary, "production"); verifyImageArtifact(ordinary, "staging");
  const active = { version: 1, mode: "staging", ...enabled };
  verifyImageArtifact(active, "staging");
  for (const receipt of [active, { ...ordinary, mode: "staging" }, null, { ...ordinary, enabled: "false" }, { ...ordinary, webOrigin }]) assert.throws(() => verifyImageArtifact(receipt, "production"));
  assert.throws(() => verifyImageArtifact({ ...active, apiOrigin: "https://wrong.test" }, "staging"));
  assert.throws(() => verifyImageArtifact(ordinary, "unknown"));
});

// Actual Vite compilation of the real Image gate, with config enabled only in a disposable file.
// No network, remote site, auth session, deployment or checked-in configuration is modified.
test("compiled build matrix fails closed in production and enables only the approved staging origin", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "retro-image-rollout-"));
  const before = Object.fromEntries(["RETRO_IMAGE_RELEASE_CONFIG", "VITE_API_URL", "VITE_IMAGE_WINDOW_WRITER", "NODE_ENV"].map((key) => [key, process.env[key]]));
  const configPath = path.join(dir, "release.json");
  try {
    process.env.RETRO_IMAGE_RELEASE_CONFIG = configPath;
    process.env.VITE_API_URL = apiOrigin;
    process.env.VITE_IMAGE_WINDOW_WRITER = "true";
    const compile = async (mode, config) => {
      await writeFile(configPath, JSON.stringify(config));
      const result = await build({ root, configFile: path.join(root, "vite.config.ts"), mode, logLevel: "silent", build: {
        write: false, sourcemap: false, minify: false, lib: { entry: path.join(root, "src/lib/imageWindowCreation.ts"), name: "ImageGate", formats: ["iife"] }
      } });
      const output = (Array.isArray(result) ? result[0] : result).output;
      const code = output.find((item) => item.type === "chunk" && item.isEntry).code;
      const receipt = JSON.parse(output.find((item) => item.fileName === "image-rollout.json").source);
      const evaluate = (origin) => {
        const context = origin === undefined ? {} : { location: { origin } };
        runInNewContext(code, context);
        return context.ImageGate.IMAGE_WINDOW_CREATION_ENABLED;
      };
      return { receipt, evaluate };
    };
    for (const [mode, config, expected] of [["production", disabled, false], ["production", enabled, false], ["staging", disabled, false], ["staging", enabled, true]]) {
      const artifact = await compile(mode, config);
      assert.equal(artifact.receipt.enabled, expected);
      assert.equal(artifact.evaluate(webOrigin), expected);
      for (const origin of [undefined, "http://localhost:5173", "https://retrodesk.pages.dev", "https://preview.retrodesk-staging.pages.dev", webOrigin + ".evil.test"]) assert.equal(artifact.evaluate(origin), false);
      if (expected) assert.throws(() => verifyImageArtifact(artifact.receipt, "production"));
      else if (mode === "production") verifyImageArtifact(artifact.receipt, "production");
    }
    process.env.VITE_API_URL = "https://other-api.test";
    await assert.rejects(() => compile("staging", enabled), /exact approved staging API/);
    await assert.rejects(() => compile("staging", { ...enabled, webOrigin: "https://retrodesk.pages.dev" }), /Invalid Image release config/);
    process.env.VITE_API_URL = apiOrigin;
    process.env.NODE_ENV = "development";
    await assert.rejects(() => compile("production", disabled), /must not use NODE_ENV=development/);
    await assert.rejects(() => compile("development", disabled), /must not use NODE_ENV=development/);
    await assert.rejects(() => compile("staging", enabled), /must not use NODE_ENV=development/);
  } finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(dir, { recursive: true, force: true });
  }
});
