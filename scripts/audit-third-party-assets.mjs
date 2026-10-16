#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = path.resolve(ROOT, process.env.RETRO_ASSET_MANIFEST || "docs/assets/third-party-assets.manifest.json");
const releaseMode = process.argv.includes("--release");
const assetExtensions = new Set([".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".ogg", ".otf", ".png", ".ttf", ".wav", ".webp", ".woff", ".woff2"]);
const statuses = new Set(["confirmed", "needs-evidence", "replace"]);

function relative(file) { return path.relative(ROOT, file).split(path.sep).join("/"); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function codeUnitCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function walk(directory) {
  const result = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => codeUnitCompare(a.name, b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}
async function expand(paths) {
  const result = [];
  for (const item of paths) {
    const full = path.resolve(ROOT, item);
    if (!await exists(full)) throw new Error(`manifest path does not exist: ${item}`);
    const stat = await fs.stat(full);
    result.push(...(stat.isDirectory() ? await walk(full) : [full]));
  }
  return result.sort((a, b) => codeUnitCompare(relative(a), relative(b)));
}
async function treeHash(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(file)); hash.update("\0"); hash.update(sha256(await fs.readFile(file))); hash.update("\n");
  }
  return hash.digest("hex");
}
function requireText(collection, field) {
  if (typeof collection[field] !== "string" || !collection[field].trim()) throw new Error(`${collection.id || "collection"}: missing ${field}`);
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.collections)) throw new Error("unsupported third-party asset manifest");
const covered = new Map();
const totals = { confirmed: 0, "needs-evidence": 0, replace: 0 };
for (const collection of manifest.collections) {
  for (const field of ["id", "authorOrRightsHolder", "license", "notice", "useScope", "reviewStatus", "treeSha256"]) requireText(collection, field);
  if (!Array.isArray(collection.paths) || !collection.paths.length) throw new Error(`${collection.id}: paths must not be empty`);
  if (!collection.source || typeof collection.source.url !== "string" || typeof collection.source.revision !== "string") throw new Error(`${collection.id}: source url and revision are required`);
  if (!statuses.has(collection.reviewStatus)) throw new Error(`${collection.id}: unsupported reviewStatus ${collection.reviewStatus}`);
  if (collection.reviewStatus === "confirmed" && collection.license === "NOASSERTION") throw new Error(`${collection.id}: confirmed assets require an asserted license`);
  const files = await expand(collection.paths);
  if (files.length !== collection.expectedFileCount) throw new Error(`${collection.id}: expected ${collection.expectedFileCount} files, found ${files.length}`);
  const actualHash = await treeHash(files);
  if (actualHash !== collection.treeSha256) throw new Error(`${collection.id}: tree hash mismatch (${actualHash})`);
  for (const file of files) {
    const key = relative(file);
    if (covered.has(key)) throw new Error(`${key} is covered by both ${covered.get(key)} and ${collection.id}`);
    covered.set(key, collection.id);
  }
  totals[collection.reviewStatus] += files.length;
}
const publicFiles = await walk(path.join(ROOT, "apps/web/public"));
const distributableAssets = publicFiles.filter((file) => assetExtensions.has(path.extname(file).toLowerCase()));
const uncovered = distributableAssets.map(relative).filter((file) => !covered.has(file));
if (uncovered.length) throw new Error(`uncovered distributable assets:\n${uncovered.map((file) => `- ${file}`).join("\n")}`);
if (releaseMode) {
  const blocked = manifest.collections.filter((collection) => collection.reviewStatus !== "confirmed");
  if (blocked.length) throw new Error(`redistribution release blocked by unresolved collections: ${blocked.map((item) => `${item.id} (${item.reviewStatus})`).join(", ")}`);
}
console.log(`Third-party asset audit passed: ${covered.size} files (${totals.confirmed} confirmed, ${totals["needs-evidence"]} needs evidence, ${totals.replace} replace).`);
