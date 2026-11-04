#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "apps/web/public/windows-icons");
const IMPORTER = path.join(ROOT, "scripts/import-windows-icons.mjs");
const SOURCE_URL = "https://github.com/trapd00r/win95-winxp_icons";
const SOURCE_COMMIT = "728a866ad59a54fd4082dbe000e1e62e50bd90e9";

function argument(name) {
  const entry = process.argv.find((value) => value.startsWith(`--${name}=`));
  return entry?.slice(name.length + 3);
}
if (process.argv.includes("--remove")) {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  console.log("icons: optional Windows pack removed; release build is clean");
  process.exit(0);
}
if (!process.argv.includes("--acknowledge-third-party-rights")) {
  console.error([
    "icons: installation requires explicit acknowledgement.",
    "The upstream collection declares no redistribution license and is not covered by Retro's MIT License.",
    "After reviewing docs/THIRD_PARTY_ASSETS.md, run:",
    "  pnpm icons:install -- --acknowledge-third-party-rights",
  ].join("\n"));
  process.exit(1);
}

const suppliedSource = argument("source");
let temporary = "";
try {
  let source = suppliedSource;
  if (source) {
    if (!path.isAbsolute(source)) throw new Error("--source must be an absolute path");
  } else {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "retro-windows-icons-"));
    execFileSync("git", ["clone", "--filter=blob:none", "--no-checkout", SOURCE_URL, temporary], { stdio: "inherit" });
    execFileSync("git", ["-C", temporary, "checkout", "--detach", SOURCE_COMMIT], { stdio: "inherit" });
    source = temporary;
  }
  execFileSync(process.execPath, [IMPORTER, `--source=${source}`], { cwd: ROOT, stdio: "inherit" });
  console.log("icons: optional pack installed locally; run `pnpm icons:remove` before a redistributable build");
} finally {
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
}
