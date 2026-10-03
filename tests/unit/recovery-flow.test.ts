/**
 * `decideRecovery` — the pure decision behind the start screen.
 *
 * Two of its three outcomes need no rendering at all, which is the reason it is a function: an
 * in-flight lookup and a failed lookup are both observable from here, and neither is reachable from
 * static markup.
 *
 * There is NO translator argument, and this file's last test asserts that rather than passing a stub
 * that throws. The screen carries no sentence about recovery — D4 requires `none` and `unavailable` to
 * render as the same markup — so the way to express that is a function with no way to ask for a string.
 */

import { describe, expect, it, vi } from "vitest";

import { decideRecovery, recoveryAllowsStartingABatch } from "@/lib/validation/recovery-flow";
import type { RecoveryOutcome } from "@/lib/validation/recovery-actions-core";

const OFFER_OUTCOME: RecoveryOutcome = {
  status: "interrupted",
  offer: { batchId: "batch_01", remaining: 4, total: 10 },
};

describe("decideRecovery", () => {
  it("produces the resume decision from an offer", () => {
    expect(decideRecovery("VAL_0000beef", OFFER_OUTCOME)).toEqual({
      kind: "resume",
      batchId: "batch_01",
      remaining: 4,
      total: 10,
    });
  });

  it("treats NOT YET ANSWERED exactly like an answer of none", () => {
    // The lookup is issued on mount and the screen renders before it returns. Rendering something
    // different in that window would produce a flash, and a participant who starts a batch during it
    // would be one the offer then contradicts. The decision is the SAME OBJECT, so the screen cannot
    // tell them apart by rendering differently.
    expect(decideRecovery("VAL_0000beef", null)).toEqual(
      decideRecovery("VAL_0000beef", { status: "none" }),
    );
  });

  it("treats every failure as none, at the screen, while the action keeps them apart", () => {
    // D4's two halves, and this is the half that would be easy to get backwards. `runRecoveryLookup`
    // reports `invalid`, `unknown_validator`, `unavailable`, and `not_configured` as FOUR distinct
    // reasons — that distinction is real and `recovery-actions.test.ts` sees it. Here all four collapse
    // to one decision, because at this layer the participant's next step is identical and none of the
    // four is theirs to act on.
    const reasons = ["invalid", "unknown_validator", "unavailable", "not_configured"] as const;
    for (const reason of reasons) {
      expect(
        decideRecovery("VAL_0000beef", { status: "failed", reason }),
        `reason ${reason}`,
      ).toEqual({
        kind: "none",
      });
    }
  });

  it("reports no-identity only when the browser holds no identifier", () => {
    // A different decision, and the only branch that may render differently — a browser with no
    // identifier was never enrolled, so "start a batch" is not available to it either and the screen
    // needs the question-first path instead. Checked BEFORE the outcome, because such a browser
    // cannot have issued a lookup and an outcome here would be one this participant never asked for.
    expect(decideRecovery(null, null)).toEqual({ kind: "no-identity" });
    // Even given one. This is the ordering, asserted: identity first.
    expect(decideRecovery(null, OFFER_OUTCOME)).toEqual({ kind: "no-identity" });
  });

  it("passes the offer's counts through rather than recomputing them", () => {
    // This layer has no way to know whether the counts are still true, so recomputing would create a
    // SECOND derivation of a research figure. The remaining count is derived once, in
    // `recognizeInterruptedBatch`, from the validator's answered set.
    const decision = decideRecovery("VAL_0000beef", OFFER_OUTCOME);
    expect(decision).toMatchObject({ remaining: 4, total: 10 });
    // Four keys, not three and not five. `batchId` is the link's destination, the two figures are the
    // sentence, and `kind` is the branch. A fifth — an answered count, a created-at, a contribution
    // total — would be something the screen could show, and `design.md` D7's whole claim is that it
    // cannot. `total` earns its place because "4 of 10" is one fact with two numbers in it; without
    // it the screen would have to read the action's response separately and compose the sentence in two
    // places.
    expect(Object.keys(decision).sort()).toEqual(["batchId", "kind", "remaining", "total"]);
    expect(Object.keys(decision)).not.toContain("answered");
    expect(Object.keys(decision)).not.toContain("createdAt");
  });

  it("never lets any outcome remove the ability to start a batch", () => {
    // `design.md` D3, and D5's rejected alternative: refusing a new batch because one is open would
    // strand a volunteer mid-task with no support channel. Asserted over EVERY decision the function
    // can produce, including the offer — which is the case where a "you already have work" gate would
    // have been written.
    const everyDecision = [
      decideRecovery("VAL_0000beef", OFFER_OUTCOME),
      decideRecovery("VAL_0000beef", { status: "none" }),
      decideRecovery("VAL_0000beef", { status: "failed", reason: "unavailable" }),
      decideRecovery(null, null),
    ];
    for (const decision of everyDecision) {
      expect(recoveryAllowsStartingABatch(decision), decision.kind).toBe(true);
    }
  });
});

/**
 * The decision function cannot ask for a sentence, because it has no way to ask.
 *
 * A TEXTUAL scan, and the limitation is stated rather than hidden: it proves the module does not import
 * the copy catalog, not that no future string could reach the screen by another route. What makes it
 * worth having is the alternative. The first draft passed a translator that THREW on any lookup, which
 * is a behavioural proof — and it needed a third parameter that nothing used, which ESLint reported as
 * an unused variable. The honest repair was to delete the parameter and assert the property that
 * actually matters: there is nothing to look strings up in.
 *
 * The complementary half of the same requirement is `tests/dom/start-batch.test.tsx`, which drives
 * the orchestration and asserts a failed lookup leaves no alert on screen and still allocates —
 * in either language, since the states it renders come from the catalog. Neither half sees the
 * other: this one cannot see the catalog, and that one cannot see the decision function.
 */
it("does not import the copy catalog, so no branch of it can acquire a sentence", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/lib/validation/recovery-flow.ts", "utf8");

  expect(source).not.toMatch(/from\s+"@\/lib\/i18n\/copy"/);
  expect(source).not.toMatch(/\bt\s*\(/);
  // Read a non-empty file. A scan of an empty or unreadable path matches nothing and passes, which is
  // the guard that reports coverage it does not provide.
  expect(source.length).toBeGreaterThan(500);
});

/**
 * The decision function does not import `server-only`, so this file needs no stub — and asserting that
 * here keeps a future import from making it untestable without anyone noticing.
 */
it("is importable without the server-only marker, which is what makes it testable", async () => {
  vi.resetModules();
  await expect(import("@/lib/validation/recovery-flow")).resolves.toBeDefined();
});
