import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "../../tests/fixtures/image-w3a",
  cacheDir: "/tmp/retro-image-w3b-vite-cache",
  server: { port: 5213, strictPort: true }
});
