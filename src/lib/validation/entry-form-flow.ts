import { isCorrectionRequired, isTranslationEligible } from "@/lib/domain/validation-response";
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
 * `isCorrectionRequired` and `isTranslationEligible` are imported from
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
  readonly translationChoice: TranslationChoice | null;
  readonly englishTranslation: string;
  readonly filipinoTranslation: string;
}

export const EMPTY_ENTRY_FORM_INPUT: EntryFormInput = {
  evaluation: null,
  correctedInstruction: "",
  translationChoice: null,
  englishTranslation: "",
  filipinoTranslation: "",
};

/**
 * Which conditional inputs exist for the chosen evaluation.
 *
 * Both are `false` when nothing is chosen yet, which is why an unstarted form shows the four
 * options and nothing else: asking for a correction before there is a judgement to correct would
 * invite a validator to write a sentence they have not decided is wrong.
 *
 * `languageChoice` replaces the old `translations` flag: the form no longer assumes both
 * translations, it asks which of the four options — English, Filipino, both, or skip — the
 * validator wants, and renders inputs for exactly the chosen languages.
 */
export interface EntryFormFields {
  readonly correction: boolean;
  readonly languageChoice: boolean;
}

export function entryFormFields(evaluation: Evaluation | null): EntryFormFields {
  if (evaluation === null) return { correction: false, languageChoice: false };
  return {
    correction: isCorrectionRequired(evaluation),
    languageChoice: isTranslationEligible(evaluation),
  };
}

/**
 * The validator's per-response translation choice.
 *
 * Four closed options, and the closure is the point: an open text field here would admit a third
 * language the columns cannot store. "Skip" is a first-class choice, not an omission — it carries
 * no penalty and implies no judgment, and the payload it produces is a complete response.
 */
export type TranslationChoice = "english" | "filipino" | "both" | "skip";

export const TRANSLATION_CHOICES: readonly TranslationChoice[] = [
  "english",
  "filipino",
  "both",
  "skip",
] as const;

/** The free-text half of the form, kept apart so the payload builder cannot be handed a `null`. */
export interface EntryFormText {
  readonly correctedInstruction: string;
  readonly englishTranslation: string;
  readonly filipinoTranslation: string;
}

/**
 * The payload to send, with ONLY the fields the chosen evaluation accepts and the chosen
 * languages supply.
 *
 * The omission is the whole point and it is easy to get wrong. `validationResponseInputSchema`
 * refuses a correction for `correct_natural` and refuses a translation for `cannot_evaluate` — not
 * by ignoring them, but by REJECTING a payload that carries them. So a form which always sent all
 * fields would be permanently unable to submit `correct_natural`, and the bug would present as
 * "the form does nothing" rather than as a validation error.
 *
 * The keys are therefore built conditionally, from the same predicates that decide which inputs
 * are rendered plus the validator's language choice. A validator who picks `incorrect`, types a
 * correction, and then switches to `correct_natural` has the stale text in the component's state;
 * this is where it is dropped, and the alternative — sending it and having the server refuse —
 * would punish a perfectly legitimate change of mind. Likewise a validator who typed a Filipino
 * translation and then chose English-only has that text dropped here, because sending it would
 * record a translation under a choice that disclaimed it.
 *
 * The return type is the schema's own, so a field added to `validationResponseInputFields` without a
 * branch here is a type error rather than a silently unsent field.
 */
export function buildResponsePayload(
  evaluation: Evaluation,
  choice: TranslationChoice | null,
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
  if (fields.languageChoice && (choice === "english" || choice === "both")) {
    payload.englishTranslation = text.englishTranslation;
  }
  if (fields.languageChoice && (choice === "filipino" || choice === "both")) {
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

  // A language choice is required exactly when translations are eligible. Without it the form
  // cannot know which inputs to require, and the server would receive a payload whose omissions
  // are ambiguous between "chose skip" and "never asked".
  if (entryFormFields(input.evaluation).languageChoice && input.translationChoice === null) {
    return { complete: false, fieldErrors: { translationChoice: "" } };
  }

  const parsed = validationResponseInputSchema.safeParse(
    buildResponsePayload(input.evaluation, input.translationChoice, input),
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
 * SIX reasons, THREE sentences — and that grouping is a decision rather than an omission, so it is
 * worth stating because the earlier version of this comment claimed "four reasons, four sentences" and
 * was wrong twice over: there are five reasons, and four distinct sentences would have meant telling a
 * participant something about the inside of the system they cannot act on.
 *
 *   `invalid`          → they can FIX it. The only reason worth a sentence of its own, because it is
 *                        the only one where the next action differs.
 *   `not_configured`   → the study is not open. Distinct because "come back later" is true and
 *                        "try again" would be a lie — retrying cannot succeed until a human deploys.
 *   everything else    → `unknown_batch`, `not_in_batch`, `persistence`, and `throttled` all resolve
 *                        to one sentence, and deliberately so. A stale link, an entry that is not in
 *                        the batch, an unreachable table, and a pacing refusal are four different
 *                        facts with one participant-visible consequence: the answer is not stored and
 *                        there is nothing the participant can do about which of the four it was.
 *                        Splitting them would produce sentences that differ only in a fact nobody
 *                        reading them can check, and the differences are already available where they
 *                        belong — in the operator log and in the distinct result reasons this function
 *                        receives. (`throttled` additionally gets the retry control beside the
 *                        sentence, because retrying it after a moment WILL succeed.)
 *
 * The word "Nothing was saved" appears in all of them deliberately: a participant who is told a write
 * failed and not told what survived has no way to know whether to retype an answer they already gave
 * up on, and the honest answer is always that nothing was.
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
