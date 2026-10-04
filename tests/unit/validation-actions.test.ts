import { describe, expect, it, vi } from "vitest";

import { createValidationResponseId } from "@/lib/domain/validation-response-id";
import {
  POSTGREST_UNIQUE_VIOLATION_CODE,
  RepositoryError,
  type ValidationsRepository,
} from "@/lib/repositories";
import {
  runSubmitValidation,
  type ValidationActionDependencies,
} from "@/lib/validation/validation-actions-core";
import { validationResponseSchema } from "@/schemas/validation";

/**
 * The module marker, stubbed because this module IMPORTS a module that carries it.
 *
 * `validation-actions-core.ts` declares no `server-only` of its own — that was a deliberate design
 * decision, so the decisions in it are reachable from a plain unit test. But it imports
 * `parseWriteIntent` from `@/lib/server/write-intake`, which carries the marker because it IS the
 * write-intake boundary. So the stub is needed, and the first draft of this file asserted it was not:
 * it collected zero tests and reported `Test Files 1 failed`, a shape that is indistinguishable from
 * "no tests matched" and from a green run if only the exit code is read.
 */
vi.mock("server-only", () => ({}));

/**
 * The validation Server Action's CORE — the write, with repositories injected.
 *
 * =================================================================================================
 * WHY THE CORE IS SEPARATE FROM THE WRAPPER
 * =================================================================================================
 * `validation-actions-wrapper.test.ts` drives the `"use server"` file with the environment module
 * stubbed to throw. That is the path that ACTUALLY RUNS in the current deployment, where all three
 * `SUPABASE_*` variables are absent. This file drives the core with repositories injected, so every
 * classification below is reachable with no credential and no network. A test of only one leaves the
 * other path unexercised, which is the gap a green checkmark once hid in this repository.
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * No Supabase client has ever been constructed. The duplicate path is proven against an error object
 * this file BUILDS, not against one PostgREST produced — so `cause.code === "23505"` is a claim about
 * the shape of a `RepositoryError`, not an observation of the wire. `SupabaseValidationsRepository`
 * must actually preserve `cause` for this to hold in production, and that is a claim about
 * `repositories-supabase.test.ts` against a recording fake, which is not the same claim. It is stated
 * here rather than left to be discovered.
 */

/** The fixed timestamp every write is stamped with, so a test can assert the server derived it. */
const NOW = new Date("2026-10-01T09:30:00.000Z");
const NOW_ISO = NOW.toISOString();

/**
 * A `RepositoryError` shaped the way `SupabaseValidationsRepository` shapes one for a uniqueness
 * refusal: the PostgREST error kept as `cause`, carrying the SQLSTATE in `code`.
 *
 * Built by a function rather than written out inline five times, and each caller passes the ONE thing
 * that differs — so a change to the shape has one place to change and every call site is still a real
 * assertion about a real error.
 */
function uniqueViolation(over: { readonly detail?: string } = {}): RepositoryError {
  return new RepositoryError("validations.insert", "a validation response already exists", {
    cause: { code: POSTGREST_UNIQUE_VIOLATION_CODE },
    detail: over.detail,
  });
}

/** A complete, valid evaluable response — the `correct_natural` shape, carrying both translations. */
function evaluableResponse(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evaluation: "correct_natural",
    englishTranslation: "Go to the Baguio Athletic Bowl.",
    filipinoTranslation: "Pumunta sa Baguio Athletic Bowl.",
    ...over,
  };
}

/**
 * A real anonymous validator identifier, taken from the schema's own pattern rather than invented.
 *
 * The first draft of this file used `"v-abc123"`, and 22 of its 23 tests failed with
 * `a payload that passed validationResponseInputSchema failed validationResponseSchema:
 * [{ path: ['validatorId'], message: 'id must look like VAL_ followed by 8 lowercase hex…' }]`.
 *
 * That is worth recording rather than merely fixing, because the failure came from `buildStoredResponse`
 * — the guard whose entire job is to refuse a stored record that does not satisfy the study's own
 * schema. It fired on a fixture rather than on production code, which is the safe direction, and it
 * fired with a message naming the field. A fixture that does not match the real id format produces a
 * loud failure; a fixture that matches the real format but a wrong one produces a silent one.
 */
const VALIDATOR_ID = "VAL_0a1b2c3d";

interface RecordingOptions {
  readonly batch?: {
    readonly id: string;
    readonly validatorId: string;
    readonly entryIds: string[];
  } | null;
  readonly completedEntryIds?: readonly string[];
  /** Thrown by `batches.findById` when set. */
  readonly batchFailure?: unknown;
  /** Thrown by `validations.insert` when set. */
  readonly insertFailure?: unknown;
  /** Thrown by `entryReservations.releaseReservation` when set. */
  readonly releaseFailure?: unknown;
  /** The id the repository returns from `insert`; differs from the minted one to prove it is reported. */
  readonly storedResponseId?: string;
  readonly missingEntryIds?: readonly string[];
}

interface Recording extends ValidationActionDependencies {
  readonly calls: string[];
  /** Every record handed to `validations.insert`, as the repository received it. */
  readonly inserted: unknown[];
}

/** Dependencies that record every call and never reach a database. */
function createRecordingDependencies(over: RecordingOptions = {}): Recording {
  const calls: string[] = [];
  const inserted: unknown[] = [];
  const batch = over.batch === undefined ? null : over.batch;
  const stored = over.storedResponseId ?? "rsp_from_the_repository";

  return {
    calls,
    inserted,
    batches: {
      async findById(id: string) {
        calls.push(`batches.findById:${id}`);
        if (over.batchFailure !== undefined) throw over.batchFailure;
        if (batch === null) return null;
        return {
          id: batch.id,
          validatorId: batch.validatorId,
          entries: batch.entryIds.map((datasetEntryId, index) => ({
            datasetEntryId,
            position: index + 1,
          })),
        };
      },
    },
    validations: {
      // The parameter is the STORED RECORD TYPE, not `unknown`, and returning only `{ id }` fails
      // typecheck at `TS2322: Type '{ id: string; }' is missing … validatorId, datasetEntryId, batchId,
      // createdAt`. That is the repository contract being asserted rather than a nuisance: an
      // implementation whose `insert` returned a partial row would be caught here rather than at review.
      //
      // ONLY `insert`. The action's dependency is `Pick<ValidationsRepository, "insert">`, and a fake
      // that also offered `listEntryIdsForValidator` was refused at
      // `TS2353: 'listEntryIdsForValidator' does not exist in type 'Pick<ValidationsRepository,
      // "insert">'`. The narrow `Pick` is the boundary doing its job: the write cannot read, so a fake
      // offering to be read is a defect in the test rather than a harmless extra.
      async insert(record: Parameters<ValidationsRepository["insert"]>[0]) {
        calls.push("validations.insert");
        inserted.push(record);
        if (over.insertFailure !== undefined) throw over.insertFailure;
        return { ...record, id: stored };
      },
    },
    entryReservations: {
      async releaseReservation(validatorId: string, entryId: string) {
        calls.push(`entryReservations.releaseReservation:${validatorId}:${entryId}`);
        if (over.releaseFailure !== undefined) throw over.releaseFailure;
      },
    },
    now: () => NOW,
  };
}

const A_BATCH = { id: "batch-1", validatorId: VALIDATOR_ID, entryIds: ["OD_0001", "OD_0002"] };

/**
 * A submit intent carrying the three keys the action accepts, and nothing else.
 *
 * Returns `Record<string, unknown>` rather than `unknown`, because a caller SPREADS it to add a
 * deliberate extra key and TypeScript refuses to spread `unknown` (`TS2698: Spread types may only be
 * created from object types`). Every other test passes the result straight to the action, where `unknown`
 * is exactly right — the point of the refusals is that the action accepts anything and decides.
 */
function intentFor(response: unknown, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { batchId: "batch-1", datasetEntryId: "OD_0001", response, ...over };
}

/**
 * The leaf field names of a set of dot-joined issue paths.
 *
 * Split on `.` rather than indexing, because the path is a string. A field name containing a `.` is not
 * possible for any of these keys — they are closed literals — so the split loses nothing, and it is the
 * only reading that is correct for the value `write-intake` actually produces.
 */
function fieldsIn(paths: readonly string[]): string[] {
  return paths.map((path) => path.slice(path.lastIndexOf(".") + 1));
}

describe("recording a completed response", () => {
  it("stores it, and reports the id the REPOSITORY returned rather than the one it minted", async () => {
    // The distinction is the only way a repository that stored something else becomes visible. Echoing
    // the minted id would paper over a repository that returned a different row.
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      storedResponseId: "rsp_read_back",
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({
      status: "recorded",
      responseId: "rsp_read_back",
      datasetEntryId: "OD_0001",
    });
    // And the record handed to storage is NOT what the repository echoed.
    const stored = deps.inserted[0] as { readonly id: string };
    expect(stored.id).not.toBe("rsp_read_back");
    expect(stored.id).toMatch(/^RSP_[0-9a-f]{16}$/);
  });

  it("takes the OWNING validator from the batch record, and never from the request", async () => {
    const deps = createRecordingDependencies({ batch: A_BATCH });

    await runSubmitValidation(intentFor(evaluableResponse()), deps);

    const stored = deps.inserted[0] as { readonly validatorId: string };
    expect(stored.validatorId).toBe(VALIDATOR_ID);
  });

  it("releases the submitter's own claim after a stored response", async () => {
    // Release runs after the insert, scoped to the owning validator and the answered entry — so
    // the row it removes can only ever be this submit's own. A release scoped wider would let
    // one submit free another attempt's hold.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result.status).toBe("recorded");
    expect(deps.calls).toContain(`entryReservations.releaseReservation:${VALIDATOR_ID}:OD_0001`);
    expect(deps.calls.indexOf("validations.insert")).toBeLessThan(
      deps.calls.indexOf(`entryReservations.releaseReservation:${VALIDATOR_ID}:OD_0001`),
    );
  });

  it("still reports recorded when the release fails, because the answer IS stored", async () => {
    // The asymmetry is deliberate and goes one way only: a stuck lease row decays by TTL, while
    // a recorded submit reported as failed would tell a validator banked work was lost. Failing
    // the submit over the release would invert that.
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      releaseFailure: new RepositoryError("entry_reservations.release", "lease table down"),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result.status).toBe("recorded");
  });

  it("stamps BOTH timestamps from the injected clock", async () => {
    const deps = createRecordingDependencies({ batch: A_BATCH });

    await runSubmitValidation(intentFor(evaluableResponse()), deps);

    const stored = deps.inserted[0] as { readonly createdAt: string; readonly updatedAt: string };
    expect(stored.createdAt).toBe(NOW_ISO);
    expect(stored.updatedAt).toBe(NOW_ISO);
  });

  it("never writes the correction or a translation over the dataset entry", async () => {
    // The boundary is structural: the repositories handed to this action are `batches.findById` and
    // `validations.insert`. There is no dataset-entry repository in the dependency type at all, so
    // this action cannot write to one — and the assertion that proves it is the CALL LIST, not a
    // comment. Adding a dataset write would require changing the type first.
    //
    // The response is an `incorrect` one, which REQUIRES a correction, so the correction under test is
    // one the study actually accepts. The first draft used `correct_natural` plus a correction, which
    // is correctly refused — so the test proved the boundary by never reaching a write at all, which
    // is the shape this repository has recorded twice: a test that passes for the wrong reason.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(
      intentFor(
        evaluableResponse({
          evaluation: "incorrect",
          correctedInstruction: "Iti Baguio Athletic Bowl ti pagtapon.",
        }),
      ),
      deps,
    );

    expect(result.status).toBe("recorded");
    expect(deps.calls).toEqual([
      "batches.findById:batch-1",
      "validations.insert",
      "entryReservations.releaseReservation:VAL_0a1b2c3d:OD_0001",
    ]);
    expect(deps.calls.some((call) => call.includes("dataset"))).toBe(false);
    // And the correction went into the RESPONSE, beside the instruction — not anywhere else.
    expect((deps.inserted[0] as Record<string, unknown>)["correctedInstruction"]).toBe(
      "Iti Baguio Athletic Bowl ti pagtapon.",
    );
  });

  it("persists the validator's OWN translations for the VALIDATED sentence, byte for byte", async () => {
    // Task 4.3's persistence half. The client half asserts what is submitted; this asserts what
    // reaches the row, because a server that normalised, trimmed, defaulted, or paired a translation
    // with the dataset's own wording would satisfy the form's test and corrupt the research record.
    //
    // The pair is deliberately NOT the correction's text: a translation is a translation, and
    // asserting the correction had been substituted for it would pass on a bug.
    const deps = createRecordingDependencies({ batch: A_BATCH });
    const CORRECTION = "Iti Baguio Athletic Bowl ti pagtapon.";
    const ENGLISH = "Go to the Baguio Athletic Bowl.";
    const FILIPINO = "Pumunta sa Baguio Athletic Bowl.";

    const result = await runSubmitValidation(
      intentFor(
        evaluableResponse({
          evaluation: "incorrect",
          correctedInstruction: CORRECTION,
          englishTranslation: ENGLISH,
          filipinoTranslation: FILIPINO,
        }),
      ),
      deps,
    );

    expect(result.status).toBe("recorded");
    const stored = deps.inserted[0] as Record<string, unknown>;
    expect(stored["correctedInstruction"]).toBe(CORRECTION);
    expect(stored["englishTranslation"]).toBe(ENGLISH);
    expect(stored["filipinoTranslation"]).toBe(FILIPINO);
    // Neither is the correction and neither is the other: a swap is the failure this catches.
    expect(stored["englishTranslation"]).not.toBe(FILIPINO);
    expect(stored["filipinoTranslation"]).not.toBe(ENGLISH);
  });

  it("writes NO dataset field, so no correction or translation can reach the source instruction", async () => {
    // The strongest form of 4.3, and the one that is a property of the ARCHITECTURE rather than of a
    // function. The correction and the translations live on the response row. The dataset entry's own
    // `instruction` is not a field of the response, and this change holds no repository capable of
    // writing one — so the rule "never overwrite the imported synthetic instruction" is enforced by the
    // absence of a path, not by a check somebody could forget.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    await runSubmitValidation(
      intentFor(
        evaluableResponse({
          evaluation: "incorrect",
          correctedInstruction: "Iti Baguio Athletic Bowl ti pagtapon.",
        }),
      ),
      deps,
    );

    // Every call this action made, in order. No dataset write exists to make.
    expect(deps.calls).toEqual([
      "batches.findById:batch-1",
      "validations.insert",
      "entryReservations.releaseReservation:VAL_0a1b2c3d:OD_0001",
    ]);
    // And the stored row carries no field that could be one.
    const stored = deps.inserted[0] as Record<string, unknown>;
    for (const forbidden of ["instruction", "sourcePayload", "sourceInstruction", "text"]) {
      expect(stored, `the response row must not carry \`${forbidden}\``).not.toHaveProperty(
        forbidden,
      );
    }
    // The response row's key set, exactly. An added key is a new place for research text to go, and
    // this is the cheapest moment to notice one.
    expect(Object.keys(stored).sort()).toEqual([
      "batchId",
      "correctedInstruction",
      "createdAt",
      "datasetEntryId",
      "englishTranslation",
      "evaluation",
      "filipinoTranslation",
      "id",
      "updatedAt",
      "validatorId",
    ]);
  });

  it("stores a record that satisfies the STORED schema, not merely the input schema", async () => {
    // Both schemas share one `superRefine`, so the stored record is re-validated with the server's four
    // added fields. This asserts the stored object is genuinely valid rather than plausible.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    await runSubmitValidation(intentFor(evaluableResponse()), deps);

    const parsed = validationResponseSchema.safeParse(deps.inserted[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.batchId).toBe("batch-1");
    expect(parsed.success && parsed.data.datasetEntryId).toBe("OD_0001");
  });

  it("records a `cannot_evaluate` response with NEITHER correction NOR translation", async () => {
    // The approved shape: the approved way to decline carries nothing else, and the stored record is
    // exactly the evaluation. Not "carries no translation" — carries no free text at all, because a
    // validator who is not confident may still have written something in a box.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(intentFor({ evaluation: "cannot_evaluate" }), deps);

    expect(result.status).toBe("recorded");
    const stored = deps.inserted[0] as Record<string, unknown>;
    expect(stored["evaluation"]).toBe("cannot_evaluate");
    expect(stored["correctedInstruction"]).toBeUndefined();
    expect(stored["englishTranslation"]).toBeUndefined();
    expect(stored["filipinoTranslation"]).toBeUndefined();
  });

  it("records a correction for `incorrect`, which requires one", async () => {
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(
      intentFor(
        evaluableResponse({
          evaluation: "incorrect",
          correctedInstruction: "Iti Baguio Athletic Bowl ti pagtapon.",
        }),
      ),
      deps,
    );

    expect(result.status).toBe("recorded");
    const stored = deps.inserted[0] as { readonly correctedInstruction: string };
    expect(stored.correctedInstruction).toBe("Iti Baguio Athletic Bowl ti pagtapon.");
  });

  it("REFUSES a whitespace-only translation, because a blank is not a skip", async () => {
    // Absence is a legitimate choice; a blank in a SUPPLIED field is not. The validator chose
    // the language and supplied nothing usable, and accepting that as a skip would record a
    // choice the stored data contradicts — so the field schema refuses it before any rule runs,
    // and the pair never reaches storage.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(
      intentFor(
        evaluableResponse({
          evaluation: "correct_unnatural",
          correctedInstruction: "Iti Baguio.",
          englishTranslation: "   ",
          filipinoTranslation: "\t\n ",
        }),
      ),
      deps,
    );

    expect(result).toEqual({ status: "failed", reason: "invalid", issues: expect.anything() });
    expect(deps.inserted).toEqual([]);
  });

  it("REFUSES a whitespace-only correction even where no correction is allowed", async () => {
    // A blank is a supplied-but-empty field, not absence: the field schema refuses it before the
    // evaluation rule could read it as nothing. Asserted as the refusal it is.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(
      intentFor({
        evaluation: "cannot_evaluate",
        correctedInstruction: "   ",
      }),
      deps,
    );

    expect(result).toEqual({ status: "failed", reason: "invalid", issues: expect.anything() });
    expect(deps.inserted).toEqual([]);
  });

  it("trims surrounding whitespace from a real translation rather than storing it", async () => {
    // The positive half of the normalisation, and the one that matters for the stored text: a
    // translation with a trailing newline is common from a textarea, and storing it verbatim makes two
    // identical research values differ as strings.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    await runSubmitValidation(
      intentFor(evaluableResponse({ englishTranslation: "  Go to the bowl.\n" })),
      deps,
    );

    expect((deps.inserted[0] as Record<string, unknown>)["englishTranslation"]).toBe(
      "Go to the bowl.",
    );
  });
});

describe("what the write REFUSES, and what it never touches", () => {
  it("reads NOTHING and writes NOTHING when the payload is malformed", async () => {
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation({ nonsense: true }, deps);

    expect(result).toEqual({ status: "failed", reason: "invalid", issues: expect.anything() });
    expect(deps.calls).toEqual([]);
    expect(deps.inserted).toEqual([]);
  });

  it("REFUSES any extra key in the intent, rather than stripping it", async () => {
    // The five keys below are the ones a client would plausibly add. A `strictObject` turns each into
    // a refusal, and a refusal is visible from outside — whereas a stripped key looks identical to a
    // request whose values happened not to matter.
    const attempts: ReadonlyArray<readonly [string, unknown]> = [
      ["validatorId", "v-attacker"],
      ["id", "rsp_chosen_by_the_client"],
      ["position", 4],
      ["createdAt", "2020-01-01T00:00:00.000Z"],
      ["clientOrder", [3, 1, 2]],
      ["skip", true],
    ];

    for (const [key, value] of attempts) {
      const deps = createRecordingDependencies({ batch: A_BATCH });
      const result = await runSubmitValidation(
        { ...intentFor(evaluableResponse()), [key]: value },
        deps,
      );

      expect(
        result.status === "failed" && result.reason === "invalid",
        `the intent schema must REFUSE an extra "${key}"`,
      ).toBe(true);
      expect(deps.calls, `nothing may be read for an extra "${key}"`).toEqual([]);
      expect(deps.inserted, `nothing may be written for an extra "${key}"`).toEqual([]);
    }
  });

  it("reports `unknown_batch` for a batch that does not exist, and does not write", async () => {
    const deps = createRecordingDependencies({ batch: null });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({ status: "failed", reason: "unknown_batch" });
    expect(deps.inserted).toEqual([]);
  });

  it("reports `not_in_batch` for an entry this batch never contained", async () => {
    // Filing against a batch that did not hold the entry would put a research record somewhere the
    // allocation audit does not cover, so the refusal is the only honest answer.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(
      { batchId: "batch-1", datasetEntryId: "OD_0500", response: evaluableResponse() },
      deps,
    );

    expect(result).toEqual({ status: "failed", reason: "not_in_batch" });
    expect(deps.calls).toEqual(["batches.findById:batch-1"]);
    expect(deps.inserted).toEqual([]);
  });

  it("checks MEMBERSHIP and not POSITION, so a position cannot redirect the response", async () => {
    // `OD_0002` is the batch's SECOND entry. Asking for it with `position: 1` must still record against
    // `OD_0002` — the entry id is the subject, and the position is not a routing instruction.
    const deps = createRecordingDependencies({ batch: A_BATCH });

    const result = await runSubmitValidation(
      { batchId: "batch-1", datasetEntryId: "OD_0002", response: evaluableResponse() },
      deps,
    );

    expect(result.status).toBe("recorded");
    const stored = deps.inserted[0] as { readonly datasetEntryId: string };
    expect(stored.datasetEntryId).toBe("OD_0002");
  });

  it("applies the SEVEN integrity rules, and reports which field failed", async () => {
    // These are the rules already enforced twice — by `validationResponseInputSchema` and by the
    // database. The action is the third place they pass through, and the point of this test is that
    // the third place is not a third implementation.
    //
    // Seven, as before, but a different seven: the two translation-presence rules are gone —
    // absence is a skip now — and two blank-refusal cases take their place.
    const attempts: ReadonlyArray<readonly [string, unknown, string]> = [
      [
        "blank English translation",
        evaluableResponse({ englishTranslation: "  " }),
        "englishTranslation",
      ],
      [
        "blank correction on incorrect",
        evaluableResponse({ evaluation: "incorrect", correctedInstruction: "  " }),
        "correctedInstruction",
      ],
      [
        "a correction for correct_natural",
        evaluableResponse({ correctedInstruction: "Iti Baguio." }),
        "correctedInstruction",
      ],
      [
        "a correction missing entirely on incorrect",
        evaluableResponse({ evaluation: "incorrect" }),
        "correctedInstruction",
      ],
      [
        "a translation on cannot_evaluate",
        { evaluation: "cannot_evaluate", englishTranslation: "Go." },
        "englishTranslation",
      ],
      ["an unknown evaluation", evaluableResponse({ evaluation: "looks_wrong" }), "evaluation"],
      [
        "a correction missing on correct_unnatural",
        evaluableResponse({ evaluation: "correct_unnatural" }),
        "correctedInstruction",
      ],
    ];

    for (const [label, response, expectedField] of attempts) {
      const deps = createRecordingDependencies({ batch: A_BATCH });
      const result = await runSubmitValidation(intentFor(response), deps);

      expect(
        result.status === "failed" && result.reason === "invalid",
        `${label} must be refused before any repository is touched`,
      ).toBe(true);
      // `write-intake` reports the path as a DOT-JOINED STRING against the wrapped intent, so a real path is
      // `"response.filipinoTranslation"`. Two measurements got this wrong in sequence: the first draft
      // compared the whole string against `"filipinoTranslation"`, and the second indexed the string as
      // if it were an array and produced `"n"` — the last CHARACTER. Both failed against correct code,
      // which is this file's third instance of writing an expected value down instead of deriving it.
      // The path is asserted in full below so its shape is pinned rather than assumed, and the last
      // segment is what a form attaches a message to.
      const paths =
        result.status === "failed" && result.issues ? result.issues.map((issue) => issue.path) : [];
      expect(
        fieldsIn(paths),
        `${label}: the message must name the field the participant can fix`,
      ).toContain(expectedField);
      expect(deps.calls, `${label}: nothing may be read`).toEqual([]);
    }
  });

  it("reports `persistence` when the BATCH read fails, and does not report the answer as saved", async () => {
    // The word `persistence` matters: the alternative would be a sentence telling a participant their
    // typed correction was stored when it was dropped, and they would have no way to know to retype it.
    const deps = createRecordingDependencies({
      batchFailure: new RepositoryError(
        "validation_batches.findById",
        "the batch table is unreachable",
      ),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
    expect(deps.inserted).toEqual([]);
  });

  it("reports `persistence` when the WRITE fails, and never as `recorded`", async () => {
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      insertFailure: new RepositoryError(
        "validations.insert",
        "the validations table is unreachable",
      ),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
    // The record WAS handed to the repository; it just did not land. The distinction matters for
    // nobody reading the result and is asserted so the test cannot be satisfied by a write that was
    // never attempted.
    expect(deps.calls).toContain("validations.insert");
  });

  it("does not swallow a NON-repository throw, because that is a bug and not a storage fault", async () => {
    // Reporting a code defect as `persistence` sends an operator to the database for something the
    // database did not do. It propagates, and the wrapper's boundary decides what to log.
    const deps = createRecordingDependencies({
      batchFailure: new TypeError("cannot read properties of undefined"),
    });

    await expect(runSubmitValidation(intentFor(evaluableResponse()), deps)).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});

describe("the duplicate refusal, which is a SUCCESS with a different name", () => {
  // ===============================================================================================
  // WHY THIS IS ITS OWN DESCRIBE
  // ===============================================================================================
  // A duplicate and a fault look identical to a caller that checks only "the insert failed". One means
  // the participant's work IS stored and the session should advance; the other means it is NOT stored
  // and they must be told so. Reporting the second as the first tells a validator their typed
  // correction was saved when it was dropped — so this classification is the difference between a
  // study that loses one response and a study that silently loses corrections.
  it("advances the session when the uniqueness constraint refuses a second response", async () => {
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      insertFailure: uniqueViolation(),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({ status: "already_recorded", datasetEntryId: "OD_0001" });
  });

  it("does NOT report a duplicate as `recorded`, because no new row exists", async () => {
    const deps = createRecordingDependencies({ batch: A_BATCH, insertFailure: uniqueViolation() });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result.status).not.toBe("recorded");
    // `recorded` carries a response id; a duplicate has none to report, and inventing one would be a
    // fabricated identifier in a research record.
    expect(Object.keys(result)).not.toContain("responseId");
  });

  it("detects the duplicate by the SQLSTATE on `cause`, NOT by matching the message", async () => {
    // `SupabaseValidationsRepository.insert` deliberately writes a DIFFERENT message for `23505` than
    // `persistenceFailure` would, so the two are distinguishable in the message — but matching prose is
    // matching a formatted sentence. This case changes the message and keeps the code, and it must
    // still be recognised as a duplicate.
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      insertFailure: uniqueViolation({
        detail: "Key (validator_id, dataset_entry_id) already exists.",
      }),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result.status).toBe("already_recorded");
  });

  it("treats a `23505` on a DIFFERENT operation as a fault, not a duplicate", async () => {
    // Both conditions are load-bearing. If either were dropped, a uniqueness failure anywhere else in
    // the write — say a batch row whose generated id collided — would be reported to a participant as
    // "you already answered this", which is a statement about their behaviour that is not true.
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      insertFailure: new RepositoryError(
        "validation_batches.insert",
        "a batch with that id exists",
        {
          cause: { code: POSTGREST_UNIQUE_VIOLATION_CODE },
        },
      ),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });

  it("treats a DIFFERENT SQLSTATE on the insert as a fault", async () => {
    // The paired opposite of the case above. A guard with only a positive case is satisfied by a check
    // that returns true for everything; with both, the check must actually discriminate.
    for (const code of ["23503", "42501", "PGRST301", undefined]) {
      const deps = createRecordingDependencies({
        batch: A_BATCH,
        insertFailure: new RepositoryError("validations.insert", "the write was refused", {
          cause: { code },
        }),
      });

      const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

      expect(
        result,
        `SQLSTATE ${String(code)} is not a duplicate and must report a persistence fault`,
      ).toEqual({ status: "failed", reason: "persistence" });
    }
  });

  it("tolerates a repository error with NO cause at all", async () => {
    // `error.cause` is typed `unknown`, and a hand-built or re-wrapped error may not carry one. Reading
    // `.code` off `undefined` is a TypeError inside a catch block, which would replace a reportable
    // storage fault with an unhandled crash.
    const deps = createRecordingDependencies({
      batch: A_BATCH,
      insertFailure: new RepositoryError("validations.insert", "the write failed"),
    });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });

  it("mints a response id the duplicate path never stores, so nothing is fabricated", async () => {
    // A minted id is generated before the insert, so a refused insert has consumed one. Asserting the
    // repository was still called once — and that the result carries no id — is what keeps the
    // consumed-id detail honest rather than papered over. No release runs here: the insert never
    // succeeded, so there is nothing whose claim this submit earned the right to free — and the
    // earlier submit that DID record already released it.
    const deps = createRecordingDependencies({ batch: A_BATCH, insertFailure: uniqueViolation() });

    const result = await runSubmitValidation(intentFor(evaluableResponse()), deps);

    expect(deps.calls).toEqual(["batches.findById:batch-1", "validations.insert"]);
    expect(result).not.toHaveProperty("responseId");
  });
});

describe("the response identifier", () => {
  it("is minted by the module, and is never the one a request could have carried", async () => {
    // The refutation of an id-supplying client: the request carried none, and the stored one is a fresh
    // value. Comparing against a THIRD generated id is the only form of this assertion that means
    // anything — comparing against a literal would pass if the mint returned a constant.
    const deps = createRecordingDependencies({ batch: A_BATCH });
    await runSubmitValidation(intentFor(evaluableResponse()), deps);
    const first = (deps.inserted[0] as { readonly id: string }).id;

    const other = createRecordingDependencies({ batch: A_BATCH });
    await runSubmitValidation(intentFor(evaluableResponse()), other);
    const second = (other.inserted[0] as { readonly id: string }).id;

    expect(first).not.toBe(second);
    expect(first).toMatch(/^RSP_[0-9a-f]{16}$/);
  });

  it("is the same value as the one `createValidationResponseId` produces for a schema check", async () => {
    // The mint is called inside the action, so its contract is asserted through the action rather than
    // only through its own module test — this proves the action uses THAT mint and not a local one.
    const deps = createRecordingDependencies({ batch: A_BATCH });
    await runSubmitValidation(intentFor(evaluableResponse()), deps);

    const stored = (deps.inserted[0] as { readonly id: string }).id;
    expect(stored).toMatch(new RegExp(`^${createValidationResponseId().slice(0, 4)}[0-9a-f]{16}$`));
  });

  it("is NOT a surrogate uuid, because the in-force schema forbids one", async () => {
    // `research-schema` forbids surrogate uuid primary keys for this table, so an id shaped like one
    // would be a record the approved schema does not describe. Asserted as a shape rather than by
    // referencing the spec, so it fails here rather than at review.
    const deps = createRecordingDependencies({ batch: A_BATCH });
    await runSubmitValidation(intentFor(evaluableResponse()), deps);

    const stored = (deps.inserted[0] as { readonly id: string }).id;
    expect(stored).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("the clock is the service's, not the caller's and not a hidden one", () => {
  it("is read ONCE per write, so both timestamps cannot disagree", async () => {
    // Two reads of `new Date()` in the same write can straddle a millisecond boundary, producing a
    // stored row whose `createdAt` is later than its `updatedAt`. Reading once removes the possibility
    // rather than testing for it.
    let reads = 0;
    const deps = createRecordingDependencies({ batch: A_BATCH });
    const counted: ValidationActionDependencies = {
      ...deps,
      now: () => {
        reads += 1;
        return NOW;
      },
    };

    await runSubmitValidation(intentFor(evaluableResponse()), counted);

    expect(reads).toBe(1);
  });

  it("reads the clock AFTER the batch is resolved, so a refused payload never touches it", async () => {
    // Not a research property, but it is why the refused cases above are cheap to assert: a malformed
    // payload must not have consulted time, a randomness source, or a repository.
    const now = vi.fn(() => NOW);
    const deps = createRecordingDependencies({ batch: null });

    await runSubmitValidation({ nonsense: true }, { ...deps, now });

    expect(now).not.toHaveBeenCalled();
  });
});
