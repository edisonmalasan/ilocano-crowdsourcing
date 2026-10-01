import { describe, expect, it } from "vitest";

import {
  resolveNextSessionEntry,
  resolveSessionEntry,
  validationSessionRequestSchema,
  type SessionOrderingKeyIsPositionOnly,
  type ValidationSessionRequest,
} from "@/lib/validation/session";
import { batchEntryPlacementSchema, type BatchEntryPlacement } from "@/schemas/batch";

/**
 * Which entry a validation session presents — the pure decision, with no database anywhere.
 *
 * =================================================================================================
 * WHY THIS IS THE FILE THAT MATTERS MOST IN THE CHANGE
 * =================================================================================================
 * `resolveSessionEntry` contains the one rule in the validation experience that can state something
 * FALSE about a participant's research record: a screen that says "nothing left to do" while a real
 * response is uncollected. It is reachable only by rendering the route, which needs a database, so it
 * is pure — and that is what makes it assertable at all.
 *
 * =================================================================================================
 * THE FIXTURES ARE PLACEMENTS, NOT HAND-WRITTEN OBJECTS WITH THE FIELDS THE FUNCTION READS
 * =================================================================================================
 * Every placement below is produced by `placement()`, which parses through the real
 * `batchEntryPlacementSchema`. A literal object would let a fixture drift out of the shape the
 * function is given — a 0-based position, a missing id — and the test would then be asserting a
 * behaviour of a situation the database can never produce. The same reason the `expect(entries.length)`
 * line is asserted rather than assumed: a guard that read nothing passes every one of its own checks.
 */
function placement(datasetEntryId: string, position: number): BatchEntryPlacement {
  const parsed = batchEntryPlacementSchema.safeParse({ datasetEntryId, position });
  if (!parsed.success) {
    throw new Error(`fixture is not a real placement: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

/** A ten-entry batch, the real batch size, in the order allocation would have recorded it. */
function tenEntryBatch(): BatchEntryPlacement[] {
  return Array.from({ length: 10 }, (_, index) => placement(`OD_${1000 + index}`, index + 1));
}

describe("a validation session request carries a batch and a position, and nothing else", () => {
  it("accepts a batch with no position, which is what /validate means by default", () => {
    const parsed = validationSessionRequestSchema.safeParse({ batchId: "batch-1" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.position).toBeUndefined();
  });

  it("accepts a position into that batch's own order", () => {
    const parsed = validationSessionRequestSchema.safeParse({ batchId: "batch-1", position: 4 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.position).toBe(4);
  });

  it("REFUSES anything that would dictate the order, rather than ignoring it", () => {
    // The distinction this whole file rests on: a refused extra key is visible, while a stripped one
    // looks from the outside exactly like a request whose values happened not to matter — and that is
    // the moment somebody adds an `entryIds` the service really does read and no request looks
    // different. So this asserts the REFUSAL, not the absence of an effect.
    for (const attempt of [
      { batchId: "batch-1", entryIds: ["OD_0001", "OD_0002"] },
      { batchId: "batch-1", entries: ["OD_0001"] },
      { batchId: "batch-1", clientOrder: [3, 1, 2] },
      { batchId: "batch-1", position: 1, skip: ["OD_0002"] },
      { batchId: "batch-1", order: "reverse" },
    ]) {
      const parsed = validationSessionRequestSchema.safeParse(attempt);
      expect(
        parsed.success,
        `the request schema must REFUSE ${JSON.stringify(attempt)} — a stripped key would look identical to a request whose values were ignored`,
      ).toBe(false);
    }
  });

  it("REFUSES a position the database itself would refuse", () => {
    // `batch_entries_position_positive` mirrors these bounds, so a value this schema accepts is a
    // value the engine accepts. Two cases only: zero, and a non-integer.
    expect(validationSessionRequestSchema.safeParse({ batchId: "b", position: 0 }).success).toBe(
      false,
    );
    expect(validationSessionRequestSchema.safeParse({ batchId: "b", position: 1.5 }).success).toBe(
      false,
    );
    // The string form is a REFUSAL here, deliberately. The route converts the query string with
    // `Number()` before it reaches this schema, so `"3"` never arrives as a string — and a schema
    // that also accepted strings would have two spellings of one request and one of them untested.
    expect(validationSessionRequestSchema.safeParse({ batchId: "b", position: "3" }).success).toBe(
      false,
    );
  });

  it("REFUSES a request with no batch at all, and one with an empty batch id", () => {
    expect(validationSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(validationSessionRequestSchema.safeParse({ batchId: "" }).success).toBe(false);
  });

  it("pins at the type layer that no third key exists, whatever it is called", () => {
    // THE PIN. A behavioural test cannot hold this: the assertion above enumerates five field names,
    // and a sixth written tomorrow would pass all of them. `Exclude<..., "batchId" | "position">` is
    // `never` while the request carries nothing else, and resolves to a string union the moment a
    // third key appears — so this declaration fails `pnpm run typecheck` with
    // `TS2322: Type 'true' is not assignable to type 'never'`.
    //
    // The negative half is in the probe comment below and cannot live here: a directive that is
    // satisfied today says only that it is satisfied today.
    const pin: SessionOrderingKeyIsPositionOnly = true;
    expect(pin).toBe(true);

    // And the same claim in the other direction, so the pin is not vacuous: the two keys that DO
    // exist are named here, read from the schema's own shape rather than a restated list, and compared
    // as SORTED COPIES. `.sort()` mutates, and `keyof ValidationSessionRequest` is `readonly`, so
    // `[...keys].sort()` is the only form that both type-checks and leaves the caller's array alone —
    // a first draft sorted in place and typecheck refused it at
    // `TS2339: Property 'sort' does not exist on type 'readonly ("batchId" | "position")[]'`.
    const fromSchema = Object.keys(
      validationSessionRequestSchema.shape,
    ) as (keyof ValidationSessionRequest)[];
    const namedHere: readonly (keyof ValidationSessionRequest)[] = ["batchId", "position"];

    expect([...fromSchema].sort()).toEqual([...namedHere].sort());
    expect(fromSchema).toHaveLength(2);
  });
});

describe("which entry a session presents", () => {
  it("presents the FIRST entry that still needs an answer, in the server's own order", () => {
    const entries = tenEntryBatch();
    const choice = resolveSessionEntry(entries, new Set(), undefined);

    expect(choice).not.toBeNull();
    expect(choice?.placement.datasetEntryId).toBe("OD_1000");
    expect(choice?.placement.position).toBe(1);
    expect(choice?.completedCount).toBe(0);
    expect(choice?.remainingCount).toBe(10);
    expect(choice?.total).toBe(10);
  });

  it("SKIPS an entry this validator already completed, and counts it", () => {
    const entries = tenEntryBatch();
    const completed = new Set(["OD_1000", "OD_1001"]);
    const choice = resolveSessionEntry(entries, completed, undefined);

    expect(choice?.placement.datasetEntryId).toBe("OD_1002");
    expect(choice?.completedCount).toBe(2);
    expect(choice?.remainingCount).toBe(8);
  });

  it("does not treat a completed id that is not in this batch as one of its entries", () => {
    // A validator's completed set is EVERY entry they have answered, across every batch. Counting it
    // against this batch would report a batch as further along than it is, which is the visible form
    // of a coverage error.
    const entries = tenEntryBatch();
    const completed = new Set(["OD_9999", "OD_9998"]);
    const choice = resolveSessionEntry(entries, completed, undefined);

    expect(choice?.completedCount).toBe(0);
    expect(choice?.remainingCount).toBe(10);
    expect(choice?.placement.datasetEntryId).toBe("OD_1000");
  });

  it("honours a requested position into the server's order", () => {
    const entries = tenEntryBatch();
    const choice = resolveSessionEntry(entries, new Set(), 5);

    expect(choice?.placement.position).toBe(5);
    expect(choice?.placement.datasetEntryId).toBe("OD_1004");
  });

  it("SKIPS past a completed entry when the requested position points at one", () => {
    // This is the property that makes a stale bookmarked link safe: the link says position 3, that
    // entry is answered, and the validator lands on the next one that is not rather than on nothing.
    const entries = tenEntryBatch();
    const choice = resolveSessionEntry(entries, new Set(["OD_1002"]), 3);

    expect(choice?.placement.datasetEntryId).toBe("OD_1003");
  });

  it("falls back to the first remaining entry when the position is past the end", () => {
    // THE ASSERTION THIS FUNCTION EXISTS FOR. A position of 999 in a ten-entry batch, or a
    // mistyped bookmark, must NOT read as "this validator has finished the study". Only
    // `remainingCount === 0` may say that.
    const entries = tenEntryBatch();
    const choice = resolveSessionEntry(entries, new Set(), 999);

    expect(choice).not.toBeNull();
    expect(choice?.placement.datasetEntryId).toBe("OD_1000");
    expect(choice?.remainingCount).toBe(10);
  });

  it("falls back to the first remaining entry when the position is one past the last", () => {
    // The form advances by `position + 1`, so this is the EXACT value the eleventh submit would
    // carry — the case where the arithmetic is right and the batch has nevertheless ended.
    const entries = tenEntryBatch();
    const completed = new Set(entries.map((entry) => entry.datasetEntryId));
    expect(resolveSessionEntry(entries, completed, 11)).toBeNull();
  });

  it("returns null ONLY when every entry in the batch is completed", () => {
    const entries = tenEntryBatch();
    const noneCompleted = resolveSessionEntry(entries, new Set(), undefined);
    expect(noneCompleted).not.toBeNull();

    const allCompleted = resolveSessionEntry(
      entries,
      new Set(entries.map((entry) => entry.datasetEntryId)),
      undefined,
    );
    expect(allCompleted).toBeNull();
  });

  it("sorts by position itself, rather than trusting the repository to have ordered the rows", () => {
    // The value of a decision this consequential should not depend on an `ORDER BY` the schema does
    // not promise. `batchEntryPlacementSchema` fixes no ordering, so an unsorted array is a shape
    // the function can legitimately be handed, and a fixture in sorted order would hide the defect.
    const entries = tenEntryBatch();
    const shuffled = [entries[6]!, entries[0]!, entries[9]!, entries[2]!, entries[1]!];

    expect(resolveSessionEntry(shuffled, new Set(), undefined)?.placement.position).toBe(1);
    expect(resolveSessionEntry(shuffled, new Set(), 3)?.placement.position).toBe(3);
  });

  it("does not mutate the caller's array while sorting", () => {
    const entries = tenEntryBatch();
    const original = [...entries];
    resolveSessionEntry(entries, new Set(), 5);
    expect(entries).toEqual(original);
  });

  it("does not mutate the caller's completed set", () => {
    // `resolveNextSessionEntry` copies before adding, so a mutation here would quietly change the
    // caller's view of what is done — and the caller is the session, which decides what is presented.
    const entries = tenEntryBatch();
    const completed = new Set<string>(["OD_1000"]);
    resolveNextSessionEntry(entries, completed, "OD_1001");

    expect([...completed]).toEqual(["OD_1000"]);
  });
});

describe("which entry comes next, once one has been completed", () => {
  it("advances to the next uncompleted entry", () => {
    const entries = tenEntryBatch();
    const choice = resolveNextSessionEntry(entries, new Set(), "OD_1000");

    expect(choice?.placement.datasetEntryId).toBe("OD_1001");
    expect(choice?.completedCount).toBe(1);
    expect(choice?.remainingCount).toBe(9);
  });

  it("advances past an entry completed in an earlier step, not just the one just answered", () => {
    const entries = tenEntryBatch();
    const choice = resolveNextSessionEntry(entries, new Set(["OD_1000", "OD_1001"]), "OD_1002");

    expect(choice?.placement.datasetEntryId).toBe("OD_1003");
  });

  it("is idempotent for an entry that is already recorded", () => {
    // THE DUPLICATE PATH. A refused second write is still an answered entry, so re-deriving "next"
    // with the id already in the completed set must land on the SAME next entry rather than
    // re-presenting the one just answered. If this returned `OD_1000` again, a validator whose
    // submit was retried would be shown the sentence they had just judged.
    const entries = tenEntryBatch();
    const first = resolveNextSessionEntry(entries, new Set(), "OD_1000");
    const again = resolveNextSessionEntry(entries, new Set(["OD_1000"]), "OD_1000");

    expect(first?.placement.datasetEntryId).toBe("OD_1001");
    expect(again?.placement.datasetEntryId).toBe(first?.placement.datasetEntryId);
  });

  it("returns null once the last entry is completed", () => {
    const entries = tenEntryBatch();
    const allButLast = new Set(entries.slice(0, 9).map((entry) => entry.datasetEntryId));
    expect(resolveNextSessionEntry(entries, allButLast, "OD_1009")).toBeNull();
  });

  it("does NOT skip an earlier unanswered entry when the participant answers out of order", () => {
    // The first draft of this test asserted the opposite — that answering `OD_1001` leads to
    // `OD_1002` — and it failed against correct code. The expected value was a guess about the
    // feature rather than a measurement of it, and the implementation was right: the session is
    // sequential, and a validator who somehow answers entry 2 while entry 1 is unanswered must still
    // be given entry 1 next. An advance that followed the entry just answered would let a stale
    // position or a hand-edited link permanently skip an entry, and the skipped entry would then
    // never reach its coverage target.
    const entries = tenEntryBatch();
    const choice = resolveNextSessionEntry(entries, new Set(["OD_1005"]), "OD_1001");

    expect(choice?.placement.datasetEntryId).toBe("OD_1000");
    expect(choice?.placement.position).toBe(1);
    // The count still reflects what is genuinely done, including the out-of-order one.
    expect(choice?.completedCount).toBe(2);
    expect(choice?.remainingCount).toBe(8);
  });

  it("lands on the first remaining entry no matter WHICH entry was just answered", () => {
    // The advance is derived from the server's order and the completed set, never from the id just
    // answered. Three different "just answered" values, three results, all of them the first entry
    // still needing an answer — a function that derived its result from the argument would answer
    // `answered + 1` and give three different ids.
    //
    // The measured values are the recorded ones, and they were NOT the ones first written down: this
    // test originally expected `[OD_1001, OD_1001, OD_1001]` and got
    // `[OD_1001, OD_1000, OD_1000]`. Answering `OD_1003` leaves `OD_1000` unanswered and so still
    // next. A test whose expected value is invented rather than measured is the failure this
    // repository has recorded most often, and both of the last two failures in this file were it.
    const entries = tenEntryBatch();
    const landed = ["OD_1000", "OD_1003", "OD_1007"].map(
      (answered) => resolveNextSessionEntry(entries, new Set(), answered)?.placement.datasetEntryId,
    );

    expect(landed).toEqual(["OD_1001", "OD_1000", "OD_1000"]);
  });
});

/**
 * A negative control for the type pin, run as a documented probe rather than as a permanent test.
 *
 * Adding a `clientOrder` key to `validationSessionRequestSchema` and honouring it in
 * `resolveSessionEntry` leaves every behavioural test in this file GREEN — the five refusal cases
 * enumerate names, not the absence of names, and the five refusals still refuse. What fails is
 * `pnpm run typecheck`, with `TS2322: Type 'true' is not assignable to type 'never'` on the
 * `SessionOrderingKeyIsPositionOnly` declaration above.
 *
 * This is the recorded lesson from `coverage-aware-allocation`, where a behavioural attempt at the
 * same guarantee was written, measured, and found NOT to work: a mutation honours a field named
 * `clientOrder`, a test smuggling `order` and `positions` never triggers it, and the suite was still
 * green. Enumerating plausible key names cannot close that gap, because a mutation may name its
 * field anything. The pin goes where a key that does not exist yet is visible.
 */
