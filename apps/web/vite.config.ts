import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { sourcemap: true },
  test: { setupFiles: ["./src/test/i18nSetup.ts"] }
});
