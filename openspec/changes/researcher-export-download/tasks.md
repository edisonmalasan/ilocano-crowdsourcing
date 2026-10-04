# Tasks

## 1. Export core and download route

- [ ] 1.1 Add `fflate` via `pnpm add fflate` (lockfile records the pin; no other dependency). Verify: `pnpm install --frozen-lockfile` exit 0.
- [ ] 1.2 Implement the injectable download core (verify session via the shared guard, collect sources through `ExportSources` picks, render via `renderDocuments`, ZIP the five artifacts with a server-clock dated filename, refuse over the size bound). Verify: unit tests over fakes prove refusal-before-read, dated ZIP contents, closed entry set, and byte-equivalence with the CLI documents.
- [ ] 1.3 Add the thin Route Handler under `src/app/researcher/(protected)/export/` that supplies real repositories and returns the ZIP or the 403 refusal. Verify: `impeccable detect` clean; route covered by core tests plus a source test naming the guard call.
- [ ] 1.4 Extend the closed test enumerations honestly (`getAdminEnv` readers, route witnesses). Verify: `admin-guard`, `admin-routes`, `validation-routes`, `dashboard-read-only` suites green.

## 2. Dashboard export action and presentation

- [ ] 2.1 Add the export section with a download control to the authenticated dashboard. Verify: DOM test proves the control links the export route and is visible only in the protected view.
- [ ] 2.2 Refine the dashboard presentation within the incumbent idiom (no figure/copy/route changes). Verify: `impeccable detect` clean; existing dashboard markup tests green.

## 3. Verification and ledger

- [ ] 3.1 Run the full suite: `lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`. Verify: all exit 0 with counts read back.
- [ ] 3.2 Run can-fire probes on the refusal-before-read guard and the equivalence assertion with green controls and byte-identical restore. Verify: both fire red on mutation.
- [ ] 3.3 Update `docs/ROADMAP.md` Project Status rows for the Apply and verify `ledger-integrity` passes.
