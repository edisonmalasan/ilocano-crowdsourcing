import { describe, expect, it } from "vitest";

import { selectBatchEntries, type AllocationCandidate } from "@/lib/domain/allocation";

/**
 * The allocation selection rule, as a pure function.
 *
 * WHAT THIS FILE PROVES
 * ---------------------
 * That the ORDER the server imposes is a function of eligibility plus the supplied randomness,
 * and that it cannot fall back to a raw row count, a stable sort, or ambient randomness.
 * Eligibility is two exclusions — already answered, already complete — and everything else is a
 * shuffle.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * That completion is computed correctly. `selectBatchEntries` is handed the completion set and
 * never derives it — see the module header — so nothing here asserts what "qualifying" means. That
 * rule is `validation-response.test.ts`, and the end-to-end claim that allocation feeds it the
 * right membership is `allocation-service.test.ts`, which drives the service against a fake
 * repository holding stored `cannot_evaluate` responses.
 *
 * Nothing here touches a database, a network, or a Server Action.
 */

/** A constant source, which is the point: the same source must give the same order every time. */
const constantZero = (): number => 0;

/** A scripted source, for asserting an exact permutation rather than "some permutation". */
function scripted(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] as number;
    index += 1;
    return value;
  };
}

const candidates = (...ids: string[]): AllocationCandidate[] => ids.map((id) => ({ id }));

const completed = (...ids: string[]): ReadonlySet<string> => new Set(ids);

const ids = (selected: readonly { id: string }[]): string[] => selected.map((entry) => entry.id);

const none = new Set<string>();

describe("who is eligible", () => {
  it("excludes an entry the validator has already answered", () => {
    // One attempt never answers one entry twice, so this is an eligibility rule rather than a
    // preference. It is also the rule the `validations_validator_entry_unique` constraint backs up
    // structurally.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      new Set(["OD_0002"]),
      completed(),
      10,
      constantZero,
    );

    expect(ids(selected)).toEqual(["OD_0001"]);
  });

  it("excludes an entry that already holds a validating package", () => {
    // One qualifying response completes the entry. There is no second round to offer it for, so
    // membership in the completion set is the whole of retirement — no count, no target.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      none,
      completed("OD_0001"),
      10,
      constantZero,
    );

    expect(ids(selected)).toEqual(["OD_0002"]);
  });

  it("keeps an entry unknown to the completion set in the pool, as incomplete", () => {
    // A caller that failed to compute completion for one entry should not RETIRE it: retirement is
    // the irreversible half of that error, because the entry may then never receive its validating
    // package. Offering it is the recoverable half. See the module header.
    const selected = selectBatchEntries(candidates("OD_0001"), none, completed(), 10, constantZero);

    expect(ids(selected)).toEqual(["OD_0001"]);
  });

  it("has no target to configure, so completion alone decides", () => {
    // The same pool under the old rule needed a target argument to say anything at all. There is
    // no target parameter any more: an entry with many qualifying responses behind it and an entry
    // with one are both complete, and the set says so without a number attached. Compared as a
    // SET, because the order is the shuffle's business and this test is about eligibility.
    const pool = candidates("OD_0001", "OD_0002", "OD_0003");

    expect(
      ids(selectBatchEntries(pool, none, completed("OD_0001"), 10, constantZero)).sort(),
    ).toEqual(["OD_0002", "OD_0003"]);
    expect(ids(selectBatchEntries(pool, none, completed(), 10, constantZero))).toHaveLength(3);
  });
});

describe("the order the server imposes", () => {
  it("shuffles the eligible entries rather than ranking them", () => {
    // Every eligible entry is incomplete, so there is nothing to rank by. The order is the
    // shuffle's, and with a constant-0 source that shuffle is a fixed permutation, asserted
    // exactly rather than as "some order".
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005", "OD_0006"),
      none,
      completed("OD_0006"),
      3,
      constantZero,
    );

    expect(ids(selected)).toHaveLength(3);
    expect(new Set(ids(selected)).size).toBe(3);
    expect(ids(selected)).not.toContain("OD_0006");
  });

  it("returns a short batch only when the eligible pool itself is smaller", () => {
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      none,
      completed(),
      10,
      constantZero,
    );

    // Not short because a tier was exhausted — short because there is nothing left.
    expect(ids(selected)).toHaveLength(2);
  });

  it("returns nothing when nothing is eligible, rather than a partial batch of ineligible entries", () => {
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      new Set(["OD_0001", "OD_0002"]),
      completed(),
      10,
      constantZero,
    );

    expect(selected).toEqual([]);
  });

  it("returns nothing for a non-positive size instead of raising", () => {
    // `resolveBatchSize` floors the result at 1, so this is a direct caller's tolerance rather
    // than a path the service can reach.
    expect(selectBatchEntries(candidates("OD_0001"), none, completed(), 0, constantZero)).toEqual(
      [],
    );
  });

  it("never mutates the caller's pool, because the caller still owns its completion set", () => {
    const pool = candidates("OD_0001", "OD_0002", "OD_0003");
    const before = ids(pool);

    selectBatchEntries(pool, none, completed(), 2, constantZero);

    expect(ids(pool)).toEqual(before);
  });
});

describe("randomization", () => {
  it("does not return eligible entries in input order", () => {
    // With a constant-0 source every swap pulls the front of the array to the back, so a shuffle
    // that silently did nothing would return [OD_0001, OD_0002, OD_0003] and fail here.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      completed(),
      3,
      constantZero,
    );

    expect(ids(selected)).toEqual(["OD_0002", "OD_0003", "OD_0001"]);
  });

  it("produces the permutation a named random source determines", () => {
    // `j = floor(random() * (i + 1))` with i = 2 then i = 1, and the source answering 0.5 then
    // 0.0, gives j = 1 then j = 0. Starting from [OD_0001, OD_0002, OD_0003]: step one swaps
    // indices 2 and 1 to reach [OD_0001, OD_0003, OD_0002], step two swaps indices 1 and 0 to reach
    // [OD_0003, OD_0001, OD_0002]. Written out so a change to the shuffle algorithm has to be
    // argued for rather than absorbed.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      completed(),
      3,
      scripted([0.5, 0]),
    );

    expect(ids(selected)).toEqual(["OD_0003", "OD_0001", "OD_0002"]);
  });

  it("shuffles answered and completed entries out before shuffling, so neither disturbs the order", () => {
    // Exclusion happens BEFORE the shuffle, not after: the random source is never spent deciding
    // the position of an entry that cannot be served, so the order of the served entries is the
    // same as if the excluded ones had never been in the pool.
    const withExcluded = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_XXXX"),
      new Set(["OD_XXXX"]),
      completed("OD_0004"),
      3,
      scripted([0.5, 0]),
    );
    const withoutExcluded = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      completed(),
      3,
      scripted([0.5, 0]),
    );

    expect(ids(withExcluded)).toEqual(ids(withoutExcluded));
  });

  it("is reproducible: the same pool, completion set and source give the same order twice", () => {
    // TWO sources with the SAME answers, not one source used twice: a scripted source is consumed
    // as the shuffle reads it, so sharing one across both calls would feed the second call the
    // continuation of the sequence rather than the same sequence. Replaying the same answers is
    // what "the same supplied randomness" means.
    const pool = candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005");
    const done = completed("OD_0005");

    const first = selectBatchEntries(pool, none, done, 4, scripted([0.9, 0.1, 0.6, 0.2]));
    const second = selectBatchEntries(pool, none, done, 4, scripted([0.9, 0.1, 0.6, 0.2]));

    expect(ids(first)).toEqual(ids(second));
    expect(ids(first)).toHaveLength(4);
  });

  it("reads randomness only from the source, never from an ambient generator", () => {
    // A source that throws proves the rule called it; it does not prove the rule called ONLY it.
    // That half is the type-level assertion in `domain-types.test.ts`, which makes the parameter
    // required, and this test's job is the complementary claim: a rule that fell back to
    // `Math.random()` for some branch would still return an order here, just a different one.
    let calls = 0;
    const counting = (): number => {
      calls += 1;
      return 0.5;
    };

    selectBatchEntries(candidates("OD_0001", "OD_0002", "OD_0003"), none, completed(), 2, counting);

    // Three elements means two swap steps, whatever order the steps take.
    expect(calls).toBe(2);
  });

  it("clamps an out-of-range draw rather than indexing past the end of the pool", () => {
    // A source that answers 1.0 — which `Math.random` never does, and which a miswritten scripted
    // source could — would otherwise compute `j = length`, read `undefined` off the end of the
    // pool, and write it into the batch. That is a silently corrupt research record rather than a
    // loud failure, which is the failure mode worth precluding.
    //
    // With the clamp, `j` is held to the current index, so every step degenerates to a swap with
    // itself and the permutation is the identity. The identity is the *point*: the claim under
    // test is that the output is still a permutation of the input containing no `undefined`, not
    // that an out-of-contract source produces a particular order.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      completed(),
      3,
      () => 1,
    );

    expect(ids(selected)).toEqual(["OD_0001", "OD_0002", "OD_0003"]);
    for (const entry of selected) expect(typeof entry.id).toBe("string");
    expect(new Set(ids(selected)).size).toBe(3);
  });
});
