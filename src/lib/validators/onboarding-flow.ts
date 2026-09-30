import type { AnonymousValidatorId, IlocanoProficiency } from "@/schemas/validator";

import type { EnrollActionResult, ResumeActionResult } from "./onboarding-actions-core";

/**
 * Onboarding flow decisions.
 *
 * ============================================================================
 * WHY THESE ARE PURE FUNCTIONS AND NOT COMPONENT STATE
 * ============================================================================
 * The interesting part of the screening flow is a decision, not a render: given
 * what the browser holds and what the server said, does this participant enroll,
 * resume, forget, or see an error? Encoding that as `useState` plus branching
 * inside a component makes it reachable only by driving a DOM, which would mean
 * either a browser test runner this project does not have or assertions about
 * markup that do not actually prove the decision.
 *
 * As pure functions, every branch is directly assertable with no rendering, no
 * network, and no Supabase credential. The client components below are left with
 * rendering and navigation only.
 *
 * ============================================================================
 * THE ONE GUARANTEE THAT MATTERS MOST HERE
 * ============================================================================
 * A participant who already holds an identity must NOT be issued a second one.
 * Two identities for one person silently split their research record in two, with
 * nothing in the stored data able to tell that it was the same person. So the
 * stored value is checked BEFORE enrolling, and `resume` short-circuits the
 * enrollment entirely.
 */

/**
 * What the flow decided to do. A component's whole job is to render one of these.
 *
 * `enroll-fresh` carries the answer, which looks redundant while the only caller
 * happens to pass `null`. It is not: the decision is that the participant proceeds
 * to ENROLL with the answer they chose, and a caller reaching it with a different
 * answer must not have to re-derive the rule. Carrying the answer makes the branch
 * honest for every future caller rather than only the one that exists today.
 */
export type OnboardingDecision =
  /** Enrollment or restore succeeded. The identifier, if new, is now known to the browser. */
  | { readonly kind: "ready"; readonly validatorId: AnonymousValidatorId | null }
  /**
   * The stored identifier names nobody. Forget it and enroll a fresh identity, because
   * handing this participant an identity that belongs to no one would be worse than
   * starting over.
   */
  | { readonly kind: "enroll-fresh"; readonly answer: IlocanoProficiency | null }
  /** Something failed. `message` is plain language and names no technical detail. */
  | { readonly kind: "error"; readonly message: string }
  /** A routine status update. Never announced as an alert. */
  | { readonly kind: "notice"; readonly message: string };

/**
 * Which action to run when the participant pressed Continue.
 *
 * The only thing this decides is whether a stored identity must be resolved first.
 * It is a separate function so that the "resume before enrolling" ordering is a
 * named, tested rule rather than a line of code inside a component.
 */
export function firstActionFor(stored: AnonymousValidatorId | null): "resume" | "enroll" {
  return stored === null ? "enroll" : "resume";
}

/** Copy shown when a stored identity is resumed rather than a new one issued. */
export const RESUMED_NOTICE = "Continuing as the validator this browser already held.";

/**
 * Maps an enrollment result.
 *
 * A success carries the newly minted identifier so the caller can store it. Any
 * failure carries no identifier at all — `EnrollActionResult` guarantees that — so
 * there is no branch here that could accidentally persist one.
 */
export function decideEnrollment(result: EnrollActionResult): OnboardingDecision {
  if (result.status === "enrolled") {
    return { kind: "ready", validatorId: result.validatorId };
  }

  return { kind: "error", message: messageForFailure(result.reason, "enrollment") };
}

/**
 * Maps a resume result.
 *
 * `absent` is NOT an error and is deliberately routed to `enroll-fresh` rather than
 * to a message: a stale local-storage value is the most likely thing to go wrong on
 * a returning visit, and it must not present to the participant as a failure they
 * caused or as a broken platform.
 */
export function decideResume(result: ResumeActionResult): OnboardingDecision {
  if (result.status === "restored") {
    // `validatorId: null` because the browser already holds this value; re-storing it
    // would be a redundant write, and the caller has nothing new to learn.
    return { kind: "ready", validatorId: null };
  }

  if (result.status === "absent") {
    return { kind: "enroll-fresh", answer: null };
  }

  return { kind: "error", message: messageForFailure(result.reason, "resume") };
}

/** Which operation failed. The wording differs, because the wrong wording confuses. */
export type OnboardingSubject = "enrollment" | "resume";

/**
 * Plain-language failure copy.
 *
 * Every message names no credential, no environment variable, no host, no table, and no
 * stack frame, and every one of them says NOTHING WAS SAVED. That last part is not
 * politeness: a participant who cannot tell whether a failure persisted something will
 * assume the worst, or retry and create a duplicate. Saying it plainly is what makes a
 * failed submission safe to retry.
 *
 * The copy is per-subject because a single shared string was actively wrong. The
 * enrollment `invalid` message tells the participant to pick one of the screening
 * options; the resume path has no options to pick, so reusing that string there would
 * tell someone to choose a proficiency level in response to a rejected resume.
 */
export function messageForFailure(
  reason: "not_configured" | "invalid" | "persistence",
  subject: OnboardingSubject,
): string {
  if (reason === "not_configured") {
    return subject === "enrollment"
      ? "The study is not open right now. Nothing was saved, and you have not been signed up."
      : "The study is not open right now, so the saved identity could not be checked. Nothing was changed.";
  }

  if (reason === "invalid") {
    return subject === "enrollment"
      ? "We could not accept that answer, and nothing was saved. Please pick one of the options, or continue without answering."
      : "The saved identity could not be checked, and nothing was changed. You can try again in a moment.";
  }

  return subject === "enrollment"
    ? "We could not finish signing you up. Nothing was saved. You can try again in a moment."
    : "The saved identity could not be checked just now, and nothing was changed. You can try again in a moment.";
}
