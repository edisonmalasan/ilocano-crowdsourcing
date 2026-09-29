import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Two projects, split by what the test needs to touch:
 *
 * - `unit`        — pure domain logic, schemas, class builders, and server-rendered markup
 *                   assertions. No I/O, no database, no DOM.
 * - `integration` — boots a real PostgreSQL instance (PGlite) and applies real SQL.
 *
 * `react-dom/server` is used for component assertions instead of a DOM environment, so the
 * accessibility contracts (accessible names, roles, `aria-*` wiring) are verified against real
 * rendered markup without adding a browser-like runtime to the unit project.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          globals: false,
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
        resolve: {
          alias: { "@": r("./src") },
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          globals: false,
          include: ["tests/integration/**/*.test.ts"],
          // PGlite boots a WASM Postgres per test file; give it room on slower CI machines.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
        resolve: {
          alias: { "@": r("./src") },
        },
      },
    ],
  },
});
