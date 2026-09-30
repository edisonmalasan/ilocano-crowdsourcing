# Tasks — required bilingual research translations

## 1. Domain contract

- [x] 1.1 Replace `translationLanguage` / `translationText` with `englishTranslation` and
      `filipinoTranslation` on the domain response type, keeping the existing NULL-to-absent-key
      convention.
- [x] 1.2 Rewrite Zod integrity rules 5 and 6 in `src/schemas/validation.ts`: both translations
      required for evaluable evaluations, both absent for `cannot_evaluate`.
- [x] 1.3 Add blank-value rejection for both translations, matching the existing correction rule
      rather than a bare non-empty check.
- [x] 1.4 Remove the now-unreachable `TRANSLATION_LANGUAGE_CHOICES` export and every reference to
      it, including test imports.
- [x] 1.5 Add `isQualifyingValidation` as a pure function in the domain layer, with the full
      definition from the specification and no database or repository dependency.
- [x] 1.6 Update the archived copy of the superseded requirement reference in code comments so no
      comment claims translation is optional.

## 2. Database

- [x] 2.1 Add `supabase/migrations/<timestamp>_required_bilingual_translations.sql`.
- [x] 2.2 Implement the precondition as a raised exception naming the conflict, and place it
      **before** the column removal.
- [x] 2.3 Add `english_translation` and `filipino_translation`, both nullable.
- [x] 2.4 Add non-blank checks on both columns using `btrim(...) > 0`, not `IS NOT NULL`.
- [x] 2.5 Add the named cross-column consistency constraint covering all four quadrants.
- [x] 2.6 Drop `translation_language` and `translation_text`.
- [x] 2.7 Add an index supporting the coverage query if the existing index does not serve it.
- [x] 2.8 Record the new migration in `supabase/migrations/README.md`, including that the PGlite
      harness applies migrations in filename order and provides no `auth.users` table.
- [x] 2.9 Do **not** modify `20260930120000_research_schema.sql`. Verify it is byte-identical
      afterwards.

## 3. Repository and boundary

- [x] 3.1 Update the row type and `VALIDATION_COLUMNS` in `src/lib/repositories/supabase/validations.ts`.
- [x] 3.2 Update `toDomain` to map both new columns using the absent-key convention, and `toRow` to
      write `?? null`.
- [x] 3.3 Confirm no code path still selects or writes the removed columns.
- [x] 3.4 Update the repository interface documentation and any export representation that names a
      translation language.

## 4. Verification

- [x] 4.1 Domain tests: every acceptance and every rejection in the `domain-contracts` delta, each
      matched to the requirement it proves.
- [x] 4.2 `isQualifyingValidation` tests covering the four evaluable shapes, `cannot_evaluate`, a
      missing English translation, a missing Filipino translation, and a blank translation.
- [x] 4.3 Repository tests for both columns in each direction, including a row that reads back with
      the keys **absent** rather than `null`, since a `null` would fail its own integrity rules.
- [x] 4.4 PGlite tests proving the database **rejects**: evaluable missing English; evaluable blank
      English; evaluable missing Filipino; evaluable blank Filipino; `cannot_evaluate` with
      English; with Filipino; with both; correction-required without correction; correction on
      `correct_natural`.
- [x] 4.5 PGlite tests proving the database **accepts**: `correct_natural` with both translations;
      `correct_unnatural` with correction and both; `incorrect` with correction and both;
      `cannot_evaluate` with no correction and no translations.
- [x] 4.6 Every rejection test matched against the **named** constraint, never a generic
      `check constraint` pattern, which passes when the wrong constraint fires.
- [x] 4.7 A test that seeds a pre-existing evaluable row, applies the migration set, and observes
      the precondition failing by name. The migration's safety claim must be exercised, not merely
      documented.
- [x] 4.8 A test proving the migration succeeds and removes the superseded columns when only
      `cannot_evaluate` rows exist.
- [x] 4.9 A test asserting `20260930120000_research_schema.sql` is unchanged by this change.
- [x] 4.10 Confirm the dataset immutability guard still passes and the synthetic dataset blob is
      unchanged.

## 5. Documentation

- [ ] 5.1 `AGENTS.md`: update only the affected durable product rules. Do not touch Git, OpenSpec,
      testing, security, orchestration, design, or boundaries sections.
- [ ] 5.2 `docs/ROADMAP.md`: confirm the phases, MVP scope, and definition of success match what
      this change implements rather than what the proposal intended.
- [ ] 5.3 Record the migration precondition as an operational note: what it refuses, why, and what
      an operator should do if it fires.

## 6. Verification stage

- [ ] 6.1 `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck` exit 0.
- [ ] 6.2 `pnpm run test:unit` and `pnpm run test:integration` exit 0, with counts read off the
      command output and recorded.
- [ ] 6.3 `pnpm run build` reports `Compiled successfully`.
- [ ] 6.4 `openspec validate required-bilingual-translations --strict` exits 0.
- [ ] 6.5 Independent verification round, with findings classified and blocking defects repaired
      before merge.

## Out of scope for this change

- The validation screen that collects both translations. That is Phase 5.
- Coverage-aware allocation consuming `isQualifyingValidation`. That is Phase 4, and it must not be
  built until this change lands.
- Interface localization. Proposed separately, as `bilingual-interface-localization`.
- The 21 deferred client-shell call sites and the browser test runner. Carried forward as
  `thin-shell-call-sites`.

## Notes for the implementer

- The temptation in task 1.2 is to keep a language discriminator "for flexibility". That is the
  representation this change exists to remove, and `design.md` records why a child table is the
  right shape *if* a third language is ever required. Do not reintroduce the discriminator.
- Task 2.2 and task 2.6 have an ordering dependency. The check must precede the drop, or the drop
  becomes lossy without anyone noticing.
- Task 4.6 is not pedantry. A generic `check constraint` matcher passes when the wrong constraint
  fires, which produces a green test that proves nothing.
