#!/usr/bin/env node
// Build-time importer for the open icon library.
//
//   node scripts/import-open-icons.mjs --haiku <haiku-clone> --pixelart <pixelart-icons-clone> \
//        --pixelarticons <pixelarticons-clone> --icon2icon <hvif-tools icon2icon binary>
//
// Reads docs/assets/open-icon-library.curation.json (the hand-written allowlist), verifies each upstream clone is at
// the pinned revision, converts/sanitizes, and writes:
//   apps/web/public/icon-library/<set>/<id>.<ext>   + LICENSE/NOTICE text per set
//   apps/web/src/lib/iconLibrary/catalog.generated.ts   (names/keywords, lazy-loaded by the picker)
//   apps/web/src/lib/iconLibrary/ids.generated.ts       (stable ids only, tiny, used by the renderer)
//   docs/assets/open-icon-library.provenance.json        (per-file source path + sha256)
// Nothing here runs at user time; the app never contacts an upstream.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
for (const required of ["haiku", "pixelart", "pixelarticons", "icon2icon"]) if (!args.get(required)) throw new Error(`missing --${required}`);

const curation = JSON.parse(await fs.readFile(path.join(ROOT, "docs/assets/open-icon-library.curation.json"), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (dir, ...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();

// ---------- strict SVG sanitizer ----------
const ELEMENTS = new Set(["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "linearGradient", "radialGradient", "stop", "clipPath", "mask"]);
const ATTRS = new Set(["id", "d", "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "fx", "fy", "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "clip-path", "mask", "maskUnits", "maskContentUnits", "clipPathUnits", "transform", "viewBox", "xmlns", "gradientUnits", "gradientTransform", "spreadMethod", "offset", "stop-color", "stop-opacity", "shape-rendering", "preserveAspectRatio"]);
const STYLE_PROPS = new Set(["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "stop-color", "stop-opacity"]);
const SAFE_VALUE = /^[#A-Za-z0-9 .,%()\-+:/_]*$/;

function checkValue(name, value, where) {
  if (!SAFE_VALUE.test(value)) throw new Error(`${where}: unsafe characters in ${name}="${value}"`);
  const lowered = value.toLowerCase();
  if (/javascript|data:|expression|@import/.test(lowered)) throw new Error(`${where}: forbidden value in ${name}`);
  for (const match of lowered.matchAll(/url\(([^)]*)\)/g)) {
    if (!/^#[a-z0-9_-]+$/.test(match[1].trim())) throw new Error(`${where}: non-local url() in ${name}`);
  }
  if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") throw new Error(`${where}: unexpected xmlns`);
}

function sanitizeSvg(source, where, { forceFill } = {}) {
  if (/<!(DOCTYPE|ENTITY)|<\?(?!xml)|<script|<foreignObject|<style|<image|<use|<a[\s>]|\son[a-z]+\s*=|xlink:|href\s*=/i.test(source)) throw new Error(`${where}: forbidden construct`);
  const body = source.replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  const stack = [];
  let rest = body;
  const tag = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/y;
  let index = 0;
  while (index < body.length) {
    if (body[index] !== "<") {
      if (/\S/.test(body[index])) throw new Error(`${where}: unexpected text content`);
      index += 1;
      continue;
    }
    tag.lastIndex = index;
    const match = tag.exec(body);
    if (!match) throw new Error(`${where}: unparseable markup near "${body.slice(index, index + 40)}"`);
    index = tag.lastIndex;
    const [, closing, name, attrText, selfClose] = match;
    if (!ELEMENTS.has(name)) throw new Error(`${where}: element <${name}> is not allowed`);
    if (closing) {
      if (stack.pop() !== name) throw new Error(`${where}: mismatched </${name}>`);
      out.push(`</${name}>`);
      continue;
    }
    const attrs = [];
    const styleAttrs = [];
    for (const attr of attrText.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
      const [, key, value] = attr;
      if (key === "style") {
        for (const declaration of value.split(";").map((item) => item.trim()).filter(Boolean)) {
          const split = declaration.indexOf(":");
          const prop = declaration.slice(0, split).trim();
          const val = declaration.slice(split + 1).trim();
          if (!STYLE_PROPS.has(prop)) throw new Error(`${where}: style property ${prop} is not allowed`);
          checkValue(prop, val, where);
          styleAttrs.push([prop, val]);
        }
        continue;
      }
      if (!ATTRS.has(key)) throw new Error(`${where}: attribute ${key} is not allowed on <${name}>`);
      checkValue(key, value, where);
      attrs.push([key, value]);
    }
    // Presentation attributes win in the order: explicit style declarations override attributes, as in CSS.
    const merged = new Map(attrs);
    for (const [key, value] of styleAttrs) merged.set(key, value);
    if (forceFill && name !== "svg") {
      for (const key of ["fill", "stroke"]) if (merged.get(key) === "currentColor") merged.set(key, forceFill);
      if (!merged.has("fill") && ["path", "rect", "circle", "ellipse", "polygon", "polyline"].includes(name)) merged.set("fill", forceFill);
    }
    if (name === "svg") {
      merged.delete("fill");
      merged.set("xmlns", "http://www.w3.org/2000/svg");
      merged.delete("width");
      merged.delete("height");
      if (!merged.has("viewBox")) throw new Error(`${where}: svg without viewBox`);
    }
    out.push(`<${name}${[...merged].map(([k, v]) => ` ${k}="${v}"`).join("")}${selfClose ? "/" : ""}>`);
    if (!selfClose) stack.push(name);
  }
  if (stack.length) throw new Error(`${where}: unclosed <${stack.at(-1)}>`);
  const result = out.join("");
  if (!result.startsWith("<svg")) throw new Error(`${where}: root is not <svg>`);
  return result;
}

// ---------- source verification ----------
const clones = { haiku: args.get("haiku"), pixelart: args.get("pixelart"), pixelarticons: args.get("pixelarticons") };
for (const [setId, set] of Object.entries(curation.sets)) {
  const head = git(clones[setId], "rev-parse", "HEAD");
  if (head !== set.source.revision) throw new Error(`${setId}: clone is at ${head}, curation pins ${set.source.revision}`);
  const dirty = git(clones[setId], "status", "--porcelain");
  if (dirty) throw new Error(`${setId}: clone has local modifications`);
}

// ---------- build ----------
const libraryRoot = path.join(ROOT, "apps/web/public/icon-library");
await fs.rm(libraryRoot, { recursive: true, force: true });
const provenance = { schemaVersion: 1, generatedBy: "scripts/import-open-icons.mjs", sets: {} };
const catalog = [];
const seen = new Set();

for (const [setId, set] of Object.entries(curation.sets)) {
  const outDir = path.join(libraryRoot, setId);
  await fs.mkdir(outDir, { recursive: true });
  const outputs = [];
  for (const entry of set.include) {
    const stable = `${setId}:${entry.id}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) throw new Error(`${stable}: id must be kebab-case`);
    if (seen.has(stable)) throw new Error(`${stable}: duplicate id`);
    seen.add(stable);
    const where = stable;
    let content;
    let sourcePath;
    if (setId === "haiku") {
      sourcePath = `${set.source.path}/${entry.src}`;
      const input = path.join(clones.haiku, sourcePath);
      const tmp = path.join(ROOT, "node_modules/.cache/open-icons", `${entry.id}.svg`);
      await fs.mkdir(path.dirname(tmp), { recursive: true });
      execFileSync(args.get("icon2icon"), [input, tmp, "--width", "64", "--height", "64"], { stdio: "pipe" });
      content = sanitizeSvg(await fs.readFile(tmp, "utf8"), where);
    } else if (setId === "pixelart") {
      sourcePath = `${set.source.path}/${entry.src}32.png`;
      content = await fs.readFile(path.join(clones.pixelart, sourcePath));
      if (content.readUInt32BE(16) !== 32 || content.readUInt32BE(20) !== 32) throw new Error(`${where}: expected a 32x32 PNG`);
    } else {
      sourcePath = `${set.source.path}/${entry.src}.svg`;
      content = sanitizeSvg(await fs.readFile(path.join(clones.pixelarticons, sourcePath), "utf8"), where, { forceFill: "#000000" });
    }
    const file = `${entry.id}.${set.ext}`;
    await fs.writeFile(path.join(outDir, file), content);
    outputs.push({ id: stable, path: `apps/web/public/icon-library/${setId}/${file}`, sourcePath, sourceSha256: sha256(await fs.readFile(path.join(clones[setId], sourcePath))), bytes: Buffer.byteLength(content), sha256: sha256(content) });
    catalog.push({ id: stable, set: setId, name: entry.zh, nameEn: entry.en, keywords: `${entry.zh} ${entry.en} ${entry.keywords}`.toLowerCase(), purposes: entry.purposes });
  }
  // License texts (MIT keeps copyright + permission notice; CC0 keeps the source record).
  const licenseSource = { haiku: path.join(clones.haiku, "License.md"), pixelart: path.join(clones.pixelart, "LICENSE"), pixelarticons: path.join(clones.pixelarticons, "LICENSE") }[setId];
  const upstreamLicense = await fs.readFile(licenseSource, "utf8");
  const header = `${set.label}\nSource: ${set.source.url} @ ${set.source.revision}\nLicense: ${set.license} (${set.licenseUrl})\nAuthor / rights holder: ${set.authorOrRightsHolder}\n${set.attribution}\n${set.convertedWith ? `Converted with: ${set.convertedWith}\n` : ""}\n--- upstream license text (${path.basename(licenseSource)}) ---\n\n`;
  await fs.writeFile(path.join(outDir, "NOTICE.txt"), header + upstreamLicense);
  provenance.sets[setId] = { source: set.source, license: set.license, licenseUrl: set.licenseUrl, authorOrRightsHolder: set.authorOrRightsHolder, count: outputs.length, outputs };
}

catalog.sort((a, b) => (a.id < b.id ? -1 : 1));
const generatedDir = path.join(ROOT, "apps/web/src/lib/iconLibrary");
await fs.mkdir(generatedDir, { recursive: true });
const banner = "// GENERATED by scripts/import-open-icons.mjs from docs/assets/open-icon-library.curation.json. Do not edit.\n";
const sets = Object.fromEntries(Object.entries(curation.sets).map(([id, set]) => [id, { label: set.label, category: set.category, ext: set.ext, license: set.license }]));
await fs.writeFile(path.join(generatedDir, "ids.generated.ts"), `${banner}export const ICON_LIBRARY_SETS = ${JSON.stringify(sets, null, 1)} as const;\n\nexport const ICON_LIBRARY_IDS: readonly string[] = ${JSON.stringify(catalog.map((item) => item.id))};\n`);
await fs.writeFile(path.join(generatedDir, "catalog.generated.ts"), `${banner}export interface IconCatalogEntry { id: string; set: string; name: string; nameEn: string; keywords: string; purposes: readonly string[] }\n\nexport const ICON_CATALOG: readonly IconCatalogEntry[] = ${JSON.stringify(catalog, null, 1)};\n\nexport const ICON_PURPOSES: Readonly<Record<string, string>> = ${JSON.stringify(curation.purposes, null, 1)};\n`);
await fs.writeFile(path.join(ROOT, "docs/assets/open-icon-library.provenance.json"), `${JSON.stringify(provenance, null, 1)}\n`);
console.log(Object.entries(provenance.sets).map(([id, set]) => `${id}: ${set.count}`).join(", "), `— total ${catalog.length}`);
