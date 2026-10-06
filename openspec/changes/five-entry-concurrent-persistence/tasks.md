# Tasks: five-entry-concurrent-persistence

## 1. Batch size 5

- [ ] 1.1 Set `BATCH_SIZE_DEFAULT = 5` in `src/schemas/batch.ts`; update its comments; adjust unit expectations naming 10.
- [ ] 1.2 Update active copy/specs/docs naming 10 (both catalogs: five/lima); record superseded-10 notes; leave archives untouched.
- [ ] 1.3 Verify allocation returns at most 5 and short batches stay honest (unit + integration).

## 2. Progress and routine status removal

- [ ] 2.1 Remove progress block (x-of-y, saved count, bar/segments, percentages) from the validation session; remove dead copy/components only when genuinely unused.
- [ ] 2.2 Keep failure surfacing (retrying / explicit retry) with ENG/FIL parity; assert absence of routine status in unit + DOM tests.

## 3. Response-submit RPC (forward migration)

- [ ] 3.1 Add versioned `submit_validation_response_v1` migration: membership check, server-derived validator, idempotent insert, post-insert reservation release (best-effort), typed ack/refusal, `search_path` + `SECURITY DEFINER` + EXECUTE posture.
- [ ] 3.2 Add privileged repository method + mapping; strict input parsing; no response-text logging.
- [ ] 3.3 Integration tests: one-RPC record, duplicate already_recorded, entry-not-in-batch, unknown batch, invalid payload, reservation released only after insert.

## 4. POST Route Handler transport

- [ ] 4.1 Add `POST /api/validation-responses` (or per-convention route): strict zod body, ownership derived server-side, single RPC call, typed responses, no credentials to browser.
- [ ] 4.2 Security tests: malformed refused pre-DB, validator-spoof ignored, privilege posture asserted.

## 5. Queue rewrite (MAX_ACTIVE_SAVES = 3, capacity 5)

- [ ] 5.1 Rewrite save queue: 3 active max, all 5 queueable, FIFO refill, per-item bounded retry/backoff, permanent parking with retained payload, single-flight by entry key, out-of-order attribution.
- [ ] 5.2 Rewire runner: enqueue-then-advance always; remove advancement gate/backlog; preserve beforeunload while unconfirmed; no browser-storage payloads.
- [ ] 5.3 Benchmark MAX_ACTIVE_SAVES 2 vs 3 (single-save wall time, 5-rapid drain, RPC duration, failure rate); record evidence; keep 3 unless worse.
- [ ] 5.4 Unit + DOM tests incl. rapid 5x cannot-evaluate: 5 queued, max 3 active observed, refill, out-of-order, transient retry, permanent park, duplicate single-flight, already_recorded confirm.

## 6. In-place finished checkpoint + verification

- [ ] 6.1 After entry 5, switch in place to finished-card shell without unmounting the queue; keep draining; no routine checkpoint message.
- [ ] 6.2 Add server verification of all 5 placements; gate both controls on drained-plus-verified; reconcile missing from retained payloads; actionable error otherwise; Finish never retires early; Continue keeps same attempt.
- [ ] 6.3 Finished-card minimal copy (invitation text, no figures/paragraph/stats/counters) with ENG/FIL parity.
- [ ] 6.4 DOM + integration tests: controls gated pre-drain, pre-verification, missing-blocks, success-enables, queue survives transition, same-attempt continuation.

## 7. Observability

- [ ] 7.1 Privacy-safe timing: POST/RPC duration, queue wait, worker count, verification duration; no response text or credentials logged.

## 8. Verification

- [ ] 8.1 Run `format:check`, `lint`, `typecheck`, `test:unit`, DOM, integration, `build`, guards, `openspec validate --strict`; independent verification pass; record real counts.
- [ ] 8.2 Hosted probes: read-only state check; RPC EXECUTE posture verification; no resets, reseeds, or research writes.
