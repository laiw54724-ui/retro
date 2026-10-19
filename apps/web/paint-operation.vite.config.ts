import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  cacheDir: "/tmp/retro-paint-operation-vite-cache",
  server: { port: 5214, strictPort: true }
});
