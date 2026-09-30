-- Required bilingual research translations.
--
-- Supersedes the single OPTIONAL translation pair (`translation_language`, `translation_text`) with
-- two REQUIRED columns (`english_translation`, `filipino_translation`). The previous representation
-- admitted states the research now forbids and had no way to state states the research now
-- requires, so it could not be extended. This is a FORWARD migration: the original
-- `20260930120000_research_schema.sql` is not modified, and no archived specification is rewritten.
--
-- ---------------------------------------------------------------------------
-- WHY THIS MIGRATION REFUSES RATHER THAN REPAIRS
-- ---------------------------------------------------------------------------
-- The new invariant must reject an evaluable row that is missing its English translation. Under the
-- previous schema, translation was OPTIONAL, so an evaluable row with no translation at all is
-- legal and expected. The two requirements therefore collide on exactly the rows that already
-- exist, and every way of resolving that collision is worse than refusing:
--
--   * Weaken the constraint for old rows. The database would permanently be able to hold a record
--     the domain schema refuses. The bilingual guarantee becomes a convention rather than a
--     constraint, which is precisely the gap this migration exists to close.
--   * Delete or quarantine the rows. Research data is never discarded as ordinary feature work.
--   * Backfill a placeholder. That fabricates research data, which is the worst option available.
--   * Assume the table is empty. That happens to be true today, and it is unfalsifiable later. An
--     assumption written into a migration is indistinguishable from a fact until the day it is
--     wrong, and the day it is wrong is the day a deployment fails with a constraint violation
--     instead of a clear explanation.
--
-- So this migration RAISES and refuses to apply. The message names the conflict and states what
-- this migration will NOT do, so an operator reading the failure knows the resolution is theirs and
-- not a bug to retry.
--
-- ---------------------------------------------------------------------------
-- WHY THE REFUSAL IS LOSSLESS WHEN IT PASSES
-- ---------------------------------------------------------------------------
-- If the precondition passes, every pre-existing row is `cannot_evaluate`. Under the previous
-- schema a `cannot_evaluate` row was permitted to carry no translation, so such a row holds no
-- translation data AT ALL. Dropping `translation_language` and `translation_text` therefore
-- discards nothing: the drop is information-preserving BECAUSE OF the check that ran first.
--
-- ---------------------------------------------------------------------------
-- ON THE ORDERING, WHICH IS NOT WHAT AN EARLIER DRAFT OF THIS COMMENT CLAIMED
-- ---------------------------------------------------------------------------
-- An earlier version of this file argued that check-then-drop is "load-bearing" and that
-- drop-then-check "would be lossy without anyone noticing". That claim was FALSE, and a probe
-- established why: this file is applied inside a transaction, so a `raise exception` rolls the
-- whole file back and a drop that had already executed is undone with it. The test written to
-- detect the reversal passed with the reversal in place, because there was nothing to detect.
--
-- The ordering therefore still holds — it is simply not defended by transaction rollback, and
-- relying on rollback is the wrong defence for a file that may be applied by a runner which
-- executes statements outside a transaction. Two properties below make the order safe on its own
-- terms rather than by accident:
--
--   1. The precondition reads only `evaluation`, so it is unaffected by whatever else has run.
--   2. The FIRST check inside the `do` block below raises if `translation_language` is already
--      absent. A drop-then-check file therefore refuses loudly, naming this precondition, instead
--      of quietly proceeding from a schema that has already lost the columns holding the data.
--      That is the behaviour the earlier comment asserted and did not have. It is an inline block,
--      not a named function, so there is nothing to call and nothing that can be silently dropped
--      from the file.
--
-- The residual real hazard is narrow and is recorded rather than hidden: a runner that applies
-- this file outside a transaction and reaches the drop before the precondition would lose the
-- columns. That runner is not the PGlite harness and is not `supabase db push`, and no such
-- runner is configured in this repository.

do $$
begin
  -- Property (2) from the ordering note above: the drop must not already have happened. Without
  -- this, a drop-then-check file would run its precondition against a schema that had already lost
  -- the columns holding the data it is supposed to protect.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'validations'
      and column_name = 'translation_language'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'required-bilingual-translations: translation_language is already absent, so this '
                'migration has been applied before or its statements are running out of order. The '
                'precondition must run BEFORE the superseded columns are dropped, because the drop '
                'discards the data the precondition exists to protect. Re-apply from a clean state.';
  end if;

  if exists (
    select 1
    from public.validations
    where evaluation <> 'cannot_evaluate'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'required-bilingual-translations: this database holds pre-existing evaluable '
                'validations, which cannot satisfy the required bilingual invariant because a '
                'single translation was permitted and two are now required. This migration will '
                'not discard them, will not fabricate translations to satisfy the new constraint, '
                'and will not weaken the constraint to accommodate them. Resolve the existing rows '
                'first, then reapply.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The two required translations
-- ---------------------------------------------------------------------------
-- Nullable, because `cannot_evaluate` must carry NEITHER translation. `NOT NULL` would be the wrong
-- tool: the requirement is conditional on the evaluation, and a per-column constraint cannot
-- express a condition. The cross-column check below states it once, properly.

alter table public.validations
  add column english_translation  text,
  add column filipino_translation text;

-- Absent or present-and-non-blank, matching the existing corrected_instruction rule. A bare
-- `IS NOT NULL` test would accept `'   '`, which satisfies a not-null check while carrying no
-- translation at all — the same defect class the corrected_instruction check already guards against,
-- and the reason that check uses `btrim`.
alter table public.validations
  add constraint validations_english_translation_not_blank check (
    english_translation is null or length(btrim(english_translation)) > 0
  );

alter table public.validations
  add constraint validations_filipino_translation_not_blank check (
    filipino_translation is null or length(btrim(filipino_translation)) > 0
  );

-- ---------------------------------------------------------------------------
-- The cross-column consistency constraints
-- ---------------------------------------------------------------------------
-- Every constraint above constrains ONE column, and a row can satisfy all of them while being a
-- record the domain schema rejects. Two quadrants remain open:
--
--   * an evaluable row missing either translation, which passes both not-blank checks vacuously;
--   * a `cannot_evaluate` row carrying either translation, which is a rendering of content the
--     validator explicitly said they could not judge.
--
-- Written to mirror `applyValidationIntegrityRules` in `@/schemas/validation` EXACTLY — neither
-- wider, which would refuse a legitimate response, nor narrower, which would be dead weight that
-- merely looks like a guarantee.
--
-- WHY TWO CONSTRAINTS AND NOT ONE, WHEN ONE LOOKS SUFFICIENT
--
-- The obvious single-constraint form is an equivalence:
--
--     (evaluation = 'cannot_evaluate') = (english is null and filipino is null)
--
-- It reads as though it covers everything. It does not. With `evaluation = 'correct_natural'` and
-- only `english_translation` populated, the left side is false and the right side is false, so the
-- equality HOLDS and the half-translated row is accepted. An equivalence states that two conditions
-- agree, not that either one is individually required; the one-sided requirement is the part it
-- cannot express.
--
-- So the rule is split, and the split is chosen so that THE TWO BILINGUAL CONSTRAINTS NEVER BOTH
-- REJECT A ROW. This is not tidiness — PostgreSQL does not promise the order it evaluates CHECK
-- constraints in, so if two constraints reject the same row, the name in the error message is
-- whichever the planner happened to reach first. Every rejection test in
-- `tests/integration/research-schema.test.ts` matches a constraint BY NAME, and with overlapping
-- constraints those tests would be asserting an accident of evaluation order. Measured, not
-- assumed: an earlier draft of this migration used the equivalence above, and the test for "an
-- evaluable row with no translations" failed because `validations_bilingual_pair_matches_evaluation`
-- fired instead of the constraint that test names.
--
-- The claim is scoped to THOSE TWO constraints. An earlier draft of this comment overstated it
-- as "every quadrant has exactly one owning constraint", and that is false. Measured: 80 of
-- the 108 (evaluation x correction x english x filipino) cells are rejected by more than one
-- constraint, because the per-column not_blank checks and the correction constraint overlap
-- them freely. Nothing depends on those being unique, and every name-matched rejection test was
-- checked against the overlap list and sits on a cell where exactly one constraint fires.
-- Stating the broader claim would be precisely the kind of overstatement this repository keeps
-- recording.
--
-- None of the four columns involved can make either predicate evaluate to NULL: each is tested with
-- `IS NULL` or `IS NOT NULL`, and `evaluation` is NOT NULL. So neither can pass vacuously, which is
-- how a SQL `CHECK` usually leaks a row it was meant to exclude.
--
-- NAMED, so a failure identifies which rule fired. The test matches on the constraint NAME rather
-- than the generic phrase `check constraint`, because a generic pattern passes when the wrong
-- constraint fires.

-- Owns: any evaluable row missing either translation. Passes every `cannot_evaluate` row.
alter table public.validations
  add constraint validations_bilingual_pair_required_when_evaluable check (
    evaluation = 'cannot_evaluate'
    or (english_translation is not null and filipino_translation is not null)
  );

-- Owns: any `cannot_evaluate` row carrying either translation. Passes every evaluable row, so it
-- never competes with the constraint above.
alter table public.validations
  add constraint validations_bilingual_pair_absent_when_unevaluable check (
    evaluation <> 'cannot_evaluate'
    or (english_translation is null and filipino_translation is null)
  );

-- ---------------------------------------------------------------------------
-- Removing the superseded representation
-- ---------------------------------------------------------------------------
-- Provably lossless here, and only here: the precondition above established that every remaining row
-- is `cannot_evaluate`, and a `cannot_evaluate` row carried no translation data.
alter table public.validations
  drop column translation_language,
  drop column translation_text;

-- ---------------------------------------------------------------------------
-- Index for the coverage query
-- ---------------------------------------------------------------------------
-- Allocation recomputes coverage across the candidate pool on every batch request, and the new
-- count filters on the two translation columns. The existing `validations_dataset_entry_id_idx`
-- already covers the entry lookup that dominates that query, and a partial index would only pay off
-- once the qualifying fraction is known to be small — which is not measurable until a project exists.
-- Adding one now would be an unmeasured guess at a query shape. Recorded as a deliberate omission
-- rather than an oversight: if coverage queries are ever slow in production, this is the index to
-- add first, and it will be added against a measured plan rather than a predicted one.
