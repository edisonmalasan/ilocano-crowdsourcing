import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Three projects, split by what the test needs to touch:
 *
 * - `unit`        — pure domain logic, schemas, class builders, and server-rendered markup
 *                   assertions. No I/O, no database, no DOM.
 * - `integration` — boots a real PostgreSQL instance (PGlite) and applies real SQL.
 * - `dom`         — client components driven for real: `createRoot` + React's `act`, a genuine
 *                   click, and the effect observed in the DOM.
 *
 * WHY `dom` EXISTS, because the split above is not a preference.
 *
 * `react-dom/server` is used for component assertions instead of a DOM environment, so the
 * accessibility contracts (accessible names, roles, `aria-*` wiring) are verified against real
 * rendered markup without adding a browser-like runtime to the unit project. That was the right
 * call for what those tests assert — and it has a hard edge, which the repository already wrote
 * down before this project existed in this form:
 *
 *   - `renderToStaticMarkup` never runs an effect and never fires a click handler
 *     (`tests/unit/onboarding-routes.test.tsx`, "Asserted against the import, which is the only
 *     place it exists").
 *   - `renderToStaticMarkup` can only ever see the IDLE state, so a pending state is unreachable
 *     (same file, "the pending behaviour is asserted where it is actually decided").
 *
 * Measured consequence: every one of the four CRITICAL unguarded call sites behind the
 * `thin-shell-call-sites` change is an event-handler or wiring fact — `readStoredValidatorId()`
 * inside `handleClick`, `router.push("/ready")` inside `handleClick`, the answer passed to a Server
 * Action inside `onSubmit`, and a button's `disabled` binding that is only true while pending. Not
 * one is observable without a DOM. At the time of writing, `submitState` and `router.push` had
 * **0 hits** anywhere in `tests/unit`.
 *
 * So the alternative was a fourth structural source scan. This repository has found six vacuous
 * guards, every one of them a scan, and the standing question for a scan is what it would take to
 * make it fail: a bare substring is satisfied by a comment, and a scan cannot tell
 * `router.push("/ready")` from a rewording of it. A DOM test asserts the EFFECT, which is the thing
 * actually specified.
 *
 * The DOM runtime is OPT-IN and must stay that way. `unit` keeps `environment: "node"`: widening it
 * would slow every domain test and re-open the property this split exists to hold. Only files under
 * `tests/dom/` run here.
 *
 * No `@testing-library` on purpose. `act` is exported by React itself and `createRoot` by
 * `react-dom/client`, so a DOM project costs one dependency (`happy-dom`) rather than three, and
 * adds no third party's opinion about how a click should be synthesised. See
 * `openspec/changes/thin-shell-call-sites/design.md` D1.
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
          name: "dom",
          environment: "happy-dom",
          globals: false,
          include: ["tests/dom/**/*.test.{ts,tsx}"],
          // A client component's writes settle across microtasks, so a DOM test awaits real async
          // work. This is a wider window than `unit` needs and a narrower one than PGlite does.
          testTimeout: 15_000,
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
