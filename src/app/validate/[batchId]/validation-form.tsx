"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, controlClasses } from "@/components/ui/field";
import { AnswerGroup } from "@/components/validation/answer-option";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { EVALUATION_DESCRIPTION_KEYS, EVALUATION_LABEL_KEYS, translatorFor } from "@/lib/i18n/copy";
import { submitValidationAction } from "@/lib/validation/actions";
import {
  EMPTY_ENTRY_FORM_INPUT,
  checkEntryForm,
  entryFormFields,
  failureMessageFor,
  submitControlState,
  type EntryFormInput,
} from "@/lib/validation/entry-form-flow";
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
 * WHY THE NEXT SENTENCE IS FETCHED ONLY AFTER THIS ONE IS STORED
 * ============================================================================
 * On success the form navigates to the NEXT POSITION in the server-allocated order, and the server
 * renders whatever it decides belongs there. It does not pre-load the next sentence into this
 * component.
 *
 * The obvious alternative — returning the next entry in the write's response, so advancing needs no
 * navigation — was rejected for a reason that is about the data rather than about code. A validator
 * who is holding the next sentence while still forming a judgement on the current one can see it
 * before they have committed to an answer, and a data set collected under that condition is a
 * different data set. Fetching it after the response is stored costs one navigation and keeps every
 * judgement made on one sentence at a time.
 */
export interface ValidationFormProps {
  readonly locale: InterfaceLocale;
  readonly batchId: string;
  readonly datasetEntryId: string;
  /** 1-based position within the batch, from `batch_entries.position`. */
  readonly position: number;
}

export function ValidationForm({ locale, batchId, datasetEntryId, position }: ValidationFormProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [input, setInput] = useState<EntryFormInput>(EMPTY_ENTRY_FORM_INPUT);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * The single-flight latch.
   *
   * `isPending` alone is not sufficient, and the reason is specific: it becomes true only when
   * React re-renders, so two clicks dispatched in the same task both see `false` and both would
   * reach the action. A ref is updated synchronously, before the first `await`, so the second click
   * finds the latch already closed. `disabled` is still set from `isPending` — that is what the
   * participant sees — but the latch is what makes the guarantee.
   */
  const inFlight = useRef(false);

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

  async function submit(): Promise<void> {
    setFailure(null);

    const check = checkEntryForm(input);
    if (!check.complete) {
      setFieldErrors(check.fieldErrors);
      return;
    }

    setFieldErrors({});
    inFlight.current = true;

    const result = await submitValidationAction({
      batchId,
      datasetEntryId,
      response: check.payload,
    });

    inFlight.current = false;

    if (result.status === "recorded" || result.status === "already_recorded") {
      // Both outcomes mean the entry is complete, and in both cases the next entry is the server's
      // to choose. A `?position` one past the current one cannot itself decide what is next — the
      // server intersects it with the completed set — so a stale or hand-edited value lands on the
      // first entry that still needs an answer rather than on nothing.
      router.push(`/validate/${encodeURIComponent(batchId)}?position=${position + 1}`);
      return;
    }

    setFailure(failureMessageFor(result.reason, t));
  }

  const submitState = submitControlState(isPending, t);

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (inFlight.current) return;
        startTransition(async () => {
          await submit();
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

      {fields.translations ? (
        <div className="flex flex-col gap-6">
          <p className="text-small text-ink-muted">{t("validation.translation.required")}</p>

          <Field
            label={t("validation.translation.english")}
            name="englishTranslation"
            description={t("validation.translation.english.description")}
            error={fieldErrors["englishTranslation"]}
            required
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

          <Field
            label={t("validation.translation.filipino")}
            name="filipinoTranslation"
            description={t("validation.translation.filipino.description")}
            error={fieldErrors["filipinoTranslation"]}
            required
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
        </div>
      ) : null}

      {/*
        A failure is an `alert`: it appears in response to something the participant did and must be
        announced. A pending notice is a `status` instead, because `role="alert"` would interrupt for
        a routine state change.
      */}
      {failure ? (
        <p
          role="alert"
          className="text-small text-status-alert flex items-start gap-2 font-semibold"
        >
          <span aria-hidden="true">△</span>
          <span>{failure}</span>
        </p>
      ) : null}

      {/*
        The ONLY control that starts a write. There is deliberately no "skip", no "later", and no
        "save without translating": for an evaluable answer the database rejects a missing
        translation, so an affordance that appeared to offer one would be a promise the platform
        cannot keep. `cannot confidently evaluate` is the approved way to decline, and it is one of
        the four options above rather than a separate button.
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
        <p className="text-small text-ink-faint">{t("validation.savingNote")}</p>
      </div>
    </form>
  );
}
