# Proposal

## Why

Traced from an owner report: after pressing "Continue validation", the
proficiency question never appears — the flow goes straight to preparing
sentences. The trace (code paths plus a read-only live count) found:

1. The label is honest: it renders only when `sessionStorage` holds an
   attempt, and the server re-check confirms it. The reporter's tab holds a
   recognised attempt whose proficiency is already recorded, so skipping the
   question is correct and their original answer is never overwritten. To see
   the question: a fresh tab.
2. A structural hole behind the same report: `allocateBatch` reads the
   validator profile but never checks `ilocanoProficiency`. An attempt with
   no recorded answer — creatable under the old decline path, reachable only
   by same-session resume — would be allocated sentences normally, and any
   answer typed on screening would be discarded by the no-overwrite rule,
   stranding it in a loop. Measured live, read-only: **16 validators, 0 with
   NULL proficiency** — unpopulated and, with intake now refusing null,
   unopenable through the product. But the methodology ("no one validates
   without choosing") currently rests on intake alone; allocation, the single
   choke point that hands out sentences, does not enforce it.

This change closes the hole at allocation with a refused outcome plus a
guided restart, making the methodology machine-enforced rather than
intake-only.

## What Changes

- **New `screening_required` allocation refusal.** A requester whose profile
  records no proficiency receives `{status: "failed",
  reason: "screening_required"}` — after the `unknown_validator` check,
  before any pool read, with no batch persisted and no reservation claimed.
  The closed reason union gains a fifth member, which is a compile error at
  every consumer rather than a silently-ignored branch.
- **Guided restart, no dead end.** The orchestration screen renders a
  dedicated state (message, no futile retry): one control clears the
  pre-correction attempt locally — zero server writes, the same primitive as
  Finish — and navigates to screening for a new screened attempt. The
  finished screen maps the reason to a dedicated message; its existing Finish
  control already retires the attempt.
- **Forward-only.** Legacy null rows are never fabricated, never backfilled,
  never constrained retroactively. Batches allocated before the correction
  drain normally: refusing submitted work would destroy research data, which
  is worse than the hole. No new write path, no profile disclosure (the
  browser learns nothing beyond the refusal), reservation and completion
  semantics untouched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `batch-allocation`: ADDED requirement — allocation requires a recorded
  proficiency (refusal shape, read/write discipline, drain rule).
- `validator-onboarding`: ADDED scenario — a pre-correction attempt without
  an answer cannot allocate; the restart path; the null row untouched.
- `batch-recovery`: MODIFIED requirement — the never-strands terminal list
  gains the screening-required-with-restart state (all scenarios survive).

## Impact

- `src/` changes confined to: the reason union + doc, the service guard,
  two decision mappings, two small UI states, four copy keys in both
  languages. No migration, no repository method, no RPC change.
- Deferred, deliberately: filling the absence on resume (a write on the
  resume path against the no-overwrite rule), and refusing in-flight legacy
  batches (destroys submitted work).
