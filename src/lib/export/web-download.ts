/**
 * The researcher web download, as an injectable core with a thin Route Handler.
 *
 * Everything here is a function over already-loaded inputs plus injected dependencies — no
 * `process.env`, no cookie jar, no client construction — so the authorization, the derivation,
 * and the packaging are unit-testable with fakes and no credential. The Route Handler supplies
 * the real cookie value, environment, clock, repositories, and logger.
 *
 * ============================================================================
 * WHY THE GUARD RUNS HERE AND NOT ONLY IN THE LAYOUT
 * ============================================================================
 * Route-group layouts do not run for Route Handlers: a layout renders pages, not file
 * responses. Placement under `(protected)/` therefore groups the route with the area it
 * belongs to but authorizes nothing. This core verifies the presented session with the same
 * `resolveResearcherAccess` guard the layout uses, BEFORE constructing anything privileged,
 * and a refused request performs zero repository reads — the guard module cannot make one even
 * if this code asked it to, because it imports no persistence path.
 *
 * ============================================================================
 * ONE DERIVATION, TWO ENVELOPES
 * ============================================================================
 * The five documents come from `renderDocuments` over `collectExportSources` — the same
 * functions the operator command calls. The only new code here is the ZIP envelope and the
 * filename. Equivalence is therefore by construction, and a test asserts the web documents
 * equal the CLI documents over the same fakes rather than re-deriving either.
 */

import { strToU8, zipSync } from "fflate";

import { RESEARCHER_REFUSAL_MESSAGE, resolveResearcherAccess } from "@/lib/admin/guard";
import type { ConfiguredAdminEnv } from "@/lib/admin/env";
import {
  collectExportSources,
  renderDocuments,
  VALIDATED_CSV,
  VALIDATED_JSON,
  VALIDATIONS_CSV,
  VALIDATIONS_JSON,
  SUMMARY_JSON,
  type ExportDocuments,
  type ExportSources,
} from "@/lib/export/documents";

/**
 * Upper bound on the ZIP response body. Refused, never truncated: a partial archive that
 * presents as complete would be a fabricated dataset. The corpus today (600 entries and a
 * handful of validations) zips to kilobytes; streaming is the recorded follow-up if growth
 * ever approaches this bound.
 */
export const MAX_EXPORT_ZIP_BYTES = 25 * 1024 * 1024;

/** `sadino-research-export-2026-10-04.zip`: dated by the server clock, never the client. */
export function exportFilename(nowMs: number): string {
  return `sadino-research-export-${new Date(nowMs).toISOString().slice(0, 10)}.zip`;
}

export interface WebDownloadDependencies {
  /** The presented session token, exactly as the cookie jar returned it. */
  readonly presented: unknown;
  /** `null` when the deployment has no operator credential — a refusal, not an error. */
  readonly adminEnv: ConfiguredAdminEnv | null;
  readonly nowMs: number;
  readonly repositories: ExportSources;
  /** Audit sink. Called once per SERVED export only; refusals log nothing corpus-derived. */
  readonly log: (line: string) => void;
  /** Test seam for the size bound; production never passes it. Defaults to `MAX_EXPORT_ZIP_BYTES`. */
  readonly maxBytes?: number;
}

export type WebDownloadResult =
  | { readonly status: "refused"; readonly message: string }
  | { readonly status: "too_large"; readonly bytes: number }
  | {
      readonly status: "ready";
      readonly filename: string;
      /** A fresh copy: `zipSync` may hand back a view over shared memory, which `Blob` refuses. */
      readonly body: Uint8Array<ArrayBuffer>;
      readonly documents: ExportDocuments;
    };

/**
 * Authorize, collect, render, and package — or refuse before the first privileged read.
 *
 * The `ordinal` in the audit line is the guard's non-secret credential position, not a
 * secret: it says which configured credential established the session without saying what
 * it is.
 */
export async function buildResearchDownload(
  dependencies: WebDownloadDependencies,
): Promise<WebDownloadResult> {
  const access = resolveResearcherAccess({
    presented: dependencies.presented,
    adminEnv: dependencies.adminEnv,
    nowMs: dependencies.nowMs,
  });
  if (access.status === "refused") {
    return { status: "refused", message: RESEARCHER_REFUSAL_MESSAGE };
  }

  const collected: string[] = [];
  const { entries, sources } = await collectExportSources(dependencies.repositories, (line) =>
    collected.push(line),
  );
  const documents = renderDocuments(sources, entries);

  const zipped = zipSync({
    [VALIDATIONS_JSON]: strToU8(documents.validationsJson),
    [VALIDATIONS_CSV]: strToU8(documents.validationsCsv),
    [SUMMARY_JSON]: strToU8(documents.summaryJson),
    [VALIDATED_JSON]: strToU8(documents.validatedJson),
    [VALIDATED_CSV]: strToU8(documents.validatedCsv),
  });
  if (zipped.length > (dependencies.maxBytes ?? MAX_EXPORT_ZIP_BYTES)) {
    return { status: "too_large", bytes: zipped.length };
  }

  dependencies.log(
    `research export served: credential #${access.ordinal}, ${documents.result.entries} entries, ` +
      `${documents.result.responses} responses, ${documents.result.validated} validated, ` +
      `${zipped.length} bytes zipped`,
  );

  return {
    status: "ready",
    filename: exportFilename(dependencies.nowMs),
    body: Uint8Array.from(zipped),
    documents,
  };
}
