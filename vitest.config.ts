import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Everything (shared/, engine/, amplify/) runs in plain Node - only the
    // frontend component tests under tests/ need a DOM.
    environment: "node",
    environmentMatchGlobs: [["tests/**", "jsdom"]],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
  },
});
