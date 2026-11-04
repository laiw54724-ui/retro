#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const STORE = path.join(ROOT, "node_modules/.pnpm");
const REPORT = path.join(ROOT, "docs/DEPENDENCY_LICENSES.md");
const write = process.argv.includes("--write");

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.type === "string") return value.type.trim();
  return "";
}
function repository(value) {
  const raw = typeof value === "string" ? value : value?.url;
  return typeof raw === "string" ? raw.replace(/^git\+/, "").replace(/\.git$/, "") : "";
}
function cell(value) { return value.replace(/\|/g, "\\|"); }

async function packageJsons() {
  const files = [];
  for (const entry of await fs.readdir(STORE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modules = path.join(STORE, entry.name, "node_modules");
    let children;
    try { children = await fs.readdir(modules, { withFileTypes: true }); } catch { continue; }
    for (const child of children) {
      if (child.name.startsWith("@")) {
        const scope = path.join(modules, child.name);
        for (const scoped of await fs.readdir(scope, { withFileTypes: true })) files.push(path.join(scope, scoped.name, "package.json"));
      } else {
        files.push(path.join(modules, child.name, "package.json"));
      }
    }
  }
  return files;
}
const packages = new Map();
for (const file of await packageJsons()) {
  let data;
  try { data = JSON.parse(await fs.readFile(file, "utf8")); } catch { continue; }
  if (!data.name || !data.version || data.name.startsWith("@retrodesk/")) continue;
  // Native optional binaries differ by host OS/CPU and are represented by
  // their portable parent package in this platform-neutral report.
  if (Array.isArray(data.os) || Array.isArray(data.cpu)) continue;
  const license = text(data.license ?? data.licenses?.[0]);
  const key = `${data.name}@${data.version}`;
  packages.set(key, { name: data.name, version: data.version, license, repository: repository(data.repository) || data.homepage || "" });
}
const unresolved = [...packages.values()].filter((item) => !item.license || /^(UNLICENSED|NOASSERTION)$/i.test(item.license));
if (unresolved.length) throw new Error(`dependencies without an asserted license: ${unresolved.map((item) => `${item.name}@${item.version}`).join(", ")}`);

const rows = [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, "en"));
const rendered = [
  "# Dependency license inventory",
  "",
  "Generated from the frozen pnpm install by `node scripts/audit-dependency-licenses.mjs --write`.",
  "The report covers the platform-neutral installed dependency graph; host-specific optional native binaries inherit their parent package's role and remain subject to their own package metadata.",
  "This inventory records upstream declarations and is not legal advice or a relicensing grant.",
  "",
  `Packages: **${rows.length}**`,
  "",
  "| Package | Version | Declared license | Upstream |",
  "| --- | --- | --- | --- |",
  ...rows.map((item) => `| ${cell(item.name)} | ${cell(item.version)} | ${cell(item.license)} | ${item.repository ? `[source](${item.repository})` : "—"} |`),
  "",
].join("\n");

if (write) {
  await fs.writeFile(REPORT, rendered);
  console.log(`Dependency license report written: ${rows.length} packages.`);
} else {
  let current;
  try { current = await fs.readFile(REPORT, "utf8"); } catch { throw new Error("dependency license report is missing; run pnpm licenses:report"); }
  if (current !== rendered) throw new Error("dependency license report is stale; run pnpm licenses:report and review the diff");
  console.log(`Dependency license audit passed: ${rows.length} packages with asserted licenses.`);
}
