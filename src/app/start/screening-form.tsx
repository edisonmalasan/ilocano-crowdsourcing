"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AnswerGroup } from "@/components/validation/answer-option";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { PROFICIENCY_LABEL_KEYS, translatorFor } from "@/lib/i18n/copy";
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
  submitControlState,
  type TerminalDecision,
} from "@/lib/validators/onboarding-flow";
import {
  ILOCANO_PROFICIENCY_CHOICES,
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
 * PROFICIENCY IS REQUIRED. There is exactly one submit control and no skip path:
 * the corrected methodology admits no decline, so a submission with nothing
 * selected is refused on the form (field-attached error, no request) and refused
 * by the server (invalid, no enrollment) alike. Fabricating a research datum —
 * recording someone as "Not confident" because they pressed Continue with
 * nothing chosen — is the exact failure this project exists to prevent.
 * =============================================================================
 *
 * Every decision lives in `@/lib/validators/onboarding-flow`, which is pure and
 * unit-tested without a DOM. This component renders decisions and navigates.
 *
 * This is the only interactive component on the screening route. The route itself
 * is a Server Component, which keeps the privileged repository out of the client
 * module graph by construction rather than by convention.
 *
 * ================================ LOCALIZATION ================================
 * This screen COLLECTS research data, so the boundary between what is a
 * presentation string and what is a stored value is sharpest here. The two are kept
 * apart deliberately and asymmetrically:
 *
 *   - `choice.value` is what gets stored. It is taken straight from
 *     `ILOCANO_PROFICIENCY_CHOICES` and is never routed through the copy catalog, so a
 *     participant selecting "Madaling gamitin" is recorded as `fluent` and one
 *     selecting "Fluent" is recorded as `fluent` too.
 *   - `choice.label` is what gets rendered, and it is looked up by value in
 *     `PROFICIENCY_LABEL_KEYS`. Only the display text varies with `locale`.
 *
 * So the locale affects every word on this screen and none of the data. Nothing here
 * derives a proficiency level, an eligibility, or a score from the language, and a
 * participant who reads Filipino and one who reads English are asked the same question
 * of the same five options, stored under the same values.
 *
 * `locale` is a required prop rather than a hook read, so the server-rendered HTML and
 * the hydrated tree agree and a Filipino participant never sees an English flash of the
 * question before it is replaced.
 */
export interface ScreeningFormProps {
  /** The interface language the surrounding route is rendering. Never persisted. */
  readonly locale: InterfaceLocale;
}

export function ScreeningForm({ locale }: ScreeningFormProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [selection, setSelection] = useState<IlocanoProficiency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitState = submitControlState(isPending, t);

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
        setNotice(t("screening.resumed"));
      } else {
        // A fresh enrollment. Storing the identifier is the CLIENT's job, not the
        // action's: the server has no browser storage, and a module that reached for it
        // could only ever run in a browser.
        writeStoredValidatorId(decision.validatorId);
      }
      router.push("/validate");
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
  async function enroll(answer: IlocanoProficiency): Promise<void> {
    apply(decideEnrollment(await enrollValidatorAction({ ilocanoProficiency: answer }), t));
  }

  /**
   * Resolves a stored identity if this browser holds one, and only then enrolls.
   *
   * The check happens at SUBMIT time, not by revealing a resume affordance when the
   * screen loads. A load-time reveal needs a post-hydration `setState`, because
   * browser storage does not exist during server rendering.
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
  async function submit(answer: IlocanoProficiency): Promise<void> {
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

    const decision = decideResume(await resumeValidatorAction({ storedId: stored }), answer, t);

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

  function run(): void {
    // Required, not declined: with nothing selected there is nothing to submit,
    // so the missing answer is identified on the control and no request is made.
    // The server refuses the same payload independently.
    if (selection === null) {
      setError(t("screening.failure.invalid.enroll"));
      return;
    }
    const answer: IlocanoProficiency = selection;
    startTransition(async () => {
      await submit(answer);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run();
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <AnswerGroup
        legend={t("screening.question")}
        hint={t("screening.supporting")}
        options={ILOCANO_PROFICIENCY_CHOICES.map((choice) => ({
          value: choice.value,
          label: t(PROFICIENCY_LABEL_KEYS[choice.value]),
        }))}
        value={selection}
        onChange={(value) => {
          setSelection(toIlocanoProficiency(value));
          // Clears the refusal as soon as the participant answers, the way the
          // validation form clears a field's error on edit: an error that
          // survives the correction it names trains the participant to ignore it.
          setError(null);
        }}
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
        One submit control, deliberately. Proficiency is required, so there is no
        second affordance: an empty Continue identifies the missing answer above
        instead of submitting, and the server refuses an empty payload as invalid.
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
      </div>

      <p className="text-small text-ink-faint">{t("screening.resumeNote")}</p>
    </form>
  );
}
