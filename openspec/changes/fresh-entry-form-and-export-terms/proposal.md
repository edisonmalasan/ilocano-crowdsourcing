# Proposal

## Why

Three concrete defects/gaps in the validation and export surfaces, reported against the live app:

1. After submitting entry 1 of a batch, entry 2 can render with entry 1's evaluation, correction, translations, translation choice, and errors still in the form — so a participant can unknowingly submit one entry's answer for another.
2. The validated dataset carries no judgment metadata: a record cannot say which evaluation produced its validated sentence, which proficiency its author reported, or which response/attempt supplied it — while its raw IDs (`source_validation_id`) point at a response under a confusing name.
3. The raw export calls a response `validation_id` and an attempt `validator_id`, inviting exactly the person-confusion the methodology forbids.

## What Changes

- Each dataset entry begins with a genuinely fresh validation form: on entry change the evaluation, correction, both translations, translation choice, field errors, and pending state reset; attempt/session identity and batch progress are untouched. Hiding stale state without clearing the payload is explicitly not the fix.
- Validated records gain `category`, `evaluation`, `self_reported_proficiency` (all from the judgment supplier), `source_attempt_id`, and the rename `source_validation_id` → `source_response_id`, in both JSON and CSV. Pooled translation derivation, `needs_review` rules, and non-adjudication are unchanged; the new fields describe the judgment supplier only, never every translation, never a person.
- Raw export renames `validation_id` → `response_id` and `validator_id` → `attempt_id` (values and prefixes unchanged) in both JSON and CSV; no database migration, no primary-key change.
- Raw-response diagnostic fields (`qualifies_toward_completion`, `contributes_judgment`, `covers_english`, `covers_filipino`, `corrected_instruction`) stay raw-only.

## Capabilities

### New Capabilities

(none — this corrects existing behavior and terminology)

### Modified Capabilities

- `validation-experience`: entries begin with a fresh form; nothing stale survives an advance.
- `research-export`: validated records carry judgment metadata; export identifiers use response/attempt terminology consistently.

## Impact

- `src/app/validate/[batchId]/validation-form.tsx` (entry-scoped reset), `src/lib/export/records.ts`, `src/lib/export/validated.ts` (fields + renames), export tests, DOM regression test, `dom-harness` (`rerender`).
- No migration, no schema change, no new dependency, no copy change (labels untouched).
