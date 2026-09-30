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
  submitControlState,
  type TerminalDecision,
} from "@/lib/validators/onboarding-flow";
import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  toIlocanoProficiency,
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
  const submitState = submitControlState(isPending);

  /**
   * Applies a decision that ends the flow: ready, error, or notice.
   *
   * The `enroll-fresh` case is NOT handled here on purpose. It continues the flow
   * rather than ending it, and it needs the participant's answer plus a second
   * awaited round trip; `submit` holds both. Routing it through this function with
   * a fire-and-forget call is how the first version of this file dropped the answer
   * and left a window where two activations could mint two identities.
   */
  function apply(decision: TerminalDecision): void {
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

    if (decision.kind === "error") {
      setError(decision.message);
      return;
    }

    setNotice(decision.message);
  }

  /**
   * Mints a fresh identity and applies the result.
   *
   * `await`ed by every caller. An unawaited call here would let `isPending` return
   * to `false` while the second Server Action round trip was still in flight, and
   * two activations inside that window would mint two validators with the second
   * silently overwriting the first in storage.
   */
  async function enroll(answer: IlocanoProficiency | null): Promise<void> {
    apply(decideEnrollment(await enrollValidatorAction({ ilocanoProficiency: answer })));
  }

  /**
   * Resolves a stored identity if this browser holds one, and only then enrolls.
   *
   * The check happens at SUBMIT time, not by revealing a resume affordance when the
   * screen loads. A load-time reveal needs a post-hydration `setState`, because
   * `localStorage` does not exist during server rendering.
   *
   * An earlier version of this comment justified the choice by saying the resulting
   * "cascading render is the pattern the React lint rules rightly reject". Half of that
   * was false and was corrected after independent review: `useEffect` + `setState` does
   * trip `react-hooks/set-state-in-effect`, but `useSyncExternalStore` — React's
   * supported, hydration-safe API for exactly this read — lints AND typechecks clean,
   * verified on React 19.2.8.
   *
   * The reason that actually holds is a data-integrity one, and it is the reason to keep:
   * `useSyncExternalStore` can tell the client that an identifier is STORED, not that the
   * server RECOGNISES it. Suppressing the question optimistically would let a participant
   * whose identifier has expired press Continue and be enrolled with no screening answer
   * at all. Resolving at submit time means the server has vouched before any answer is
   * treated as unnecessary, so the decision to ask is made on confirmed state rather
   * than on a value the server has not yet checked.
   *
   * The second reason is the important one: a participant who already has an
   * identity and submits this form must NOT get a second one. That would split one
   * person's research record in two — earlier answers under one anonymous validator,
   * everything after this form under another, with nothing in the stored data able
   * to tell it was the same person.
   *
   * A RETURNING VALIDATOR DOES SEE THIS QUESTION, and that is a known, recorded
   * limitation rather than an oversight — see `design.md` D2 and the spec scenario
   * it constrains. What is guaranteed is that their selection is never stored over
   * their original answer: the resume path contains no `create` call, so the
   * original self-reported screening answer survives untouched.
   */
  async function submit(answer: IlocanoProficiency | null): Promise<void> {
    setError(null);
    setNotice(null);

    const stored = readStoredValidatorId();

    // The `|| stored === null` looks redundant, because `firstActionFor(null)` already
    // returns "enroll". It is there to narrow `stored` to a non-null identifier on the other
    // side of the branch, which the compiler cannot infer from the call. The rule itself
    // stays in `firstActionFor` so that it is one named, tested function rather than a
    // comparison repeated at its call site.
    if (firstActionFor(stored) === "enroll" || stored === null) {
      await enroll(answer);
      return;
    }

    const decision = decideResume(await resumeValidatorAction({ storedId: stored }), answer);

    if (decision.kind !== "enroll-fresh") {
      apply(decision);
      return;
    }

    // The stored identifier named nobody. Forgetting it is the only correct move —
    // and enrolling now uses `answer`, the selection this participant just made, not a
    // decline. Recorded as a data-integrity fix; the previous version hardcoded null
    // here and recorded people as having declined when they had answered.
    clearStoredValidatorId();
    await enroll(answer);
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
        onChange={(value) => setSelection(toIlocanoProficiency(value))}
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
        <Button
          type="submit"
          size="lg"
          disabled={submitState.disabled}
          aria-busy={submitState.ariaBusy}
        >
          {submitState.label}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => run(null)}
          disabled={submitState.disabled}
          aria-busy={submitState.ariaBusy}
        >
          Skip and continue without answering
        </Button>
      </div>

      <p className="text-small text-ink-faint">
        If this browser already holds a validator identity, continuing will resume it instead of
        creating a second one, and the answer above will not be stored over the original.
      </p>
    </form>
  );
}
