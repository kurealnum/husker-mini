import path from "node:path";
import process from "node:process";
import { defineConfig } from "vitest/config";

// Load .env (DATABASE_URL, etc.) for integration tests that need a real
// database connection. Safe to skip if the file doesn't exist.
try {
  process.loadEnvFile(path.resolve(__dirname, ".env"));
} catch {
  // No .env file present — tests that need it will fail with a clear error.
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
