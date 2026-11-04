import { readFileSync } from "node:fs";

export const IMAGE_STAGING_WEB_ORIGIN = "https://retrodesk-staging.pages.dev";
export const IMAGE_STAGING_API_ORIGIN = "https://retrodesk-api-staging.beibeiz.workers.dev";

export function validateImageRelease(config) {
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      Object.keys(config).sort().join(",") !== "apiOrigin,enabled,webOrigin" ||
      typeof config.enabled !== "boolean" || config.webOrigin !== IMAGE_STAGING_WEB_ORIGIN ||
      config.apiOrigin !== IMAGE_STAGING_API_ORIGIN) {
    throw new Error("Invalid Image release config: exact approved staging Web/API origins and boolean enabled required");
  }
  return config;
}

export function readImageRelease(file) {
  return validateImageRelease(JSON.parse(readFileSync(file, "utf8")));
}

export function configuredImageRollout({ command, mode, defaultConfig }) {
  if (command === "build" && process.env.NODE_ENV === "development") throw new Error("Release builds must not use NODE_ENV=development");
  const config = readImageRelease(process.env.RETRO_IMAGE_RELEASE_CONFIG || defaultConfig);
  return resolveImageRollout({ command, mode, config, apiOrigin: process.env.VITE_API_URL });
}

export function resolveImageRollout({ command, mode, config, apiOrigin }) {
  validateImageRelease(config);
  const enabled = command === "build" && mode === "staging" && config.enabled;
  if (enabled && apiOrigin !== IMAGE_STAGING_API_ORIGIN) throw new Error("Enabled Image staging build requires the exact approved staging API origin");
  return { enabled, webOrigin: enabled ? config.webOrigin : null, apiOrigin: enabled ? config.apiOrigin : null };
}

export function verifyImageArtifact(receipt, target) {
  if (!["staging", "production"].includes(target)) throw new Error("Image artifact target must be staging or production");
  if (!receipt || receipt.version !== 1 || typeof receipt.enabled !== "boolean" || !["production", "staging"].includes(receipt.mode)) throw new Error("Missing or invalid Image rollout receipt; rebuild the web artifact");
  if (target === "production" && (receipt.mode !== "production" || receipt.enabled)) throw new Error("Refusing production deployment of a staging Image artifact");
  if (receipt.enabled && (receipt.mode !== "staging" || receipt.webOrigin !== IMAGE_STAGING_WEB_ORIGIN || receipt.apiOrigin !== IMAGE_STAGING_API_ORIGIN)) throw new Error("Image artifact does not match the approved staging target pair");
  if (!receipt.enabled && (receipt.webOrigin !== null || receipt.apiOrigin !== null)) throw new Error("Disabled Image artifact has invalid rollout metadata");
}
