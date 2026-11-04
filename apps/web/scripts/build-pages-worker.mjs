import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = path.join(root, "dist");
const apiUrl = (process.env.VITE_API_URL || "http://localhost:8787").replace(/\/$/, "");
if (!/^https?:\/\//.test(apiUrl)) throw new Error("VITE_API_URL must be an absolute HTTP(S) URL");
await mkdir(dist, { recursive: true });
await copyFile(path.join(root, "edge/pages-worker.mjs"), path.join(dist, "_worker.js"));
await writeFile(path.join(dist, "runtime-config.json"), `${JSON.stringify({ apiUrl })}\n`);
console.log(`pages-worker: built with API origin ${new URL(apiUrl).origin}`);
