/**
 * The research-export documents, shared by the operator command and the researcher download.
 *
 * PURE, and importing nothing but the shared domain predicates, the serializers, and repository
 * *interfaces* — the same reason `review-flags.ts` takes no dependencies: the artifact's content
 * must be testable with fakes, no database, and no credential. Both callers (the CLI command and
 * the web download) read the corpus through these functions, so there is exactly one derivation
 * and the web/CLI equivalence is by construction rather than by review.
 *
 * Nothing in this file touches `process.env`, opens a connection, or writes a file. Reading the
 * environment, connecting, and emitting are each caller's own job.
 */

import { buildCsv } from "@/lib/export/csv";
import {
  buildExportRecords,
  buildExportSummary,
  EXPORT_RECORD_KEYS,
  isQualifyingValidation,
  type ExportSourceWithQualifying,
} from "@/lib/export/records";
import {
  buildValidatedDataset,
  VALIDATED_RECORD_KEYS,
  validatedCsvRow,
} from "@/lib/export/validated";
import type { DatasetEntriesRepository } from "@/lib/repositories/dataset-entries-repository";
import type { ValidationsRepository } from "@/lib/repositories/validations-repository";
import type { ValidatorsRepository } from "@/lib/repositories/validators-repository";
import type { DatasetEntry } from "@/schemas/dataset";

/** The output file names. Fixed, so a consumer can find them without reading the summary. */
export const VALIDATIONS_JSON = "validations.json";
export const VALIDATIONS_CSV = "validations.csv";
export const SUMMARY_JSON = "summary.json";
export const VALIDATED_JSON = "validated-dataset.json";
export const VALIDATED_CSV = "validated-dataset.csv";

/** The five artifact names, in the order they are zipped and written. */
export const EXPORT_DOCUMENT_NAMES = [
  VALIDATIONS_JSON,
  VALIDATIONS_CSV,
  SUMMARY_JSON,
  VALIDATED_JSON,
  VALIDATED_CSV,
] as const;

export type ExportDocumentName = (typeof EXPORT_DOCUMENT_NAMES)[number];

/**
 * The three reads an export needs, as `Pick`s of the repository interfaces.
 *
 * `Pick` rather than the whole interfaces, so a write method is not even in the type: the
 * read-only property is enforced by the type layer, not by discipline. The repositories
 * themselves are the real implementations — no query logic is duplicated here.
 */
export interface ExportSources {
  readonly entries: Pick<DatasetEntriesRepository, "listAllActive">;
  readonly validations: Pick<ValidationsRepository, "listForEntries">;
  readonly validators: Pick<ValidatorsRepository, "listByIds">;
}

/** What one run produced, so a caller can report and a test can assert. */
export interface ExportResult {
  readonly entries: number;
  readonly responses: number;
  readonly qualifying: number;
  readonly validated: number;
  readonly files: readonly string[];
}

/** The serialised documents, as text — so emitting them is the only I/O left to the caller. */
export interface ExportDocuments {
  readonly validationsJson: string;
  readonly validationsCsv: string;
  readonly summaryJson: string;
  readonly validatedJson: string;
  readonly validatedCsv: string;
  readonly result: Omit<ExportResult, "files">;
}

export function renderDocuments(
  sources: readonly ExportSourceWithQualifying[],
  entries: readonly DatasetEntry[],
): ExportDocuments {
  const records = buildExportRecords(sources);
  const summary = buildExportSummary(entries, sources);
  const validated = buildValidatedDataset(entries, sources);

  return {
    validationsJson: `${JSON.stringify(records, null, 2)}\n`,
    validationsCsv: buildCsv(records, EXPORT_RECORD_KEYS),
    summaryJson: `${JSON.stringify(summary, null, 2)}\n`,
    validatedJson: `${JSON.stringify(validated, null, 2)}\n`,
    validatedCsv: buildCsv(validated.records.map(validatedCsvRow), VALIDATED_RECORD_KEYS),
    result: {
      entries: entries.length,
      responses: records.length,
      qualifying: summary.totals.qualifying_validations,
      validated: validated.records.length,
    },
  };
}

/**
 * Reads the corpus and returns the export sources with each response's author's proficiency attached.
 *
 * Proficiency is attached from the stored profile and nothing else: it is self-reported metadata, and
 * this function derives no weight, rank, or eligibility from it.
 */
export async function collectExportSources(
  repositories: ExportSources,
  write: (line: string) => void,
): Promise<{ entries: DatasetEntry[]; sources: ExportSourceWithQualifying[] }> {
  const entries = await repositories.entries.listAllActive();
  write(`read ${entries.length} active dataset entries`);

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const responses =
    entries.length === 0
      ? []
      : await repositories.validations.listForEntries(entries.map((entry) => entry.id));
  write(`read ${responses.length} stored validation responses`);

  const validatorIds = [...new Set(responses.map((response) => response.validatorId))];
  const profiles = await repositories.validators.listByIds(validatorIds);
  const proficiencyByValidator = new Map(
    profiles.map((profile) => [profile.id, profile.ilocanoProficiency]),
  );
  write(`read ${profiles.length} validator profiles`);

  const sources: ExportSourceWithQualifying[] = [];
  for (const response of responses) {
    const entry = entryById.get(response.datasetEntryId);
    // A response whose entry is not in the active set has no entry row to describe. It is reported
    // rather than dropped silently, because a corpus whose responses do not all belong to a dataset
    // entry is something a researcher needs to know about before trusting the export.
    if (entry === undefined) {
      write(
        `WARNING: response ${response.id} references entry ${response.datasetEntryId}, which is not an active dataset entry; skipped`,
      );
      continue;
    }
    sources.push({
      entry,
      response,
      proficiency: proficiencyByValidator.get(response.validatorId) ?? null,
      qualifies: isQualifyingValidation(response),
    });
  }

  return { entries, sources };
}
