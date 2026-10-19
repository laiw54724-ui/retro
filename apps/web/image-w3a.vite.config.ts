import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Debug-only assets live under tests, outside the production public directory. */
export default defineConfig({
  plugins: [react()],
  publicDir: "../../tests/fixtures/image-w3a",
  cacheDir: "/tmp/retro-image-w3a-vite-cache",
  server: { port: 5212, strictPort: true }
});
