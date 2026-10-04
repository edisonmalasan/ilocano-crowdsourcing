/**
 * One export record per stored validation, and the JSON documents built from them.
 *
 * PURE, and importing nothing but the shared qualifying predicate — the same reason
 * `review-flags.ts` does: the artifact's content must be testable with fakes, no database, and no
 * credential. The command that reads the corpus and writes files lives elsewhere; everything here is
 * a function over already-loaded rows.
 *
 * ============================================================================
 * THE INVARIANT THIS MODULE EXISTS TO KEEP
 * ============================================================================
 * One record per stored response, and one field per validator's own text. Nothing in this file may
 * combine two validators' translations, corrections, or evaluations into one value, and nothing may
 * pick a preferred response. A "consensus translation" column is the single most plausible wrong
 * addition to an export, and once written it looks like research output. `qualifying` travels on each
 * record so the summary's counts can be recomputed from this document alone, which is what makes the
 * export checkable rather than merely readable.
 *
 * Naming: the fields are `english_translation` and `filipino_translation` — snake_case, named for
 * the research content rather than for a UI concept, so a consumer reading the JSON cannot mistake
 * them for interface copy. `self_reported_proficiency` says what the field IS, because the dashboard
 * shows the same value as self-reported metadata and an unqualified `proficiency` invites a reader to
 * treat it as a quality score. Nothing here derives a weight, a rank, or a quality measure from it.
 */

import {
  countQualifyingValidations,
  isEntryComplete,
  isQualifyingValidation,
} from "@/lib/domain/validation-response";
import { requiresResearcherReview } from "@/lib/domain/review-flags";
import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { IlocanoProficiency } from "@/schemas/validator";

/** The stored response shape the record is built from, plus its entry and author's metadata. */
export interface ExportSource {
  readonly entry: DatasetEntry;
  readonly response: ValidationResponse;
  /** `null` when the validator never recorded one. Metadata, never a score. */
  readonly proficiency: IlocanoProficiency | null;
}

/**
 * The exported record's key set, in CSV column order.
 *
 * Declared once and used by both serializers, so the JSON and the CSV cannot drift into describing
 * different records — which is a failure a reader of either artifact alone would never notice.
 */
export const EXPORT_RECORD_KEYS = [
  "dataset_entry_id",
  "category",
  "validation_id",
  "validator_id",
  "self_reported_proficiency",
  "evaluation",
  "corrected_instruction",
  "english_translation",
  "filipino_translation",
  "qualifies_toward_completion",
  "submitted_at",
] as const;

export type ExportRecordKey = (typeof EXPORT_RECORD_KEYS)[number];

/**
 * One exported validation. Every string field holds ONE validator's own text or `null`.
 *
 * `corrected_instruction` and both translations are `string | null` rather than omitted, so the CSV
 * has a fixed column count and a consumer never has to distinguish "absent" from "empty" by
 * inspecting which keys exist.
 */
export type ExportRecord = Readonly<Record<ExportRecordKey, string | null>>;

/** A record plus the fields needed to build per-entry summaries. Kept separate from the artifact. */
export interface ExportSourceWithQualifying extends ExportSource {
  readonly qualifies: boolean;
}

/**
 * A stored optional field as an exported cell: absent becomes `null`, never the string "null".
 *
 * The stored response type carries these as `string | null | undefined` because SQL NULL maps to
 * `null` while a key that was never sent maps to `undefined`, and an export must not make a consumer
 * distinguish those two. Both become the same empty CSV field.
 */
function nullableText(value: string | null | undefined): string | null {
  return value ?? null;
}

/** One record per stored response, in the order given. Never merges, never drops a response. */
export function buildExportRecords(sources: readonly ExportSourceWithQualifying[]): ExportRecord[] {
  return sources.map(({ entry, response, proficiency, qualifies }) => ({
    dataset_entry_id: entry.id,
    category: entry.category,
    validation_id: response.id,
    validator_id: response.validatorId,
    self_reported_proficiency: proficiency,
    evaluation: response.evaluation,
    corrected_instruction: nullableText(response.correctedInstruction),
    english_translation: nullableText(response.englishTranslation),
    filipino_translation: nullableText(response.filipinoTranslation),
    qualifies_toward_completion: qualifies ? "true" : "false",
    submitted_at: response.createdAt,
  }));
}

/**
 * One entry's position in the corpus, as the summary reports it.
 *
 * There is deliberately no `coverage_target` field. Completeness is the shared predicate, not a
 * count against a number, so a target could only ever carry a constant — and a consumer invited
 * to check records against a constant draws a false conclusion. `coverage_complete` keeps its
 * name and is re-specified as the predicate's output.
 */
export interface EntrySummary {
  readonly dataset_entry_id: string;
  readonly category: string;
  /** Qualifying validations from DISTINCT validators — per-entry, never global (see below). */
  readonly qualifying_validations: number;
  readonly non_qualifying_validations: number;
  readonly stored_responses: number;
  readonly distinct_validators: number;
  readonly coverage_complete: boolean;
  readonly requires_researcher_review: boolean;
}

export interface CategorySummary {
  readonly category: string;
  readonly entries: number;
  readonly qualifying_validations: number;
  readonly non_qualifying_validations: number;
  readonly stored_responses: number;
}

export interface ExportSummary {
  readonly generated_from: {
    readonly entries: number;
    readonly stored_responses: number;
    readonly distinct_validators: number;
  };
  /** Totals are SUMMED from the per-entry figures; see the note on `buildExportSummary`. */
  readonly totals: {
    readonly qualifying_validations: number;
    readonly non_qualifying_validations: number;
    readonly stored_responses: number;
    readonly entries_with_coverage_complete: number;
    readonly entries_requiring_review: number;
    /**
     * Incomplete entries, which the validated dataset omits rather than zero-fills. Stated here
     * so the summary names how many entries were left out and why; the validated document's own
     * derivation block carries the same number, and the two are asserted equal.
     */
    readonly omitted_from_validated: number;
  };
  readonly by_category: readonly CategorySummary[];
  readonly by_entry: readonly EntrySummary[];
}

/** The rows for one entry, in a form both summarizers can use. */
function groupByEntry(
  entries: readonly DatasetEntry[],
  sources: readonly ExportSourceWithQualifying[],
): Map<string, ExportSourceWithQualifying[]> {
  const groups = new Map<string, ExportSourceWithQualifying[]>();
  for (const entry of entries) groups.set(entry.id, []);
  for (const source of sources) {
    // A response for an entry outside the supplied set has no entry row to describe, and inventing
    // one would fabricate a dataset entry the corpus does not contain. It is skipped, and the count
    // that would have included it is therefore reported from the rows actually summarised.
    groups.get(source.entry.id)?.push(source);
  }
  return groups;
}

/**
 * Per-entry and per-category summaries, plus totals.
 *
 * The contribution totals are SUMMED from the per-entry figures rather than counted across the whole
 * corpus, and that is not a style choice: `countQualifyingValidations` dedupes by `validatorId`
 * ACROSS the array it is given, so it is correct for one entry's coverage and returns "the number of
 * validators who ever contributed anything" if applied to everything at once. Summing per entry is what
 * makes the total a total.
 */
export function buildExportSummary(
  entries: readonly DatasetEntry[],
  sources: readonly ExportSourceWithQualifying[],
): ExportSummary {
  const groups = groupByEntry(entries, sources);

  const byEntry: EntrySummary[] = entries.map((entry) => {
    const rows = groups.get(entry.id) ?? [];
    // A duplicate validator on one entry is impossible under the schema's unique constraint; the
    // Set is here so the figure is right by construction rather than by assumption, and so a
    // fixture that violates the constraint does not silently inflate coverage.
    const distinctValidators = new Set(rows.map((row) => row.response.validatorId)).size;
    // `ValidationResponse` is structurally a `CoverageResponseShape` — same evaluation, same
    // optional correction and translations — so no cast is needed or wanted here. An earlier draft
    // cast each row, which would have silenced a future divergence between the stored type and the
    // shape the coverage rule actually consumes, which is precisely the drift this module must not
    // permit.
    const qualifying = countQualifyingValidations(rows.map((row) => row.response));

    return {
      dataset_entry_id: entry.id,
      category: entry.category,
      qualifying_validations: qualifying,
      non_qualifying_validations: rows.length - qualifying,
      stored_responses: rows.length,
      distinct_validators: distinctValidators,
      coverage_complete: isEntryComplete(rows.map((row) => row.response)),
      requires_researcher_review: requiresResearcherReview(rows.map((row) => row.response)),
    };
  });

  // Accumulated with an explicit mutable copy rather than by mutating a `readonly` value in place:
  // the type says these fields are read-only, and the compiler was right to object. A spread creates
  // the mutable working value while the exported type stays immutable, so a consumer cannot edit a
  // summary it was handed.
  const byCategoryMap = new Map<string, CategorySummary>();
  for (const entry of byEntry) {
    const current = byCategoryMap.get(entry.category) ?? {
      category: entry.category,
      entries: 0,
      qualifying_validations: 0,
      non_qualifying_validations: 0,
      stored_responses: 0,
    };
    byCategoryMap.set(entry.category, {
      category: current.category,
      entries: current.entries + 1,
      qualifying_validations: current.qualifying_validations + entry.qualifying_validations,
      non_qualifying_validations:
        current.non_qualifying_validations + entry.non_qualifying_validations,
      stored_responses: current.stored_responses + entry.stored_responses,
    });
  }

  const totals = byEntry.reduce(
    (accumulated, entry) => ({
      qualifying_validations: accumulated.qualifying_validations + entry.qualifying_validations,
      non_qualifying_validations:
        accumulated.non_qualifying_validations + entry.non_qualifying_validations,
      stored_responses: accumulated.stored_responses + entry.stored_responses,
      entries_with_coverage_complete:
        accumulated.entries_with_coverage_complete + (entry.coverage_complete ? 1 : 0),
      entries_requiring_review:
        accumulated.entries_requiring_review + (entry.requires_researcher_review ? 1 : 0),
      omitted_from_validated:
        accumulated.omitted_from_validated + (entry.coverage_complete ? 0 : 1),
    }),
    {
      qualifying_validations: 0,
      non_qualifying_validations: 0,
      stored_responses: 0,
      entries_with_coverage_complete: 0,
      entries_requiring_review: 0,
      omitted_from_validated: 0,
    },
  );

  return {
    generated_from: {
      entries: entries.length,
      stored_responses: totals.stored_responses,
      distinct_validators: new Set(sources.map((source) => source.response.validatorId)).size,
    },
    totals,
    by_category: [...byCategoryMap.values()],
    by_entry: byEntry,
  };
}

/** True when a stored response qualifies — re-exported so a caller need not import two modules. */
export { isQualifyingValidation };
