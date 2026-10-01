# Design - `interrupted-batch-recovery`

## The situation, measured rather than assumed

Four facts, each read out of the code rather than assumed. Two of them are the reason this change is much
smaller than it looks, and one of them is the reason it must not be sold as a data-loss fix.

**1. Resume already works; only discovery is missing.** `resolveSessionEntry` receives the completed entry
ids and, when no position is requested, returns the first placement not among them. Reloading
`/validate/<batchId>` therefore lands on the first unanswered entry — and the same derivation already
recognises a fully answered batch as finished. Nothing about resumption needs building.

**2. Abandonment destroys no coverage.** `selectBatchEntries` excludes a candidate only when
`answeredEntryIds.has(candidate.id)` or coverage has reached the target. An abandoned batch's unanswered
entries satisfy neither and remain allocatable, to anyone. **No response is lost either**, but the
mechanism is not the one a reader would guess, and this was corrected on verification: `UNIQUE
(validator_id, dataset_entry_id)` forbids a **second recorded response**, not a second *asking*. What stops
an answered entry being offered again is the allocation filter, at a different layer. The repository says so
itself — `validations.ts` records that if the row cap were ever reached, the result would be **short**,
the missing entries **would be offered again**, and the database would refuse the second response. So the
constraint is a backstop behind the filter, not the filter. A third exclusion applies to everybody and is
not an effect of abandonment: an entry marked inactive is not in the pool at all.

**3. `validation_batches` has two columns and no timestamps.** `id` and `validator_id`, and nothing else.
`research-schema` defers status, completion, and assignment timestamps *"until the changes that own them add
them"*, so adding one is sanctioned — but only one is added, and only because of D2.

**4. The validator's identifier is browser-local.** `readStoredValidatorId()` reads `localStorage`, which
does not exist while the server renders. `/validate` is therefore a Server Component that reads only the
locale cookie, with a client island making the write. A recovery read inherits that constraint, which is
what D8 is about.

## Decisions

### D1 - Recognition is derived, and no lifecycle column is added

An interrupted batch is *the validator's own batch with at least one unanswered entry*. Both halves are
read from stored rows. No `status`, no `resumed_at`, no `abandoned_at`.

`batch-completion`'s D4 already declined a lifecycle column, and `research-schema` defers one. The
reinforcing reason is that a stored flag creates a second authority: a batch marked `in_progress` whose
entries are all answered would then be reported as interrupted, and the repair for that is a scheduled job
nobody has a reason to write. Derivation has no such state to fall out of step.

### D2 - `created_at` is added for one reason: to make the choice total

"Offer the most recently created" needs an age, and the table has none. `defaultBatchId` produces
`` `${validatorId}-${now.toISOString()}` ``, so the identifier *happens* to encode an ISO instant and is
lexically time-sortable. Sorting on it was rejected: that couples a persistence query to the shape of a
string that exists for a different reason (readability and ownership in logs), and a future id scheme would
break the ordering silently while the query still succeeded.

So: `created_at timestamptz`, **written by the server** in `create`, not defaulted. The server already mints
every other timestamp, and a database default would make the database a second source of time — the same
objection that removed `requested_size` from this table.

Ordering is `created_at DESC, id DESC`, and the reason for the second key had to be corrected on
verification. The original argument was that `toISOString()` has millisecond precision, so two batches
created in the same millisecond tie. **That is wrong**, and in an instructive way: for one validator, two
batches minted in the same millisecond produce the *identical* id, because both halves of
`` `${validatorId}-${now.toISOString()}` `` match. That is a primary-key collision on
`validation_batches.id`, and the second write is refused as a persistence failure. It is not a tie.

The tiebreaker is still right, for two reasons that survive the correction. First, `id` is unique by
primary key, so ordering by it after `created_at` always yields one row — an ordering that can tie makes the
offered batch depend on the driver's row order, which is not a property anyone can test or rely on.
Second, and concretely: **the migration backfills every existing row with one identical `now()`**, so
pre-existing batches really do share a creation instant, and a validator who had allocated twice before the
migration has two interrupted batches with the same timestamp. That is an in-world witness for the tie, not
a hypothetical. The tiebreaker exists because the backfill guarantees it, which is a better reason than the
one first written.

The migration is forward, and it backfills: existing rows get `now()`, because the honest backfill value for
a batch created at an unknown time is the moment it became knowable. There are no production rows — no
Supabase project exists — so no research record is misdated, and that is stated rather than glossed.

### D3 - The lookup is additive: it can add an affordance, and it can fail

The lookup never removes, disables, or delays the existing *Start a batch* control. It is invoked on mount
and its result, whatever it is, only ever adds.

This is the whole reason a failed lookup needs no special handling. A control that could be withheld would
need a rule for what to show while it was pending and what to show if it never arrived, and that rule would
be a second failure mode to get wrong. A control that can only be added has none.

The visible consequence: while the lookup is in flight, *Start a batch* is already usable. A participant on
a slow connection who presses it gets exactly today's behaviour — a new batch — which is a legitimate
choice they were always entitled to make.

### D4 - "None" and "could not determine" are different outcomes, and only one is shown

The lookup returns three shapes: an interrupted batch, an explicit **none**, and an explicit
**unavailable**. The last is a modelled outcome rather than a thrown exception, because an exception
swallowed into a success is exactly the failure this repository keeps recording — but it is still a
distinct value, not a silent `null`.

Only *none* and *unavailable* render identically: both show the start experience unchanged, and neither
shows the participant an error. That is a deliberate product decision, not an omission. The participant
cannot act on "we could not check", and a message offering them nothing is worse than no message — it
teaches someone that the platform is broken when it is only slow.

The distinction survives where it is useful: the outcome type carries it, so it is testable, and the
repository's error remains a typed error rather than being flattened into a success at the boundary.

### D5 - Starting a new batch while one is interrupted stays allowed

The alternative — offer resume, and refuse allocation until the open batch is finished or declined — was
rejected. It makes a convenience feature into a gate, and gates have failure modes that conveniences do
not: a participant whose open batch is somehow unusable would be **stranded**, with the only way forward
being something they cannot do. On a volunteer study with no accounts and no support channel, stranding is
worse than an extra batch.

So both controls are present whenever an interrupted batch exists. Two abandoned batches are then possible,
and only the most recent is offered — the older stays inert, unreachable, and harmless, which D1 already
established is what an abandoned batch is.

### D6 - Resume is a link, and this is the opposite of `batch-completion`'s D1

`batch-completion`'s D1 made *Continue* a direct control rather than a link to `/validate`, because **there
was no batch to link to** — the identifier did not exist until the server minted it.

Here the identifier is the batch's own stored address, known before the participant presses anything.
That makes a link the honest control: it writes nothing (R3), needs no pending state, and works with
JavaScript disabled. A button that called an action to navigate to an address the client already held
would be a write-shaped control around a pure navigation.

The contrast is worth recording because it shows the decision is a consequence of *what exists*, not a
house style.

**And the address is not free of the participant's identifier.** `defaultBatchId` embeds the validator's
anonymous id verbatim, so rendering this link puts `VAL_…` in `/validate`'s HTML. That is accepted rather
than designed around, and the acceptance is the honest position: the browser already holds that identifier
and already sends it to the server, so the link discloses nothing it did not have. The alternative —
changing batch ids so they no longer embed the owner — is a real improvement and is **out of scope here**,
because `defaultBatchId`'s own docstring says the embedding is deliberate: a log line naming a batch should
also name whose batch it is. What this change must not do is *add* an identifier beyond that one, which is
why the requirement is phrased as "introduces no identifier beyond the one it leads to" rather than as
"reveals no identifier" — the stricter phrasing is unsatisfiable, and an unsatisfiable requirement is a
requirement that will be quietly ignored or quietly broken.

### D7 - The offer reports remaining entries, never answered ones

The copy says how many of the batch's entries **remain**. It does not say how many the participant answered,
and it does not present any total-response figure.

Two reasons. First, `cannot_evaluate` responses count as answered for session purposes but contribute
**zero** qualifying coverage, so "3 of 10 answered" is a figure whose meaning depends on a subtlety the
participant has no reason to hold; "7 remaining" is true under every reading. Second, and following
`batch-completion`'s D2, a per-batch figure adjacent to the work could be *mistaken* for a contribution or
coverage measure. "Remaining" describes the batch, not the participant.

### D8 - Discovery runs from a client island, on mount, and is a read

The identifier is in `localStorage` (fact 4), so a Server Component cannot know who is asking. The read is
therefore issued from the existing `StartBatch` island on mount, through a Server Action — the same
server-authoritative transport as every write, and the same shape as `requestBatchAction`.

It is a **read**, deliberately. It goes through the same repository interfaces and the same typed-error
mapping as any read, and it creates nothing. Making it an action rather than a route handler keeps one
transport for client/server conversation, and keeps the repository out of the client module graph by
construction — the reason `StartBatch` exists as an island.

### D9 - The lookup takes a validator identifier and no batch identifier

The request is keyed on the anonymous identifier the browser already holds, and the server re-checks it
against enrolled validators exactly as `runAllocateBatch` does. There is deliberately **no parameter** for a
batch id, which is the type-layer fact that makes "a client cannot choose which batch is resumed" a
guarantee rather than a promise — the same technique `batch-allocation` used for batch order, and the same
reason: a parameter that does not exist cannot be honoured.

The identifier is client-supplied, and that is pre-existing and unchanged. What is new is only that a
lookup discloses a batch for an identifier the caller already supplied, so it reveals nothing the caller
did not already know.

**This was overstated in the first draft and the correction matters.** The draft said the lookup "cannot be
used to enumerate participants". The identifier is `VAL_` plus 8 hex characters — 32 bits — and the lookup
answers, for any guessed identifier, whether it names an enrolled validator and how much of its batch
remains. So it absolutely can be used to enumerate. What is true is narrower: **the platform already
answers that same question** through `unknown_validator` on `requestBatchAction` and every other
validator-keyed operation, so this adds **no new kind of oracle**. A claim about attacker capability and a
claim about novelty are different claims, and only the second one is true.

## Deliberately not in this change

- **A resumption link on the landing page.** See the proposal's scope.
- **Cleanup of older abandoned batches.** Inert by D1's derivation; deleting research rows is not available.
- **Refusing a new batch while one is interrupted.** D5.
- **Asking the participant which open batch they want.** With more than one, the list is confusing rather
  than helpful, and the most recent is the one they were last working on.
- **Any coverage, export, or admin concern.** Phase 7 and later.

## Carried forward, and deliberately not re-decided here

- **`pglite-harness.test.ts` is order-dependent under `--sequence.shuffle`** (4 of its 11 tests), pre-existing
  and unrelated. Any new integration file must be excluded from shuffle verification rather than "fixed" by
  removing the check.
- **`lifetime-figure.test.ts` cannot catch a coverage-filtered count**, because it writes its own SQL rather
  than exercising the application's query builder. The analogous risk for D7 — a "remaining" figure that
  filters to qualifying responses instead of all responses — is the same shape and must not be papered over
  with a test that supplies its own rows. The guard has to assert the *filter the application used*.

## Open questions, carried into Apply

1. **Where does `created_at` sit relative to the existing `validation_sessions` timestamp handling?** Those
   are application-written; this must match, and the migration's backfill is the one place the two
   behaviours coexist.
2. **Does the lookup need its own index?** `(validator_id, created_at DESC, id DESC)` is the useful access
   path, but with no Supabase project there is no way to measure whether the existing
   `validation_batches_validator_id_idx` is insufficient. The index should be added on reasoning, and that
   reasoning stated, not on a measurement nobody can take.
