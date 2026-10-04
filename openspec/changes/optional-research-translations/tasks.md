# Tasks

## 1. Domain rule (pooled coverage)

- [ ] 1.1 Replace the per-response qualifying predicate with the pooled
  three-pillar rule (valid judgment, covering EN, covering FIL) in the shared
  domain module, keeping the single-definition property. Verify: unit tests
  prove pooled coverage across mixed rows, `cannot_evaluate` contributes
  nothing, and raw counts never decide.
- [ ] 1.2 Update every in-code caller of the old predicate (allocation
  eligibility, dashboard overview, export summary, validated derivation) to
  the pooled rule with no second rule anywhere. Verify: the three-consumer
  agreement test passes over a mixed corpus.

## 2. Database migration (widen, lossless)

- [ ] 2.1 Write the forward migration replacing the two directional bilingual
  CHECKs with per-language allowance; correction-evaluation consistency,
  uniqueness, vocabulary, positions, RLS, and grants untouched. Verify:
  PGlite suite proves single-translation and translation-free evaluable rows
  insert, blanks and `cannot_evaluate`-with-translation still refuse, and
  every pre-existing fixture row still inserts.
- [ ] 2.2 Apply the migration to the hosted project through the Management
  API, one request per file, and verify by re-reading `pg_constraint` over
  the real wire. Verify: named-constraint read-back, research counts
  unchanged.

## 3. Validation experience (language choice)

- [ ] 3.1 Replace the required translation pair with the English / Filipino /
  both / skip choice; per-language inputs render conditionally; skip submits
  evaluation (+correction) with neither translation. Verify: DOM tests prove
  each choice submits the chosen fields only, empty submit sends nothing,
  and the write stays single-flight.
- [ ] 3.2 Re-parse with the same schema on the server for every choice
  combination, including blank-translation refusal. Verify: server-side
  tests for all four choices plus blank rejection.

## 4. Export and dashboard (pooled meanings)

- [ ] 4.1 Rework the validated-record derivation to per-field
  earliest-non-blank assembly with multi-source `needs_review`, and the
  per-response flags to contribution flags. Verify: export tests prove
  pooled assembly, multi-source flagging, and unchanged raw-document shape.
- [ ] 4.2 Recompute dashboard figures from pooled coverage with the same
  figure set; review flag from valid-judgment disagreement. Verify:
  dashboard tests over a mixed corpus.

## 5. Ledger and spec hygiene

- [ ] 5.1 Confirm `openspec validate --specs --strict` is **still 19** (deltas
  live under `openspec/changes/`, no new capability) and only one migration
  file was added, none modified.
- [ ] 5.2 Update `docs/ROADMAP.md` Project Status rows and verify
  `tests/unit/ledger-integrity.test.ts` passes.
- [ ] 5.3 Record the supersession in `AGENTS.md` durable product constraints
  the way that file records its own corrections (corrected rather than
  deleted): the "translations are required, bilingual, and never skipped"
  bullets now describe the pre-change rule. Verify: the entry names the new
  rule, the old text stays visible as superseded, and no other durable rule
  is altered.
