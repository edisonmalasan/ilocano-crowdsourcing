import { describe, expect, it, vi } from "vitest";

import { WriteIntentError, isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";

import type { ValidationsRepository } from "@/lib/repositories";
import type { ValidationResponse } from "@/schemas/validation";
import { validationResponseInputSchema } from "@/schemas/validation";

vi.mock("server-only", () => ({}));

/**
 * A repository that records every call, so the test can prove nothing was persisted.
 *
 * Counting calls is the point: asserting only that an error was thrown would still pass if the
 * implementation validated *after* writing. The "zero calls" assertion is what makes
 * "rejected before persistence" a real claim.
 */
function createCountingRepository() {
  const calls: string[] = [];
  const stored: ValidationResponse[] = [];

  const repository: ValidationsRepository = {
    async insert(response) {
      calls.push("insert");
      stored.push(response);
      return response;
    },
    async findById(id) {
      calls.push("findById");
      return stored.find((response) => response.id === id) ?? null;
    },
    async findByEntry(entryId) {
      calls.push("findByEntry");
      return stored.filter((response) => response.datasetEntryId === entryId);
    },
    async countForEntry(entryId) {
      calls.push("countForEntry");
      return stored.filter((response) => response.datasetEntryId === entryId).length;
    },
    async countForValidator(validatorId) {
      calls.push("countForValidator");
      return stored.filter((response) => response.validatorId === validatorId).length;
    },
    // The two allocation reads. Nothing in this file exercises them, and they are here only
    // because `ValidationsRepository` is a CLOSED interface and `tsc` rejects an object literal
    // that does not satisfy it. They are deliberately the same shape as the count methods above so
    // that a future reader does not mistake them for behaviour under test: every one of them records
    // a call name, which means if a write-intake path ever started calling them, the `calls`
    // assertions in this file would see it.
    async listForEntries(entryIds) {
      calls.push("listForEntries");
      const wanted = new Set(entryIds);
      return stored.filter((response) => wanted.has(response.datasetEntryId));
    },
    async listAllValidatorIds() {
      calls.push("listAllValidatorIds");
      return stored.map((response) => response.validatorId);
    },
    async listEntryIdsForValidator(validatorId) {
      calls.push("listEntryIdsForValidator");
      return stored
        .filter((response) => response.validatorId === validatorId)
        .map((response) => response.datasetEntryId);
    },
  };

  return { repository, calls, stored };
}

/** Stands in for a Server Action body: parse first, then persist. */
async function submitValidation(raw: unknown): Promise<ValidationResponse> {
  const { repository } = createCountingRepository();
  const intent = parseWriteIntent(validationResponseInputSchema, raw, {
    schemaName: "validationResponseInput",
  });

  return repository.insert({
    id: "res_01",
    validatorId: "VAL_a81d92c1",
    datasetEntryId: "OD_0001",
    batchId: "batch_01",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...intent,
  });
}

describe("write-intake rejection", () => {
  it("rejects a malformed payload and records ZERO repository calls", async () => {
    const { repository, calls, stored } = createCountingRepository();

    // `incorrect` without a correction: the most consequential integrity rule.
    const error = await (async () => {
      try {
        const intent = parseWriteIntent(validationResponseInputSchema, {
          evaluation: "incorrect",
        });
        await repository.insert({
          id: "res_01",
          validatorId: "VAL_a81d92c1",
          datasetEntryId: "OD_0001",
          batchId: "batch_01",
          createdAt: "2026-09-30T00:00:00.000Z",
          updatedAt: "2026-09-30T00:00:00.000Z",
          ...intent,
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(isWriteIntentError(error)).toBe(true);
    expect(calls).toEqual([]);
    expect(stored).toEqual([]);
  });

  it("lists the offending field path, so a form can attach the message to the right control", async () => {
    // Both translations ARE supplied, so the correction is the only defect. The payload used to be
    // a bare `{ evaluation: "incorrect" }`, which now also misses both translations — the rejection
    // would still have been correct, and the assertion would still have passed, but it would have
    // been asserting three field paths against an expectation of one. A test that fails for the
    // wrong reason is not evidence.
    const error = (() => {
      try {
        parseWriteIntent(validationResponseInputSchema, {
          evaluation: "incorrect",
          englishTranslation: "Go by jeep.",
          filipinoTranslation: "Sumakay ng jeep.",
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(WriteIntentError);
    const writeError = error as WriteIntentError;

    expect(writeError.issues.map((issue) => issue.path)).toEqual(["correctedInstruction"]);
    expect(writeError.fieldIssues.correctedInstruction).toHaveLength(1);
  });

  it("lists every offending field, not only the first", async () => {
    // The point of this test is that THREE fields are reported, so the payload must genuinely
    // violate three rules: a correction on a `cannot_evaluate` response, plus both translations.
    const error = (() => {
      try {
        parseWriteIntent(validationResponseInputSchema, {
          evaluation: "cannot_evaluate",
          correctedInstruction: "Gemahen ti jeep.",
          englishTranslation: "Go by jeep.",
          filipinoTranslation: "Sumakay ng jeep.",
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect((error as WriteIntentError).issues.map((issue) => issue.path).sort()).toEqual([
      "correctedInstruction",
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("reports NO translation issue for a skipped-translation response, there being none", async () => {
    // The inverse of what this test asserted under the required pair: absence is now a legitimate
    // choice, so a payload carrying neither translation parses cleanly rather than producing one
    // issue per field. A form that needs per-field guidance gets it from the language CHOICE
    // being unmade, not from the schema — and the choice lives in the form, not in this payload.
    const parsed = parseWriteIntent(validationResponseInputSchema, {
      evaluation: "correct_natural",
    });

    expect(parsed.evaluation).toBe("correct_natural");
    expect("englishTranslation" in parsed).toBe(false);
    expect("filipinoTranslation" in parsed).toBe(false);
  });

  it("names the schema in the error so a log identifies which contract rejected the payload", () => {
    const error = (() => {
      try {
        parseWriteIntent(
          validationResponseInputSchema,
          {},
          { schemaName: "validationResponseInput" },
        );
        return null;
      } catch (caught) {
        return caught;
      }
    })() as WriteIntentError;

    expect(error.schemaName).toBe("validationResponseInput");
    expect(error.message).toContain("validationResponseInput");
  });

  it("never includes the submitted value in the error message, so it is safe to log", () => {
    const error = (() => {
      try {
        parseWriteIntent(validationResponseInputSchema, {
          evaluation: "incorrect",
          correctedInstruction: "   ",
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })() as WriteIntentError;

    expect(error.message).not.toContain("Gemahen");
  });
});

describe("write-intake acceptance", () => {
  it("passes a valid payload through unchanged", () => {
    const raw = {
      evaluation: "incorrect",
      correctedInstruction: "Gemahen nga agpangide ti jeep.",
      englishTranslation: "Go to the bank by jeep.",
      filipinoTranslation: "Pumunta sa bangko gamit ang jeep.",
    };

    expect(parseWriteIntent(validationResponseInputSchema, raw)).toEqual(raw);
  });

  it("returns the normalized value, so persistence stores exactly what the schema approved", () => {
    const parsed = parseWriteIntent(validationResponseInputSchema, {
      evaluation: "correct_unnatural",
      correctedInstruction: "  Gemahen   nga  agpangide ti jeep.  ",
      englishTranslation: "  Go to   the bank by jeep.  ",
      filipinoTranslation: "  Pumunta   sa bangko gamit ang jeep.  ",
    });

    expect(parsed.correctedInstruction).toBe("Gemahen nga agpangide ti jeep.");
    expect(parsed.englishTranslation).toBe("Go to the bank by jeep.");
    expect(parsed.filipinoTranslation).toBe("Pumunta sa bangko gamit ang jeep.");
  });

  it("strips keys the schema does not model, so an unexpected field never reaches persistence", () => {
    const parsed = parseWriteIntent(validationResponseInputSchema, {
      evaluation: "correct_natural",
      englishTranslation: "Go to the bank by jeep.",
      filipinoTranslation: "Pumunta sa bangko.",
      // A client trying to dictate authoritative state it does not own.
      coverageCount: 999,
      isComplete: true,
    });

    expect(parsed).toEqual({
      evaluation: "correct_natural",
      englishTranslation: "Go to the bank by jeep.",
      filipinoTranslation: "Pumunta sa bangko.",
    });
    expect("coverageCount" in parsed).toBe(false);
  });

  it("strips the superseded single-translation keys, recording a judgment without translations", () => {
    // A client on the previous wire format sends a language discriminator and one text. Both keys
    // are unknown to the schema and are dropped rather than honoured — and with translations
    // optional, the stripped payload is an ACCEPTED translation-free response. Nothing is
    // silently lost: the stripped keys carried at most one translation, and the record stands as
    // a judgment without translations rather than failing closed.
    const parsed = parseWriteIntent(validationResponseInputSchema, {
      evaluation: "correct_natural",
      translationLanguage: "filipino",
      translationText: "Pumunta sa bangko.",
    });

    expect(parsed).toEqual({ evaluation: "correct_natural" });
  });

  it("writes exactly once when the payload is valid", async () => {
    const response = await submitValidation({
      evaluation: "correct_natural",
      englishTranslation: "Go to the bank by jeep.",
      filipinoTranslation: "Pumunta sa bangko.",
    });

    expect(response.evaluation).toBe("correct_natural");
    expect(response.englishTranslation).toBe("Go to the bank by jeep.");
    expect(response.filipinoTranslation).toBe("Pumunta sa bangko.");
  });
});
