/**
 * The validated dataset: one derived record per complete entry.
 *
 * PURE, and importing nothing but the shared domain predicates — the same reason `records.ts`
 * does: the artifact's content must be testable with fakes, no database, and no credential.
 *
 * ============================================================================
 * DERIVED PER FIELD, NEVER CHOSEN
 * ============================================================================
 * For each complete entry each field comes from its earliest covering source by server-minted
 * `createdAt`: the validated Ilocano from the earliest valid judgment (the correction where the
 * evaluation required one, otherwise the source instruction), each translation from its earliest
 * non-blank supplier. `createdAt` is minted at insert, never supplied by a client, so
 * earliest-by-clock is a mechanical rule rather than a judgment about which response is best. No
 * vote is taken, no responses are merged into consensus wording, and no preferred validator is
 * selected — the methodology forbids all three, and this module offers no code path that could
 * express them.
 *
 * Any of these force `needs_review` without changing the pick:
 *
 *   - the shared review rule fires (evaluation disagreement or competing corrections);
 *   - the record's fields come from more than one response, so no single response vouches for
 *     the whole record;
 *   - two suppliers for one field share the same `createdAt`, so "earliest" is ambiguous.
 *
 * In the tie case the smallest response id wins, stated as arbitrary and carrying no meaning:
 * ids are CSPRNG hex, so their order means nothing, and a tie-break that pretended otherwise
 * would be a finding dressed as a method. The flag says a human must decide; the determinism
 * says the artifact is reproducible until they do.
 *
 * This document is the MECHANICAL CANDIDATE pending thesis-approved adjudication (Phase 12),
 * and it says so in its own derivation block. Nothing here presents a record as adjudicated.
 */

import {
  coversEnglishTranslation,
  coversFilipinoTranslation,
  isCorrectionRequired,
  isEntryComplete,
  isValidJudgment,
  type ValidationEvaluation,
} from "@/lib/domain/validation-response";
import {
  categoryRowForSlug,
  compareCanonicalEntryIds,
  DATASET_CATEGORY_TABLE,
} from "@/lib/domain/categories";
import { requiresResearcherReview } from "@/lib/domain/review-flags";
import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { ExportSourceWithQualifying } from "./records";

/**
 * The validated record's CSV column order.
 *
 * JSON nests origin/destination/transit_mode under `output`; CSV has no nesting, so the same
 * leaves travel flat. Both forms carry the same leaf values — the parity test asserts leaves,
 * not structure, and says so.
 */
export const VALIDATED_RECORD_KEYS = [
  "category_id",
  "category",
  "category_name",
  "id",
  "source_entry_id",
  "validated_ilocano",
  "evaluation",
  "self_reported_proficiency",
  "english_translation",
  "filipino_translation",
  "origin",
  "destination",
  "transit_mode",
  "source_response_id",
  "source_attempt_id",
  "needs_review",
] as const;

export type ValidatedRecordKey = (typeof VALIDATED_RECORD_KEYS)[number];

/** One validated entry, as the JSON document carries it. */
export interface ValidatedRecord {
  readonly id: string;
  /** The source-local id 1..600 within the entry's category block. A number here (not text): the
   * JSON document is typed while the CSV carries the same value as text. */
  readonly source_entry_id: number;
  readonly category: string;
  /** The human-readable source category name, verbatim. Provenance; the slug stays the key. */
  readonly category_name: string;
  readonly validated_ilocano: string;
  /**
   * The judgment supplier's evaluation. Describes the response that supplied
   * `validated_ilocano` — never the translations, which may come from elsewhere.
   */
  readonly evaluation: ValidationEvaluation;
  /**
   * The self-reported proficiency attached to the judgment supplier's attempt, or null when
   * unrecorded. Metadata about the supplier, never a quality score, and never evidence about
   * who authored any other field — least of all about a real human being.
   */
  readonly self_reported_proficiency: string | null;
  readonly english_translation: string;
  readonly filipino_translation: string;
  readonly output: {
    readonly origin: string | null;
    readonly destination: string | null;
    readonly transit_mode: string | null;
  };
  /** The validated-Ilocano supplier's response id: provenance back to the raw record. */
  readonly source_response_id: string;
  /**
   * The anonymous attempt that submitted the judgment response. An attempt identifier, never a
   * person identifier: one attempt may own many responses, and one person may hold many
   * attempts.
   */
  readonly source_attempt_id: string;
  readonly needs_review: boolean;
}

/** One validated entry flattened for CSV, in `VALIDATED_RECORD_KEYS` order. */
export type ValidatedCsvRow = Readonly<Record<ValidatedRecordKey, string | null>>;

/** One validated entry's group, as the grouped JSON document carries it. */
export interface ValidatedCategoryGroup {
  readonly category_id: number | null;
  readonly category: string;
  readonly category_name: string | null;
  /** Records in numeric-suffix order, without the enclosing category triple. */
  readonly records: GroupedValidatedRecord[];
}

/** One grouped-JSON validated record: the full record without the enclosing triple. */
export type GroupedValidatedRecord = Omit<ValidatedRecord, "category" | "category_name"> & {
  readonly category_id: number | null;
};

/** The derivation rule, stated in the artifact so no reader mistakes it for adjudication. */
export interface ValidatedDerivation {
  readonly rule: "pooled-earliest-per-field-by-server-created-at";
  readonly tie_break: "smallest-validation-id-arbitrary-carries-no-meaning";
  /** Complete entries omitted: none — every complete entry derives exactly one record. */
  readonly omitted_incomplete_entries: number;
}

/** The validated document: its rule, then its category groups in `category_id` order. */
export interface ValidatedDataset {
  readonly derivation: ValidatedDerivation;
  readonly categories: readonly ValidatedCategoryGroup[];
}

/**
 * The validated Ilocano sentence for one valid judgment over its entry.
 *
 * The correction where the evaluation required one, otherwise the source instruction,
 * byte-identical — a correction is never written onto the entry, and the entry is never altered
 * to match a correction. The throw is unreachable through valid judgments and is tested
 * anyway: a judgment missing its required correction means the predicate and this function
 * disagree about what judges, which is precisely the drift this module must not permit silently.
 */
export function validatedIlocanoFor(entry: DatasetEntry, response: ValidationResponse): string {
  if (!isCorrectionRequired(response.evaluation)) return entry.instruction;
  const correction = response.correctedInstruction;
  if (typeof correction === "string" && correction.trim().length > 0) return correction;
  throw new Error(`valid judgment ${response.id} requires a correction it does not carry`);
}

/** Order rows by server-minted instant, ties by smallest id. Sorts a copy, never in place. */
function orderedByServerClock(
  rows: readonly ExportSourceWithQualifying[],
): ExportSourceWithQualifying[] {
  return [...rows].sort(
    (left, right) =>
      left.response.createdAt.localeCompare(right.response.createdAt) ||
      (left.response.id < right.response.id ? -1 : left.response.id > right.response.id ? 1 : 0),
  );
}

/**
 * The three supplying rows: earliest valid judgment, earliest covering English translation,
 * earliest covering Filipino translation. Each may be a different response — that is pooled
 * coverage, not a defect — and the multi-source flag below says so openly.
 */
interface FieldSuppliers {
  readonly judgment: ExportSourceWithQualifying;
  readonly english: ExportSourceWithQualifying;
  readonly filipino: ExportSourceWithQualifying;
}

function fieldSuppliers(rows: readonly ExportSourceWithQualifying[]): FieldSuppliers | null {
  const ordered = orderedByServerClock(rows);
  const judgment = ordered.find((row) => isValidJudgment(row.response));
  const english = ordered.find((row) => coversEnglishTranslation(row.response));
  const filipino = ordered.find((row) => coversFilipinoTranslation(row.response));
  if (judgment === undefined || english === undefined || filipino === undefined) return null;
  return { judgment, english, filipino };
}

/** True when the record's fields come from more than one response. */
function isMultiSource(suppliers: FieldSuppliers): boolean {
  const ids = new Set([
    suppliers.judgment.response.id,
    suppliers.english.response.id,
    suppliers.filipino.response.id,
  ]);
  return ids.size > 1;
}

/**
 * True when "earliest" is ambiguous for any field: two suppliers for one pillar share one
 * instant. At the recorded precision simultaneity is simultaneity, and the arbitrary tie-break
 * below must be flagged rather than silent.
 */
function hasSupplierTie(rows: readonly ExportSourceWithQualifying[]): boolean {
  const pillars: ReadonlyArray<(row: ExportSourceWithQualifying) => boolean> = [
    (row) => isValidJudgment(row.response),
    (row) => coversEnglishTranslation(row.response),
    (row) => coversFilipinoTranslation(row.response),
  ];
  return pillars.some((pillar) => {
    const ats = rows
      .filter(pillar)
      .map((row) => row.response.createdAt)
      .sort();
    return ats.length > 1 && ats[0] === ats[1];
  });
}

/** A present-and-non-blank translation cell, or a loud failure naming the drift. */
function requiredTranslation(
  value: string | null | undefined,
  language: string,
  supplierId: string,
): string {
  // Covering guarantees presence-and-non-blank; the guard below turns a drift between the
  // predicate and this function into a loud failure rather than a blank cell.
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `covering ${language} supplier ${supplierId} carries no ${language} translation`,
    );
  }
  return value;
}

/**
 * One validated record per complete entry, grouped by category in `category_id` order with
 * records in numeric-suffix order. Incomplete entries are absent, not zero-filled: nothing is
 * validated for them yet, and inventing a row would fabricate a finding. Categories with no
 * complete entry still appear with an empty record list, so the document always carries all
 * five groups — including at pristine zero state, where the alternative is a document that
 * looks like it forgot its categories.
 */
export function buildValidatedDataset(
  entries: readonly DatasetEntry[],
  sources: readonly ExportSourceWithQualifying[],
): ValidatedDataset {
  const groups = new Map<string, ExportSourceWithQualifying[]>();
  for (const entry of entries) groups.set(entry.id, []);
  for (const source of sources) {
    // Same orphan rule as the raw summary: a response whose entry is not in the supplied set has
    // no entry row to derive from, and inventing one would fabricate a dataset entry.
    groups.get(source.entry.id)?.push(source);
  }

  const byCategory = new Map<string, ValidatedRecord[]>();
  for (const entry of entries) {
    const rows = groups.get(entry.id) ?? [];
    if (!isEntryComplete(rows.map((row) => row.response))) continue;
    // Complete by the predicate above, so all three suppliers exist; a `null` here names a
    // disagreement between the predicate and this function rather than an incomplete entry.
    const suppliers = fieldSuppliers(rows);
    if (suppliers === null) {
      throw new Error(`complete entry ${entry.id} has no covering supplier for every pillar`);
    }
    const judgment = suppliers.judgment.response;
    const english = requiredTranslation(
      suppliers.english.response.englishTranslation,
      "English",
      suppliers.english.response.id,
    );
    const filipino = requiredTranslation(
      suppliers.filipino.response.filipinoTranslation,
      "Filipino",
      suppliers.filipino.response.id,
    );
    const record: ValidatedRecord = {
      id: entry.id,
      source_entry_id: entry.sourceEntryId,
      category: entry.category,
      category_name: entry.categoryName,
      validated_ilocano: validatedIlocanoFor(entry, judgment),
      evaluation: judgment.evaluation,
      self_reported_proficiency: suppliers.judgment.proficiency,
      english_translation: english,
      filipino_translation: filipino,
      output: {
        origin: entry.origin,
        destination: entry.destination,
        transit_mode: entry.transitMode,
      },
      source_response_id: judgment.id,
      source_attempt_id: judgment.validatorId,
      needs_review:
        requiresResearcherReview(rows.map((row) => row.response)) ||
        isMultiSource(suppliers) ||
        hasSupplierTie(rows),
    };
    const list = byCategory.get(entry.category);
    if (list === undefined) byCategory.set(entry.category, [record]);
    else list.push(record);
  }

  const categories: ValidatedCategoryGroup[] = [];
  const seen = new Set<string>();
  for (const row of DATASET_CATEGORY_TABLE) {
    seen.add(row.slug);
    const records = (byCategory.get(row.slug) ?? [])
      .sort((left, right) => compareCanonicalEntryIds(left.id, right.id))
      .map((record) => stripCategoryTriple(row.categoryId, record));
    categories.push({
      category_id: row.categoryId,
      category: row.slug,
      category_name: row.name,
      records,
    });
  }
  // Slugs outside the canonical table keep their own group after the known ones, in
  // first-seen order, so the open-category contract holds here too.
  for (const [slug, records] of byCategory) {
    if (seen.has(slug)) continue;
    categories.push({
      category_id: null,
      category: slug,
      category_name: records[0]?.category_name ?? null,
      records: [...records]
        .sort((left, right) => compareCanonicalEntryIds(left.id, right.id))
        .map((record) => stripCategoryTriple(null, record)),
    });
  }

  const complete = categories.reduce((sum, group) => sum + group.records.length, 0);
  return {
    derivation: {
      rule: "pooled-earliest-per-field-by-server-created-at",
      tie_break: "smallest-validation-id-arbitrary-carries-no-meaning",
      omitted_incomplete_entries: entries.length - complete,
    },
    categories,
  };
}

/**
 * The grouped-JSON form of one record: the enclosing triple established once per group, so
 * the record does not repeat it. The flat CSV row keeps the triple as cells — CSV cannot
 * nest, so parity there means same information, not same shape.
 */
function stripCategoryTriple(
  category_id: number | null,
  record: ValidatedRecord,
): GroupedValidatedRecord {
  const { category: _droppedCategory, category_name: _droppedName, ...rest } = record;
  void _droppedCategory;
  void _droppedName;
  return { ...rest, category_id };
}

/**
 * Every derived record with its group triple reattached, in group order.
 *
 * The exact inverse of the grouping strip: the group is each record's own group, never
 * looked up, so JSON and CSV cannot disagree about which category a record belongs to. Used
 * by the flat CSV serialization and by tests asserting derivation behavior without caring
 * about grouping.
 */
export function flattenValidatedGroups(dataset: ValidatedDataset): ValidatedRecord[] {
  return dataset.categories.flatMap((group) => {
    if (group.records.length === 0) return [];
    // A group with records always carries the entries' own name when built by
    // `buildValidatedDataset`. Throwing rather than inventing one, because a fabricated
    // category name in a flat row would be a research falsehood.
    if (group.category_name === null) {
      throw new Error(`validated group ${group.category} carries records but no category name`);
    }
    const category_name: string = group.category_name;
    return group.records.map((record) => {
      const { category_id: _groupId, ...rest } = record;
      void _groupId;
      return { ...rest, category: group.category, category_name };
    });
  });
}

/** One validated record flattened for CSV. `needs_review` travels as "true"/"false". */
export function validatedCsvRow(record: ValidatedRecord): ValidatedCsvRow {
  const categoryId = categoryRowForSlug(record.category)?.categoryId;
  return {
    category_id: categoryId === undefined ? null : String(categoryId),
    category: record.category,
    category_name: record.category_name,
    id: record.id,
    source_entry_id: String(record.source_entry_id),
    validated_ilocano: record.validated_ilocano,
    evaluation: record.evaluation,
    self_reported_proficiency: record.self_reported_proficiency,
    english_translation: record.english_translation,
    filipino_translation: record.filipino_translation,
    origin: record.output.origin,
    destination: record.output.destination,
    transit_mode: record.output.transit_mode,
    source_response_id: record.source_response_id,
    source_attempt_id: record.source_attempt_id,
    needs_review: record.needs_review ? "true" : "false",
  };
}
