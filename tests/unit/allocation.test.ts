import { describe, expect, it } from "vitest";

import {
  selectBatchEntries,
  type AllocationCandidate,
  type CoverageByEntryId,
} from "@/lib/domain/allocation";

/**
 * The allocation selection rule, as a pure function.
 *
 * WHAT THIS FILE PROVES
 * ---------------------
 * That the ORDER the server imposes is a function of coverage alone plus the supplied randomness,
 * and that it cannot fall back to a raw row count, a stable sort, or ambient randomness.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * That coverage is computed correctly. `selectBatchEntries` is handed the coverage map and never
 * derives it — see the module header — so nothing here asserts what "qualifying" means. That rule
 * is `validation-response.test.ts`, and the end-to-end claim that allocation feeds it the right
 * numbers is `allocation-service.test.ts`, which drives the service against a fake repository
 * holding stored `cannot_evaluate` responses.
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

const coverage = (pairs: readonly (readonly [string, number])[]): CoverageByEntryId =>
  new Map(pairs);

const ids = (selected: readonly { id: string }[]): string[] => selected.map((entry) => entry.id);

const none = new Set<string>();

describe("who is eligible", () => {
  it("excludes an entry the validator has already answered", () => {
    // The methodology forbids a second response from the same validator counting as a second
    // independent opinion, so this is an eligibility rule rather than a preference. It is also the
    // rule the `validations_validator_entry_unique` constraint backs up structurally.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      new Set(["OD_0002"]),
      coverage([]),
      3,
      10,
      constantZero,
    );

    expect(ids(selected)).toEqual(["OD_0001"]);
  });

  it("excludes an entry whose qualifying coverage has REACHED the target", () => {
    // "Reached", not "exceeds": the third qualifying validation is what retires the entry. A rule
    // written as `>` would serve every entry one extra time, and the resulting over-collection is
    // invisible in the data — it looks like diligence.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      none,
      coverage([
        ["OD_0001", 3],
        ["OD_0002", 2],
      ]),
      3,
      10,
      constantZero,
    );

    expect(ids(selected)).toEqual(["OD_0002"]);
  });

  it("keeps an entry with no coverage figure in the pool, as coverage zero", () => {
    // A caller that failed to compute coverage for one entry should not RETIRE it: retirement is
    // the irreversible half of that error, because the entry may then never reach the target.
    // Offering it is the recoverable half. See the module header.
    const selected = selectBatchEntries(
      candidates("OD_0001"),
      none,
      coverage([]),
      3,
      10,
      constantZero,
    );

    expect(ids(selected)).toEqual(["OD_0001"]);
    expect(selected[0]?.coverage).toBe(0);
  });

  it("compares against the CONFIGURED target, so nothing is hard-coded in the rule", () => {
    const pool = candidates("OD_0001", "OD_0002", "OD_0003");
    const counts = coverage([
      ["OD_0001", 1],
      ["OD_0002", 2],
      ["OD_0003", 3],
    ]);

    // The same pool and the same coverage, under two different targets. If the rule carried the
    // planning target of 3 as a constant, these two calls could not differ.
    const atThree = selectBatchEntries(pool, none, counts, 3, 10, constantZero);
    const atTwo = selectBatchEntries(pool, none, counts, 2, 10, constantZero);

    expect(ids(atThree)).toEqual(["OD_0001", "OD_0002"]);
    expect(ids(atTwo)).toEqual(["OD_0001"]);
  });
});

describe("the order the server imposes", () => {
  it("offers every lowest-coverage entry before any higher-coverage entry", () => {
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005", "OD_0006"),
      none,
      coverage([
        ["OD_0001", 2],
        ["OD_0002", 0],
        ["OD_0003", 1],
        ["OD_0004", 0],
        ["OD_0005", 2],
        ["OD_0006", 1],
      ]),
      3,
      3,
      constantZero,
    );

    // Both zero-coverage entries come first, then one of the coverage-1 entries. A rule that
    // served the lowest entry alone would return a batch of 1.
    expect(ids(selected)).toHaveLength(3);
    expect(ids(selected).slice(0, 2).sort()).toEqual(["OD_0002", "OD_0004"]);
    expect(ids(selected)[2]).toMatch(/^OD_000[36]$/);
  });

  it("tops up a partially filled lowest-coverage group from the next group up", () => {
    // Roadmap rule 6 says "up to 10", and the participant experience specifies a batch of 10. A
    // lowest-tier-only reading would serve a batch of 2 here, forever.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005"),
      none,
      coverage([
        ["OD_0001", 0],
        ["OD_0002", 1],
        ["OD_0003", 1],
        ["OD_0004", 1],
        ["OD_0005", 2],
      ]),
      3,
      4,
      constantZero,
    );

    expect(ids(selected)).toHaveLength(4);
    expect(ids(selected)[0]).toBe("OD_0001");
    // The three coverage-1 entries fill the rest, and the coverage-2 entry is not reached.
    expect(ids(selected).slice(1).sort()).toEqual(["OD_0002", "OD_0003", "OD_0004"]);
  });

  it("returns a short batch only when the eligible pool itself is smaller", () => {
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      none,
      coverage([["OD_0001", 1]]),
      3,
      10,
      constantZero,
    );

    // Not short because the lowest tier was exhausted — short because there is nothing left.
    expect(ids(selected)).toHaveLength(2);
  });

  it("returns nothing when nothing is eligible, rather than a partial batch of ineligible entries", () => {
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002"),
      new Set(["OD_0001", "OD_0002"]),
      coverage([]),
      3,
      10,
      constantZero,
    );

    expect(selected).toEqual([]);
  });

  it("returns nothing for a non-positive size instead of raising", () => {
    // `resolveBatchSize` floors the result at 1, so this is a direct caller's tolerance rather
    // than a path the service can reach.
    expect(
      selectBatchEntries(candidates("OD_0001"), none, coverage([]), 3, 0, constantZero),
    ).toEqual([]);
  });

  it("never mutates the caller's pool, because the caller still owns its coverage map", () => {
    const pool = candidates("OD_0001", "OD_0002", "OD_0003");
    const before = ids(pool);

    selectBatchEntries(pool, none, coverage([]), 3, 2, constantZero);

    expect(ids(pool)).toEqual(before);
  });
});

describe("randomization within a coverage level", () => {
  it("does not return equal-coverage entries in input order", () => {
    // With a constant-0 source every swap pulls the front of the group to the back, so a shuffle
    // that silently did nothing would return [OD_0001, OD_0002, OD_0003] and fail here.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      coverage([
        ["OD_0001", 0],
        ["OD_0002", 0],
        ["OD_0003", 0],
      ]),
      3,
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
      coverage([
        ["OD_0001", 1],
        ["OD_0002", 1],
        ["OD_0003", 1],
      ]),
      3,
      3,
      scripted([0.5, 0]),
    );

    expect(ids(selected)).toEqual(["OD_0003", "OD_0001", "OD_0002"]);
  });

  it("shuffles each coverage group independently, so the tiers stay contiguous", () => {
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004"),
      none,
      coverage([
        ["OD_0001", 0],
        ["OD_0002", 0],
        ["OD_0003", 1],
        ["OD_0004", 1],
      ]),
      3,
      4,
      constantZero,
    );

    // The coverage-0 group shuffles to [OD_0002, OD_0001] and the coverage-1 group to
    // [OD_0004, OD_0003]; concatenation keeps them in tier order.
    expect(ids(selected)).toEqual(["OD_0002", "OD_0001", "OD_0004", "OD_0003"]);
    expect(selected.map((entry) => entry.coverage)).toEqual([0, 0, 1, 1]);
  });

  it("is reproducible: the same pool, coverage and source give the same order twice", () => {
    const pool = candidates("OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005");
    const counts = coverage([
      ["OD_0001", 0],
      ["OD_0002", 0],
      ["OD_0003", 1],
      ["OD_0004", 1],
      ["OD_0005", 2],
    ]);
    const source = scripted([0.9, 0.1, 0.6, 0.2]);

    const first = selectBatchEntries(pool, none, counts, 3, 4, source);
    const second = selectBatchEntries(pool, none, counts, 3, 4, source);

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

    selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      coverage([]),
      3,
      2,
      counting,
    );

    // Three elements means two swap steps, whatever order the steps take.
    expect(calls).toBe(2);
  });

  it("clamps an out-of-range draw rather than indexing past the end of the group", () => {
    // A source that answers 1.0 — which `Math.random` never does, and which a miswritten scripted
    // source could — would otherwise compute `j = length`, read `undefined` off the end of the
    // group, and write it into the batch. That is a silently corrupt research record rather than a
    // loud failure, which is the failure mode worth precluding.
    //
    // With the clamp, `j` is held to the current index, so every step degenerates to a swap with
    // itself and the permutation is the identity. The identity is the *point*: the claim under
    // test is that the output is still a permutation of the input containing no `undefined`, not
    // that an out-of-contract source produces a particular order.
    const selected = selectBatchEntries(
      candidates("OD_0001", "OD_0002", "OD_0003"),
      none,
      coverage([
        ["OD_0001", 0],
        ["OD_0002", 0],
        ["OD_0003", 0],
      ]),
      3,
      3,
      () => 1,
    );

    expect(ids(selected)).toEqual(["OD_0001", "OD_0002", "OD_0003"]);
    for (const entry of selected) expect(typeof entry.id).toBe("string");
    expect(new Set(ids(selected)).size).toBe(3);
  });
});
