import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve(process.argv[2] ?? "dist");
const assetsDir = path.join(distDir, "assets");
const files = (await readdir(assetsDir)).filter((file) => file.endsWith(".js"));
if (!files.length) throw new Error(`No JavaScript bundle found in ${assetsDir}`);

const source = (await Promise.all(files.map((file) => readFile(path.join(assetsDir, file), "utf8")))).join("\n");
const forbidden = ["https://example.supabase.co", "http://localhost:8787"];
const leakedFallback = forbidden.find((value) => source.includes(value));
if (leakedFallback) throw new Error(`Refusing deployment: bundle contains fallback runtime URL ${leakedFallback}`);

const supabaseUrls = [...new Set(source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/g) ?? [])];
if (supabaseUrls.length !== 1) throw new Error(`Refusing deployment: expected exactly one Supabase project URL, found ${supabaseUrls.length}`);
if (!/https:\/\/[a-z0-9.-]+(?:workers\.dev|pages\.dev|retrodesk\.[a-z.]+)\b/.test(source)) {
  throw new Error("Refusing deployment: no HTTPS API origin was embedded in the bundle");
}

console.log(`Deploy environment verified (${supabaseUrls[0]}).`);
