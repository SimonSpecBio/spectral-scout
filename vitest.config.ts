import path from "node:path";
import { defineConfig } from "vitest/config";

// Phase 0.3 (build-cycle doc, 2026-09-07): a small suite on invariants that
// corrupt workflow or data, not general coverage. jsdom is only needed for
// lib/offline-queue.test.ts (window/navigator/indexedDB) -- cheap enough to
// use it for the whole suite rather than split environments per file.
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*": ["./*"] -- Vite/Vitest doesn't read
    // tsconfig path mappings on its own.
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.ts"],
  },
});
