# Design

## Context

See `proposal.md` (Why) for motivation. Current state, measured on this repository (see change exploration):

- Fresh start costs 4 client→server hops: `requestInterruptedBatchAction` (`src/lib/validation/recovery-actions.ts`), `requestBatchAction` (`src/lib/allocation/actions.ts`, holding the only RPC `allocate_validation_batch_v1` via `src/lib/repositories/supabase/batches.ts`), SSR session open (`openValidationSession` in `src/lib/validation/session-service.ts` piggybacked on navigation), and a post-mount `requestNextEntryAction` prefetch (`src/lib/validation/next-entry-actions.ts`).
- Both start consumers (`src/app/validate/start-batch.tsx`, `src/app/validate/[batchId]/finished-batch.tsx`) use only the batch id from the allocation outcome; the `entries` array crosses the boundary and is deliberately unread.
- Testable halves already exist as cores over injected repositories (`allocation-actions-core.ts`, `recovery-actions-core.ts`, `next-entry-actions-core.ts`, `session-service.ts` takes dependencies); wrappers own env + privileged client only.

## Goals / Non-Goals

- Goals: one client→server start round trip returning batch id + first entry; zero new RPCs; zero new tables/columns/migrations; existing cores reused, not rewritten.
- Non-Goals: prefetch removal (it stays for entry 2+); route-contract changes; allocation-function changes; any `validation-experience` per-entry change; resuming UI offers (auto-resume stays).

## Decisions

- **One new orchestration core (`runStartValidation`) over injected repositories, plus one `"use server"` wrapper action.** It sequences the existing `runRecoveryLookup` → `runAllocateBatch` → first-entry resolution (the `resolveSessionEntry` + `projectAllocatedEntry` projection already shared by session-service and next-entry core) in one server invocation. Alternative (a new RPC composing all three) rejected: it would duplicate pooled-pillar logic in a second SQL place, violating the exactly-one-SQL-place rule proven by parity tests.
- **Result type is a new closed union (`started` / `resumed` / `exhausted` / `screening_required` / `no-identity` / `invalid` / `not_configured` / `persistence`), carrying batch id + one entry on the two success arms.** A new type rather than reusing `AllocationOutcome`, because the shape contract (exactly one entry, never the batch) is the point and reusing the wide type would let the entries array leak back in. Key-set pins at type + runtime, following the repository's established pattern.
- **Strict intent: validator id + optional size preference only (`z.strictObject`).** Anything else (entry lists, ordering, ownership, timestamps) is refused before any database work, matching the allocation intent's reject-don't-ignore posture.
- **Resume path performs zero writes.** The orchestration checks recovery first; on `resume` it resolves the first unanswered entry and returns without touching allocation. The resume-writes-nothing scenario is asserted as absence-of-write-path (following the existing scenario's own warning that row-state assertions cannot observe it).
- **Both clients navigate to the batch address on success, unchanged.** The orchestration does not render; SSR session open on `[batchId]` stays as the renderer. This keeps the route contract (`batch-route.ts`) untouched and leaves the old actions in place until verification passes.
- **Failure taxonomy reuses existing reasons** (`invalid`, `not_configured`, `unknown_batch`-class refusals surface as honest failure with retry; recovery-internal failure falls through silently to allocation). No new participant-facing copy except what the one quiet working state already shows.

## Risks / Trade-offs

- [Risk] Double allocation from double-mount/double-click now concentrates in one action. Mitigation: single-flight latch in both call sites (existing `started` ref pattern on `/validate`; add the same to the Continue control) plus a DOM `pressMany` test proving one orchestration per double activation.
- [Risk] Orchestration widens a Server Action's blast radius (recovery + allocation + reads in one place). Mitigation: core stays a thin sequencer delegating to the existing tested cores/services; unit tests drive it against fakes, and parity/integration suites for allocation run unchanged.
- [Risk] Latency target depends on deployment conditions (cold start, network). Mitigation: record conditions with the measurement; the spec requires stating what was not proven.

## Migration Plan

No migration. Deploy as code-only change; old actions (`requestBatchAction`, `requestInterruptedBatchAction` direct client use on start paths) are rewired to the orchestration in this change and removed only if orphaned — otherwise left for non-start callers. Rollback is a revert to the two-action clients; no stored state changes shape.

## Open Questions

None. The one genuine unknown (measured latency on the real path) is a task (measure and record), not a design fork: all feasible outcomes keep this approach.
