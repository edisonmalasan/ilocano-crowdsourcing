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
 * In the tie case the smallest validation id wins, stated as arbitrary and carrying no meaning:
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
} from "@/lib/domain/validation-response";
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
  "id",
  "validated_ilocano",
  "english_translation",
  "filipino_translation",
  "origin",
  "destination",
  "transit_mode",
  "source_validation_id",
  "needs_review",
] as const;

export type ValidatedRecordKey = (typeof VALIDATED_RECORD_KEYS)[number];

/** One validated entry, as the JSON document carries it. */
export interface ValidatedRecord {
  readonly id: string;
  readonly validated_ilocano: string;
  readonly english_translation: string;
  readonly filipino_translation: string;
  readonly output: {
    readonly origin: string | null;
    readonly destination: string | null;
    readonly transit_mode: string | null;
  };
  /** The validated-Ilocano supplier's id: provenance back to the raw record, without naming whose. */
  readonly source_validation_id: string;
  readonly needs_review: boolean;
}

/** One validated entry flattened for CSV, in `VALIDATED_RECORD_KEYS` order. */
export type ValidatedCsvRow = Readonly<Record<ValidatedRecordKey, string | null>>;

/** The derivation rule, stated in the artifact so no reader mistakes it for adjudication. */
export interface ValidatedDerivation {
  readonly rule: "pooled-earliest-per-field-by-server-created-at";
  readonly tie_break: "smallest-validation-id-arbitrary-carries-no-meaning";
  /** Complete entries omitted: none — every complete entry derives exactly one record. */
  readonly omitted_incomplete_entries: number;
}

/** The validated document: its rule, then its records. */
export interface ValidatedDataset {
  readonly derivation: ValidatedDerivation;
  readonly records: readonly ValidatedRecord[];
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
 * One validated record per complete entry, in entry order. Incomplete entries are absent, not
 * zero-filled: nothing is validated for them yet, and inventing a row would fabricate a finding.
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

  const records: ValidatedRecord[] = [];
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
    records.push({
      id: entry.id,
      validated_ilocano: validatedIlocanoFor(entry, judgment),
      english_translation: english,
      filipino_translation: filipino,
      output: {
        origin: entry.origin,
        destination: entry.destination,
        transit_mode: entry.transitMode,
      },
      source_validation_id: judgment.id,
      needs_review:
        requiresResearcherReview(rows.map((row) => row.response)) ||
        isMultiSource(suppliers) ||
        hasSupplierTie(rows),
    });
  }

  return {
    derivation: {
      rule: "pooled-earliest-per-field-by-server-created-at",
      tie_break: "smallest-validation-id-arbitrary-carries-no-meaning",
      omitted_incomplete_entries: entries.length - records.length,
    },
    records,
  };
}

/** One validated record flattened for CSV. `needs_review` travels as "true"/"false". */
export function validatedCsvRow(record: ValidatedRecord): ValidatedCsvRow {
  return {
    id: record.id,
    validated_ilocano: record.validated_ilocano,
    english_translation: record.english_translation,
    filipino_translation: record.filipino_translation,
    origin: record.output.origin,
    destination: record.output.destination,
    transit_mode: record.output.transit_mode,
    source_validation_id: record.source_validation_id,
    needs_review: record.needs_review ? "true" : "false",
  };
}
