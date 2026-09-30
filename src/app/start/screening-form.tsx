"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AnswerGroup } from "@/components/validation/answer-option";
import {
  clearStoredValidatorId,
  readStoredValidatorId,
  writeStoredValidatorId,
} from "@/lib/validators/browser-identity";
import { enrollValidatorAction, resumeValidatorAction } from "@/lib/validators/actions";
import {
  decideEnrollment,
  decideResume,
  firstActionFor,
  RESUMED_NOTICE,
  type OnboardingDecision,
} from "@/lib/validators/onboarding-flow";
import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  type IlocanoProficiency,
} from "@/schemas/validator";

/**
 * Ilocano proficiency screening.
 *
 * ============================ RESEARCH INTEGRITY ============================
 * This screen COLLECTS research data: the answer is stored on the validator
 * profile and is the background record for the whole study. Two rules follow,
 * and both are structural rather than matters of discipline:
 *
 * 1. Options are rendered by `AnswerGroup`, whose unselected class string is a
 *    single frozen constant taking no per-option input. A proficiency level
 *    therefore cannot be given more visual weight than a validation judgment,
 *    because neither can be given weight relative to the other. The five options
 *    are mapped straight from `ILOCANO_PROFICIENCY_CHOICES` in declared order —
 *    never sorted, never re-labelled, never given a `hint`. Adding a hint is
 *    specifically how a screening question gets nudged.
 *
 * 2. Nothing derived from the answer is ever displayed. There is no score, no
 *    rank, no "recommended" level, and no eligibility feedback, because the
 *    thesis team has not approved any rule about which levels matter. A screen
 *    that told someone their answer qualified them would be encoding an
 *    unapproved methodology decision in the interface.
 *
 * DECLINING IS A FIRST-CLASS ANSWER. There is an explicit "skip and continue"
 * path that submits `null`. That is stored as absence, never as a default level
 * and never as the lowest option — silently recording someone as "Not confident"
 * because they skipped would fabricate a research datum.
 * =============================================================================
 *
 * Every decision lives in `@/lib/validators/onboarding-flow`, which is pure and
 * unit-tested without a DOM. This component renders decisions and navigates.
 *
 * This is the only interactive component on the screening route. The route itself
 * is a Server Component, which keeps the privileged repository out of the client
 * module graph by construction rather than by convention.
 */
export function ScreeningForm() {
  const router = useRouter();
  const [selection, setSelection] = useState<IlocanoProficiency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Applies a decision. The only place either browser-storage write or navigation happens. */
  function apply(decision: OnboardingDecision): void {
    if (decision.kind === "ready") {
      if (decision.validatorId === null) {
        // A resume: the browser already holds this identifier, so there is nothing to
        // store. Announcing it is the point — the participant pressed what looked like
        // a start button and was not issued a new identity, which deserves saying.
        setNotice(RESUMED_NOTICE);
      } else {
        // A fresh enrollment. Storing the identifier is the CLIENT's job, not the
        // action's: the server has no localStorage, and a module that reached for it
        // could only ever run in a browser.
        writeStoredValidatorId(decision.validatorId);
      }
      router.push("/ready");
      return;
    }

    if (decision.kind === "enroll-fresh") {
      // The stored identifier named nobody. Forgetting it is the only correct move.
      clearStoredValidatorId();
      void enroll(decision.answer);
      return;
    }

    if (decision.kind === "error") {
      setError(decision.message);
      return;
    }

    setNotice(decision.message);
  }

  async function enroll(answer: IlocanoProficiency | null): Promise<void> {
    apply(decideEnrollment(await enrollValidatorAction({ ilocanoProficiency: answer })));
  }

  /**
   * Resolves a stored identity if this browser holds one, and only then enrolls.
   *
   * The check happens HERE, at submit time, rather than by revealing a resume
   * affordance when the screen loads. The second reason is the important one: a
   * participant who already has an identity and submits this form must NOT get a
   * second one. That would silently split one person's research record in two —
   * earlier answers under one anonymous validator, everything after this form under
   * another, with nothing in the stored data able to tell it was the same person.
   * A load-time banner would not prevent that; it would only make it less likely.
   */
  async function submit(answer: IlocanoProficiency | null): Promise<void> {
    setError(null);
    setNotice(null);

    const stored = readStoredValidatorId();

    if (firstActionFor(stored) === "enroll") {
      await enroll(answer);
      return;
    }

    apply(decideResume(await resumeValidatorAction({ storedId: stored })));
  }

  function run(answer: IlocanoProficiency | null): void {
    startTransition(async () => {
      await submit(answer);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(selection);
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <AnswerGroup
        legend={ILOCANO_PROFICIENCY_QUESTION}
        hint={ILOCANO_PROFICIENCY_SUPPORTING_COPY}
        options={ILOCANO_PROFICIENCY_CHOICES.map((choice) => ({
          value: choice.value,
          label: choice.label,
        }))}
        value={selection}
        onChange={(value) => setSelection(value as IlocanoProficiency)}
        disabled={isPending}
        error={error ?? undefined}
      />

      {/*
        A pending notice is a `status` element, not an `alert`. `role="alert"` announces
        itself when it appears, which is right for a rejection and wrong for a routine
        status update.
      */}
      {notice ? (
        <p className="text-small text-ink-muted" role="status">
          {notice}
        </p>
      ) : null}

      {/*
        Two distinct affordances, deliberately. "Continue" submits the current selection,
        or a decline if nothing is selected; the quiet button is an explicit, labelled
        way to decline, so skipping is a choice the participant makes rather than an
        accident of not having clicked yet.
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" size="lg" disabled={isPending} aria-busy={isPending || undefined}>
          {isPending ? "Saving…" : "Continue"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => run(null)}
          disabled={isPending}
          aria-busy={isPending || undefined}
        >
          Skip and continue without answering
        </Button>
      </div>

      <p className="text-small text-ink-faint">
        If this browser already holds a validator identity, continuing will resume it instead of
        creating a second one.
      </p>
    </form>
  );
}
