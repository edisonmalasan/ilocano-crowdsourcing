"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button, linkButtonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { requestBatchAction } from "@/lib/allocation/actions";
import { translatorFor } from "@/lib/i18n/copy";
import {
  decideRecovery,
  recoveryAllowsStartingABatch,
  type RecoveryDecision,
} from "@/lib/validation/recovery-flow";
import { batchRouteHref, batchRoutePath } from "@/lib/validation/batch-route";
import type { RecoveryOutcome } from "@/lib/validation/recovery-actions-core";
import { requestInterruptedBatchAction } from "@/lib/validation/recovery-actions";
import { decideStartBatch, type StartBatchDecision } from "@/lib/validation/start-batch-flow";
import { readStoredValidatorId } from "@/lib/validators/browser-identity";

/**
 * ============================================================================
 * OBTAINING A BATCH — the client island on `/validate`
 * ============================================================================
 * A batch id does not exist until the server has chosen one, so this route cannot be a static link
 * from `/ready`: there is nothing to link TO. The request is therefore made from the participant's
 * browser, using the anonymous identifier the onboarding flow already stored there, and the
 * navigation happens only after the server has answered.
 *
 * ============================================================================
 * WHY THE IDENTITY IS READ AT PRESS TIME AND NOT DURING RENDER
 * ============================================================================
 * `readStoredValidatorId()` reads browser storage, which does not exist while the server renders, so
 * calling it in the component body would make the first server-rendered markup disagree with the
 * first client-rendered markup — a hydration mismatch whose visible symptom is the whole card
 * changing on arrival. The alternative of reading in an effect and rendering optimistically was
 * rejected for the reason recorded in `src/app/start/screening-form.tsx`: suppressing the question
 * lets someone act before the server has vouched for the value they are acting on.
 *
 * So the button is always offered, and pressing it resolves the identity and, if there is one, asks
 * for a batch. A browser holding no identity gets the "answer the question first" answer instead of
 * a request the server was always going to refuse. `requestBatchAction` re-checks the identifier
 * against storage regardless, so a hand-edited value produces `unknown_validator` rather than a
 * batch attached to nobody: the browser is not trusted here, it is only where the value is kept.
 *
 * ============================================================================
 * THE SAME IDENTITY IS READ TWICE, AND THAT IS NOT AN INCONSISTENCY
 * ============================================================================
 * `readStoredValidatorId()` is called once in the mount effect below and once at press time. Two calls
 * rather than one kept value, because a value held across a render is a value the component would have
 * to reconcile: the browser could be cleared, or a second tab could write a different one, and the
 * component has no way to know without looking. Reading where each is needed means each read is true
 * at the moment it is used, and the second read is also the one that gets re-checked by the server.
 *
 * ============================================================================
 * WHY THE LOOKUP IS AN EFFECT AND NOT PART OF RENDER
 * ============================================================================
 * The same reason the identity is not read during render: browser storage does not exist while the
 * server renders, and `requestInterruptedBatchAction` is a Server Action that must not run there. An
 * effect runs once, after the participant's own browser has taken over, and it is a READ - so issuing
 * it on mount costs a query and writes nothing (`design.md` D8).
 *
 * THE EFFECT CANNOT BLOCK THE SCREEN. Until it answers, `recovery` is `null`, and `decideRecovery`
 * treats `null` as `none`. There is no loading branch, no spinner, and no disabled button, because
 * `design.md` D3 makes the lookup strictly ADDITIVE: the most it can do is add a link to a batch the
 * participant already has. A screen that waited for it before offering anything would turn a slow
 * query into an unavailable study.
 */
export interface StartBatchProps {
  readonly locale: InterfaceLocale;
}

/**
 * Where the resume link points.
 *
 * A named function rather than an inline expression so a test asserts the value the ROUTE
 * CONTRACT produces rather than a literal repeated beside it, and so the start screen has one
 * reviewable place where a batch address is built.
 *
 * The id is emitted EXACTLY as the server stored it — no `encodeURIComponent` — which is the
 * producer half of `src/lib/validation/batch-route.ts`. The route decodes it once; pre-encoding
 * here composed with the framework's own encoding into `%253A` and produced an address naming no
 * batch.
 */
export function resumeHref(batchId: string): string {
  return batchRoutePath(batchId);
}

export function StartBatch({ locale }: StartBatchProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [decision, setDecision] = useState<StartBatchDecision | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * The recovery lookup's answer, and the identity it was asked about — as ONE value.
   *
   * `outcome` is `null` while none has arrived, and `null` is deliberately three things at once: no
   * lookup has run, the lookup reported `none`, and the lookup failed. `decideRecovery` collapses all
   * three into the same decision and the screen renders the same markup for each (`design.md` D4).
   * Holding one value rather than a status enum is what makes that structural — a future edit cannot
   * branch on a distinction this state does not hold.
   *
   * `storedId` is state rather than a fresh storage read, for the reason the effect's comment
   * gives: a value read during render makes the first client render disagree with the first server
   * render, because browser storage does not exist on the server. The press-time read below is separate
   * and fresh; THIS one exists only so the decision has an identity to reason about.
   *
   * ONE OBJECT, not two `useState` calls, because the two are written together. Two would admit the
   * state `storedId: "VAL_…" , outcome: null` — an identity with no answer yet — which is precisely the
   * not-yet-answered case the shape is meant to express, so it happens to be harmless; but it would
   * also admit the reverse, an outcome with no identity, which is not a state this screen can be in.
   */
  const [lookup, setLookup] = useState<{
    storedId: string | null;
    outcome: RecoveryOutcome | null;
  }>({
    storedId: null,
    outcome: null,
  });

  useEffect(() => {
    // The result is assigned once, after the lookup, so nothing is written from the effect's own body.
    // `react-hooks/set-state-in-effect` rejects a synchronous `setState` there for a good reason — it
    // forces a second render pass for a value the component already knows — and the first draft of this
    // effect called `setStoredId` and `setOutcome` from the body, which the linter caught.
    //
    // The shape is also honest about the requirement. A browser holding no identity is not an ERROR and
    // not a special case: it simply has no lookup to make, and the value written is the same `none` a
    // successful empty lookup produces, so the screen cannot tell the two apart — which is what it must
    // not be able to do.
    let cancelled = false;

    void (async () => {
      const stored = readStoredValidatorId();
      const answer: RecoveryOutcome =
        stored === null
          ? { status: "none" }
          : await requestInterruptedBatchAction({ validatorId: stored });
      if (cancelled) return;
      setLookup({ storedId: stored, outcome: answer });
    })();

    return () => {
      // React state after unmount is a no-op with a warning in development, and this screen is navigated
      // away from the moment a participant presses the button. The guard is one word and removes the
      // whole class of question.
      cancelled = true;
    };
  }, []);

  const recovery: RecoveryDecision = decideRecovery(lookup.storedId, lookup.outcome);
  // Read so the D3 requirement is a CALL rather than the absence of a branch, which no test can
  // assert. Every path through this component returns true, and that is the point.
  const mayStart = recoveryAllowsStartingABatch(recovery);

  return (
    <Card as="section" padding="lg">
      <h2 className="text-heading">{t("validateStart.title")}</h2>
      <p className="text-body text-ink-muted mt-3">{t("validateStart.lead")}</p>

      {/*
        THE ADDITION. A link, not a button, and with no handler at all (`design.md` D6): the batch
        already exists, so unlike "Start a batch" there is something to link TO, and clicking it writes
        nothing. The opposite of the finished screen's D1, where the target does not exist until the
        server makes it and a link would be impossible.

        It sits ABOVE the start button rather than beside it, because it is the participant's own
        unfinished work and that is what they came back for — while the button below stays exactly
        where it was, enabled, with its label untouched. Nothing about the button changes when a
        resume offer appears, and that is the observable form of D3.
      */}
      {recovery.kind === "resume" ? (
        <div className="mt-5 flex flex-col gap-3" data-recovery="resume">
          <p className="text-body font-semibold">{t("validateStart.resume.title")}</p>
          <p className="text-body text-ink-muted" data-recovery-count="true">
            {recovery.remaining} {t("validateStart.resume.remaining.connector")} {recovery.total}{" "}
            {t("validateStart.resume.remaining.unit")}
          </p>
          <div>
            <Link className={linkButtonClasses({ size: "lg" })} href={resumeHref(recovery.batchId)}>
              {t("validateStart.resume.cta")}
            </Link>
          </div>
          {/*
            The sentence that makes the button below safe to press. Without it, a resume offer and a
            "start a new batch" button read as contradictory, and a participant could reasonably
            conclude the second one discards the first. Nothing is discarded — the requirement is that
            an unfinished batch's entries stay allocatable, which is why offering both is honest.
          */}
          <p className="text-small text-ink-faint">{t("validateStart.resume.note")}</p>
        </div>
      ) : null}

      {decision?.kind === "no-identity" ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-body text-ink-muted">{t("validateStart.noIdentity")}</p>
          <p>
            <Link className="font-display font-bold underline" href="/start">
              {t("validateStart.noIdentity.cta")}
            </Link>
          </p>
        </div>
      ) : null}

      {decision?.kind === "exhausted" ? (
        <p className="text-body text-ink-muted mt-5">{t("validateStart.exhausted")}</p>
      ) : null}

      {decision?.kind === "error" ? (
        <p role="alert" className="text-small text-status-alert mt-5 font-semibold">
          {decision.message}
        </p>
      ) : null}

      <div className="mt-6">
        {/*
          `!mayStart || isPending` rather than `isPending`.

          `mayStart` is `true` on every path through `decideRecovery`, so the two expressions produce
          the same rendered button today. The difference is what a later edit can do: with the
          recovery decision absent, a branch that wanted to disable this button would have to ADD
          `disabled` here and nobody would notice, and `tests/dom` would still pass because the
          behaviour it checks is "pressing this issues a request". Writing the requirement into the
          expression makes the blocking case a change to this file rather than an omission from it,
          and if it ever became false the button would grey out rather than disappear.

          The label is ALSO unchanged by the offer above. A participant with an interrupted batch sees
          "Give me my sentences" exactly as a participant with none does, which is what makes the
          note about starting a fresh batch true rather than a promise.
        */}
        <Button
          type="button"
          size="lg"
          disabled={!mayStart || isPending}
          aria-busy={isPending || undefined}
          onClick={() => {
            setDecision(null);
            startTransition(async () => {
              const stored = readStoredValidatorId();
              const result =
                stored === null ? null : await requestBatchAction({ validatorId: stored });

              if (result !== null && result.status === "allocated") {
                router.push(batchRouteHref(result.batchId));
                return;
              }

              setDecision(decideStartBatch(stored, result, t));
            });
          }}
        >
          {isPending ? t("validateStart.working") : t("validateStart.begin")}
        </Button>
      </div>
    </Card>
  );
}
