import { describe, expect, it } from "vitest";

import {
  recognizeInterruptedBatch,
  type InterruptedBatchOffer,
  type RecoverableBatch,
  type RecoveryRecognition,
} from "@/lib/domain/batch-recovery";

/**
 * ============================================================================
 * RECOGNITION, AS A PURE RULE
 * ============================================================================
 * No database, no repository, no clock: everything the rule needs arrives as an argument, which is what
 * `tasks.md` 2.3 asks for and what makes the whole rule testable on a machine with no Supabase project.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY NOT ASSERTED HERE, AND WHY THAT IS NOT A GAP
 * ============================================================================
 * `tasks.md` 2.4 names two wrong implementations of the remaining count — counting only the responses
 * whose `batch_id` equals this batch, and filtering to *qualifying* responses so a `cannot_evaluate`
 * reappears as outstanding work. Both live in the layer that FETCHES the answered set, not here: this
 * rule is handed a `ReadonlySet` and cannot see `batch_id` or `evaluation` at all. So this file proves
 * the rule's half — it counts whatever set it is given, unfiltered — and the fetch's half is proved
 * against the repository in `repositories-supabase.test.ts`, where the filters can be observed.
 *
 * `lifetime-figure.test.ts` is the cautionary example and must not be copied: it writes its own SQL, so
 * it cannot catch a coverage-filtered count in the application's query builder.
 */

/** A batch, defaulted to something valid so each test states only what it is about. */
function batch(over: Partial<RecoverableBatch> = {}): RecoverableBatch {
  return {
    id: "VAL_a1-2026-10-01T00:00:00.000Z",
    validatorId: "VAL_a1",
    createdAt: "2026-10-01T00:00:00.000Z",
    entryIds: ["OD_0001", "OD_0002"],
    ...over,
  };
}

/** The offer, or a raise — so a test cannot quietly accept a `none` it did not expect. */
function offerOf(result: RecoveryRecognition): InterruptedBatchOffer {
  if (result.kind !== "interrupted") {
    throw new Error(`expected an interrupted batch, got ${JSON.stringify(result)}`);
  }
  return result.offer;
}

const none = (result: RecoveryRecognition): boolean => result.kind === "none";

describe("recognizeInterruptedBatch", () => {
  it("offers the only interrupted batch, with its remaining and total counts", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [batch({ entryIds: ["OD_0001", "OD_0002", "OD_0003"] })],
      new Set(["OD_0001", "OD_0002"]),
    );

    // Two of three answered, so ONE remains. The count is of WORK LEFT, never of work contributed.
    expect(offerOf(result)).toEqual({
      batchId: "VAL_a1-2026-10-01T00:00:00.000Z",
      remaining: 1,
      total: 3,
    });
  });

  it("offers the most recently created of several interrupted batches", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [
        batch({ id: "VAL_a1-old", createdAt: "2026-10-01T00:00:00.000Z" }),
        batch({ id: "VAL_a1-new", createdAt: "2026-10-03T00:00:00.000Z" }),
        batch({ id: "VAL_a1-middle", createdAt: "2026-10-02T00:00:00.000Z" }),
      ],
      new Set<string>(),
    );

    expect(offerOf(result).batchId).toBe("VAL_a1-new");
  });

  it("breaks a tie on the creation instant by identifier, descending", () => {
    const sameInstant = "2026-10-02T09:30:00.000Z";
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [
        batch({ id: "VAL_a1-aaa", createdAt: sameInstant }),
        batch({ id: "VAL_a1-zzz", createdAt: sameInstant }),
      ],
      new Set<string>(),
    );

    // Descending, so the LATER identifier wins. Ascending would be just as total and just as arbitrary;
    // what the requirement actually needs is that ONE of them wins, every time.
    expect(offerOf(result).batchId).toBe("VAL_a1-zzz");
  });

  it("chooses the same batch whichever order the rows arrived in", () => {
    const sameInstant = "2026-10-02T09:30:00.000Z";
    const batches = [
      batch({ id: "VAL_a1-aaa", createdAt: sameInstant }),
      batch({ id: "VAL_a1-zzz", createdAt: sameInstant }),
      batch({ id: "VAL_a1-mmm", createdAt: sameInstant }),
    ];
    const answered = new Set<string>();

    const forwards = offerOf(recognizeInterruptedBatch("VAL_a1", batches, answered)).batchId;
    const backwards = offerOf(
      recognizeInterruptedBatch("VAL_a1", [...batches].reverse(), answered),
    ).batchId;
    const rotated = offerOf(
      recognizeInterruptedBatch("VAL_a1", [batches[2], batches[0], batches[1]], answered),
    ).batchId;

    // This is the property the migration's `id DESC` index key exists to make possible, and it is the
    // one a test can assert while an "it happened to be first" implementation would also pass: so the
    // ROTATION is what distinguishes them. Two orderings would not have been enough.
    expect(backwards).toBe(forwards);
    expect(rotated).toBe(forwards);
  });

  it("never offers a batch whose entries are all answered", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [batch({ entryIds: ["OD_0001", "OD_0002"] })],
      new Set(["OD_0001", "OD_0002"]),
    );

    // However it was left — abandoned, closed, finished — a batch with no work left is not interrupted.
    expect(none(result)).toBe(true);
  });

  it("counts an entry answered in ANOTHER batch as answered here", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [batch({ entryIds: ["OD_0001", "OD_0002", "OD_0003"] })],
      // OD_0001 was answered while working a different batch. The set is the VALIDATOR's, not this
      // batch's, so it counts — and the validator is not about to be offered it again.
      new Set(["OD_0001"]),
    );

    expect(offerOf(result).remaining).toBe(2);
  });

  it("counts a cannot_evaluate answer as answered, because the rule does not filter by evaluation", () => {
    // A `cannot_evaluate` response counts as answered for session purposes while contributing zero
    // qualifying coverage. Two different questions; this rule answers the first, and a participant told
    // "4 remaining" must not be shown work they have already declined. See design D7.
    const answeredElsewhere = new Set(["OD_0001", "OD_0002"]);
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [batch({ entryIds: ["OD_0001", "OD_0002", "OD_0003"] })],
      answeredElsewhere,
    );

    expect(offerOf(result).remaining).toBe(1);
  });

  it("reports none for an entry-less batch, rather than raising or offering empty work", () => {
    // A batch row with no entries is the residue of `create`'s non-transactional two writes. The other
    // read in that directory, `findById`, RAISES on such a row on purpose. This one must not.
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [batch({ id: "VAL_a1-residue", entryIds: [] })],
      new Set<string>(),
    );

    expect(none(result)).toBe(true);
  });

  it("never offers a batch belonging to another validator", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [
        batch({
          id: "VAL_b7-theirs",
          validatorId: "VAL_b7",
          createdAt: "2026-10-09T00:00:00.000Z",
        }),
      ],
      new Set<string>(),
    );

    expect(none(result)).toBe(true);
  });

  it("skips a newer finished batch without letting it mask an older interrupted one", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [
        // The OLDER batch must itself be interrupted, or this test proves nothing: an earlier draft gave
        // both batches the same two answered entries, so BOTH were finished and the correct answer was
        // `none` — which is what the test got, and read as a failure of the rule rather than of the
        // fixture. A guard drawn from a fixture tests the fixture.
        batch({
          id: "VAL_a1-old",
          createdAt: "2026-10-01T00:00:00.000Z",
          entryIds: ["OD_0001", "OD_0009"],
        }),
        batch({
          id: "VAL_a1-newer-finished",
          createdAt: "2026-10-05T00:00:00.000Z",
          entryIds: ["OD_0001"],
        }),
      ],
      new Set(["OD_0001"]),
    );

    // The newer batch IS this validator's and IS newer, and it is still not offered — so the older
    // interrupted batch is found rather than lost behind it.
    expect(offerOf(result).batchId).toBe("VAL_a1-old");
  });

  it("skips a newer entry-less batch without letting it mask an older interrupted one", () => {
    const result = recognizeInterruptedBatch(
      "VAL_a1",
      [
        batch({ id: "VAL_a1-old", createdAt: "2026-10-01T00:00:00.000Z" }),
        batch({ id: "VAL_a1-newer-residue", createdAt: "2026-10-05T00:00:00.000Z", entryIds: [] }),
      ],
      new Set<string>(),
    );

    expect(offerOf(result).batchId).toBe("VAL_a1-old");
  });

  it("reports none for a validator with no batches at all", () => {
    expect(none(recognizeInterruptedBatch("VAL_a1", [], new Set()))).toBe(true);
  });

  it("refuses to choose rather than picking silently when a creation instant is unreadable", () => {
    // `Date.parse` returning NaN would make every `!==` comparison true, so a comparator built on it
    // returns NaN and the winner becomes whichever candidate was examined last. This asserts the
    // refusal instead, which is the only version of this behaviour worth having.
    expect(() =>
      recognizeInterruptedBatch(
        "VAL_a1",
        [batch({ createdAt: "not-a-timestamp" })],
        new Set<string>(),
      ),
    ).toThrow(/unreadable createdAt/);
  });
});

/**
 * The offer's key set is closed at the TYPE layer, so a fourth field fails `pnpm run typecheck` — the
 * layer that can see a key which does not exist yet, which is the only layer where this is enforceable.
 *
 * Stated plainly because it is defeatable: `const pin: SomeNeverType = true` is defeated by a
 * deliberate edit that widens the excluded list below, and no test will notice that edit. The prose
 * assertion in the next block is the half to weigh alongside it.
 */
describe("the offer carries exactly three fields", () => {
  it("reads a closed key set off a real offer", () => {
    type OfferKeys = keyof InterruptedBatchOffer;
    const pin: Record<Exclude<OfferKeys, "batchId" | "remaining" | "total">, never> &
      Record<Exclude<"batchId" | "remaining" | "total", OfferKeys>, never> = true;
    expect(pin).toBe(true);

    // The prose half: the key set is read off a real offer, as a closed set, with no invented key list.
    const offer = offerOf(
      recognizeInterruptedBatch(
        "VAL_a1",
        [batch({ entryIds: ["OD_0001", "OD_0002"] })],
        new Set(["OD_0001"]),
      ),
    );
    const keys: OfferKeys[] = Object.keys(offer).sort() as OfferKeys[];
    expect(keys).toEqual(["batchId", "remaining", "total"]);
    expect(Object.keys(offer)).toHaveLength(3);
  });
});
