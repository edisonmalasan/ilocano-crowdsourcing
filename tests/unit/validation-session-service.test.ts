import { describe, expect, it, vi } from "vitest";

import { RepositoryError, type DatasetEntriesRepository } from "@/lib/repositories";
import type { ValidationSessionDependencies } from "@/lib/validation/session-service";
import { allocatedEntrySchema, batchRecordSchema } from "@/schemas/batch";

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed here.
 */
vi.mock("server-only", () => ({}));

/**
 * Opening a validation session — the three reads the placement decision needs.
 *
 * =================================================================================================
 * WHY THE SERVICE IS SEPARATE FROM THE WRITE, stated as a test rather than a convention
 * =================================================================================================
 * A failed read and a failed write leave a participant in opposite states and must never report the
 * same sentence: one leaves them looking at nothing, the other leaves them holding a typed answer that
 * was not saved. The separation is the point, and the paired assertions below (`absent` for a batch
 * that does not exist versus `unknown_batch` from the write; `failed`/`persistence` here versus the
 * same reason there) are what make it a property rather than a file layout.
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * No repository here is a real one. Every fixture is a recording fake, so what is proven is the
 * SERVICE'S decisions — which reads it makes, in what order, and what it reports — and nothing about
 * PostgREST, the wire protocol, or whether `.in()`/`.range()` behave as assumed.
 */

const VALIDATOR_ID = "VAL_0a1b2c3d";
const NOW = "2026-09-30T12:00:00.000Z";

interface ServiceOptions {
  readonly batch?: unknown;
  readonly completedEntryIds?: readonly string[];
  readonly entries?: Readonly<Record<string, unknown>>;
  readonly missingEntryIds?: readonly string[];
  readonly batchFailure?: unknown;
  readonly validationsFailure?: unknown;
  readonly datasetFailure?: unknown;
  /** A stored entry that must FAIL `allocatedEntrySchema`, to exercise the projection refusal. */
  readonly unprojectableEntry?: unknown;
  /**
   * The lifetime figure the fake `countForValidator` answers with.
   *
   * `null` means "fall back to the number of completed ids", which keeps the pre-existing fixtures
   * that never thought about a lifetime figure reporting the same value they always did.
   */
  readonly lifetimeAnsweredCount?: number | null;
  /** A count read that fails, to prove the figure is never silently replaced by a default. */
  readonly countFailure?: unknown;
}

interface Recording extends ValidationSessionDependencies {
  readonly calls: string[];
}

function createRecording(over: ServiceOptions = {}): Recording {
  const calls: string[] = [];
  // Typed as the repository's own RETURN type rather than a bare record, so a fixture that drifts from
  // the stored-entry shape fails typecheck instead of satisfying the fake with a value the repository
  // could never return. It must be `Awaited<ReturnType<…>>` and not `Parameters<…>[0]`: the first
  // draft used the parameter type, which is the entry ID — a `string` — and the fake's `findById` then
  // failed at `TS2322: Type 'string | null' is not assignable to type '{ id: string; … }'`. A fixture
  // that returns the ID where the record belongs is the shape this catches.
  type StoredEntry = NonNullable<Awaited<ReturnType<DatasetEntriesRepository["findById"]>>>;
  const entries: Record<string, StoredEntry> = (over.entries as Record<string, StoredEntry>) ?? {
    OD_0001: storedEntry("OD_0001", "Pumunta iti Baguio Athletic Bowl."),
    OD_0002: storedEntry("OD_0002", "Langet iti Wright Park."),
    OD_0003: storedEntry("OD_0003", "Papanak iti The Mansion."),
  };

  return {
    calls,
    batches: {
      async findById(id: string) {
        calls.push(`batches.findById:${id}`);
        if (over.batchFailure !== undefined) throw over.batchFailure;
        if (over.batch === null) return null;
        const record = over.batch ?? {
          id,
          validatorId: VALIDATOR_ID,
          entries: [
            { datasetEntryId: "OD_0001", position: 1 },
            { datasetEntryId: "OD_0002", position: 2 },
            { datasetEntryId: "OD_0003", position: 3 },
          ],
        };
        return batchRecordSchema.parse(record);
      },
    },
    validations: {
      async listEntryIdsForValidator(validatorId: string) {
        calls.push(`validations.listEntryIdsForValidator:${validatorId}`);
        if (over.validationsFailure !== undefined) throw over.validationsFailure;
        return [...(over.completedEntryIds ?? [])];
      },
      async countForValidator(validatorId: string) {
        calls.push(`validations.countForValidator:${validatorId}`);
        if (over.countFailure !== undefined) throw over.countFailure;
        return over.lifetimeAnsweredCount ?? (over.completedEntryIds ?? []).length;
      },
    },
    datasetEntries: {
      async findById(id: string) {
        calls.push(`datasetEntries.findById:${id}`);
        if (over.datasetFailure !== undefined) throw over.datasetFailure;
        if (over.missingEntryIds?.includes(id)) return null;
        if (over.unprojectableEntry !== undefined) return over.unprojectableEntry as never;
        return entries[id] ?? null;
      },
    },
  };
}

/** A stored `DatasetEntry`, built through the same fields the importer writes. */
function storedEntry(id: string, instruction: string): Record<string, unknown> {
  return {
    id,
    category: "origin_destination",
    instruction,
    origin: "Baguio",
    destination: "Baguio",
    transitMode: "jeepney",
    sourcePayload: { record_id: id },
    createdAt: NOW,
    isActive: true,
  };
}

/** Imported lazily so the `server-only` stub above is registered first. */
async function loadService() {
  return import("@/lib/validation/session-service");
}

describe("opening a session for a batch that exists", () => {
  it("presents ONE entry, with the counts a progress bar needs", async () => {
    const { openValidationSession } = await loadService();
    const deps = createRecording();

    const outcome = await openValidationSession({ batchId: "batch-1" }, deps);

    expect(outcome.status).toBe("presenting");
    if (outcome.status !== "presenting") throw new Error("unreachable");
    expect(outcome.session.batchId).toBe("batch-1");
    expect(outcome.session.entry.id).toBe("OD_0001");
    expect(outcome.session.position).toBe(1);
    expect(outcome.session.total).toBe(3);
    expect(outcome.session.completedCount).toBe(0);
    expect(outcome.session.remainingCount).toBe(3);
  });

  it("reads the batch, THEN the completed set, THEN the entry — and no entry before the choice", async () => {
    // The ORDER is load-bearing, not incidental. `listEntryIdsForValidator` needs `batch.validatorId`,
    // so it cannot come first; and reading an entry before the placement decision would fetch every
    // entry in the batch and put ten sentences in memory to show one.
    const { openValidationSession } = await loadService();
    const deps = createRecording();

    await openValidationSession({ batchId: "batch-1" }, deps);

    expect(deps.calls).toEqual([
      "batches.findById:batch-1",
      `validations.listEntryIdsForValidator:${VALIDATOR_ID}`,
      "datasetEntries.findById:OD_0001",
    ]);
  });

  it("derives the validator from the BATCH, and asks the caller for nothing", async () => {
    const { openValidationSession } = await loadService();
    const deps = createRecording();

    // A request carrying a validator id is REFUSED, not reconciled. One source of truth: a second
    // client-supplied claim about identity is a second thing to get wrong, and reconciling two claims
    // is exactly where "did I answer this, or did somebody else?" goes wrong.
    const outcome = await openValidationSession(
      { batchId: "batch-1", validatorId: "VAL_ffffffff" },
      deps,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(deps.calls).toEqual([]);
  });

  it("offers an entry this validator has NOT completed, computed at request time", async () => {
    // Tasks 1.3 and 6.2 at the layer that decides. The exclusion is not a filter applied to what is
    // rendered; it is the completed set the service READS, intersected with the batch's own
    // placements, and the very first entry the batch recorded is skipped because it is already done.
    const { openValidationSession } = await loadService();
    const deps = createRecording({ completedEntryIds: ["OD_0001"] });

    const outcome = await openValidationSession({ batchId: "batch-1" }, deps);

    if (outcome.status !== "presenting") throw new Error("unreachable");
    expect(outcome.session.entry.id).toBe("OD_0002");
    expect(outcome.session.position).toBe(2);
    expect(outcome.session.completedCount).toBe(1);
    expect(outcome.session.remainingCount).toBe(2);
    // The completed entry is never read at all — it is not fetched and then hidden, which is the
    // difference between excluding it and merely not showing it.
    expect(deps.calls).toEqual([
      "batches.findById:batch-1",
      `validations.listEntryIdsForValidator:${VALIDATOR_ID}`,
      "datasetEntries.findById:OD_0002",
    ]);
    expect(deps.calls).not.toContain("datasetEntries.findById:OD_0001");
  });

  it("reads NO client-supplied completion state, and offers a completed entry only if asked for one", async () => {
    // The other half of task 1.3's verification. A stale link naming a position the validator has
    // already answered does NOT produce that entry: the requested position is a position INTO the
    // server's order, and the completed set is applied on top of it, so the position resolves forward
    // to the next unanswered entry. A version that trusted the position alone would show a validator a
    // sentence they had already judged, and every response to it would be a duplicate the uniqueness
    // constraint refuses — after the validator had spent the effort.
    const { openValidationSession } = await loadService();
    const deps = createRecording({ completedEntryIds: ["OD_0002"] });

    const outcome = await openValidationSession({ batchId: "batch-1", position: 2 }, deps);

    if (outcome.status !== "presenting") throw new Error("unreachable");
    expect(outcome.session.entry.id).not.toBe("OD_0002");
    // Measured, not assumed: with OD_0002 done, position 2 resolves FORWARD to OD_0003, because the
    // remaining set is [1, 3] and the first remaining placement at or after 2 is 3.
    expect(outcome.session.entry.id).toBe("OD_0003");
    expect(outcome.session.position).toBe(3);
  });

  it("does not re-offer a completed entry when the validator RETURNS to the session", async () => {
    // The participant-facing counterpart to at-most-once, and a DIFFERENT failure from the database
    // refusing the write: a refusal has already cost the validator their typed answer, so the screen
    // must not produce the situation. Two visits to the same batch with the same completed set must
    // both skip the completed entry — a second visit is what a refresh, a bookmark, or a back-button
    // looks like from the server.
    const { openValidationSession } = await loadService();
    const deps = createRecording({ completedEntryIds: ["OD_0001"] });

    const first = await openValidationSession({ batchId: "batch-1" }, deps);
    const second = await openValidationSession({ batchId: "batch-1" }, deps);

    for (const outcome of [first, second]) {
      if (outcome.status !== "presenting") throw new Error("unreachable");
      expect(outcome.session.entry.id).toBe("OD_0002");
    }
    // And the second visit did not mutate anything: it is a read, twice, with the same answer.
    expect(deps.calls).toEqual([
      "batches.findById:batch-1",
      `validations.listEntryIdsForValidator:${VALIDATOR_ID}`,
      "datasetEntries.findById:OD_0002",
      "batches.findById:batch-1",
      `validations.listEntryIdsForValidator:${VALIDATOR_ID}`,
      "datasetEntries.findById:OD_0002",
    ]);
  });

  it("projects the stored entry to the SIX fields a validation screen may render", async () => {
    const { openValidationSession } = await loadService();
    const deps = createRecording();

    const outcome = await openValidationSession({ batchId: "batch-1" }, deps);

    if (outcome.status !== "presenting") throw new Error("unreachable");
    const { entry } = outcome.session;
    // The projection is asserted by its KEYS, which is stronger than asserting the values: an
    // implementation that quietly widened the projection would still return the right instruction.
    expect(Object.keys(entry).sort()).toEqual([
      "category",
      "destination",
      "id",
      "instruction",
      "origin",
      "transitMode",
    ]);
    expect(allocatedEntrySchema.safeParse(entry).success).toBe(true);
    // And the two fields the schema's own documentation excludes, named as absences.
    expect(entry).not.toHaveProperty("sourcePayload");
    expect(entry).not.toHaveProperty("createdAt");
    expect(entry).not.toHaveProperty("isActive");
  });

  it("resolves a requested position against the completed set", async () => {
    const { openValidationSession } = await loadService();
    const deps = createRecording({ completedEntryIds: ["OD_0001"] });

    const outcome = await openValidationSession({ batchId: "batch-1", position: 1 }, deps);

    if (outcome.status !== "presenting") throw new Error("unreachable");
    expect(outcome.session.entry.id).toBe("OD_0002");
    expect(outcome.session.completedCount).toBe(1);
    expect(outcome.session.remainingCount).toBe(2);
  });

  it("accepts a POSITION as a number and REFUSES the string spelling", async () => {
    // The route converts the query string with `Number()` before it arrives, so `"3"` never reaches
    // the service as a string. A schema that accepted both would have two spellings of one request and
    // only one of them exercised.
    const { openValidationSession } = await loadService();

    const numeric = await openValidationSession({ batchId: "b", position: 2 }, createRecording());
    expect(numeric.status).toBe("presenting");

    const stringly = await openValidationSession(
      { batchId: "b", position: "2" },
      createRecording(),
    );
    expect(stringly).toEqual({ status: "failed", reason: "invalid" });
  });

  it("REFUSES a malformed request and reads NOTHING, so a bad link costs no query", async () => {
    for (const attempt of [
      {},
      { batchId: "" },
      { batchId: "b", position: 0 },
      { batchId: "b", position: "1" },
      { batchId: "b", entryIds: ["OD_0001"] },
      null,
      "batch-1",
    ]) {
      const { openValidationSession } = await loadService();
      const deps = createRecording();

      expect(
        await openValidationSession(attempt, deps),
        `${JSON.stringify(attempt)} must be refused`,
      ).toEqual({ status: "failed", reason: "invalid" });
      expect(deps.calls, `${JSON.stringify(attempt)}: nothing may be read`).toEqual([]);
    }
  });
});

describe("every outcome that is NOT an entry", () => {
  it("reports `absent` for a batch id that does not exist", async () => {
    // Distinct from the write's `unknown_batch` and from `failed`. A stale bookmark is not a study
    // that is down, and the participant-facing sentence says so — with a way onward, not an apology.
    const { openValidationSession } = await loadService();

    const outcome = await openValidationSession(
      { batchId: "gone" },
      createRecording({ batch: null }),
    );

    expect(outcome).toEqual({ status: "absent" });
  });

  it("reports `finished` ONLY when every entry in the batch is completed", async () => {
    const { openValidationSession } = await loadService();

    const outcome = await openValidationSession(
      { batchId: "batch-1" },
      createRecording({ completedEntryIds: ["OD_0001", "OD_0002", "OD_0003"] }),
    );

    expect(outcome).toEqual({
      status: "finished",
      batchId: "batch-1",
      completedCount: 3,
      total: 3,
      // The figure the fake answers with, which by default mirrors the completed set. Asserted rather
      // than omitted: `toEqual` is a FULL key-set assertion, so a `finished` outcome that grew a field
      // and was not updated here would fail rather than pass unnoticed.
      lifetimeAnsweredCount: 3,
    });
  });

  it("reads the LIFETIME figure for the BATCH's own validator, and the count is a separate call", async () => {
    // The source of the figure is the property, and the ORDER is what proves it is read from
    // validation records rather than derived from the batch: `listEntryIdsForValidator` is
    // batch-scoped, so a lifetime total can only come from a read whose argument is the validator.
    const { openValidationSession } = await loadService();
    const deps = createRecording({
      completedEntryIds: ["OD_0001", "OD_0002", "OD_0003"],
      // Deliberately NOT the completed count: a validator who worked through three batches and
      // finished this one has a lifetime figure nothing like this batch's size.
      lifetimeAnsweredCount: 27,
    });

    const outcome = await openValidationSession({ batchId: "batch-1" }, deps);

    expect(outcome).toMatchObject({
      status: "finished",
      completedCount: 3,
      lifetimeAnsweredCount: 27,
    });
    expect(deps.calls).toEqual([
      "batches.findById:batch-1",
      `validations.listEntryIdsForValidator:${VALIDATOR_ID}`,
      `validations.countForValidator:${VALIDATOR_ID}`,
    ]);
  });

  it("reads the lifetime figure ONLY on the finished path, so no screen can show a rising total", async () => {
    // `design.md` D7, pinned at the layer that can actually enforce it. A lifetime total is a volume
    // counter if it climbs while somebody is answering; the cheapest structural guarantee is that the
    // `presenting` path never fetches it, so there is no number there to render. This is a
    // COUNT over the recorded calls, not an absence assertion, and the two `presenting` cases below
    // are the controls proving the counter can be non-zero for that reason.
    const { openValidationSession } = await loadService();
    const finished = await openValidationSession(
      { batchId: "batch-1" },
      createRecording({ completedEntryIds: ["OD_0001", "OD_0002", "OD_0003"] }),
    );
    const presenting = await openValidationSession({ batchId: "batch-1" }, createRecording());
    const resumed = await openValidationSession(
      { batchId: "batch-1", position: 2 },
      createRecording({ completedEntryIds: ["OD_0001"] }),
    );

    const count = (outcome: unknown) =>
      (outcome as { status: string }).status === "finished" ? 1 : 0;
    expect(finished.status).toBe("finished");
    expect(presenting.status).toBe("presenting");
    expect(resumed.status).toBe("presenting");
    // The same classifier, the same fixture, three requests: one finished and two presenting. If the
    // count were 0/0/0 the finished screen would have no lifetime figure at all, and this block's other
    // assertions would be passing on nothing.
    expect([finished, presenting, resumed].map(count)).toEqual([1, 0, 0]);
  });

  it("reports `failed`/`persistence` when the LIFETIME count read fails, rather than a figure of zero", async () => {
    // The failure mode worth refusing: a `0` fallback tells a validator who has answered forty
    // sentences across four batches that they have answered none. That is a false statement about the
    // participant's research record, produced by a database hiccup, so the honest answer is the same
    // `failed`/`persistence` the completed-set read already produces for the same reason.
    const { openValidationSession } = await loadService();
    const deps = createRecording({
      completedEntryIds: ["OD_0001", "OD_0002", "OD_0003"],
      countFailure: new RepositoryError("validations.countForValidator", "unreachable"),
    });

    expect(await openValidationSession({ batchId: "batch-1" }, deps)).toEqual({
      status: "failed",
      reason: "persistence",
    });
    // And it did attempt the read, so this is not passing because the figure was never fetched.
    expect(deps.calls).toContain(`validations.countForValidator:${VALIDATOR_ID}`);
  });

  it("does NOT report `finished` for a stale position when entries remain", async () => {
    // The read-side twin of the pure decision's most important assertion. A URL must never be able to
    // declare a validator's work finished, and this is the path a real request takes.
    const { openValidationSession } = await loadService();

    const outcome = await openValidationSession(
      { batchId: "batch-1", position: 999 },
      createRecording(),
    );

    expect(outcome.status).toBe("presenting");
  });

  it("reports `failed`/`persistence` when the BATCH read fails", async () => {
    const { openValidationSession } = await loadService();
    const deps = createRecording({
      batchFailure: new RepositoryError("validation_batches.findById", "unreachable"),
    });

    expect(await openValidationSession({ batchId: "b" }, deps)).toEqual({
      status: "failed",
      reason: "persistence",
    });
  });

  it("reports `failed`/`persistence` when the COMPLETED-SET read fails", async () => {
    // Not `finished`. A failed read of "what have I done" and an empty answer look identical to a
    // caller, and treating the failure as the empty answer would tell a validator who has answered
    // nothing that they have finished the study.
    const { openValidationSession } = await loadService();
    const deps = createRecording({
      validationsFailure: new RepositoryError(
        "validations.listEntryIdsForValidator",
        "unreachable",
      ),
    });

    expect(await openValidationSession({ batchId: "b" }, deps)).toEqual({
      status: "failed",
      reason: "persistence",
    });
    // And it never reached the entry, because it had no business rendering one.
    expect(deps.calls.some((call) => call.startsWith("datasetEntries"))).toBe(false);
  });

  it("reports `failed`/`persistence` when the ENTRY read fails", async () => {
    const { openValidationSession } = await loadService();
    const deps = createRecording({
      datasetFailure: new RepositoryError("dataset_entries.findById", "unreachable"),
    });

    expect(await openValidationSession({ batchId: "b" }, deps)).toEqual({
      status: "failed",
      reason: "persistence",
    });
  });

  it("reports `failed`/`persistence` for a batch placement with NO dataset entry behind it", async () => {
    // `batch_entries.dataset_entry_id` is a foreign key, so this is a bug or a database that is not the
    // one these tests assume. Neither skipping the entry nor reporting the batch finished is honest:
    // both understate the work this validator still owes, in the research record and on their screen.
    const { openValidationSession } = await loadService();

    const outcome = await openValidationSession(
      { batchId: "b" },
      createRecording({ missingEntryIds: ["OD_0001"] }),
    );

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("reports `failed`/`persistence` for a stored entry that will not project", async () => {
    // The projection is a closed schema, so an entry it cannot express must not be rendered with
    // fields quietly dropped. Returning `null` here and letting the caller decide would put the choice
    // in the route, where nothing checks it.
    const { openValidationSession } = await loadService();
    const deps = createRecording({
      unprojectableEntry: { ...storedEntry("OD_0001", "Pumonta iti Baguio."), category: "  " },
    });

    expect(await openValidationSession({ batchId: "b" }, deps)).toEqual({
      status: "failed",
      reason: "persistence",
    });
  });

  it("does not swallow a NON-repository throw, because that is a bug and not a storage fault", async () => {
    // Reporting a code defect as `persistence` sends an operator to the database for something the
    // database did not do. It propagates and the route's boundary decides what to log.
    const { openValidationSession } = await loadService();
    const deps = createRecording({ batchFailure: new TypeError("boom") });

    await expect(openValidationSession({ batchId: "b" }, deps)).rejects.toBeInstanceOf(TypeError);
  });

  it("does not mention `not_configured` from the service, which has no environment to fail on", async () => {
    // The reason is produced by the ROUTE. Asserting the service never returns it stops a future edit
    // from adding it here, where it would be a union member with no producer — and a result type that
    // tells callers about states the service does not know is a lie about the contract.
    const { openValidationSession } = await loadService();

    const outcomes = [
      await openValidationSession({ batchId: "b" }, createRecording()),
      await openValidationSession({ batchId: "b" }, createRecording({ batch: null })),
      await openValidationSession(
        { batchId: "b" },
        createRecording({ completedEntryIds: ["OD_0001", "OD_0002", "OD_0003"] }),
      ),
      await openValidationSession(
        { batchId: "b" },
        createRecording({ batchFailure: new RepositoryError("validation_batches.findById", "x") }),
      ),
      await openValidationSession({}, createRecording()),
    ];

    for (const outcome of outcomes) {
      expect(
        outcome.status === "failed" ? outcome.reason : undefined,
        "the service has no environment, so it cannot report a configuration failure",
      ).not.toBe("not_configured");
    }
  });
});

describe("the dependency factory", () => {
  it("reads the environment INSIDE the request, so the module stays importable with no credential", async () => {
    // In this repository no `SUPABASE_*` variable exists, so a module-scope client would make
    // `session-service` unimportable rather than reportable, and the failure would arrive as an import
    // error nobody can attribute. This test file importing the module at all is half the proof; the
    // call-count below is the other half.
    const { sessionDependencies } = await loadService();

    expect(() => sessionDependencies()).toThrow();
  });
});
