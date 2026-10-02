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

- [x] 3.1 `scripts/export-research.ts` + `pnpm run export:research`: validates its environment
      locally (documented duplication of the env contract, as `import-dataset` does), reads the
      corpus through the repositories, writes `validations.json`, `validations.csv` and
      `summary.json` into a caller-named directory. Verified with 17 unit tests over injected
      sources and a temporary directory: the file set written, the destination used and created, the
      refusal naming the destination when a write cannot happen, and every `main` refusal.
      **The gate probe against the real hosted project found a bug a unit test over a hand-built argv
      could not**: `pnpm run <script> -- <args>` forwards the `--` separator as a literal argument, so
      the command refused the exact invocation its own error message tells the operator to type. The
      separator is now dropped explicitly, and the reason is recorded at the code.
      **The command runs with `--conditions=react-server`**, which is how it reaches the `server-only`
      repository implementations at all: that package's entry point THROWS outside a Server Component
      render (measured), and its own `exports` map sends the `react-server` condition to `empty.js`.
      The alternatives were measured and rejected in the header — importing `@/lib/env/server` has
      the same problem, and widening the `WITHOUT_SERVER_ONLY` exemption list would have meant new
      query logic outside the repository boundary rather than reusing it.
- [x] 3.2 Read-only assertion: no route, page, or Server Action imports the export or its module,
      and the command performs no insert/update/delete against a research table. Verified with a
      source-text unit test (shape-tolerant write-call patterns, both directive quote styles, an
      enumerated filesystem-call count, and an exact list of the three artifact names) plus can-fire
      controls pointed at real production writers.
      **An existing guard in `tests/unit/import-dataset-command.test.ts` failed on this file and was
      right to.** It asserted "no script under `scripts/` writes anything", which was equivalent to
      "the import writes nothing" only while `scripts/` held exactly one file; the approved export
      requirement makes the blanket form false. It was narrowed by NAMING the one exempt script, and
      STRENGTHENED with a check that was never stated before and matters more: **no script may write
      into `data/`**, the immutable research source.

## 4. Close out

- [x] 4.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced. Measured: lint 0,
      format 0, typecheck 0, unit **68 files / 1577 tests**, dom **7 / 87**, integration **12 / 197**,
      build "Compiled successfully", change valid, `--specs` **14/14**.
- [x] 4.2 Gate: the real command run against the hosted project. Exit 0; **600 active dataset
      entries read, 0 stored validation responses, 0 validator profiles**; the three artifacts
      written into a temporary directory and verified to agree with each other (summary's stored
      count equals the JSON record count, the qualifying total equals the records flagged qualifying,
      the CSV line count equals records + 1 header, the CSV header equals the declared key set, and
      no key name implies a merge). **PARTIAL, and recorded as such: the hosted corpus holds ZERO
      validations** — no validator has submitted yet — so no record-level behaviour was exercised
      against real data. Record content is proven by unit tests over a fixture only. The probe was
      deleted afterward and never committed, and it prints counts, keys and shapes: no research text,
      no instruction, and no credential value.
- [x] 4.3 `openspec change validate research-export --strict` exits 0. **It caught a real mistake
      first**: a scripted edit of this file dropped the `## 4. Close out` heading, and the validator
      reported six `tasks.md` warnings about group numbering before that. Repaired, not waived.
- [ ] 4.4 Update `docs/ROADMAP.md` `## Project Status`.
- [ ] 4.5 Independent verification pass. No CRITICAL finding may survive, and no WARNING may be
      silently waived.
- [ ] 4.6 Merge with a merge commit only after 4.1–4.5 are green.
