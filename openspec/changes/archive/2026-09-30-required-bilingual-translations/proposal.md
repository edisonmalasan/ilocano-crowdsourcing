# Required bilingual research translations

## Why

The thesis methodology now requires that **every evaluable validation carries both an English and a
Filipino translation** of the validated Ilocano sentence. The platform currently models a single
**optional** translation, identified by a language discriminator:

```text
translation_language   one of english | filipino | null
translation_text
```

That representation cannot express the new requirement, and the mismatch is not cosmetic. It
admits states the research now forbids, and it omits states the research now requires:

- it accepts a `correct_natural` response with **no** translation, which must now be rejected;
- it accepts a response carrying **only** an English translation, which must now be rejected;
- it has no way to say "English and Filipino are both required together".

This matters for more than data entry. Coverage is defined in terms of these responses, so a
representation that cannot tell a complete bilingual response from a half-finished one cannot
compute whether an entry is finished. The `domain-contracts` specification states this directly
today, and it is the behaviour being replaced:

> #### Scenario: Translation is optional
>
> - **WHEN** a response for evaluation `correct_natural` is submitted with no translation
> - **THEN** validation succeeds

Until this change lands, **Phase 4 must not be implemented**, because its allocation logic would
count responses that the approved methodology says do not count.

This change is deliberately **not** bundled with bilingual interface localization. The two features
share the word "translation" and nothing else: one is validator-authored research data about a
dataset entry, the other is browser-local presentation state for the website. Merging them would
produce a change whose ownership is unclear and whose tests would be entangled. Interface
localization is proposed separately, after this one lands.

## What Changes

### Research response

- **Both translations become required for every evaluable validation.** A `correct_natural`,
  `correct_unnatural`, or `incorrect` response SHALL carry a non-empty English translation and a
  non-empty Filipino translation.
- **The translations describe the *validated* Ilocano sentence.** Where a correction was required,
  both translations translate the **correction**, not the pre-correction wording.
- **`correct_natural` accepts no correction.** The original synthetic instruction is the validated
  Ilocano sentence for that response.
- **`cannot_evaluate` carries neither translation.** Its response is still persisted where
  appropriate for the research record.
- **There is no skip-translation option** for an evaluable response.

### Data model

- `validations` gains **`english_translation`** and **`filipino_translation`**, and the
  `translation_language` / `translation_text` pair is **dropped**.
- A **forward migration** is added. Migration history is not rewritten, and the archived
  specifications that described the previous model are not edited as though it never existed.

### Coverage and allocation semantics

- A **QUALIFYING completed validation** is defined. It requires an evaluable evaluation, any
  required correction present, both translations non-empty, all integrity checks satisfied, and a
  **distinct** anonymous validator.
- `cannot_evaluate` counts **zero**. A partial response counts **zero**. A legacy or incomplete
  response missing either translation counts **zero**.
- The raw validation count SHALL NOT be used as a proxy for coverage.
- An entry leaves normal allocation at the configured target of qualifying validations (initial
  target **3**). A fourth validator is **not** collected merely because free-text corrections or
  translations disagree; the disagreement is flagged for researcher adjudication instead.

### Enforcement

- The Zod schema, domain types, database constraints, repository row mapping, explicit column
  selection, and exports all change together, so no layer can accept a shape another rejects.

## Impact

- **Affected capabilities:** `domain-contracts` (the response contract and its integrity rules),
  `research-schema` (the `validations` table, its constraints, and the migration set).
- **Affected code:** `src/schemas/validation.ts`, `src/lib/domain/validation-response.ts`,
  `src/lib/repositories/supabase/validations.ts`, and a new forward migration under
  `supabase/migrations/`.
- **Affected tests:** the domain integrity tests, the repository row-mapping tests, and the
  PGlite schema tests, which must be extended to prove each rejection and each acceptance.
- **Migration is forward-only and guarded.** See `design.md` for the precondition that refuses the
  migration rather than silently discarding research rows, and for why that precondition is
  provably lossless.
- **No user-visible change yet.** The validation screen that collects both translations is Phase 5
  work. This change makes the *representation and the rules* correct first, so that Phase 4 and
  Phase 5 are built against requirements rather than against a superseded model.
- **Not a data migration of existing production data.** No environment has ever held a row: all
  three Supabase credentials are absent and no client has ever been constructed. The migration is
  written for the case where that changes before it is applied, and it fails loudly rather than
  quietly if it is wrong.
