"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button, linkButtonClasses } from "@/components/ui/button";
import { requestBatchAction } from "@/lib/allocation/actions";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import {
  continueControlState,
  decideContinueBatch,
  type ContinueBatchDecision,
} from "@/lib/validation/continue-batch-flow";
import { readStoredValidatorId } from "@/lib/validators/browser-identity";

/**
 * ============================================================================
 * THE TWO CONTROLS ON THE FINISHED BATCH SCREEN
 * ============================================================================
 * Two controls, side by side, and the whole design of this file is that they are genuinely
 * different KINDS of thing rather than two buttons with different wording.
 *
 *   CONTINUE — a `<button>` that calls the existing `requestBatchAction` and then navigates to the
 *              batch the server chose. A control, not a link, because a batch id does not exist
 *              until the server has produced one: there is nothing to link TO, and linking to
 *              `/validate` instead would put a second request screen between a participant and the
 *              work they asked to continue. That is `design.md` D1, and it is the reason this file
 *              imports the SAME action `/validate`'s own island imports rather than reaching past
 *              it — two paths to allocation would be two paths that can disagree about what
 *              allocation does.
 *
 *   FINISH   — a `<Link>`, and it performs no write at all. No participation record, no completion
 *              marker, no abandonment flag, because the approved method defines no participation-end
 *              event and inventing one would create a fact about an anonymous participant that
 *              nothing asks for (`design.md` D3). Everything already submitted stays exactly as
 *              submitted, and a participant who returns tomorrow is still eligible to continue.
 *
 * ============================================================================
 * WHY THE FINISH LINK IS AN INTERNAL HREF TO THE LANDING PAGE
 * ============================================================================
 * `/` is the only route that is not part of the validation sequence, so it is the only destination
 * that neither asks for another batch nor implies one is waiting. `/validate` and `/ready` both
 * lead onward to a fresh batch, and putting "Finish for now" one click away from "and here is
 * another batch" would make the two controls say opposite things. It is an INTERNAL href on
 * purpose: a link to somewhere outside this study is a link this project cannot vouch for.
 *
 * ============================================================================
 * WHAT THE CLIENT IS NOT TOLD
 * ============================================================================
 * `requestBatchAction` returns the allocated batch's ENTRIES as well as its id. They are read past
 * here — only `batchId` is used, and the response is never rendered. That is not tidiness: a client
 * holding a whole batch's contents before it has answered any of it is the condition the per-entry
 * screen's own header exists to prevent, and a continuation path is exactly where it would creep
 * back in. A DOM test pastes a real instruction into the action's response and asserts it never
 * reaches the document.
 *
 * The identity is read at PRESS time for the reason `start-batch.tsx` records: `localStorage` does
 * not exist while the server renders, so reading it during render would make the first client
 * render disagree with the first server render.
 */
export interface FinishedBatchProps {
  readonly locale: InterfaceLocale;
}

/** Where finishing goes. Named so a test asserts the value rather than a literal repeated beside it. */
export const FINISH_HREF = "/";

export function FinishedBatch({ locale }: FinishedBatchProps) {
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
    const outcome = stored === null ? null : await requestBatchAction({ validatorId: stored });

    inFlight.current = false;

    if (outcome !== null && outcome.status === "allocated") {
      router.push(`/validate/${encodeURIComponent(outcome.batchId)}`);
      return;
    }

    setDecision(decideContinueBatch(stored, outcome, t));
  }

  const continueState = continueControlState(isPending, t);

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/*
        The one piece of state this control can report, and it is NOT an error state in the ordinary
        sense. `exhausted` is an ordinary research outcome — every entry remaining was already
        answered by this validator or has reached the coverage target — and reporting it as a failure
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
          disabled={continueState.disabled}
          aria-busy={continueState.ariaBusy}
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
          The finish control. A LINK, with no handler at all: there is no `onClick`, no form, and
          nothing to submit. That is the whole of `design.md` D3 — declining to continue is not a
          datum, so the honest implementation is one that writes nothing because it has nothing to
          say to the server.
        */}
        <Link
          className={linkButtonClasses({ variant: "secondary", size: "lg", fullWidth: true })}
          href={FINISH_HREF}
        >
          {t("validate.finished.finish")}
        </Link>

        {/*
          What finishing means, in words, because a control labelled "Finish for now" invites the
          reading that something was closed. Nothing was. This is the sentence that keeps D3's
          honest reading available, and it deliberately says nothing about how many batches a
          participant should do — the localization requirement forbids implying that.
        */}
        <p className="text-small text-ink-faint">{t("validate.finished.finishNote")}</p>
      </div>
    </div>
  );
}
