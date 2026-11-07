import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Relative asset paths so the build works on GitHub Pages or any subfolder.
  base: "./",
  // three.js alone is ~550 kB minified; that's expected for this page.
  build: { chunkSizeWarningLimit: 900 },
  plugins: [cloudflare()],
});
