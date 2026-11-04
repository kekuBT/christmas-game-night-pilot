import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: { port: 5173, proxy: { "/rooms": "http://localhost:3000", "/games": "http://localhost:3000" } },
  build: { outDir: "dist", emptyOutDir: true },
});
