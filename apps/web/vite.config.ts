import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { configuredImageRollout } from "./scripts/image-rollout.mjs";

export default defineConfig(({ command, mode }) => {
  const rollout = configuredImageRollout({ command, mode, defaultConfig: new URL("./config/image-staging-rollout.json", import.meta.url) });
  return {
    plugins: [react(), {
      name: "image-rollout-receipt",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "image-rollout.json", source: JSON.stringify({ version: 1, mode, ...rollout }) + "\n" });
      }
    }],
    define: { __RETRO_IMAGE_STAGING_ROLLOUT__: JSON.stringify(rollout), __RETRO_IMAGE_DEV_SERVER__: command === "serve" },
    server: { port: 5173 },
    build: { sourcemap: true },
    test: { setupFiles: ["./src/test/i18nSetup.ts"] }
  };
});
