import { readFileSync } from "node:fs";
import { verifyImageArtifact } from "./image-rollout.mjs";

const target = process.argv[2];
verifyImageArtifact(JSON.parse(readFileSync(new URL("../dist/image-rollout.json", import.meta.url), "utf8")), target);
console.log(`Image artifact verified for ${target}.`);
