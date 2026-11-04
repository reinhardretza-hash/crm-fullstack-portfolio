import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Echte Integrationstests gegen eine laufende PostgreSQL-Instanz - bewusst
// eine eigene Konfiguration statt eines Flags in vitest.config.mts, damit
// `npm run test` (Unit-Tests) niemals versehentlich eine Datenbank braucht
// und `npm run test:integration` unmissverständlich erkennbar ist.
// `fileParallelism: false`, da mehrere Testdateien sich sonst dieselbe
// Testdatenbank gegenseitig zerschießen würden.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/integration/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
