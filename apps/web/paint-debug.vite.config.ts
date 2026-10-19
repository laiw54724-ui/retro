import { defineConfig } from "vite";

// Dedicated fixture server; no app registration or production bundle entry.
export default defineConfig({
  cacheDir: "/tmp/retro-paint-w5a-vite-cache",
  server: { port: 5173 }
});
