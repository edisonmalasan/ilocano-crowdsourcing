/**
 * The researcher web download core, driven with fakes — no credential, no database.
 *
 * `server-only` cannot be imported under Vitest, so the marker is stubbed: the boundary it
 * marks is asserted structurally elsewhere, and what this file owns is behaviour — refusal
 * before the first read, the dated ZIP envelope, and byte-equivalence with the operator
 * documents over the same fakes.
 */
import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";

vi.mock("server-only", () => ({}));

import { issueResearcherSession } from "@/lib/admin/session";
import {
  buildResearchDownload,
  exportFilename,
  MAX_EXPORT_ZIP_BYTES,
} from "@/lib/export/web-download";
import {
  renderDocuments,
  SUMMARY_JSON,
  VALIDATED_CSV,
  VALIDATED_JSON,
  VALIDATIONS_CSV,
  VALIDATIONS_JSON,
  type ExportSources,
} from "@/lib/export/documents";
import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

const NOW = new Date("2026-10-04T12:00:00.000Z").getTime();
const OPERATOR_SECRET = "operator-secret-for-tests-only";
const SESSION_SECRET = "session-secret-for-tests-only";

const adminEnv = { operatorSecrets: [OPERATOR_SECRET], sessionSecret: SESSION_SECRET };

function signedSession(): string {
  return issueResearcherSession({
    ordinal: 1,
    credential: OPERATOR_SECRET,
    nowMs: NOW,
    secret: SESSION_SECRET,
  });
}

const entry = (id: string): DatasetEntry => ({
  id,
  category: "origin_destination",
  instruction: `instruction for ${id}`,
  origin: `origin of ${id}`,
  destination: `destination of ${id}`,
  transitMode: "walking",
  createdAt: "2026-09-01T12:00:00.000Z",
  isActive: true,
});

const response = (
  id: string,
  validatorId: string,
  entryId: string,
  extra: Partial<ValidationResponse> = {},
): ValidationResponse => ({
  id,
  validatorId: validatorId as AnonymousValidatorId,
  datasetEntryId: entryId,
  batchId: "batch_01",
  evaluation: "correct_natural",
  englishTranslation: "Go north past the market.",
  filipinoTranslation: "Dumiretso ka sa hilaga.",
  createdAt: "2026-09-02T12:00:00.000Z",
  updatedAt: "2026-09-02T12:00:00.000Z",
  ...extra,
});

const ENTRIES = [entry("E1"), entry("E2")];
const RESPONSES = [response("r01", "VAL_00000001", "E1"), response("r02", "VAL_00000002", "E1")];

function sources(calls: string[]): ExportSources {
  return {
    entries: {
      listActive: async () => {
        calls.push("entries.listActive");
        return ENTRIES;
      },
    },
    validations: {
      listForEntries: async (ids) => {
        calls.push("validations.listForEntries");
        return RESPONSES.filter((r) => ids.includes(r.datasetEntryId));
      },
    },
    validators: {
      listByIds: async (ids) => {
        calls.push("validators.listByIds");
        return ids.map((id): ValidatorProfile => ({
          id: id as AnonymousValidatorId,
          ilocanoProficiency: "fluent",
          createdAt: "2026-09-01T12:00:00.000Z",
          lastActiveAt: "2026-09-02T12:00:00.000Z",
          totalValidations: 1,
        }));
      },
    },
  };
}

describe("refusal precedes any privileged read", () => {
  it("refuses an unconfigured deployment without touching a repository", async () => {
    const calls: string[] = [];
    const logged: string[] = [];

    const result = await buildResearchDownload({
      presented: signedSession(),
      adminEnv: null,
      nowMs: NOW,
      repositories: sources(calls),
      log: (line) => logged.push(line),
    });

    expect(result.status).toBe("refused");
    expect(calls).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("refuses a forged session without touching a repository", async () => {
    const calls: string[] = [];
    const logged: string[] = [];

    const result = await buildResearchDownload({
      presented: "forged.session.token",
      adminEnv,
      nowMs: NOW,
      repositories: sources(calls),
      log: (line) => logged.push(line),
    });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.message).toBe(
        "This area is not available. A valid researcher session is required.",
      );
    }
    expect(calls).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("refuses an expired session without touching a repository", async () => {
    const calls: string[] = [];
    const stale = issueResearcherSession({
      ordinal: 1,
      credential: OPERATOR_SECRET,
      nowMs: NOW - 9 * 60 * 60 * 1000,
      secret: SESSION_SECRET,
    });

    const result = await buildResearchDownload({
      presented: stale,
      adminEnv,
      nowMs: NOW,
      repositories: sources(calls),
      log: () => {},
    });

    expect(result.status).toBe("refused");
    expect(calls).toEqual([]);
  });
});

describe("served download", () => {
  it("zips exactly the five artifacts with a dated filename and logs once", async () => {
    const calls: string[] = [];
    const logged: string[] = [];

    const result = await buildResearchDownload({
      presented: signedSession(),
      adminEnv,
      nowMs: NOW,
      repositories: sources(calls),
      log: (line) => logged.push(line),
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.filename).toBe("sadino-research-export-2026-10-04.zip");
    expect(calls).toEqual([
      "entries.listActive",
      "validations.listForEntries",
      "validators.listByIds",
    ]);

    const unzipped = unzipSync(result.body);
    expect(Object.keys(unzipped).sort()).toEqual(
      [VALIDATIONS_JSON, VALIDATIONS_CSV, SUMMARY_JSON, VALIDATED_JSON, VALIDATED_CSV].sort(),
    );

    // Byte-equivalence with the operator documents over the same corpus: the envelope is
    // new, the contents are not.
    const expected = renderDocuments(
      RESPONSES.map((r) => ({
        entry: ENTRIES[0]!,
        response: r,
        proficiency: "fluent" as const,
        qualifies: true,
      })),
      ENTRIES,
    );
    const text = (name: string): string =>
      Buffer.from(unzipped[name] as Uint8Array).toString("utf8");
    expect(text(VALIDATIONS_JSON)).toBe(expected.validationsJson);
    expect(text(VALIDATIONS_CSV)).toBe(expected.validationsCsv);
    expect(text(SUMMARY_JSON)).toBe(expected.summaryJson);
    expect(text(VALIDATED_JSON)).toBe(expected.validatedJson);
    expect(text(VALIDATED_CSV)).toBe(expected.validatedCsv);

    // One audit line: counts and the non-secret credential position, no session content.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("credential #1");
    expect(logged[0]).toContain("2 entries");
    expect(logged[0]).not.toContain(OPERATOR_SECRET);
    expect(logged[0]).not.toContain(SESSION_SECRET);
  });

  it("refuses rather than truncates when the corpus exceeds the bound", async () => {
    const result = await buildResearchDownload({
      presented: signedSession(),
      adminEnv,
      nowMs: NOW,
      repositories: sources([]),
      log: () => {},
      maxBytes: 10,
    });

    expect(result.status).toBe("too_large");
  });

  it("dates the filename by the server clock", () => {
    expect(exportFilename(new Date("2026-01-15T00:00:00.000Z").getTime())).toBe(
      "sadino-research-export-2026-01-15.zip",
    );
    expect(MAX_EXPORT_ZIP_BYTES).toBe(25 * 1024 * 1024);
  });
});
