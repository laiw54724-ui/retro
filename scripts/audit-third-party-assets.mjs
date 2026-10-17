#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = path.resolve(ROOT, process.env.RETRO_ASSET_MANIFEST || "docs/assets/third-party-assets.manifest.json");
const releaseMode = process.argv.includes("--release");
const assetExtensions = new Set([".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".ogg", ".otf", ".png", ".ttf", ".wav", ".webp", ".woff", ".woff2"]);
const optionalMarkerName = ".retro-icon-pack.json";

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
async function expand(paths, required = true) {
  const result = [];
  for (const item of paths) {
    const full = path.resolve(ROOT, item);
    if (!await exists(full)) {
      if (required) throw new Error(`manifest path does not exist: ${item}`);
      continue;
    }
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
function requireCommon(collection) {
  for (const field of ["id", "authorOrRightsHolder", "license", "notice", "useScope"]) requireText(collection, field);
  if (!Array.isArray(collection.paths) || !collection.paths.length) throw new Error(`${collection.id}: paths must not be empty`);
  if (!collection.source || typeof collection.source.url !== "string" || typeof collection.source.revision !== "string") throw new Error(`${collection.id}: source url and revision are required`);
}
function trackedFiles(item) {
  return execFileSync("git", ["-C", ROOT, "ls-files", "--", item], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}
async function verifyOptionalWindowsPack(collection, files) {
  const markerPath = path.join(ROOT, collection.paths[0], optionalMarkerName);
  if (!await exists(markerPath)) throw new Error(`${collection.id}: missing ${optionalMarkerName}`);
  const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
  if (marker.schemaVersion !== 1 || marker.source !== collection.source.url || marker.commit !== collection.source.revision || marker.fileCount !== collection.expectedAssetFileCount) {
    throw new Error(`${collection.id}: invalid pack marker`);
  }
  const assets = files.filter((file) => assetExtensions.has(path.extname(file).toLowerCase()));
  if (assets.length !== collection.expectedAssetFileCount) throw new Error(`${collection.id}: expected ${collection.expectedAssetFileCount} assets, found ${assets.length}`);
  const provenance = JSON.parse(await fs.readFile(path.resolve(ROOT, collection.detailManifest), "utf8"));
  if (provenance.source?.url !== collection.source.url || provenance.source?.commit !== collection.source.revision || provenance.outputs?.length !== collection.expectedAssetFileCount) {
    throw new Error(`${collection.id}: provenance does not match the pinned pack`);
  }
  const expected = new Map(provenance.outputs.map((item) => [item.path, item]));
  for (const file of assets) {
    const item = expected.get(relative(file));
    if (!item) throw new Error(`${collection.id}: unexpected asset ${relative(file)}`);
    const contents = await fs.readFile(file);
    if (contents.length !== item.bytes || sha256(contents) !== item.sha256) throw new Error(`${collection.id}: hash mismatch ${relative(file)}`);
  }
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.collections) || !Array.isArray(manifest.excludedCollections)) throw new Error("unsupported third-party asset manifest");
const covered = new Map();
let confirmed = 0;
let localExcluded = 0;

for (const collection of manifest.collections) {
  requireCommon(collection);
  for (const field of ["reviewStatus", "treeSha256"]) requireText(collection, field);
  if (collection.reviewStatus !== "confirmed" || collection.license === "NOASSERTION") throw new Error(`${collection.id}: bundled collections must be confirmed with an asserted license`);
  const files = await expand(collection.paths);
  if (files.length !== collection.expectedFileCount) throw new Error(`${collection.id}: expected ${collection.expectedFileCount} files, found ${files.length}`);
  const actualHash = await treeHash(files);
  if (actualHash !== collection.treeSha256) throw new Error(`${collection.id}: tree hash mismatch (${actualHash})`);
  for (const file of files) {
    const key = relative(file);
    if (covered.has(key)) throw new Error(`${key} is covered by both ${covered.get(key)} and ${collection.id}`);
    covered.set(key, collection.id);
  }
  confirmed += files.length;
}

for (const collection of manifest.excludedCollections) {
  requireCommon(collection);
  requireText(collection, "resolution");
  for (const item of collection.paths) {
    const tracked = trackedFiles(item);
    if (tracked.length) throw new Error(`${collection.id}: excluded path contains tracked files:\n${tracked.map((file) => `- ${file}`).join("\n")}`);
  }
  const files = await expand(collection.paths, false);
  if (!files.length) continue;
  if (releaseMode) throw new Error(`redistribution release contains excluded collection: ${collection.id}; run pnpm icons:remove or remove ${collection.paths.join(", ")}`);
  if (collection.id === "optional-windows-icon-pack") await verifyOptionalWindowsPack(collection, files);
  for (const file of files.filter((item) => assetExtensions.has(path.extname(item).toLowerCase()))) {
    const key = relative(file);
    if (covered.has(key)) throw new Error(`${key} is covered by both ${covered.get(key)} and ${collection.id}`);
    covered.set(key, collection.id);
    localExcluded += 1;
  }
}

const publicFiles = await walk(path.join(ROOT, "apps/web/public"));
const distributableAssets = publicFiles.filter((file) => assetExtensions.has(path.extname(file).toLowerCase()));
const uncovered = distributableAssets.map(relative).filter((file) => !covered.has(file));
if (uncovered.length) throw new Error(`uncovered distributable assets:\n${uncovered.map((file) => `- ${file}`).join("\n")}`);
if (releaseMode) {
  const license = await fs.readFile(path.join(ROOT, "LICENSE"), "utf8");
  if (!license.startsWith("MIT License\n")) throw new Error("root LICENSE is missing or is not the approved MIT text");
}
console.log(`Third-party asset audit passed: ${confirmed} bundled confirmed files${localExcluded ? `; ${localExcluded} local excluded assets verified` : ""}${releaseMode ? "; release exclusions clean" : ""}.`);
