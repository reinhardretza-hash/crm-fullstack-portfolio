import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Nur Unit-Tests (gemockte Prisma/Auth) - echte Integrationstests gegen
    // PostgreSQL laufen getrennt über vitest.integration.config.mts /
    // `npm run test:integration`, damit `npm run test` nie eine Datenbank
    // braucht und niemals versehentlich beides vermischt.
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
