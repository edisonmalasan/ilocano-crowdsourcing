# Proposal

## Why

Starting validation currently costs four client→server round trips before the first entry is on screen: a recovery lookup action, an allocation action (which itself holds the only RPC), an SSR session read piggybacked on navigation, and a post-mount prefetch action. Each hop adds latency and failure surface to the moment a participant has the least context — the working spinner between Continue/start and the first sentence. The allocation work itself is already fast (database-side, one transaction); the remaining cost is the number of trips, not the work.

## What Changes

- Adds one server orchestration for validation start that, in a single client→server round trip, checks for a resumable interrupted batch, allocates a new batch when there is none, and resolves the first entry to present — returning only the batch id plus that one entry, never the whole batch entry list.
- Applies the orchestration to both start paths: the `/validate` auto-orchestrator (fresh start and resume) and the finished card's Continue control (same attempt, new batch).
- Keeps every existing guarantee intact: pooled-completeness eligibility, same-attempt exclusion, reservation atomicity inside the allocation function, strict client-intent rejection, service-role-only RPC, attempt identity unchanged across Continue.
- Measures start latency (Continue/start action dispatched → first entry rendered) against a ~1–3s target on the real deployment path; records what was measured and what it does not prove.
- **BREAKING**: none. Existing allocation, recovery, session-open, and prefetch entry points remain until the orchestration is verified; no route, schema, or export changes.

## Capabilities

### New Capabilities

- `validation-start`: one round trip from start intent to first entry (recovery check + allocation + first-entry resolution in one orchestration, single-entry result, timing target, failure taxonomy).

### Modified Capabilities

- `batch-allocation`: the start path no longer ships the whole allocated entry list to the client; the orchestration returns the batch id plus the first entry only, with allocation semantics unchanged.
- `batch-recovery`: the standalone client-issued recovery lookup on the start path folds into the orchestration; resume addressing and ordering semantics unchanged.
- `data-access-boundary`: the new orchestration follows the established posture (strict intent, server-derived ownership/timestamps, privileged RPC server-side only, browser never calls RPC directly).

(No `validation-experience` change: the per-entry flow, progress removal, and quiet-persistence rules are untouched; what the participant sees at start — one quiet working state ending in the first sentence — is specified in the new capability.)

## Impact

- Affected code: `src/app/validate/start-batch.tsx`, `src/app/validate/[batchId]/finished-batch.tsx`, `src/lib/allocation/*`, `src/lib/validation/recovery-*`, `src/lib/validation/session-service.ts`, `src/lib/validation/next-entry-actions*`, one new orchestration core + action module.
- No migration, no dataset change, no export change, no interface-copy change.
- Tests: unit (orchestration core against fakes, strict-intent pins), DOM (one orchestration per start, single-flight, no whole-batch exposure in rendered output), integration (allocation + reservation + first-entry resolution parity against PGlite using production migrations).
