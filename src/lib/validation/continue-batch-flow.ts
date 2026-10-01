import type { Translate } from "@/lib/i18n/copy";
import type { AllocationOutcome } from "@/schemas/batch";

/**
 * ============================================================================
 * WHAT TO DO AFTER A CONTINUE REQUEST — as a pure function
 * ============================================================================
 * The sibling of `start-batch-flow.ts`, and separate from it for two reasons that are both about
 * what the two screens are allowed to SAY rather than about how they are wired.
 *
 *  1. THE OUTCOMES ARE THE SAME. This reuses the existing `AllocationOutcome` union and adds no
 *     variant, so `exhausted` here is literally the same value the start screen already reports. A
 *     second result type would be a second vocabulary for the same research fact, and the mapping
 *     between them would be somewhere to drift.
 *
 *  2. THE COPY IS NOT. `validateStart.exhausted` says every available sentence "has already been
 *     answered by the required number of people", which is COVERAGE vocabulary — and it is true,
 *     and it is exactly what `design.md` D2 forbids on the finished screen, because that screen
 *     also shows a lifetime figure which is deliberately not a coverage figure. Reusing the key
 *     would have put a coverage claim next to a figure that is defined as not being one, and it
 *     would have done it UNDERNEATH the `validate.finished.*` copy guard, which is scoped by
 *     namespace and would therefore never have seen the string.
 *
 * So the decision shape is shared and the sentences are this screen's own. The branches are
 * identical to the start screen's — start, exhausted, no identity, failure — and each is assertable
 * here with no rendering at all, which `renderToStaticMarkup` and the DOM harness between them
 * cannot do for the navigation half.
 */
export type ContinueBatchDecision =
  | { readonly kind: "continue"; readonly batchId: string }
  | { readonly kind: "exhausted" }
  | { readonly kind: "no-identity" }
  | { readonly kind: "error"; readonly message: string };

/**
 * @param storedId The anonymous validator identifier this browser holds, or `null`.
 * @param outcome  What the allocation Server Action returned. `null` when no request could be made.
 */
export function decideContinueBatch(
  storedId: string | null,
  outcome: AllocationOutcome | null,
  t: Translate,
): ContinueBatchDecision {
  // FIRST and unconditionally, for the same reason as `decideStartBatch`: the fact is knowable
  // before any request, and asking the server to allocate for a browser that holds no identity
  // would produce `unknown_validator` — a restatement of something the browser already knew.
  if (storedId === null) return { kind: "no-identity" };

  if (outcome === null)
    return { kind: "error", message: t("validate.finished.failure.persistence") };

  switch (outcome.status) {
    case "allocated":
      return { kind: "continue", batchId: outcome.batchId };
    // An ordinary research outcome, reported as itself. NO batch was fabricated: the service
    // returns `exhausted` precisely when its selection produced nothing, and it performs no write
    // on that path. `tests/unit/allocation-actions.test.ts` counts `batches.create` calls there.
    case "exhausted":
      return { kind: "exhausted" };
    case "failed":
      return {
        kind: "error",
        message:
          outcome.reason === "not_configured"
            ? t("validate.finished.failure.notConfigured")
            : outcome.reason === "invalid" || outcome.reason === "unknown_validator"
              ? t("validate.finished.failure.invalid")
              : t("validate.finished.failure.persistence"),
      };
  }
}

export interface ContinueControlState {
  readonly disabled: boolean;
  readonly ariaBusy: true | undefined;
  readonly label: string;
}

/**
 * The state of the continue control while its own request is open.
 *
 * The same three facts `submitControlState` reports, and for the same reasons — `design-system`
 * requires the INITIATING control to report its own progress through text as well as styling, and
 * to keep an accessible name while it does. It is a separate function rather than a parameter of
 * that one because the copy is this screen's: reusing `validation.submitting` would have put a
 * per-entry answer's vocabulary on a control that requests a batch.
 *
 * NOTE WHAT THIS DOES NOT DO, which is the answer to `design.md` open question 1. It does not hide
 * the control, and it does not make the finish link inert. Phase 5's precedent is a busy control
 * beside hidden conditional inputs; there are no conditional inputs here, and the finish link is a
 * navigation rather than a control made unavailable — a participant must always be able to leave.
 * So the pending state is on the control that started the action, and only there.
 */
export function continueControlState(isPending: boolean, t: Translate): ContinueControlState {
  return {
    disabled: isPending,
    ariaBusy: isPending ? true : undefined,
    label: isPending ? t("validate.finished.continue.working") : t("validate.finished.continue"),
  };
}
