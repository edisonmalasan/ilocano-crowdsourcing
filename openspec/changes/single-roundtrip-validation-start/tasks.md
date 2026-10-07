# Tasks

## 1. Orchestration core

- [x] 1.1 New `runStartValidation` core over injected repositories (recovery lookup → allocate → first-entry resolution), returning the closed start union with batch id + exactly one entry; verified by unit tests against fakes covering fresh start, resume (zero allocation calls), exhausted, screening_required, invalid intent, and recovery-internal-failure fall-through.
- [x] 1.2 Strict intent schema (`z.strictObject`, validator id + optional size only) with type-level exact key-set pin; verified by unit tests refusing entry lists, ordering, ownership, and timestamps before any repository call, plus a `typecheck` can-fire probe (added key fails).
- [x] 1.3 Single-entry result shape proof; verified by unit tests asserting the success arms carry exactly one entry and by a wire-shape test rejecting fixtures with a second entry's sentence/identifier.

## 2. Server-action wrapper

- [x] 2.1 New `"use server"` wrapper building real dependencies (env check → `not_configured`, privileged repositories) and delegating to the core; verified by wrapper tests driven with the environment module throwing, asserting no client-reachable import of the service-role credential.
- [x] 2.2 No-new-RPC proof; verified by a source enumeration test over the orchestration's reachable persistence calls (allocation function + read-only lookups only) and by integration asserting no new migration file.

## 3. Client rewiring

- [x] 3.1 `/validate` auto-orchestrator uses the single action (recovery + allocation client calls removed from that path), keeping terminal outcomes and onward actions; verified by DOM tests (one orchestration per mount, StrictMode double-mount single-flight, exhausted/failure/screening states render with retry/restart).
- [x] 3.2 Finished-card Continue uses the single action under the same attempt with a single-flight latch; verified by DOM `pressMany` test proving one orchestration for two same-task presses and by unit tests that attempt identity is unchanged.
- [x] 3.3 No whole-batch exposure; verified by DOM/rendered-output tests asserting a second entry's sentence never reaches the document on either start path.

## 4. Parity and regression

- [x] 4.1 Existing allocation parity, reservation, session, and recovery suites run unchanged; verified by full `test:unit`, `test:dom`, `test:integration` green plus `lint`, `format:check`, `typecheck`, `build`.
- [x] 4.2 Old actions remain for non-start callers or are removed if orphaned; verified by grep enumeration of callers with each call site disposition stated.

## 5. Latency measurement

- [x] 5.1 Dispatch-to-first-entry measured on the real deployment path with conditions recorded (orchestration duration vs first-entry render where observable); verified by a recorded figure against the ~1–3s target, gaps stated as open items, no synthetic-only claim.

## 6. Proposal verification

- [x] 6.1 Run `openspec change validate single-roundtrip-validation-start --strict`, independent verification pass (every delta scenario named with its test), and hosted read-only probes (no resets, reseeds, or research writes); record real counts.
