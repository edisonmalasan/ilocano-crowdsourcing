# Proposal

## Why

`single-validation-package` removed the dashboard figure the corrected methodology made false and
installed no replacement: the researcher overview currently shows totals, the partition, the
percentage, and the retained breakdowns, but **no cannot-evaluate count, no raw response count,
and no duplicate/overlap diagnostics** — and the export ships one document (per-response records
plus summary) with **no validated-dataset document at all**. The thesis team cannot yet answer
"how much is judged?", "how much is abstention?", "where did collection overlap?", or "what is
the validated sentence for each finished entry?" from any artifact this platform produces.

This change installs the approved figure list and splits the export in two: the RAW RESEARCH
RESPONSES document (what validators said, per response, disagreements preserved) and the
VALIDATED DATASET document (the mechanical derivation of one validated record per complete
entry). Both are specified here; neither invents adjudication, which belongs to Phase 12.

## What Changes

- **Dashboard figure list becomes the approved set.** Added as first-class figures: `cannot_evaluate`
  response count, raw stored-response count, entries holding more than one qualifying package
  (overlap), and responses recorded after their entry's first qualifying response (late arrivals
  from validation races). Retained: total entries, complete, incomplete, completion %, qualifying
  total, attempts-with-responses, evaluation distribution, proficiency breakdown, review flags.
- **Overlap and lateness are defined as pure functions over stored rows, not as detected
  incidents.** A duplicate is an extra qualifying package beyond the first — measurable because
  `UNIQUE (validator_id, dataset_entry_id)` makes same-attempt duplication impossible, so every
  extra package is a distinct attempt. A late arrival is a response whose server-minted `createdAt`
  is after its entry's first qualifying response. Neither is an error; both are collection
  diagnostics the thesis team monitors.
- **BREAKING** — The export writes five files, not three: `validations.json` + `validations.csv`
  (raw, unchanged shape), `summary.json` (unchanged shape), plus `validated-dataset.json` +
  `validated-dataset.csv` (one record per complete entry).
- **A validated record is derived, never chosen.** For each complete entry: `validated_ilocano`
  is the correction where the supplying response required one and the source instruction otherwise;
  the supplying response is the earliest qualifying response by server-minted `createdAt`. Both
  translations come from that same response. No vote, no merge, no preferred validator.
- **Ties and disagreements are flagged, not resolved.** Equal `createdAt` among an entry's
  qualifying responses, or more than one distinct correction/evaluation behind a complete entry,
  forces the review flag on the validated record; the emitted record is still deterministic
  (smallest validation id wins the tie, stated as arbitrary), and the flag says a human must
  decide. The document is the mechanical candidate pending thesis-approved adjudication (Phase
  12) — it SHALL state its derivation rule and SHALL NOT present any record as adjudicated.
- **Incomplete entries are absent from the validated dataset.** Nothing is validated for them yet,
  and inventing a row would fabricate a finding. The summary states how many entries were
  omitted and why.
- **Provenance without persons.** Each validated record carries `source_validation_id` linking it
  to the raw response it derives from. It SHALL NOT carry a validator/attempt identifier: the raw
  document already preserves authorship per record, and re-exporting attempt ids into a
  "validated" artifact invites reading them as endorsements by persons. Attempt counts on the
  dashboard are likewise defined as attempts-with-responses, never as people.
- **Three-consumer agreement.** The consistency guard compares dashboard, raw-export summary, and
  validated dataset over the same corpus: same complete set, same qualifying total, same review
  set.

## Capabilities

### New Capabilities

(none — every rule below modifies an existing capability's requirements)

### Modified Capabilities

- `researcher-dashboard`: the overview figure list becomes the approved set — first-class
  cannot-evaluate count, raw response count, overlap figures (entries with extra packages, late
  arrivals), with attempts-with-responses defined as attempts, never persons.
- `research-export`: the RAW vs VALIDATED split; the validated record shape
  (`id`, `validated_ilocano`, `english_translation`, `filipino_translation`,
  `output:{origin,destination,transit_mode}`, `source_validation_id`, review flag); earliest-package
  derivation with tie/disagreement flagging; incomplete entries omitted; JSON+CSV for both
  documents with the same round-trip guarantee; provenance rule.
- `consistency-guards`: dashboard vs raw summary vs validated dataset agree on the complete set,
  the qualifying total, and the review set over one corpus.

## Impact

- `src/lib/admin/dashboard.ts`: new overview fields, computed from the same repository reads (no
  new queries — every figure derives from entries + responses + profiles already loaded).
- `src/app/researcher/(protected)/overview.tsx`: new figure cards; entry-review page unchanged
  (per-response content already complete).
- `src/lib/export/`: new validated-dataset builder beside `records.ts`; `csv.ts` generalized from
  one key set to a passed key set (both documents share the quoting rules and the round-trip
  requirement).
- `scripts/export-research.ts`: two more files written (`validated-dataset.json`,
  `validated-dataset.csv`); summary line extended. Still one command, still no request path.
- Tests: dashboard service/views, export records/command/csv/no-merge, cross-consumer agreement
  (three-way), and the two allow-list scans that enumerate export outputs by name
  (`export-read-only.test.ts` file list; the "exactly N named files" assertion in
  `export-command.test.ts`).
- No migration. No schema change. No new route, action, or script file — the export stays one
  operator command, so `import-dataset-command.test.ts`'s single-filesystem-script invariant holds.
- Deferred by design: thesis-approved adjudication rules and the adjudicated final (Phase 12);
  attempt-scoped allocation (`attempt-scoped-allocation`); real-flow verification.
