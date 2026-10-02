# Tasks

## 1. Pure export serializers

- [ ] 1.1 `src/lib/export/records.ts`: build one export record per stored validation — entry id and
      category, validator id, self-reported proficiency, evaluation, correction, `english_translation`,
      `filipino_translation`, qualifying flag, timestamps. Verify with unit tests over a hand-built
      fixture asserting the exact key set (no extra key, none missing) and that each record's
      translations are that validator's own text.
- [ ] 1.2 `src/lib/export/csv.ts`: RFC 4180 quoting — quote on comma, double quote, CR or LF; double an
      embedded quote; a header row from the record keys. Verify with unit tests including a value
      containing all four, and a round-trip parser test in the test file that parses the CSV back and
      asserts equality with the original text.
- [ ] 1.3 `src/lib/export/summary.ts`: per-entry and per-category totals — qualifying, non-qualifying,
      stored, distinct validators, coverage-complete flag, review flag, coverage target. Verify with
      unit tests over a hand-counted fixture; every number asserted exactly.
- [ ] 1.4 Qualifying totals summed PER ENTRY, never counted globally (`countQualifyingValidations`
      dedupes by validator across its whole input). Verify with a fixture where the global count and
      the summed per-entry count differ, asserting the sum is what ships.

## 2. The no-merge invariant

- [ ] 2.1 A unit test over the SERIALIZED artifact (not the input rows) asserting no string field in
      either document contains text belonging to two different validators, and that no field name
      implies a consensus. Verify by mutating the serializer to concatenate two validators' English
      text and watching the named test go red, with green controls and a byte-identical restore.

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
