/**
 * Documentation checks for the Issue #54 research PR.
 * Run from this isolated review branch with:
 *   node --test docs/research/scene-builder/verify-design.mjs
 *
 * These checks validate evidence and review scope, not a Scene implementation.
 * AUDITED_BASE is intentionally pinned: refresh it only after a new source audit.
 * No application imports, dependencies, network requests, or file writes.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const AUDITED_BASE = "aa8b75a8a0b90ffc530b3b2d109804070f35d9d2";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const designPath = "docs/superpowers/specs/2026-10-17-scene-builder-design.md";
const planPath = "docs/superpowers/plans/2026-10-17-scene-builder-acceptance.md";
const scriptPath = "docs/research/scene-builder/verify-design.mjs";
const allowedPaths = new Set([designPath, planPath, scriptPath]);
const documents = [designPath, planPath].map((path) => ({
  path,
  contents: readFileSync(resolve(root, path), "utf8"),
}));
const [design, plan] = documents;
const git = (...args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const links = (contents) => Array.from(contents.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g), (match) => match[1]);

test("both documents identify the available audited commit and research-only scope", () => {
  assert.equal(git("cat-file", "-t", AUDITED_BASE).trim(), "commit");
  for (const document of documents) {
    assert.ok(document.contents.includes(AUDITED_BASE), `${document.path}: missing audited SHA`);
    assert.match(document.contents, /研究/);
    assert.match(document.contents, /待實作|待執行|沒有實作/);
  }
});

test("Markdown code fences are balanced and close without a language suffix", () => {
  for (const document of documents) {
    let opened = null;
    for (const [index, line] of document.contents.split("\n").entries()) {
      const match = line.match(/^(`{3,}|~{3,})(.*)$/);
      if (!match) continue;
      if (!opened) opened = { marker: match[1], line: index + 1 };
      else {
        assert.equal(match[1], opened.marker, `${document.path}:${index + 1}: mismatched fence`);
        assert.equal(match[2].trim(), "", `${document.path}:${index + 1}: invalid closing fence`);
        opened = null;
      }
    }
    assert.equal(opened, null, `${document.path}: unclosed code fence`);
  }
});

test("relative document and checker links resolve inside this repository", () => {
  let checked = 0;
  for (const document of documents) {
    for (const href of links(document.contents)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("#")) continue;
      const path = href.split("#")[0];
      const target = resolve(root, dirname(document.path), path);
      const within = relative(root, target);
      assert.ok(!within.startsWith("..") && !isAbsolute(within), `link escapes repository: ${href}`);
      assert.ok(existsSync(target), `${document.path}: missing relative link ${href}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 3, "expected design/acceptance/checker cross-links");
});

test("pinned GitHub source citations exist at the audited commit with valid line ranges", () => {
  const sourceCache = new Map();
  let citations = 0;
  for (const document of documents) {
    for (const href of links(document.contents)) {
      if (!href.startsWith("https://github.com/laiw54724-ui/retro/blob/")) continue;
      const match = href.match(/^https:\/\/github\.com\/laiw54724-ui\/retro\/blob\/([a-f\d]{40})\/([^#]+)(?:#L(\d+)(?:-L(\d+))?)?$/);
      assert.ok(match, `source citation must pin a full SHA and valid path: ${href}`);
      const [, sha, path, firstRaw, lastRaw] = match;
      assert.equal(sha, AUDITED_BASE, `unreviewed source revision: ${href}`);
      if (!sourceCache.has(path)) sourceCache.set(path, git("show", `${sha}:${path}`));
      const text = sourceCache.get(path);
      const lineCount = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
      if (firstRaw) {
        const first = Number(firstRaw);
        const last = Number(lastRaw ?? firstRaw);
        assert.ok(first >= 1 && last >= first && last <= lineCount,
          `${path}: citation ${first}-${last} exceeds ${lineCount} lines`);
      }
      citations += 1;
    }
  }
  assert.ok(citations >= 16, "expected repository evidence for all major researched paths");
});

test("all 12 design invariants map to exactly 40 uniquely defined phased acceptance cases", () => {
  const invariants = new Map();
  for (const line of design.contents.split("\n")) {
    const match = line.match(/^\| (INV-\d{2}) \|.*\| ([^|]+) \|$/);
    if (!match) continue;
    assert.ok(!invariants.has(match[1]), `duplicate invariant ${match[1]}`);
    invariants.set(match[1], match[2].match(/SC-\d{2}/g) ?? []);
  }
  assert.equal(invariants.size, 12);
  const cases = new Map();
  const phases = new Set(["W6a0", "W6a", "W6b", "W6c", "W6d"]);
  for (const line of plan.contents.split("\n")) {
    const match = line.match(/^\| (SC-\d{2}) \| (INV-\d{2}) \| (W6\w+) \| (.+) \| (.+) \|$/);
    if (!match) continue;
    const [, id, invariant, phase, oracle, layer] = match;
    assert.ok(!cases.has(id), `duplicate acceptance case ${id}`);
    assert.ok(invariants.has(invariant), `${id}: unknown invariant ${invariant}`);
    assert.ok(phases.has(phase), `${id}: invalid phase ${phase}`);
    assert.ok(oracle.trim().length >= 40 && layer.trim().length > 0, `${id}: missing concrete oracle/layer`);
    cases.set(id, invariant);
  }
  assert.equal(cases.size, 40);
  const mapped = new Set();
  for (const [invariant, ids] of invariants) {
    assert.ok(ids.length > 0, `${invariant}: no acceptance cases`);
    for (const id of ids) {
      assert.ok(!mapped.has(id), `${id}: mapped more than once`);
      assert.equal(cases.get(id), invariant, `${id}: design and plan disagree`);
      mapped.add(id);
    }
  }
  for (let i = 1; i <= 40; i += 1) assert.ok(mapped.has(`SC-${String(i).padStart(2, "0")}`));
});

test("the complete review diff and untracked files stay within the three approved docs paths", () => {
  const tracked = git("diff", "--name-only", AUDITED_BASE, "--").trim().split("\n").filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard").trim().split("\n").filter(Boolean);
  const changed = new Set([...tracked, ...untracked]);
  assert.equal(changed.size, 3, "expected exactly the three research deliverables");
  for (const path of changed) assert.ok(allowedPaths.has(path), `out-of-scope change: ${path}`);
  for (const path of allowedPaths) assert.ok(changed.has(path), `missing research deliverable: ${path}`);
});
