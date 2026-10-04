-- Per-response translation choice: each translation independently absent-or-non-blank.
--
-- FORWARD MIGRATION. No table, column, index, policy, or function is modified except the two
-- named constraints below. No existing migration file is modified.
--
-- ---------------------------------------------------------------------------
-- WHY WIDENING, AND WHY NO REFUSAL PRECONDITION
-- ---------------------------------------------------------------------------
-- The corrected methodology lets each evaluable response carry English, Filipino, both, or
-- neither, while `cannot_evaluate` still carries neither. The previous pair of directional
-- CHECKs demanded both translations together for every evaluable response, so they must go.
--
-- Widening accepts every row the old rule accepted: a row satisfying both directional
-- constraints satisfies the remaining one, and every row the old rule rejected for a missing
-- translation is now legitimate by design. The migration is therefore lossless by
-- construction — there is no data state to protect, no row to quarantine, and no placeholder
-- to fabricate. A refusal precondition would guard nothing: unlike the migration that
-- introduced these constraints, this one cannot strand a single existing row.
--
-- ---------------------------------------------------------------------------
-- WHAT REMAINS, AND WHY ONE CONSTRAINT IS ENOUGH
-- ---------------------------------------------------------------------------
-- Dropped:
--
--   - `validations_bilingual_pair_required_when_evaluable` (evaluable rows needed both
--     translations; per-response choice makes that false);
--   - `validations_bilingual_pair_absent_when_unevaluable` (superseded by the narrower
--     replacement below).
--
-- Added:
--
--   - `validations_no_translation_when_unevaluable` (`cannot_evaluate` carries neither
--     translation; passes every evaluable row unconditionally).
--
-- Kept untouched: the per-column not-blank checks on both translation columns (absent or
-- present-and-non-blank, exactly the per-language allowance the methodology requires), the
-- correction-evaluation consistency check, uniqueness, vocabulary, positions, RLS, and grants.
-- A blank translation is still refused — by the not-blank checks, which see it before any
-- directional rule could — so widening never admits a whitespace-only "translation".
--
-- A single directional constraint cannot compete with itself, so the evaluation-order hazard
-- the previous pair documented (two constraints rejecting one row, planner's choice of name)
-- has nowhere to occur. The per-column checks overlap it freely, as before: nothing depends on
-- rejection-name uniqueness across ALL constraints, and every name-matched rejection test sits
-- on a cell where exactly one constraint fires.

alter table public.validations
  drop constraint validations_bilingual_pair_required_when_evaluable;

alter table public.validations
  drop constraint validations_bilingual_pair_absent_when_unevaluable;

-- Owns: any `cannot_evaluate` row carrying either translation. Passes every evaluable row, so a
-- legitimate partial-translation row is never refused for the wrong reason.
alter table public.validations
  add constraint validations_no_translation_when_unevaluable check (
    evaluation <> 'cannot_evaluate'
    or (english_translation is null and filipino_translation is null)
  );
