import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The app is served by server.mjs (:4800) from dist/. `npm run dev` runs Vite
// on :5173 and forwards API, media and site files to that server.
const backend = "http://localhost:4800";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": backend, "/media": backend, "/site": backend },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
