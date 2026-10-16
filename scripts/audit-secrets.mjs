#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const textExtensions = new Set([
  "", ".cjs", ".css", ".env", ".example", ".graphql", ".html", ".ini", ".js", ".json", ".jsonc",
  ".jsx", ".lock", ".map", ".md", ".mjs", ".properties", ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx",
  ".txt", ".yaml", ".yml",
]);
const detectors = [
  { id: "private-key", pattern: /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/g },
  { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
  { id: "stripe-secret", pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{20,}\b/g },
  { id: "supabase-secret", pattern: /\bsb_secret_[0-9A-Za-z_-]{20,}\b/g },
  { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    id: "sensitive-assignment",
    pattern: /\b(?:SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|GOOGLE_CLIENT_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_URL)\s*[:=]\s*["']?([^\s"']{16,})/g,
  },
];
const safeMarkers = /(?:YOUR_|EXAMPLE|PLACEHOLDER|CHANGEME|REDACTED|<[^>]+>|\$\{|test-service-secret)/i;
const artifactsOnly = process.argv.includes("--artifacts-only");
const artifactRoots = ["apps/web/dist", "apps/api/dist"];

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: ROOT, encoding: options.encoding ?? "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
}
function looksTextual(file) {
  const base = path.basename(file);
  if (/^(?:Dockerfile|Makefile|Procfile|README|LICENSE|NOTICE|SECURITY|CONTRIBUTING|CODE_OF_CONDUCT)(?:\..*)?$/.test(base)) return true;
  return textExtensions.has(path.extname(file).toLowerCase());
}
function lineNumber(text, offset) { return text.slice(0, offset).split("\n").length; }
function safeMatch(detector, value) {
  if (safeMarkers.test(value)) return true;
  if (detector.id !== "jwt") return false;
  try {
    const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
    return payload?.role === "anon";
  } catch { return false; }
}
function scan(text, location, mode, findings) {
  if (text.includes("\0")) return;
  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of text.matchAll(detector.pattern)) {
      if (safeMatch(detector, match[0])) continue;
      findings.push({ detector: detector.id, location, line: lineNumber(text, match.index ?? 0), mode });
    }
  }
}
function parseBatch(buffer, expected) {
  const blobs = new Map();
  let offset = 0;
  for (const oid of expected) {
    const newline = buffer.indexOf(10, offset);
    if (newline < 0) throw new Error("unexpected git cat-file batch output");
    const header = buffer.subarray(offset, newline).toString("utf8").split(" ");
    const size = Number(header[2]);
    offset = newline + 1;
    blobs.set(oid, buffer.subarray(offset, offset + size));
    offset += size + 1;
  }
  return blobs;
}

function walkArtifacts(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkArtifacts(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const findings = [];
const worktreeFiles = artifactsOnly ? [] : git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
if (!artifactsOnly) {
  for (const file of worktreeFiles) {
    if (!looksTextual(file)) continue;
    const data = readFileSync(path.join(ROOT, file));
    if (data.length <= MAX_BLOB_BYTES) scan(data.toString("utf8"), file, "worktree", findings);
  }
}
const artifactFiles = artifactRoots.flatMap((directory) => walkArtifacts(path.join(ROOT, directory)));
for (const file of artifactFiles) {
  if (!looksTextual(file)) continue;
  const data = readFileSync(file);
  if (data.length <= MAX_BLOB_BYTES) scan(data.toString("utf8"), path.relative(ROOT, file), "artifact", findings);
}

const objectPaths = new Map();
for (const line of (artifactsOnly ? "" : git(["rev-list", "--objects", "--all"])).split("\n")) {
  const separator = line.indexOf(" ");
  if (separator < 0) continue;
  const oid = line.slice(0, separator);
  const file = line.slice(separator + 1);
  if (looksTextual(file) && !objectPaths.has(oid)) objectPaths.set(oid, file);
}
const objectIds = [...objectPaths.keys()];
if (objectIds.length) {
  const check = git(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], { input: `${objectIds.join("\n")}\n` });
  const selected = check.trim().split("\n").filter(Boolean).flatMap((line) => {
    const [oid, type, rawSize] = line.split(" ");
    return type === "blob" && Number(rawSize) <= MAX_BLOB_BYTES ? [oid] : [];
  });
  if (selected.length) {
    const raw = git(["cat-file", "--batch"], { input: `${selected.join("\n")}\n`, encoding: null });
    const blobs = parseBatch(raw, selected);
    for (const [oid, data] of blobs) scan(data.toString("utf8"), `${objectPaths.get(oid)}@${oid.slice(0, 12)}`, "history", findings);
  }
}

const unique = [...new Map(findings.map((item) => [`${item.detector}:${item.location}:${item.line}:${item.mode}`, item])).values()];
if (unique.length) {
  console.error(`Secret audit found ${unique.length} potential finding(s). Values are intentionally hidden:`);
  for (const item of unique) console.error(`- ${item.detector} ${item.mode} ${item.location}:${item.line}`);
  console.error("Treat findings as credentials until reviewed. Revoke/rotate first; do not rewrite Git history automatically.");
  process.exitCode = 1;
} else {
  console.log(`Secret audit passed: ${worktreeFiles.length} tracked/untracked worktree paths, ${artifactFiles.length} build artifact files, and ${objectIds.length} reachable Git objects checked (values never printed).`);
}
