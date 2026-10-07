"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, controlClasses } from "@/components/ui/field";
import { AnswerGroup } from "@/components/validation/answer-option";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { EVALUATION_DESCRIPTION_KEYS, EVALUATION_LABEL_KEYS, translatorFor } from "@/lib/i18n/copy";
import {
  EMPTY_ENTRY_FORM_INPUT,
  checkEntryForm,
  entryFormFields,
  submitControlState,
  type EntryFormInput,
} from "@/lib/validation/entry-form-flow";
import type { ValidationResponseInput } from "@/schemas/validation";
import { EVALUATION_CHOICES, evaluationSchema } from "@/schemas/validation";

/**
 * ============================================================================
 * THE PER-ENTRY VALIDATION FORM
 * ============================================================================
 * The only interactive island on the validation route. It holds no sentence: `EntryCard` above it
 * rendered the research material, and this component receives only the batch id, the entry id, and
 * the position within the batch. That is a deliberate consequence of a research-integrity property,
 * not a layout preference — see the note on advancing, below.
 *
 * ============================================================================
 * NEUTRALITY IS STRUCTURAL, NOT DISCIPLINARY
 * ============================================================================
 * The four options come from `EVALUATION_CHOICES` in declared order and are handed to the existing
 * `AnswerGroup`, whose unselected class string is a single frozen constant taking no per-option
 * input. There is therefore no parameter through which `correct_natural` could be given more
 * visual weight than `cannot_evaluate`, and no code path that sorts, reorders, re-labels, or
 * pre-selects an option. All four carry a clarifier, because a design that gave ONE option a
 * clarifier would be visibly flagging it.
 *
 * Only the LABEL and the CLARIFIER are localized. The stored value is `choice.value`, so a
 * validator answering in Filipino is recorded as `incorrect` and one answering in English is
 * recorded as `incorrect` too.
 *
 * ============================================================================
 * WHY THE FORM PREVENTS AN INVALID SUBMISSION WITHOUT ENFORCING IT
 * ============================================================================
 * `checkEntryForm` runs the SHARED `validationResponseInputSchema` — the same object the server
 * action re-parses with — and a failed check makes no request at all, pointing at the field that is
 * missing. That is a courtesy, not the enforcement. The enforcement is the server, which refuses the
 * same payload whether or not this check ran, and there is a server-side test for exactly that. A
 * client check is worth having because a participant should not lose a typed correction to a round
 * trip, but it must never be described as the guarantee: the guarantee is that the request would be
 * refused anyway.
 *
 * ============================================================================
 * WHY THE NEXT SENTENCE MAY ALREADY BE WAITING WHEN THIS ONE IS STORED
 * ============================================================================
 * On a valid submit the form hands the payload to the session runner, which
 * enqueues it for background persistence and advances to the already-prefetched
 * next entry in the same task. It does not await the write and does not
 * navigate: the runner owns advancing, the queue owns confirming, and this
 * component owns the judgement being formed right now.
 *
 * The earlier design — fetch the next sentence only after the current response
 * is stored — is SUPERSEDED by product decision (`optimistic-entry-progression`):
 * the methodology does not require it. What is preserved is the property that
 * mattered: exactly one sentence is ever PRESENTED at a time. The prefetched
 * entry is held by the runner, never rendered here, and nothing of it reaches
 * this component before the advance.
 */
export interface ValidationFormProps {
  readonly locale: InterfaceLocale;
  readonly datasetEntryId: string;
  /**
   * Receives a locally-validated payload. The runner enqueues it and advances;
   * nothing here awaits the server, so this callback is synchronous by contract
   * and the form never reports a response as saved.
   */
  readonly onValidSubmit: (payload: ValidationResponseInput) => void;
}

export function ValidationForm({ locale, datasetEntryId, onValidSubmit }: ValidationFormProps) {
  const t = translatorFor(locale);
  const [input, setInput] = useState<EntryFormInput>(EMPTY_ENTRY_FORM_INPUT);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [isPending, startTransition] = useTransition();
  /**
   * The single-flight latch.
   *
   * `isPending` alone is not sufficient, and the reason is specific: it becomes true only when
   * React re-renders, so two clicks dispatched in the same task both see `false` and both would
   * enqueue. A ref is updated synchronously, so the second click finds the latch already closed.
   * `disabled` is still set from `isPending` — that is what the participant sees — but the latch
   * is what makes the guarantee. It releases when the entry changes, and the queue's per-key
   * idempotency holds even if the latch is ever bypassed.
   */
  const inFlight = useRef(false);

  /**
   * The entry this state was built for. Compared against the prop during render, below.
   */
  const [entryId, setEntryId] = useState(datasetEntryId);

  /**
   * Entry-scoped reset, decided DURING RENDER rather than in an effect.
   *
   * The runner remounts this form per entry (`key={entry.id}`), so initializers usually run
   * fresh; this covers the prop-change path as well. Resetting in a `useEffect` would paint
   * one frame of the previous entry's answers first; adjusting here means the frame committed
   * for a new entry never held the old one. Only entry-scoped fields reset, and only when the
   * entry actually changed — re-rendering the same entry (locale switch, parent update) keeps
   * everything the participant typed.
   */
  if (entryId !== datasetEntryId) {
    setEntryId(datasetEntryId);
    setInput(EMPTY_ENTRY_FORM_INPUT);
    setFieldErrors({});
    // The latch needs no reset here: the runner remounts this form per entry, so a new entry
    // is a new latch. (Writing a ref during render is forbidden, and the remount makes it
    // unnecessary.)
  }

  const fields = entryFormFields(input.evaluation);

  /** Clears a field's error as soon as the participant edits it. */
  function edit<K extends keyof EntryFormInput>(key: K, value: EntryFormInput[K]): void {
    setInput((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function submit(): void {
    const check = checkEntryForm(input);
    if (!check.complete) {
      setFieldErrors(check.fieldErrors);
      return;
    }

    setFieldErrors({});
    inFlight.current = true;

    // Enqueue and advance synchronously: the runner persists in the background and shows the
    // next entry immediately. Nothing is awaited here, so nothing here can report the response
    // as saved — the queue's confirmation is the only thing that does, through the runner's
    // save status. The latch releases when the entry changes (above) or, if the runner holds
    // this entry for a backlog drain, on the next submit attempt path below.
    //
    // The runner remounts this form per entry (`key={entry.id}`), which is the primary reset;
    // the render-time reset above covers the prop-change path. Either way a second click for
    // the same entry finds the latch closed, and the queue's per-key idempotency holds even
    // if the latch is ever bypassed.
    onValidSubmit(check.payload);
  }

  // The transition covers the synchronous advance the submit triggers. There is no awaited
  // write anymore, so `isPending` is brief by construction rather than by network — the
  // control still reports its own in-progress state per `design-system`, and the latch above
  // is still what makes the single-flight guarantee.
  //
  // Entry transitions never disable this form: while the skeleton shows, this
  // component is not rendered at all, and a revealed entry arrives immediately
  // interactive. Only `isPending` governs availability here — the submit LABEL
  // stays "Save and continue" rather than borrowing the "Saving…" text, because
  // reporting a presentational pause as a server write would be exactly the routine saving
  // commentary the study removed, and `aria-busy` stays reserved for a genuine pending write.
  const submitState = submitControlState(isPending, t);

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (inFlight.current) return;
        startTransition(() => {
          submit();
        });
      }}
    >
      <AnswerGroup
        legend={t("validation.evaluation.legend")}
        hint={t("validation.evaluation.hint")}
        options={EVALUATION_CHOICES.map((choice) => ({
          value: choice.value,
          label: t(EVALUATION_LABEL_KEYS[choice.value]),
          hint: t(EVALUATION_DESCRIPTION_KEYS[choice.value]),
        }))}
        value={input.evaluation}
        onChange={(value) => {
          // The radiogroup reports a `string`; the enum decides what may be recorded. Re-parsing
          // rather than casting means a future fifth option that reached this component without
          // being in `EVALUATION_CHOICES` would be ignored rather than stored.
          const parsed = evaluationSchema.safeParse(value);
          if (parsed.success) edit("evaluation", parsed.data);
        }}
        disabled={isPending}
        error={fieldErrors["evaluation"]}
      />

      {fields.correction ? (
        <Field
          label={t("validation.correction.label")}
          name="correctedInstruction"
          description={t("validation.correction.description")}
          error={fieldErrors["correctedInstruction"]}
          required
        >
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              name="correctedInstruction"
              lang="ilo"
              rows={3}
              value={input.correctedInstruction}
              disabled={isPending}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => edit("correctedInstruction", event.currentTarget.value)}
              className={controlClasses({ invalid })}
            />
          )}
        </Field>
      ) : null}

      {fields.languageChoice ? (
        <div className="flex flex-col gap-6">
          <AnswerGroup
            legend={t("validation.translation.choice.legend")}
            hint={t("validation.translation.choice.hint")}
            options={(
              [
                ["english", t("validation.translation.choice.english")],
                ["filipino", t("validation.translation.choice.filipino")],
                ["both", t("validation.translation.choice.both")],
                ["skip", t("validation.translation.choice.skip")],
              ] as const
            ).map(([value, label]) => ({ value, label }))}
            value={input.translationChoice}
            onChange={(value) => {
              if (
                value === "english" ||
                value === "filipino" ||
                value === "both" ||
                value === "skip"
              ) {
                edit("translationChoice", value);
              }
            }}
            disabled={isPending}
            error={
              fieldErrors["translationChoice"] !== undefined
                ? t("validation.translation.choice.required")
                : undefined
            }
          />

          {input.translationChoice === "english" || input.translationChoice === "both" ? (
            <Field
              label={t("validation.translation.english")}
              name="englishTranslation"
              description={t("validation.translation.english.description")}
              error={fieldErrors["englishTranslation"]}
            >
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="englishTranslation"
                  lang="en"
                  rows={3}
                  value={input.englishTranslation}
                  disabled={isPending}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(event) => edit("englishTranslation", event.currentTarget.value)}
                  className={controlClasses({ invalid })}
                />
              )}
            </Field>
          ) : null}

          {input.translationChoice === "filipino" || input.translationChoice === "both" ? (
            <Field
              label={t("validation.translation.filipino")}
              name="filipinoTranslation"
              description={t("validation.translation.filipino.description")}
              error={fieldErrors["filipinoTranslation"]}
            >
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="filipinoTranslation"
                  lang="fil"
                  rows={3}
                  value={input.filipinoTranslation}
                  disabled={isPending}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(event) => edit("filipinoTranslation", event.currentTarget.value)}
                  className={controlClasses({ invalid })}
                />
              )}
            </Field>
          ) : null}
        </div>
      ) : null}

      {/*
        A failure is an `alert`: it appears in response to something the participant did and must be
        announced. A pending notice is a `status` instead, because `role="alert"` would interrupt for
        a routine state change.

        Server-side refusals no longer render here: the runner owns persistence and reports it
        through the save status beside the entry, so a refusal for entry N is still visible after
        the session has advanced past it. What stays here are the field errors above, which point
        at the input the validator can fix before anything is sent.
      */}

      {/*
        The ONLY control that starts a write. There is deliberately no "later" control: the
        translation choice includes an explicit skip, so deferral is a recorded answer rather
        than an accident of navigation. `cannot confidently evaluate` is the approved way to
        decline the whole entry, and it is one of the four options above rather than a
        separate button.
      */}
      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={submitState.disabled}
          aria-busy={submitState.ariaBusy}
        >
          {submitState.label}
        </Button>
      </div>
    </form>
  );
}
