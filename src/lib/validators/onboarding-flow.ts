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
 * network, and no Supabase credential. The client component below is left with
 * rendering, browser-storage writes, and navigation only.
 *
 * ============================================================================
 * THE TWO GUARANTEES THAT MATTER MOST HERE
 * ============================================================================
 * 1. A participant who already holds an identity must NOT be issued a second
 *    one. Two identities for one person silently split their research record in
 *    two, with nothing in the stored data able to tell that it was the same
 *    person. So the stored value is resolved BEFORE enrolling.
 *
 * 2. A screening answer the participant just gave must never be thrown away.
 *    This is subtler than it looks and the first version of this file got it
 *    wrong: `enroll-fresh` carried an `answer` field, the only producer of that
 *    field hardcoded `null`, and the component forwarded it — so a participant
 *    who selected "Fluent" and whose stored identifier turned out to be
 *    unrecognised was enrolled as having DECLINED. Silently recording a
 *    fabricated research datum is the exact failure this project exists to
 *    prevent, and it is why every decision below takes the pending answer as an
 *    explicit parameter instead of carrying a field nothing can populate.
 */

/** What the flow decided to do. A component's whole job is to render one of these. */
export type OnboardingDecision =
  /**
   * Enrollment or restore succeeded and the participant should see the confirmation.
   * `validatorId` is non-null only when a NEW identifier was minted and the browser
   * therefore has something to store; on a resume the browser already holds it, and
   * re-storing it would be a redundant write.
   */
  | { readonly kind: "ready"; readonly validatorId: AnonymousValidatorId | null }
  /**
   * Proceed to a fresh enrollment, carrying the answer the participant chose.
   *
   * Reached when a stored identifier names nobody, so it is forgotten and a new
   * identity is issued. `answer` is passed in rather than derived: on this path the
   * participant HAS answered the question, and enrolling them as `null` would
   * record a decline they never chose.
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
 *
 * The return type is `TerminalDecision`, not the full `OnboardingDecision`, because an
 * enrollment result can never be `enroll-fresh`: that variant exists only for the
 * stale-identifier fallback, which has already been decided before enrollment runs.
 * Declaring the narrower type means a caller cannot pass an `enroll-fresh` here and
 * have it silently fall through both branches.
 */
export function decideEnrollment(result: EnrollActionResult): TerminalDecision {
  if (result.status === "enrolled") {
    return { kind: "ready", validatorId: result.validatorId };
  }

  return { kind: "error", message: messageForFailure(result.reason, "enrollment") };
}

/**
 * Maps a resume result, carrying the pending answer through the fallback.
 *
 * `answer` is a required parameter on purpose. The stale-identifier path is the one
 * place a participant has already answered the question and would otherwise be
 * enrolled as having declined, so the answer is threaded in explicitly rather than
 * reconstructed. A test asserts that `absent` yields the exact answer object passed
 * in, not a `null` of the decision's own making.
 *
 * `absent` is NOT an error and is deliberately routed to `enroll-fresh` rather than
 * to a message: a stale local-storage value is the most likely thing to go wrong on
 * a returning visit, and it must not present to the participant as a failure they
 * caused or as a broken platform.
 */
export function decideResume(
  result: ResumeActionResult,
  answer: IlocanoProficiency | null,
): OnboardingDecision {
  if (result.status === "restored") {
    // `validatorId: null` because the browser already holds this value.
    return { kind: "ready", validatorId: null };
  }

  if (result.status === "absent") {
    return { kind: "enroll-fresh", answer };
  }

  return { kind: "error", message: messageForFailure(result.reason, "resume") };
}

/**
 * The decisions that END the flow, as opposed to continuing it.
 *
 * A separate named type rather than an inline `Exclude<...>` in the component, because
 * `Exclude` over a widened return type does not narrow at the call site and had to be
 * replaced with a discriminant check anyway. Having the type here also documents which
 * branch of the flow the client is responsible for terminating.
 */
export type TerminalDecision =
  | { readonly kind: "ready"; readonly validatorId: AnonymousValidatorId | null }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "notice"; readonly message: string };

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

/**
 * The submit control's state while a Server Action is in flight.
 *
 * Extracted purely so it is assertable without a DOM. `renderToStaticMarkup` never runs
 * a transition, so it can only ever observe `isPending === false` — which means a test
 * written against the form's markup alone cannot see the pending behaviour at all, and
 * a form that stopped disabling its controls on submit would pass every markup test.
 *
 * `ariaBusy` is `undefined` rather than `false` when idle so the attribute is absent,
 * which is what assistive technology should see for a control that is simply ready.
 */
export interface SubmitControlState {
  readonly disabled: boolean;
  readonly ariaBusy: true | undefined;
  readonly label: string;
}

export function submitControlState(isPending: boolean): SubmitControlState {
  return {
    disabled: isPending,
    ariaBusy: isPending ? true : undefined,
    label: isPending ? "Saving…" : "Continue",
  };
}
