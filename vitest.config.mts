import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@content": path.resolve(import.meta.dirname, "content"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Fictional demonstration records exist for development and tests.
    env: { FIELDWISE_DEMO_MODE: "true" },
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
