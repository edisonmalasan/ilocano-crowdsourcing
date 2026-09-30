# Design — required bilingual research translations

## Context

The previous model is a **single optional translation** selected by a language discriminator. The
new model is a **required pair** for evaluable responses. That is a change of kind, not of degree:
a discriminator can be extended to more languages, a required pair cannot.

The genuinely hard part is not the new columns. It is the collision between the new invariant and
any row that already exists, and it must be resolved deliberately rather than discovered in a
database.

## Goals

- Evaluable responses carry both translations; the database rejects anything else.
- Coverage is computed from **qualifying** responses, and the definition lives in one place.
- The forward migration cannot silently destroy or silently invalidate research data.
- The change is verifiable with executable evidence at every layer, not by convention.

## Decisions

### 1. Two explicit columns, not a normalised child table

```sql
english_translation   text
filipino_translation  text
```

**Considered: a `validation_translations(validation_id, language, text)` child table.** This would
generalise to more languages and would let a language be added without a migration.

Rejected for now. It buys a generalisation the methodology has not asked for, and it costs a join
on the hottest research path in the platform: the coverage count runs per candidate entry on every
batch request. It also makes "both required" a two-row anti-join rather than a single constraint,
which is strictly harder to enforce in the database and harder to test. The requirement says to
prefer a normalised structure **only if the design identifies a concrete advantage**; the concrete
advantage here is negative.

The decision is recorded rather than buried, because it is the one that will be revisited first if
a third language is ever required. At that point the child table is the right shape, and this
change is the last cheap moment to choose it.

### 2. Nullable columns plus a cross-column constraint, not `NOT NULL`

The columns are nullable because `cannot_evaluate` must carry neither. Expressing "required only
for evaluable evaluations" as `NOT NULL` would be wrong, and expressing it as a nullable pair with
a cross-column check is the standard way to state it:

```sql
constraint validations_bilingual_pair check (
  (evaluation = 'cannot_evaluate' AND english_translation IS NULL AND filipino_translation IS NULL)
  OR
  (evaluation <> 'cannot_evaluate'
     AND english_translation IS NOT NULL AND length(btrim(english_translation)) > 0
     AND filipino_translation IS NOT NULL AND length(btrim(filipino_translation)) > 0)
)
```

Blank-but-not-null must be rejected too, so `btrim(...) > 0` appears on both. A constraint that
merely tested `IS NOT NULL` would accept a whitespace-only translation, which is the same defect
class this project has already been bitten by once in the correction column.

### 3. The forward migration carries a precondition that REFUSES rather than repairs

This is the decision that needs the most justification, so it is stated as a problem first.

**The collision.** The new schema must reject an evaluable row missing English. Under the old
schema, translation was optional, so an evaluable row with no translation is *legal and expected*.
Any such row violates the new constraint the moment the columns are added. So:

- the migration cannot simply add the columns and add the constraint;
- it cannot add the columns and backfill, because no process can invent a Filipino translation;
- it must not weaken the constraint to grandfather old rows, because that constraint is the
  research guarantee this change exists to establish;
- it must not delete or quarantine the rows, because `AGENTS.md` forbids discarding research data
  as ordinary feature work.

**The decision.** The migration **raises an exception and refuses to apply** when it finds a row it
cannot legally carry forward:

```sql
do $$
begin
  if exists (select 1 from public.validations where evaluation <> 'cannot_evaluate') then
    raise exception using
      errcode = 'check_violation',
      message = 'required-bilingual-translations: pre-existing evaluable validations exist and '
                'cannot satisfy the required bilingual invariant. Resolve them before applying '
                'this migration. It will not discard research data and will not weaken the '
                'constraint.';
  end if;
end $$;
```

**Why this is the honest option.** Failing loudly is only defensible if the failure is *actionable*.
It is: the message says what is wrong and what will not happen. The alternatives are worse in
specific ways:

- *Weaken the constraint for old rows* — leaves the database permanently able to hold a row the
  domain refuses, so the guarantee is a convention rather than a constraint. That is exactly what
  this project exists to avoid.
- *Delete the rows* — forbidden, and destroys data.
- *Backfill a placeholder* — fabricates research data. The single worst option available.
- *Assume the table is empty* — true today, and unfalsifiable later. An assumption written into a
  migration is indistinguishable from a fact until the day it is wrong.

**Why the precondition is provably lossless when it passes.** If the check passes, every existing
row is `cannot_evaluate`, and a `cannot_evaluate` row under the old schema is permitted to carry no
translation. Such a row therefore holds **no translation data at all**, so dropping
`translation_language` and `translation_text` discards nothing. The drop is not merely tolerable
after the check; it is information-preserving *because of* the check.

**The ordering is correct, but not for the reason originally claimed here, and that matters.** An
earlier draft of this section said check-then-drop "is load-bearing and must not be reversed", on the
reasoning that a reversal would be lossy "without anyone noticing". A probe falsified that: the
PGlite harness applies each migration file inside a transaction, so the `raise exception` rolls the
file back and a drop that had already executed is undone with it. **A test asserting "the columns
are still there after the refusal" passes with the ordering reversed**, because rollback erases the
evidence of everything that ran before the failure. Inside a transaction, no post-failure assertion
can distinguish "the check ran first" from "the drop ran first".

So the ordering is now enforced *in the artefact* rather than argued in a comment. The precondition
first asserts that `translation_language` still exists and raises by name if it does not, so a
drop-then-check file fails loudly instead of quietly proceeding from a schema that has already lost
the columns holding the data. That assertion is genuinely red-on-reversal, and it is the only one of
the file's tests that measures the ordering rather than the outcome.

The residual hazard is narrow and is recorded rather than hidden: a runner that applies this file
outside a transaction and reaches the drop before the precondition would lose the columns. No such
runner is configured in this repository — not the PGlite harness, not `supabase db push`.

**It is testable.** The precondition is a behaviour, so it gets a test: seed a violating row, run
the migration set, assert it fails, and assert the named reason. A migration that cannot be shown
to refuse is a migration whose safety argument is untested. Note that the *obvious* negative control
for that test does not work: `ADD CONSTRAINT ... CHECK` validates existing rows, so the migration
refuses even with the precondition deleted. The control therefore asserts the difference the
precondition actually makes — an explanatory failure rather than a bare constraint violation.

### 4. The qualifying-validation predicate lives in one pure function

Coverage correctness is a domain question, not a query detail, and the same predicate is needed by
the allocator, the admin dashboard, and the export. It is therefore one exported pure function
over the domain response type:

```ts
export function isQualifyingValidation(response: ValidationResponse): boolean
```

**Considered: computing it in SQL.** Rejected. A SQL expression would be a second, independent
implementation of the rule, and the two would drift — which is the failure mode this project has
already recorded five times, where a record claimed more than the code enforced. One definition,
one set of tests.

**Considered: adding a stored generated column.** Rejected. It would make the database agree with
the domain, which is attractive, but it is a second implementation in a second language inside the
database engine, and PGlite is not Supabase, so the evidence for it would be weaker than the
evidence for the function. The function is the single source; the database enforces the *invariants*
of a response, and the *meaning* of coverage is a domain concern.

**A second function, because the spec has two scenarios a single response cannot satisfy.** Coverage
is a question about a *set*, and a set has two properties one response does not: not every response
qualifies, and a validator counts once. `isQualifyingValidation` answers only the per-response half
and deliberately does not try to guess the rest — distinctness belongs to the set, and the integrity
checks are already guaranteed by the column constraints. So
`countQualifyingValidations(responses): number` is built directly on the predicate and adds only the
distinct-validator count:

```ts
export function countQualifyingValidations(responses: readonly CoverageResponseShape[]): number
```

It is not a second definition of the same rule; it is the set-level half of the one rule, and the
per-response predicate remains the only place that decides what "qualifying" means. Both spec
scenarios it covers are testable now, and neither needs the Phase 4 allocator to exist first. The
duplicate-validator branch is unreachable through the repository, because `UNIQUE (validator_id,
dataset_entry_id)` makes one response per validator per entry structurally impossible, and it is
exercised in a test anyway — a branch that cannot be reached is a branch that is never run.

**Considered: collapsing `requiresBilingualTranslations` into `isTranslatableContent`.** Done, in the
other direction. Both existed as two names over one implementation, on the theory that a caller
might want the "is a translation permitted?" reading. There is no such reading under this
methodology — a translation is never merely permitted — so the second name had no caller outside
its own tests, and `AGENTS.md` prohibits speculative abstractions. The names will genuinely diverge
if a third target language is ever approved, and that change should introduce the split with a real
caller attached rather than this change carrying a placeholder in advance.

### 5. Both Server Action payloads and the row mapping change together

The repository maps `NULL` to an **absent key** rather than to `null`, and that decision is
load-bearing: mapping a `NULL` translation to an explicit `null` would make a legitimate
`cannot_evaluate` row fail its own integrity rules the moment it was read back. The new columns
inherit exactly that treatment, and the mapping is where a silent asymmetry would hide — a row read
that produced `{ englishTranslation: null }` instead of omitting the key would be a bug that only
appears on a read path, long after the write succeeded.

## Risks

| Risk | Mitigation |
| --- | --- |
| The precondition is wrong and blocks a real deployment | It is the only option that does not destroy data, fabricate it, or weaken the guarantee. Its message states the problem and what it will not do. |
| Coverage drifts from the domain rule | One pure function, no second implementation. Tests assert the function directly and assert that allocation calls it. |
| A legacy row appears between proposal and apply | That is precisely the case the precondition exists for, and it is now a loud failure rather than a silent corruption. |
| The two translations are confused with interface localization | Separate change, separate vocabulary, and `domain-contracts` deltas touch no locale concept at all. |
| A blank translation passes a `NOT NULL` check | `btrim(...) > 0` is asserted in the constraint and in a test that submits whitespace only. |

## Migration Plan

1. Apply the precondition check.
2. Add `english_translation` and `filipino_translation`.
3. Add the non-blank checks and the cross-column consistency constraint.
4. Drop `translation_language` and `translation_text`.

One forward migration file, applied in filename order after the existing research-schema migration.
No existing migration file is modified. No archived specification is edited.

## How the specification expresses the replacement, and why

The `domain-contracts` delta **removes** the existing requirement and **adds** a replacement,
rather than modifying it. That was not the first approach, and the first approach was rejected by
`openspec validate --strict` for a reason worth recording, because it will recur in any future
change that reverses an approved behaviour.

A `MODIFIED` block replaces the requirement wholesale, and the validator refuses an archive that
would silently drop a scenario. Three scenarios in the current requirement state behaviour this
change reverses: `Translation is optional`, `Unsupported translation language is rejected`, and
`Translation language requires text`. None can be carried forward:

- rewriting their bodies while keeping their titles would leave a specification asserting that
  "translation is optional" is a scenario, which is a false record in the artifact that defines
  the product;
- renaming them is treated by the validator as *omitting* the originals, which is the same error.

The only tool-supported way to drop a scenario is to remove the requirement that contains it. So
the superseded requirement is recorded in a `REMOVED` block **in full, verbatim**, and its
replacement is added. This satisfies the constraint that superseded requirement history must not be
rewritten as though it never existed: the old text is in the change, and the archive diff shows
exactly what was removed and what replaced it.

The `research-schema` delta does the opposite, and is a genuine `MODIFIED`: only one scenario was
affected, and it survives with updated content, so every original scenario name is retained.

## Open Questions

None blocking. The following is a proposal decision, recorded so it can be challenged rather than
discovered:

- The precondition refuses **all** pre-existing evaluable rows, including evaluable rows that carry
  no translation at all. A slightly more permissive variant would allow evaluable rows with no
  translation to be carried forward as non-qualifying legacy records. That variant was rejected
  because it leaves the table holding rows the domain schema refuses, which reintroduces exactly
  the convention-not-constraint gap this project is trying to close. If the thesis team prefers the
  permissive variant, the decision belongs in the specification, not in the migration.
