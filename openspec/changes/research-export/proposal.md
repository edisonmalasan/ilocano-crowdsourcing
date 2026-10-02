# Proposal

## Why

The research data is now being collected and stored, and the thesis team's approved dataset cannot be
produced from it. Every validator response — including each validator's own correction, English
translation, and Filipino translation — exists only as a row in `validations`, and there is no way to
get it out in a form a thesis write-up or a statistical analysis can use. The Phase 7 dashboard let a
researcher *read* coverage; it deliberately performs no writes and exposes no export, so this is the
first stage where research data leaves the application.

The risk is not only that the feature is missing. An export that merges three validators'
translations into one "consensus" string, or that reports a raw row count as if it were qualifying
coverage, would produce a plausible-looking dataset that is wrong — and wrong in exactly the way this
project's other changes were built to prevent.

## What Changes

- A **research-data export** as an operator command (`pnpm run export:research`), not a route. The
  precedent is `import:dataset`, which is a command because nothing in a request path may write a
  dataset entry; the symmetric argument holds for reading the whole corpus: an export is bulk,
  is run by the research team against a deployment, and must not be reachable by a request.
- **Two JSON documents**, each written to a caller-named output directory:
  - `validations.json` — one record per stored validation, with `english_translation` and
    `filipino_translation` as **separate fields**, each holding that validator's own text, plus the
    correction, the evaluation, the validator's self-reported proficiency, and whether the response
    qualifies toward coverage.
  - `summary.json` — per dataset entry: qualifying count, non-qualifying count, stored-response
    count, coverage-complete flag, review flag, and the coverage target in force.
- **Never merged**: no field in either document combines validators' texts, and no document contains
  a single "consensus" value per entry. Enforced by a test over the export's own shape, not by
  convention.
- **CSV** for the validations document, since that is the one a statistical package reads; proper
  quoting so a translation containing a comma or a newline survives a round trip.
- **Category-aware**: records carry their category, and the summary is grouped by category, because
  the roadmap requires category-specific export and the platform already supports more than one.
- **Adjudication stays configurable and is NOT performed here.** The export records what each
  validator said and whether responses disagree; it does not resolve disagreement, majority-vote, or
  choose a final corrected instruction. Final-dataset production is a later, thesis-approved step.
- No schema change, no migration, no RLS change, no dashboard route, no new dependency.

## Capabilities

### New Capabilities

- `research-export`: what the export contains, what it must never do to a validator's words, and what
  it refuses to decide.

### Modified Capabilities

(none — no existing requirement changes. The export is a consumer of the shared qualifying
definition and the existing read paths, not a subject of change.)

## Impact

- `scripts/export-research.ts`: the operator command; `pnpm run export:research`.
- `src/lib/export/`: pure serializers (JSON shaping, CSV quoting, summary assembly) with no I/O, so
  they are testable with no database and no credential.
- `src/lib/repositories/`: reuses `listActive`, `listForEntries`, and `listByIds` unchanged. At 600
  entries × ~3 responses the corpus is small enough to read whole; a per-entry loop is not needed and
  a paginated export would add a truncation mode to a research artifact, which is worse.
- Tests: unit (serializer shape, CSV quoting, no-merge invariant, summary arithmetic over a
  hand-counted fixture), plus a source-level assertion that the export defines no Server Action and
  writes no research row.
