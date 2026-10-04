# Design

## Context

See `proposal.md` — Why. The current rule (one response carrying evaluation,
correction, and both translations) is enforced in four places that must move
together: the UI form, the shared domain predicate, the database CHECKs, and
the export derivation. The subtlety is entirely in what pooled coverage does
to each of them.

## Goals / Non-Goals

**Goals**

- A validator can complete a response with English, Filipino, both, or
  neither translation, with no penalty and no implied ranking.
- Entry completion, allocation eligibility, dashboard figures, and export
  status all derive from one pooled rule over the same corpus.
- The database refuses malformed rows (blank translations, stray corrections,
  `cannot_evaluate` with translations) independently of application code.

**Non-Goals**

- Changing the four evaluations, correction requirements, `cannot_evaluate`
  semantics, session/attempt identity, reservations, or the raw export shape.
- Deciding the final multi-source adjudication rule (thesis team, Phase 12).

## Decisions

### D1 — Choice lives on the response, coverage lives on the entry

**Chosen:** per-response `translation_choice` is implicit in which fields are
non-blank (EN set / FIL set / both / neither); no discriminator column. The
UI offers the four-way choice; the server and database read the fields.

**Why.** The schema already forbids a language discriminator
(`domain-contracts` rule 6), and a choice column would be a second source of
truth that can disagree with the fields. Presence-means-chosen keeps one
fact in one place.

### D2 — Pooled rule as three pillars, not per-response qualifying

**Chosen:** valid judgment + covering EN + covering FIL per entry, each
possibly from a different response; `cannot_evaluate` contributes nothing.

**Why.** Any per-response "qualifying" notion would recreate the package
under another name and reintroduce the abandonment pressure this change
removes. The three-pillar form is the smallest vocabulary every consumer
(allocation, dashboard, export) can share without a second rule.

### D3 — Widen the CHECKs, don't version them

**Chosen:** one forward migration replacing the two directional bilingual
CHECKs with per-language allowance (each translation absent-or-non-blank;
`cannot_evaluate` carries neither).

**Why.** Widening accepts every row the old rule accepted, so the migration
is lossless by construction with no refusal precondition and no data
touching. The correction-evaluation consistency CHECK is untouched, as are
uniqueness, vocabulary, positions, RLS, and RPC grants.

### D4 — Export assembles per field, flags multi-source, never resolves

**Chosen:** `validated_ilocano` from the earliest valid judgment (correction
where required, else source instruction); each translation from its earliest
non-blank supplier; `source_validation_id` points at the Ilocano supplier;
`needs_review` true whenever fields come from more than one response or
evaluations/corrections disagree.

**Why.** Earliest-per-field is mechanical and stated openly, like the rule it
replaces. Multi-source flagging routes exactly the ambiguous records to the
thesis-approved adjudication that already owns them. No merge, no vote, no
preferred validator.

### D5 — Counts become contributions, figures stay the same set

**Chosen:** no new dashboard or export figures. Per-response flags become
contribution flags (judgment / EN-covering / FIL-covering); entry
complete/incomplete derives pooled; evaluation distribution and proficiency
breakdown are untouched.

**Why.** The figure list was approved as a set; this change redefines what
fills it, not what it contains. A new figure would need its own methodology
approval.

## Risks / Trade-offs

- **[Coverage slows if validators skip often.]** The pooled rule still
  completes entries from mixed rows; allocation keeps offering incomplete
  entries to new attempts. Mitigation: dashboard shows per-pillar coverage
  so the thesis team can see which pillar lags.
- **[Multi-source validated records.]** Mitigation: `needs_review` flags
  them; adjudication owns the final rule (recorded open question below).
- **[Legacy bilingual rows.]** Unaffected: every existing row satisfies the
  widened constraints, and pooled coverage counts old full packages
  (judgment + both coverings from one row) as complete.

## Migration Plan

One forward migration file replacing the two directional CHECKs. No data
migration, no backfill, no refusal precondition (widening is lossless).
Applied to the hosted project through the Management API, one request per
file, verified by re-reading `pg_constraint` — never by pasting into the SQL
Editor. Rollback is a no-op conceptually (re-narrowing would refuse
legitimate partial rows); the file is never rewritten.

## Open Questions

- **Final multi-source adjudication rule.** Deferred to the thesis team
  (Phase 12) by design. The export's mechanical assembly plus
  `needs_review` is the complete pre-adjudication behavior; nothing in this
  change depends on the answer.
