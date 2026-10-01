import type { Translate } from "@/lib/i18n/copy";
import type { AllocationOutcome } from "@/schemas/batch";

/**
 * ============================================================================
 * WHAT TO DO AFTER A BATCH REQUEST — as a pure function
 * ============================================================================
 * The handoff out of `/ready` is a decision, not a render: given what the browser holds and what the
 * server said, does this participant start, wait, check the question first, or read a failure?
 *
 * It is a pure function for the reason `src/lib/validators/onboarding-flow.ts` is one — encoding it
 * as component state would make it reachable only by driving a DOM, and the branches here are the
 * ones a participant actually takes. Four of the five are testable with no rendering at all.
 *
 * `exhausted` is the branch that matters most and is the easiest to get wrong. It is an ordinary
 * research outcome — every remaining entry was already answered by this validator or has reached
 * the coverage target — and reporting it as a FAILURE would tell someone who has finished the study
 * that something is broken. It gets its own sentence, and that sentence is thanks rather than an
 * apology.
 */
export type StartBatchDecision =
  | { readonly kind: "start"; readonly batchId: string }
  | { readonly kind: "exhausted" }
  | { readonly kind: "no-identity" }
  | { readonly kind: "error"; readonly message: string };

/**
 * @param storedId The anonymous validator identifier this browser holds, or `null`.
 * @param outcome  What the allocation Server Action returned. `null` while no request has run.
 */
export function decideStartBatch(
  storedId: string | null,
  outcome: AllocationOutcome | null,
  t: Translate,
): StartBatchDecision {
  // The identity check comes FIRST and unconditionally, because it is the one thing that is knowable
  // before a request is made, and asking the server to allocate a batch for a browser that holds no
  // identity would produce `unknown_validator` — a server-side restatement of a fact the browser
  // already had.
  if (storedId === null) return { kind: "no-identity" };

  if (outcome === null) return { kind: "error", message: t("validateStart.failure.persistence") };

  switch (outcome.status) {
    case "allocated":
      return { kind: "start", batchId: outcome.batchId };
    case "exhausted":
      return { kind: "exhausted" };
    case "failed":
      return {
        kind: "error",
        message:
          outcome.reason === "not_configured"
            ? t("validateStart.failure.notConfigured")
            : outcome.reason === "invalid" || outcome.reason === "unknown_validator"
              ? t("validateStart.failure.invalid")
              : t("validateStart.failure.persistence"),
      };
  }
}
