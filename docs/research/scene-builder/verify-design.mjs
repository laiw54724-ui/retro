/**
 * Verify retained documentation after removing historical AI work orders.
 * Run: node --test docs/research/scene-builder/verify-design.mjs
 * This is not a validation of the still-unimplemented Scene design.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const paths = [
  "README.md",
  "docs/README.md",
  "docs/SCENE_MEDIA_RECONCILIATION.md",
  "docs/MEDIA_M2_M4_DESIGN.md",
  "docs/ASSET-LICENSES.md",
  "docs/THIRD_PARTY_ASSETS.md",
  "docs/verification/guestbook-preview-42/README.md",
  "docs/superpowers/evidence/2026-10-19-appearance-p2-writer.md",
];
const documents = paths.map(path => ({ path, contents: readFileSync(resolve(root, path), "utf8") }));

test("living docs do not reference removed AI plan/spec paths", () => {
  for (const { path, contents } of documents) {
    assert.doesNotMatch(contents, /(?:docs\/)?superpowers\/(?:plans|specs)\//, path);
  }
});

test("relative Markdown links resolve inside the current checkout", () => {
  let checked = 0;
  for (const { path, contents } of documents) {
    for (const match of contents.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
      const href = match[1];
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) continue;
      const target = resolve(root, dirname(path), decodeURIComponent(href.split("#")[0].split("?")[0]));
      const within = relative(root, target);
      assert.ok(!within.startsWith("..") && !isAbsolute(within), path + ": link escapes checkout: " + href);
      assert.ok(existsSync(target), path + ": broken link: " + href);
      checked += 1;
    }
  }
  assert.ok(checked > 20, "expected documentation cross-links to be checked");
});

test("removed task-plan Markdown and generated issue snapshot are absent", () => {
  for (const dir of ["docs/superpowers/plans", "docs/superpowers/specs"]) {
    const full = resolve(root, dir);
    if (!existsSync(full)) continue;
    const stack = [full];
    while (stack.length) {
      const next = stack.pop();
      for (const entry of readdirSync(next, { withFileTypes: true })) {
        const filename = resolve(next, entry.name);
        if (entry.isDirectory()) stack.push(filename);
        else assert.ok(!/\.md$/.test(entry.name) && entry.name !== "original-issues.json",
          "retired work order still present: " + relative(root, filename));
      }
    }
  }
});

test("asset rights and provenance remain clearly documented", () => {
  const rights = readFileSync(resolve(root, "docs/ASSET-LICENSES.md"), "utf8");
  for (const marker of [
    "NOASSERTION",
    "728a866ad59a54fd4082dbe000e1e62e50bd90e9",
    "Windows icon",
    "Cubic 11",
    "OFL",
    "assets:audit:release",
    "assets/windows-icons.provenance.json",
  ]) assert.ok(rights.includes(marker), "missing preserved asset-rights evidence: " + marker);
});
