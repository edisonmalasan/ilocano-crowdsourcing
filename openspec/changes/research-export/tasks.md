# Tasks

## 1. Pure export serializers

- [x] 1.1 `src/lib/export/records.ts`: one export record per stored validation — entry id and
      category, validator id, self-reported proficiency, evaluation, correction, `english_translation`,
      `filipino_translation`, qualifying flag, timestamp. Verified with unit tests over a hand-built
      fixture asserting the exact key set (no extra key, none missing), each record's translations
      being that validator's own text, and absent fields exported as `null` rather than `""`.
- [x] 1.2 `src/lib/export/csv.ts`: RFC 4180 quoting — quote on comma, double quote, CR or LF; double an
      embedded quote; a header row from the key set. Verified with unit tests including a value
      containing all four, and a round-trip test using a TEST-LOCAL parser that throws on malformed
      CSV, so a writer emitting invalid quoting fails loudly instead of producing a quiet misreading.
- [x] 1.3 Summary assembly (in `records.ts`, beside the records it summarises): per-entry and
      per-category totals — qualifying, non-qualifying, stored, distinct validators, coverage-complete
      flag, review flag, coverage target. Verified over a hand-counted fixture; every number asserted
      exactly, and the per-category figures asserted to sum to the totals so the grouping cannot be
      decorative.
- [x] 1.4 Qualifying totals summed PER ENTRY, never counted globally. Verified with a fixture where
      the two answers differ: counted globally, `countQualifyingValidations` returns **3** (distinct
      QUALIFYING validators) where the correct total is **5**. The fixture comment predicted 4 and the
      measurement said 3, because the predicate skips non-qualifying responses before counting and the
      fourth validator abstained; the trap holds in kind and the correction is recorded in the test
      rather than smoothed over.

## 2. The no-merge invariant

- [x] 2.1 A unit test over the SERIALIZED artifact (not the input rows) asserting no string field in
      either document contains text belonging to two different validators, no field name implies a
      merge, no record field is an array or nested object, and each record's key set is EXACTLY the
      declared set. Verified by four can-fire mutants, each RED by name with green controls and
      byte-identical restores.
      **The probe found a real hole in the guard, not just in itself.** A `consensus_*` field added to
      a record's object literal left the test GREEN: the name check walked `EXPORT_RECORD_KEYS` and
      the top-level document keys, and a key in neither list appeared in both walks' blind spot.
      Typecheck would have caught the excess property, but a test that depends on typecheck is not a
      test — `vitest` runs without it. The closed key-set assertion and a per-record key walk now
      close it, and re-probing the same mutant goes red.
      **Two of this probe's own earlier mutants were corrupt and are worth recording**, because both
      scored a confident, meaningless RED: one referenced `entries` (in scope only inside
      `buildExportSummary`) and one referenced a constant declared in the TEST file. Each threw a
      ReferenceError on every call, so EVERY test failed — a red that says nothing about which
      assertion did the work. The probe now (a) refuses a mutant injecting an out-of-scope name
      before running it, and (b) reports `RED-BUT-CORRUPTED` when every test in the file fails
      rather than scoring that as RED.

## 3. The operator command

- [ ] 3.1 `scripts/export-research.ts` + `pnpm run export:research`: validates its environment locally
      (documented duplication of the env contract, as `import:dataset` does), reads the corpus through
      the repositories, writes `validations.json`, `validations.csv` and `summary.json` into a
      caller-named directory. Verify with unit tests over injected fakes: the file set written, the
      destination used, and a refusal carrying the destination when the write fails.
- [ ] 3.2 Read-only assertion: no route, page, or Server Action invokes the export, and the command
      performs no insert/update/delete against a research table. Verify with a source-text unit test
      plus can-fire controls pointed at real production writers.

## 4. Close out

- [ ] 4.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced.
- [ ] 4.2 Gate: run the real command against the hosted project and read the produced artifacts,
      asserting the record count matches the corpus and that both forms describe the same records.
      Report artifact paths and counts; never print research text.
- [ ] 4.3 `openspec change validate research-export --strict` exits 0.
- [ ] 4.4 Update `docs/ROADMAP.md` `## Project Status`.
- [ ] 4.5 Independent verification pass. No CRITICAL finding may survive, and no WARNING may be
      silently waived.
- [ ] 4.6 Merge with a merge commit only after 4.1–4.5 are green.
