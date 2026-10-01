import {
  isCorrectionRequired,
  requiresBilingualTranslations,
} from "@/lib/domain/validation-response";
import type { Translate } from "@/lib/i18n/copy";
import type { Evaluation } from "@/schemas/validation";
import { validationResponseInputSchema, type ValidationResponseInput } from "@/schemas/validation";

import type { SubmitValidationFailureReason } from "./validation-actions-core";

/**
 * ============================================================================
 * THE PER-ENTRY FORM'S DECISIONS, AS PURE FUNCTIONS
 * ============================================================================
 * The interesting part of a validation form is not a render; it is four questions:
 *
 *   1. Given the chosen evaluation, which inputs EXIST?
 *   2. Given what is typed, is this a complete response?
 *   3. If the server refuses, what does the participant read?
 *   4. While a write is in flight, what state is the control in?
 *
 * Encoding those as `useState` plus branching inside a component makes them reachable only by
 * driving a DOM, which in this project means either a browser test runner it does not have or
 * assertions about markup that do not actually prove the decision. As pure functions every branch is
 * assertable with no rendering, no network, and no credential; the client component below is left
 * with rendering, event handling, and navigation only — the same split
 * `src/lib/validators/onboarding-flow.ts` makes for the screening form.
 *
 * ============================================================================
 * QUESTION 1 IS ANSWERED BY THE DOMAIN PREDICATES, NOT BY A LOCAL RULE
 * ============================================================================
 * `isCorrectionRequired` and `requiresBilingualTranslations` are imported from
 * `@/lib/domain/validation-response`, and this file adds nothing of its own to them. A form that
 * decided "the correction box appears for `correct_unnatural` and `incorrect`" on its own would be
 * a second implementation of an approved research rule, and the two would disagree the first time
 * somebody added or renamed an evaluation — silently, because a form that renders the wrong field
 * looks exactly like a form with nothing typed in it.
 *
 * `validationResponseInputSchema` is used for question 2 for the same reason and is the SAME object
 * the server action re-parses with. A form that checked "both translations are non-blank" locally
 * would be a third copy of a rule that already has two, and — worse — a form that BLOCKS a
 * legitimate answer is a research-integrity defect, not a helpful validation message. The prevention
 * below is a convenience; the enforcement is the server, and the test that says so is a server-side
 * one.
 */

/** What the participant has entered so far, before normalisation. */
export interface EntryFormInput {
  readonly evaluation: Evaluation | null;
  readonly correctedInstruction: string;
  readonly englishTranslation: string;
  readonly filipinoTranslation: string;
}

export const EMPTY_ENTRY_FORM_INPUT: EntryFormInput = {
  evaluation: null,
  correctedInstruction: "",
  englishTranslation: "",
  filipinoTranslation: "",
};

/**
 * Which conditional inputs exist for the chosen evaluation.
 *
 * Both are `false` when nothing is chosen yet, which is why an unstarted form shows the four
 * options and nothing else: asking for a correction before there is a judgement to correct would
 * invite a validator to write a sentence they have not decided is wrong.
 */
export interface EntryFormFields {
  readonly correction: boolean;
  readonly translations: boolean;
}

export function entryFormFields(evaluation: Evaluation | null): EntryFormFields {
  if (evaluation === null) return { correction: false, translations: false };
  return {
    correction: isCorrectionRequired(evaluation),
    translations: requiresBilingualTranslations(evaluation),
  };
}

/** The free-text half of the form, kept apart so the payload builder cannot be handed a `null`. */
export interface EntryFormText {
  readonly correctedInstruction: string;
  readonly englishTranslation: string;
  readonly filipinoTranslation: string;
}

/**
 * The payload to send, with ONLY the fields the chosen evaluation accepts.
 *
 * The omission is the whole point and it is easy to get wrong. `validationResponseInputSchema`
 * refuses a correction for `correct_natural` and refuses a translation for `cannot_evaluate` — not
 * by ignoring them, but by REJECTING a payload that carries them. So a form which always sent all
 * three fields would be permanently unable to submit `correct_natural`, and the bug would present as
 * "the form does nothing" rather than as a validation error.
 *
 * The keys are therefore built conditionally, from the same two predicates that decide which inputs
 * are rendered. A validator who picks `incorrect`, types a correction, and then switches to
 * `correct_natural` has the stale text in the component's state; this is where it is dropped, and
 * the alternative — sending it and having the server refuse — would punish a perfectly legitimate
 * change of mind.
 *
 * The return type is the schema's own, so a field added to `validationResponseInputFields` without a
 * branch here is a type error rather than a silently unsent field.
 */
export function buildResponsePayload(
  evaluation: Evaluation,
  text: EntryFormText,
): ValidationResponseInput {
  const fields = entryFormFields(evaluation);
  const payload: {
    evaluation: Evaluation;
    correctedInstruction?: string;
    englishTranslation?: string;
    filipinoTranslation?: string;
  } = { evaluation };

  if (fields.correction) payload.correctedInstruction = text.correctedInstruction;
  if (fields.translations) {
    payload.englishTranslation = text.englishTranslation;
    payload.filipinoTranslation = text.filipinoTranslation;
  }

  return payload;
}

/**
 * The result of checking a form against the shared schema.
 *
 * `complete` is the word that matters: it means "this is a response the study can record", and it is
 * computed by the same object the server uses. An `incomplete` result carries the field paths so the
 * form can point at the specific input that is missing, rather than telling a participant their
 * answer was wrong.
 */
export type EntryFormCheck =
  | { readonly complete: true; readonly payload: ValidationResponseInput }
  | { readonly complete: false; readonly fieldErrors: Readonly<Record<string, string>> };

export function checkEntryForm(input: EntryFormInput): EntryFormCheck {
  // Nothing chosen is not a response. Checked here rather than by sending an empty payload, because
  // "you have not chosen yet" and "your answer was rejected" are different things to say to someone
  // and only one of them is true.
  if (input.evaluation === null) {
    return { complete: false, fieldErrors: { evaluation: "" } };
  }

  const parsed = validationResponseInputSchema.safeParse(
    buildResponsePayload(input.evaluation, input),
  );
  if (parsed.success) return { complete: true, payload: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    // First issue per field wins. Two messages on one input would be read out twice, and the second
    // is always a consequence of the first.
    fieldErrors[field] ??= issue.message;
  }
  return { complete: false, fieldErrors };
}

export interface SubmitControlState {
  readonly disabled: boolean;
  readonly ariaBusy: true | undefined;
  readonly label: string;
}

/**
 * The state of the one control that started the write.
 *
 * `design-system` requires the initiating control to report its own in-progress state, and requires
 * controls made inert ALONGSIDE it to change appearance uniformly. Those are two different
 * requirements with two different controls, and this function is only about the first: it is the
 * control that becomes `disabled` and `aria-busy`, and its label changes so the change is available
 * as text rather than only as styling.
 */
export function submitControlState(isPending: boolean, t: Translate): SubmitControlState {
  return {
    disabled: isPending,
    ariaBusy: isPending ? true : undefined,
    label: isPending ? t("validation.submitting") : t("validation.submit"),
  };
}

/**
 * The sentence a participant reads when a submission does not succeed.
 *
 * Four reasons, four sentences, and none of them is interchangeable with another. The word "Nothing
 * was saved" appears in all of them deliberately: a participant who is told a write failed and not
 * told what survived has no way to know whether to retype an answer they already gave up on, and
 * the honest answer is always that nothing was.
 */
export function failureMessageFor(reason: SubmitValidationFailureReason, t: Translate): string {
  switch (reason) {
    case "invalid":
      return t("validation.failure.invalid");
    case "not_configured":
      return t("validation.failure.notConfigured");
    default:
      return t("validation.failure.persistence");
  }
}
