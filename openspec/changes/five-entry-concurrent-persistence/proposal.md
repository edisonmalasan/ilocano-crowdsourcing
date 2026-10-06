# Proposal: five-entry-concurrent-persistence

## Why

The true batch size must become 5, the participant UI must stop pressuring validators with per-entry progress and routine save chatter, and background persistence must stop pretending client-invoked Server Actions are a parallel write pool. Rapid submissions (notably five fast cannot-evaluate answers) must never be silently lost, and the finished card must become a real synchronization checkpoint instead of a screen reached by navigation after a client-side drain.

## What Changes

- True batch size changes from 10 to 5: `BATCH_SIZE_DEFAULT` 10 to 5, all active copy/specs/docs saying 10 updated, batch-size-10 rule recorded as superseded.
- Per-entry progress UI removed from the validation session: no sentence x-of-y, no saved count, no progress bar/segments, no percentages. Internal accounting (placement, queue, confirms) is unchanged.
- Routine Saving/Saved status stays removed; only actionable failures surface (retrying / explicit retry states).
- Background response transport moves from client-called Server Action (`submitValidationAction`) to a same-origin POST Route Handler (`POST /api/validation-responses` or equivalent per repo conventions) for individual response writes. Server Actions remain for one-shot workflows.
- Each response persists via ONE versioned PostgreSQL RPC (`submit_validation_response_v1` or per-convention name): resolve batch, derive validator, verify membership, enforce server-minted identity, idempotent insert under `UNIQUE (validator_id, dataset_entry_id)`, release reservation after persistence, typed acknowledgement (`recorded` / `already_recorded` / typed refusal).
- Controlled save workers: `MAX_ACTIVE_SAVES = 3` (at most 3 response POST/RPC operations in flight); all 5 current-batch responses may exist independently in the queue; participant advancement never waits on worker occupancy.
- Queue capacity covers the whole current 5-entry batch; entry ID / batch placement is the idempotency key; duplicate clicks stay single-flight.
- After entry 5, transition IN PLACE to the existing finished-card visual state without unmounting the queue; run fresh server-authoritative verification that all 5 placements have stored responses; enable Answer another batch / Finish for now only after verification passes. No routine "Saving your responses…" message; failures surface as actionable errors.
- Finish for now never retires the attempt before the checkpoint passes; Answer another batch keeps the SAME attempt and allocates a new 5-entry batch.
- Finished-card copy: body becomes an invitation to answer another batch ("Would you like to answer another batch?" plus Filipino equivalent); no figures, no explanatory paragraph, no progress statistics, no save/sync counter. Owner-removed content stays removed.
- Privacy-safe timing instrumentation for response POST/RPC duration, queue wait, worker count, checkpoint verification duration. No response text logged.

## Capabilities

### New Capabilities

- `response-persistence`: independent per-entry response queue with controlled concurrency (MAX_ACTIVE_SAVES = 3), POST transport, single-RPC submit, typed retry lifecycle, idempotent acknowledgement, rapid-submission safety, in-place finished checkpoint with server verification.

### Modified Capabilities

- `validation-experience`: batch size 5; no progress display; quiet persistence; optimistic advance decoupled from worker occupancy; in-place finished checkpoint.
- `batch-completion`: checkpoint semantics (controls disabled until server verification of all 5); finished-card minimal copy.
- `batch-allocation`: configured batch size 5; short-batch language updated; same-attempt continuation across batches.
- `interface-localization`: ten/sampung copy to five/lima where numbers remain; progress/save keys removed; ENG/FIL parity; no U+2014 outside permitted titles.
- `data-access-boundary`: new POST Route Handler and versioned response-submit RPC under the established security posture (strict parsing, server-derived ownership, service-role-only RPC, PUBLIC/anon/authenticated revoked, no browser credentials).

## Impact

- `src/schemas/batch.ts`, `src/app/validate/**`, `src/lib/validation/**`, `src/lib/allocation/**`, `src/lib/i18n/copy.ts`, `src/components/ui/progress.tsx` (if orphaned), new `src/app/api/**` POST handler, new `supabase/migrations/*_submit_validation_response*.sql`, new repository RPC method.
- Tests: unit (queue, copy, routes), DOM (runner, checkpoint), integration (RPC parity, concurrency, reservation interplay). MAX_ACTIVE_SAVES = 2 vs 3 benchmark measured before choosing.
- No dataset change, no reseed, no research-data deletion, no methodology change beyond batch size 10 to 5.
