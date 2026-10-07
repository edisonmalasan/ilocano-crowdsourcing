"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import { batchRoutePath } from "@/lib/validation/batch-route";
import {
  continueControlState,
  decideContinueBatch,
  type ContinueBatchDecision,
} from "@/lib/validation/continue-batch-flow";
import { requestStartValidationAction } from "@/lib/validation/start-validation-actions";
import { clearStoredValidatorId, readStoredValidatorId } from "@/lib/validators/browser-identity";

/**
 * ============================================================================
 * THE TWO CONTROLS ON THE FINISHED BATCH SCREEN
 * ============================================================================
 * Two controls, side by side, and the whole design of this file is that they are genuinely
 * different KINDS of thing rather than two buttons with different wording.
 *
 *   CONTINUE — a `<button>` that calls the single start orchestration and then navigates
 *              to the batch the server chose. A control, not a link, because a batch id does not exist
 *              until the server has produced one: there is nothing to link TO, and linking to
 *              `/validate` instead would put a second request screen between a participant and the
 *              work they asked to continue. That is `design.md` D1, and it is the reason this file
 *              imports the SAME action `/validate`'s own island imports rather than reaching past
 *              it — two paths to allocation would be two paths that can disagree about what
 *              allocation does. The orchestration runs under the SAME attempt: no new validator is
 *              minted because another batch was requested.
 *
 *   FINISH   — a `<button>` that discards the attempt token and then navigates to the same internal
 *              `/`. It still issues NO Server Action and writes no participation record, no
 *              completion marker and no abandonment flag, because the approved method defines no
 *              participation-end event and inventing one would create a fact about an anonymous
 *              participant that nothing asks for (`design.md` D3). What it does instead is END THE
 *              ATTEMPT IN THIS BROWSER SESSION: the token is the whole of what makes a later visit a
 *              continuation rather than a new participation, and leaving it behind would mean a
 *              participant who pressed "Finish" was silently resumed into the same attempt when they
 *              came back. Everything already submitted stays exactly as submitted, and taking part
 *              again means screening again and being issued a fresh attempt.
 *
 * ============================================================================
 * WHY FINISH GOES TO THE LANDING PAGE, AND WHY IT IS A CONTROL RATHER THAN A LINK
 * ============================================================================
 * `/` is the only route that is not part of the validation sequence, so it is the only destination
 * that neither asks for another batch nor implies one is waiting. `/validate` and `/ready` both
 * lead onward to a fresh batch, and putting "Finish for now" one click away from "and here is
 * another batch" would make the two controls say opposite things. The destination is INTERNAL on
 * purpose: a link to somewhere outside this study is a link this project cannot vouch for.
 *
 * It was a `<Link>` until this change, because it had nothing to do but navigate. It is a
 * `<button>` now because it has one more thing to do first, and a link cannot: it discards the
 * attempt token (D3). **The clear happens before the navigation** — `router.push` is not awaited by
 * this handler, so the order is specified rather than observed, and the alternative ordering is the
 * kind of thing that silently becomes load-bearing the day the navigation is awaited.
 *
 * **There is deliberately no cleanup effect.** An effect that cleared the token on unmount would also
 * fire when the component unmounts for any other reason — a re-render that changes its key, a
 * navigation past it, a parent conditional — and would retire attempts the participant never chose
 * to finish. That is the same "declining to continue records nothing" property this control exists
 * to protect, so the token is discarded in exactly one place: the handler below.
 *
 * ============================================================================
 * WHAT THE CLIENT IS NOT TOLD
 * ============================================================================
 * `requestStartValidationAction` returns the batch id plus the first entry only. The
 * entry is read past here — only `batchId` is used, and the response is never rendered.
 * That is not tidiness: a client holding a whole batch's contents before it has answered
 * any of it is the condition the per-entry screen's own header exists to prevent, and a
 * continuation path is exactly where it would creep back in. A DOM test pastes a real
 * instruction into the action's response as a SECOND entry and asserts it never reaches
 * the document — and the response shape makes a second entry unrepresentable rather than
 * merely unread.
 *
 * The identity is read at PRESS time for the reason `start-batch.tsx` records: browser storage does
 * not exist while the server renders, so reading it during render would make the first client
 * render disagree with the first server render.
 */
export interface FinishedBatchProps {
  readonly locale: InterfaceLocale;
  /**
   * The hard checkpoint verdict, owned by the queue-owning session runner.
   * Absent (standalone finished route) means ungated; present but incomplete
   * disables both controls so Finish cannot retire the attempt before every
   * placement is verified stored.
   */
  readonly gate?: { readonly complete: boolean };
}

/** Where finishing goes. Named so a test asserts the value rather than a literal repeated beside it. */
export const FINISH_HREF = "/";

export function FinishedBatch({ locale, gate }: FinishedBatchProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [decision, setDecision] = useState<ContinueBatchDecision | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * The single-flight latch, for the reason `validation-form.tsx` records and not more briefly:
   * `isPending` becomes true only on re-render, so two clicks dispatched in the same task would both
   * see `false` and both would request a batch. A ref is closed synchronously, before the first
   * `await`. `disabled` is still what the participant sees; the latch is what makes the guarantee.
   *
   * This matters more here than it does on the form. A double submit on the form writes one
   * response, because the database's `UNIQUE (validator_id, dataset_entry_id)` refuses the second. A
   * double press HERE would create TWO batches, and an orphaned empty batch is exactly the cost
   * `design.md` records as this change's accepted ordering risk.
   */
  const inFlight = useRef(false);

  async function requestAnotherBatch(): Promise<void> {
    setDecision(null);
    const stored = readStoredValidatorId();
    // `null` means no request was made at all, which is a different fact from a request that came
    // back `failed`. `decideContinueBatch` distinguishes them, exactly as `decideStartBatch` does.
    // The orchestration's terminal outcomes are mapped onto the existing allocation-shaped
    // decision input so both start screens keep one vocabulary for the same research facts.
    const outcome =
      stored === null ? null : await requestStartValidationAction({ validatorId: stored });

    inFlight.current = false;

    if (outcome !== null && (outcome.status === "started" || outcome.status === "resumed")) {
      router.push(batchRoutePath(outcome.batchId));
      return;
    }

    setDecision(
      decideContinueBatch(
        stored,
        outcome === null
          ? null
          : outcome.status === "exhausted"
            ? { status: "exhausted" }
            : { status: "failed", reason: outcome.reason },
        t,
      ),
    );
  }

  const continueState = continueControlState(isPending, t);
  const gated = gate?.complete === false;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/*
        The one piece of state this control can report, and it is NOT an error state in the ordinary
        sense. `exhausted` is an ordinary research outcome — every entry remaining was already
        answered by this validator or is already complete — and reporting it as a failure
        would tell somebody who has finished the study that something is broken. It reads as thanks
        and as a reassurance that what they submitted is intact, because both are true.
      */}
      {decision?.kind === "exhausted" ? (
        <p className="text-body text-ink-muted" data-decision="exhausted">
          {t("validate.finished.exhausted")}
        </p>
      ) : null}

      {decision?.kind === "no-identity" ? (
        <p className="text-body text-ink-muted" data-decision="no-identity">
          {t("validate.finished.failure.invalid")}
        </p>
      ) : null}

      {/*
        A failure is an `alert`, because it appears in response to something the participant did and
        must be announced — and `exhausted` above is deliberately NOT one, because an ordinary research
        outcome is not a fault. The message sits in its own element beside the warning glyph, which is
        the same shape `validation-form.tsx` uses, so the sentence is readable on its own and a test
        can compare the rendered text against the catalog rather than against a concatenation.
      */}
      {decision?.kind === "error" ? (
        <p
          role="alert"
          className="text-small text-status-alert flex items-start gap-2 font-semibold"
          data-decision="error"
        >
          <span aria-hidden="true">△</span>
          <span data-decision-message="true">{decision.message}</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {/*
          THE ONLY CONTROL THAT REQUESTS A BATCH on this screen. Counted, not asserted absent:
          `tests/unit/validation-routes.test.tsx` counts its label over the rendered finished
          presentation, and `design.md` D1 requires the count to be exactly one because two paths to
          allocation are two paths that can disagree.
        */}
        <Button
          type="button"
          size="lg"
          disabled={continueState.disabled || gated}
          aria-busy={continueState.ariaBusy || gated || undefined}
          onClick={() => {
            if (inFlight.current) return;
            inFlight.current = true;
            startTransition(async () => {
              await requestAnotherBatch();
            });
          }}
        >
          {continueState.label}
        </Button>

        {/*
          The finish control, and the ONE place in the application where an attempt token is
          discarded on purpose. It issues no Server Action — declining to continue is not a datum,
          so there is nothing to say to the server — and it is not a link, because a link cannot
          clear anything before it navigates. `design.md` D3.

          The order inside the handler is the specification: discard, then navigate.

          The explanatory note that used to sit beneath this ("Stopping here changes nothing…")
          was removed by owner decision with its catalog keys: on a screen whose heading already
          says the batch is finished, it was orientation for a decision the two buttons above
          already name.
        */}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          disabled={gated}
          aria-busy={gated || undefined}
          onClick={() => {
            clearStoredValidatorId();
            router.push(FINISH_HREF);
          }}
        >
          {t("validate.finished.finish")}
        </Button>
      </div>
    </div>
  );
}
