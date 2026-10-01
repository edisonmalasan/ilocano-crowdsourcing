import type { RecoveryOutcome } from "./recovery-actions-core";

/**
 * ============================================================================
 * WHAT THE START SCREEN DOES ABOUT A LOOKUP RESULT — as a pure function
 * ============================================================================
 * `/validate` already has a decision to make: given what the browser holds and what the allocation
 * Server Action said, does this participant start, wait, check the question first, or read a failure?
 * That is `decideStartBatch`. The recovery lookup ADDS a second question, and it arrives from a
 * different Server Action at a different time — on mount, without the participant having asked.
 *
 * This is a function for the reason `decideStartBatch` and `onboarding-flow.ts` are ones: encoding it
 * as component state would make the branches reachable only by driving a DOM. Two of the three branches
 * are reachable with no rendering at all.
 *
 * ============================================================================
 * WHY `none` AND `unavailable` RENDER THE SAME MARKUP (`design.md` D4)
 * ============================================================================
 * They are DIFFERENT OUTCOMES and the distinction is preserved one layer up — `runRecoveryLookup`
 * reports them as two statuses and a test can see them apart there. At the SCREEN they are
 * deliberately indistinguishable, and the reason is a product one rather than a technical tidiness:
 * a participant who cannot be offered a resume has the same next step either way — start a batch — and
 * a sentence explaining that the check did not complete is a message about OUR infrastructure in the
 * middle of a volunteer task. It would also be unfalsifiable from the outside, since a participant
 * cannot tell which of the two happened.
 *
 * So the rule is: the screen renders EXACTLY the markup it renders for `none`, not a second branch
 * that happens to look the same. §5.3 asserts the two produce identical HTML, which is a stronger
 * claim than "both show nothing" and the only way a later edit cannot quietly add a distinguishing
 * string to one of them.
 *
 * ============================================================================
 * WHY NO BRANCH HERE CAN REMOVE AN AFFORDANCE (`design.md` D3)
 * ============================================================================
 * Every outcome returns a decision that still permits STARTING a batch. There is no branch that
 * disables or hides the existing call to action, and no branch that returns an error in place of it.
 * A lookup is a read on a screen that already works; the most it may do is fail, and failing means
 * showing what it already showed.
 */
export type RecoveryDecision =
  /**
   * An interrupted batch is available: show the offer, and still offer to start a new batch.
   *
   * `remaining` and `total` are the offer's own figures, passed through. `total` is what the batch
   * holds and `remaining` is what is left of it, so "4 of 10" is the whole sentence — and the pairing
   * is what keeps a component from reaching back into the action's response to assemble one, which
   * would be a second place the two figures are combined.
   */
  | {
      readonly kind: "resume";
      readonly batchId: string;
      readonly remaining: number;
      readonly total: number;
    }
  /** Nothing to resume. Also what `unavailable` produces, and what `null` (not yet answered) does. */
  | { readonly kind: "none" }
  /** The browser holds no identifier, so a lookup was never issued and none can be. */
  | { readonly kind: "no-identity" };

/**
 * @param storedId The anonymous validator identifier this browser holds, or `null`.
 * @param outcome  What the recovery Server Action returned. `null` while no lookup has run.
 *
 * THERE IS NO TRANSLATOR PARAMETER, and its absence is the enforcement rather than an oversight.
 *
 * `decideStartBatch` takes one, because every one of ITS branches has something to say. This function's
 * branches have nothing to say — that is D4 — so a translator parameter would be a parameter with no
 * use, and the first draft carried one with an underscore, which ESLint correctly reported as an unused
 * variable. An underscore is the shape of a requirement that has been talked around.
 *
 * Two properties follow, and they are better than the throwing-translator test the underscore was
 * standing in for:
 *
 *   - this module cannot ask for a string, because it has nothing to ask with; and
 *   - a D4 test can assert the CATALOG rather than the call: `tests/dom/start-batch.test.tsx` derives
 *     every `validateStart.resume.*` key from the English catalog and asserts that none of the five, in
 *     either language, reads as a fault. That is a statement about what exists to be said, which an
 *     unused parameter could never have been.
 */
export function decideRecovery(
  storedId: string | null,
  outcome: RecoveryOutcome | null,
): RecoveryDecision {
  // Checked BEFORE the outcome, and not as a refinement of it. A browser with no identifier cannot
  // have issued a request, so an outcome here would be one this participant never asked for — and the
  // participant still needs to be told why nothing appeared, which is a different message from "you
  // have no unfinished batch".
  if (storedId === null) return { kind: "no-identity" };

  // `null`, `none`, and every failure collapse to the SAME decision. D4 says they must render the same
  // markup and this is where that becomes true; the reasons are separated above and in the action, and
  // this function deliberately discards them.
  if (outcome === null || outcome.status !== "interrupted") return { kind: "none" };

  // The offer's counts are passed straight through rather than recomputed, because this layer has no
  // way to know whether they are still true and recomputing would create a second derivation of a
  // research figure. The remaining count is derived once, in the rule, from the validator's answered
  // set — see `recognizeInterruptedBatch`.
  return {
    kind: "resume",
    batchId: outcome.offer.batchId,
    remaining: outcome.offer.remaining,
    total: outcome.offer.total,
  };
}

/**
 * Whether the screen should still show its primary call to action.
 *
 * ALWAYS TRUE, and written as a function rather than left implicit because the requirement it
 * corresponds to (`design.md` D3 — the lookup is additive) is otherwise only visible as the ABSENCE of
 * a branch, which no test can assert without this.
 *
 * The deliberate consequence: the participant is never blocked from starting a new batch because a
 * recovery check failed or is still running. A separate decision was considered and rejected in D5,
 * on the grounds that refusing a new batch would strand a volunteer mid-task with no support channel.
 */
export function recoveryAllowsStartingABatch(decision: RecoveryDecision): true {
  // An EXHAUSTIVE switch rather than `return true`, and the difference is load-bearing twice over.
  //
  // It removes an unused parameter without an underscore, which is the honest way to express "this
  // argument is not read" — the alternative ESLint rejected is a name that lies about being used. And
  // it makes a FOURTH decision a compile error rather than a silent pass: `RecoveryDecision` is a closed
  // union, so adding a variant leaves this switch without a `return`, and TypeScript reports the
  // function as possibly not returning.
  switch (decision.kind) {
    case "resume":
    case "none":
    case "no-identity":
      return true;
  }
}
