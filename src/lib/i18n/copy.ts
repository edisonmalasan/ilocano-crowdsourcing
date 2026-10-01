import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  type IlocanoProficiency,
} from "@/schemas/validator";
import {
  EVALUATION_CHOICES,
  TRANSLATION_FIELD_LABELS,
  type Evaluation,
} from "@/schemas/validation";

import type { InterfaceLocale } from "@/lib/domain/locale";

/**
 * The interface copy catalog.
 *
 * ============================================================================
 * WHAT IS IN HERE AND WHAT MUST NEVER BE
 * ============================================================================
 * This module holds every human-readable string the public interface renders, in English and in
 * Filipino. That is the whole inventory, and the inventory is bounded on purpose.
 *
 * Nothing in here is, may be, or may become:
 *
 *   - a synthetic Ilocano dataset instruction. That is research material, read from
 *     `dataset_entries.instruction` and rendered exactly as stored. There is no path from a
 *     dataset string to a lookup in this file, so there is nothing here to get wrong.
 *   - a validator's corrected Ilocano, or their English or Filipino RESEARCH translation. Those
 *     are the participant's own words, held in the response and rendered as typed.
 *   - a place name or a dataset identifier. Research data whose identity must not vary with a
 *     presentation preference.
 *   - a machine-readable value. `fluent`, `correct_natural`, `OD_0001` and `VAL_…` are the values
 *     the research record holds, and localizing one of them would change what a response means
 *     rather than how it reads.
 *
 * The catalog makes localizing a string CONVENIENT, and that is the whole danger. The only defence
 * is that nothing on the research-material path is ever routed through here, which is why the
 * screening form builds its options from `choice.value` and looks the label up separately.
 *
 * ============================================================================
 * THE CATALOG IS EXHAUSTIVE BY TYPE, AND THAT IS THE POINT
 * ============================================================================
 * The failure mode for a copy catalog is a key that exists in English and not in Filipino. The
 * Filipino interface then silently shows English for that string and NOTHING fails: no test, no
 * type error, no build error. A participant reads a half-localized page and the research
 * instrument looks unfinished.
 *
 * So the guarantee lives in the TYPE, not in a test. `ENGLISH_COPY` defines the key set and
 * `FILIPINO_COPY` is annotated `Record<CopyKey, string>`. Adding an English key with no Filipino
 * string is a `pnpm run typecheck` failure, and so is a typo'd Filipino key.
 *
 * A test would have been the obvious place for this and would have been WORSE. A key-set test
 * compares two lists that are both correct at the moment it runs; the moment someone adds one key
 * to one catalog it is the test that is wrong, and it fails for the wrong reason at best, or is
 * rewritten to match the new list at worst - which is exactly the direction of a missing string.
 * Absence is not observable at runtime, so the pin belongs at the layer that can see a key which
 * does not exist yet. This is the same lesson as the `AllocationRequest` key-set pin in
 * `tests/unit/domain-types.test.ts`, and the same mechanism.
 *
 * FLAT KEYS, NOT NESTED OBJECTS, and that is load-bearing. `Record<keyof typeof english, string>`
 * checks the TOP-LEVEL keys only: a nested `{ screening: { question: … } }` catalog would be
 * "exhaustive" as long as every section exists, while a missing string inside a section passed
 * type-check and rendered English. Flat dotted keys make the annotated record genuinely leaf-deep.
 *
 * WHAT THE TYPE STILL CANNOT CATCH, and is covered by a test instead: a Filipino string that is
 * present but EMPTY, and a Filipino string that is byte-identical to its English counterpart
 * because of a copy-paste. Both compile. Both are visible to a participant as a bug in the tool.
 *
 * ============================================================================
 * WHY THREE ENGLISH STRINGS ARE IMPORTED FROM `@/schemas/validator` RATHER THAN REPEATED
 * ============================================================================
 * `ILOCANO_PROFICIENCY_QUESTION`, `ILOCANO_PROFICIENCY_SUPPORTING_COPY` and the choice `label`s
 * already exist there, and the file records them as approved copy with a single source of truth.
 * Repeating them here would create a second copy of an approved research string that can drift,
 * and the drift would be invisible in the Filipino catalog while being visible to participants.
 *
 * The import is a dependency from presentation data onto a schema module, which is normally the
 * wrong direction - and it is the right direction here, because the thing being imported is
 * approved COPY, not a runtime validator. What is deliberately NOT imported across is the other
 * way: the screening form still takes the answer from `choice.value`, so nothing a participant
 * selects is ever sourced from this file.
 */

/**
 * The English catalog. It DEFINES the key set; the Filipino catalog is typed against it.
 *
 * The screening keys are assigned from the schema constants rather than written out, so the
 * approved English wording of the question and the choice labels has exactly one definition.
 * `ILOCANO_PROFICIENCY_CHOICES` is indexed in its declared order, which is the same order the
 * screening screen presents the options in and which a test already pins.
 */
export const ENGLISH_COPY = {
  // -- Document ------------------------------------------------------------
  "meta.siteTitle": "Sadino — validate Ilocano navigation data",
  "meta.siteDescription":
    "Help check Ilocano navigation instructions for the Sadino research project. Ten short " +
    "sentences at a time. No name, no email, no account.",

  // -- Shared chrome -------------------------------------------------------
  "common.beforeYouStart": "Before you start",
  skipToContent: "Skip to content",
  "switcher.label": "Interface language",
  "switcher.englishName": "English",
  "switcher.filipinoName": "Filipino",

  // -- Landing -------------------------------------------------------------
  "landing.header.study": "validation study",
  "landing.badge.dataset": "Ilocano · navigation data",
  "landing.badge.recruit": "Researchers wanted",
  "landing.hero.title1": "Check the Ilocano.",
  "landing.hero.title2": "Fix what’s off.",
  "landing.hero.lead":
    "Sadino is a thesis dataset for Ilocano local navigation. It was written by a machine. You " +
    "are the part of the process that makes it trustworthy: you read a sentence, judge whether it " +
    "says what it should, and correct it when it does not.",
  "landing.cta.start": "Start validation",
  "landing.cta.hint": "Two steps: one question about your Ilocano, then you begin.",
  "landing.expectations.heading": "What to expect",
  "landing.panel.task.label": "The task",
  "landing.panel.task.title": "Ten sentences at a time",
  "landing.panel.task.body":
    "You will see a short Ilocano navigation instruction together with the place it is meant to " +
    "describe. You decide whether the sentence says what it is supposed to say, and you fix it " +
    "when it does not.",
  "landing.panel.ask.label": "The ask",
  "landing.panel.ask.title": "One question about you",
  "landing.panel.ask.body":
    "We ask how comfortable you are with Ilocano. That is background information for the " +
    "research record. It is not a score, and it does not change what you are asked to do.",
  "landing.panel.keep.label": "What we keep",
  "landing.panel.keep.title": "Your judgment, not your identity",
  "landing.panel.keep.body":
    "We store the entry, your evaluation, any correction you write, and an optional translation. " +
    "We do not ask for your name, your email, your student number, or your phone.",
  "landing.before.label": "Please read",
  "landing.before.item1":
    "Taking part is voluntary. You can stop after any batch, and nothing you have already " +
    "submitted is taken back.",
  "landing.before.item2":
    "You will never see the same sentence twice, and you will stop being offered sentences once " +
    "enough other people have checked them.",
  "landing.before.item3":
    "If a sentence is wrong, we would rather have your version of it than a conversation about it. " +
    "Write it the way you would actually say it.",
  "common.footer.research": "Sadino · Ilocano navigation research",
  "landing.footer.noAccounts": "No accounts. No name, no email, no student number.",

  // -- Returning-validator resume island ------------------------------------
  "resume.title": "Already started?",
  "resume.body":
    "If you have taken part on this browser before, you can carry on as the same anonymous " +
    "validator.",
  "resume.continue": "Continue as that validator",
  "resume.checking": "Checking…",
  "resume.noneHeld":
    "This browser does not hold a saved identity. Choose Start validation to begin — it takes one " +
    "question.",
  "resume.unknown":
    "That saved identity is no longer recognised, so it has been cleared. Choose Start validation " +
    "to begin again as a new anonymous validator.",

  // -- Screening route ------------------------------------------------------
  "start.header.step": "step 2 of 3",
  "start.lead":
    "One question about your Ilocano. It is background information for the research record — it " +
    "is not a score, and it does not change what you are asked to do. You can continue without " +
    "answering it.",
  "start.beforeAnswer.label": "Before you answer",
  "start.beforeAnswer.item1":
    "Taking part is voluntary. You can stop at any point, including on this screen, and close the " +
    "tab — nothing is saved unless you press Continue.",
  "start.beforeAnswer.item2":
    "We do not ask for your name, your email, your student number, or your phone number, and there " +
    "is no field on any screen where you could enter one.",
  "start.beforeAnswer.item3":
    "Your identity is a random code. A copy is kept in this browser so we can recognise you when " +
    "you return, and the code is stored in the study database with your answers, where it cannot " +
    "be traced back to you either way. Clearing your browser data ends our ability to recognise " +
    "you.",
  "start.meta.title": "Screening",
  "start.meta.description":
    "One question about your Ilocano comfort, and nothing about you is collected. No name, no " +
    "email, no account.",

  // -- Screening form -------------------------------------------------------
  // The question, the supporting copy, and the five option labels are the approved English
  // wording held in `@/schemas/validator`. They are assigned rather than repeated so the catalog
  // and the schema cannot disagree about what the approved screening copy says.
  //
  // NOTE ON `landing.panel.keep.body`. It uses the English word "translation" to NAME a research
  // field, and the Filipino rendering says "pagsasalin" for the same reason. That is interface
  // prose describing the study, not a rendering of any stored research translation: no
  // participant-authored English or Filipino text is ever read from this catalog.
  "screening.question": ILOCANO_PROFICIENCY_QUESTION,
  "screening.supporting": ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  "screening.proficiency.native": ILOCANO_PROFICIENCY_CHOICES[0].label,
  "screening.proficiency.fluent": ILOCANO_PROFICIENCY_CHOICES[1].label,
  "screening.proficiency.conversational": ILOCANO_PROFICIENCY_CHOICES[2].label,
  "screening.proficiency.basic": ILOCANO_PROFICIENCY_CHOICES[3].label,
  "screening.proficiency.not_confident": ILOCANO_PROFICIENCY_CHOICES[4].label,
  "screening.submit": "Continue",
  "screening.submitting": "Saving…",
  "screening.skip": "Skip and continue without answering",
  "screening.resumeNote":
    "If this browser already holds a validator identity, continuing will resume it instead of " +
    "creating a second one, and the answer above will not be stored over the original.",
  "screening.resumed": "Continuing as the validator this browser already held.",

  // -- Failure copy. Keyed by outcome reason AND by subject, because a single shared string
  //    was actively wrong: the enrollment `invalid` message tells a participant to pick one of
  //    the screening options, and the resume path has no options to pick. See
  //    `messageForFailure` in `@/lib/validators/onboarding-flow`.
  "screening.failure.notConfigured.enroll":
    "The study is not open right now. Nothing was saved, and you have not been signed up.",
  "screening.failure.notConfigured.resume":
    "The study is not open right now, so the saved identity could not be checked. Nothing was " +
    "changed.",
  "screening.failure.invalid.enroll":
    "We could not accept that answer, and nothing was saved. Please pick one of the options, or " +
    "continue without answering.",
  "screening.failure.invalid.resume":
    "The saved identity could not be checked, and nothing was changed. You can try again in a " +
    "moment.",
  "screening.failure.persistence.enroll":
    "We could not finish signing you up. Nothing was saved. You can try again in a moment.",
  "screening.failure.persistence.resume":
    "The saved identity could not be checked just now, and nothing was changed. You can try again " +
    "in a moment.",

  // -- Confirmation route ---------------------------------------------------
  "ready.header.step": "step 3 of 3",
  "ready.badge": "How this works",
  // Doubles as the page title. The document title and the heading are the same approved string,
  // so they are one key rather than two that could drift.
  "ready.title": "Before you begin",
  "ready.lead":
    "Nothing identifying was collected, and there is no account to manage. Here is what happens " +
    "when you start.",
  "ready.starting.label": "What happens when you start",
  "ready.starting.item1":
    "A random code is generated for you and saved to the database. It is not derived from " +
    "anything about you.",
  "ready.starting.item2":
    "A copy of that code is kept in this browser only, so you can be recognised when you come " +
    "back.",
  "ready.starting.item3":
    "The answer you give to the Ilocano question is kept with your validator identity as " +
    "background information. If you chose to skip it, nothing was recorded in its place. If this " +
    "browser already held an identity, the answer already stored with it is the one that was kept.",
  "ready.notStarted.label": "If you have not started yet",
  "ready.notStarted.body":
    "Reaching this page does not mean you answered the Ilocano question. That question is what " +
    "creates your validator identity, and there is no way to create one from this page.",
  "ready.notStarted.cta": "Go to the Ilocano question",
  "ready.next.label": "What happens next",
  "ready.next.body1":
    "You are given Ilocano navigation sentences one at a time, in the order the study chose, and " +
    "each one is judged on its own. Coming back to this browser will not replace your screening " +
    "answer.",
  "ready.next.body2":
    "Each finished sentence is saved straight away, so you can stop at any point without losing what " +
    "you have already done, and come back later from this same browser.",
  "ready.begin.label": "Start now",
  "ready.begin.body":
    "Ask for your sentences. The study chooses which ones you get, and how many, so it may be " +
    "asking for them right now.",
  "ready.begin.cta": "Start validating",
  "ready.stop.label": "If you want to stop",
  "ready.stop.body":
    "Clearing this browser's site data removes the code that links you to your validator " +
    "identity. Because the code is the only link, that is permanent: you would begin again as a " +
    "new anonymous validator, and your earlier answers would remain in the research record under " +
    "the old identity.",
  "common.footer.noAccounts": "No accounts. Nothing identifying.",
  "ready.meta.description":
    "What happens when you start validating, and what is kept. Sentences arrive in the next phase.",

  // -- Not found ------------------------------------------------------------
  "notFound.title": "This page isn’t here.",
  "notFound.body":
    "The address may have changed, or the link may be incomplete. Nothing you have submitted is " +
    "affected.",
  "notFound.cta": "Go back to the start",
  "notFound.meta.title": "Page not found",

  // -- Starting a batch -----------------------------------------------------
  // The route a participant lands on to leave `/ready` and obtain a batch. The batch is requested
  // from the server rather than linked to, because a batch id does not exist until the server has
  // chosen one — which is also why this route cannot be a static `href` on `/ready`.
  "validateStart.meta.title": "Start validating",
  "validateStart.title": "Start your batch",
  "validateStart.lead":
    "You will be given a set of Ilocano navigation sentences, one at a time, in the order the " +
    "study chose.",
  "validateStart.begin": "Give me my sentences",
  "validateStart.working": "Preparing your sentences…",
  "validateStart.working.ariaLabel": "Preparing your sentences",
  "validateStart.noIdentity":
    "This browser does not hold a saved validator identity, so there is nothing to attach a batch " +
    "to. Answer the Ilocano question first.",
  "validateStart.noIdentity.cta": "Go to the Ilocano question",
  "validateStart.exhausted":
    "Every sentence available to this validator has already been answered by the required number of " +
    "people. Thank you — there is nothing more to do right now.",
  "validateStart.failure.notConfigured":
    "The study is not open right now, and no batch was created.",
  "validateStart.failure.invalid":
    "This browser could not be recognised as a validator, and no batch was created. Answer the " +
    "Ilocano question first.",
  "validateStart.failure.persistence":
    "We could not prepare your sentences just now, and no batch was created. You can try again in " +
    "a moment.",

  // -- Picking up an interrupted batch --------------------------------------
  // The only copy in the catalog that describes something the participant has ALREADY done, rather
  // than something they are about to do. Every string here is about their own unfinished work.
  //
  // THERE IS DELIBERATELY NO COPY FOR A FAILED CHECK, and that absence is a requirement rather than an
  // oversight. `design.md` D4 models *none* and *unavailable* as different outcomes and requires the
  // screen to render them identically, so a sentence for one and not the other would be a research
  // statement about our infrastructure, in the middle of a volunteer task, that a participant cannot
  // verify and cannot act on. `recovery-flow.test.ts` enforces this mechanically: the translator it
  // passes THROWS on any lookup, so a branch that grew a sentence fails the suite.
  //
  // And there is no string offering reassurance about how many batches a participant ought to do, nor
  // about any total. The only figure is what is left of THIS batch, which is work they have already
  // been given.
  "validateStart.resume.title": "You have a batch part-finished",
  // The count is composed from THREE keys at the call site rather than from one `{remaining} of
  // {total}` template, because "4 of 10 sentences" and "4 ng 10 na pangungusap" are one fact with two
  // grammars and a template would force one language to carry the other's word order. This is the same
  // decision `validate.progress.sentence` / `.of` / `.saved` already make, and it is the reason this
  // copy block reads as three fragments rather than one sentence.
  //
  // It also makes the ORDER of the figures a property of the catalog: `remaining` comes first in both
  // languages, which is the whole point of the sentence. A template would let a translator move
  // `total` ahead of `remaining`, producing "10 of 4", and nothing would fail.
  "validateStart.resume.remaining.connector": "of",
  "validateStart.resume.remaining.unit": "sentences still waiting for you",
  "validateStart.resume.cta": "Carry on where you stopped",
  "validateStart.resume.note":
    "Everything you already sent is saved. Starting a new batch instead is fine too — the sentences " +
    "in this one stay available to you.",

  // -- The validation session ------------------------------------------------
  // Doubles as the document title. Every string on this route is chrome: the sentence itself is
  // research material and is rendered from storage, never from here.
  "validate.meta.title": "Validating",
  "validate.meta.description":
    "One Ilocano navigation sentence at a time. Your judgement, any correction, and both " +
    "translations are saved as you go.",
  "validate.header.step": "step 4 of 4",
  "validate.entry.label": "The sentence",
  "validate.entry.instructionLabel": "Ilocano sentence",
  "validate.entry.originLabel": "Intended origin",
  "validate.entry.destinationLabel": "Intended destination",
  "validate.entry.transitModeLabel": "Intended travel mode",
  "validate.entry.transitMode.absent": "Not stated",

  // -- Progress --------------------------------------------------------------
  // Three fragments rather than one formatted sentence, because "Sentence 3 of 10" and
  // "Pangungusap 3 ng 10" are the same fact with different grammar, and a format string would force
  // one of those languages to carry the other's word order.
  "validate.progress.label": "Progress through this batch",
  "validate.progress.sentence": "Sentence",
  "validate.progress.of": "of",
  "validate.progress.saved": "saved",

  // -- Per-entry form --------------------------------------------------------
  "validation.evaluation.legend": "What does this sentence do?",
  // The four approved option labels and clarifiers, ASSIGNED from `EVALUATION_CHOICES` in
  // `@/schemas/validation` rather than retyped, for the reason the screening labels are: the
  // approved English wording has one home, and a catalog that restates it is a second place for it
  // to be quietly edited. Declared order is preserved, never sorted, never re-labelled.
  "validation.evaluation.correct_natural": EVALUATION_CHOICES[0].label,
  "validation.evaluation.correct_natural.description": EVALUATION_CHOICES[0].description,
  "validation.evaluation.correct_unnatural": EVALUATION_CHOICES[1].label,
  "validation.evaluation.correct_unnatural.description": EVALUATION_CHOICES[1].description,
  "validation.evaluation.incorrect": EVALUATION_CHOICES[2].label,
  "validation.evaluation.incorrect.description": EVALUATION_CHOICES[2].description,
  "validation.evaluation.cannot_evaluate": EVALUATION_CHOICES[3].label,
  "validation.evaluation.cannot_evaluate.description": EVALUATION_CHOICES[3].description,
  "validation.evaluation.hint":
    "Choose the one that fits best. A correction is asked for only when you choose the second or " +
    "third option, and two translations are asked for unless you choose the last.",
  "validation.correction.label": "Corrected Ilocano sentence",
  "validation.correction.description":
    "Write it the way you would actually say it. It is stored beside the original sentence, which " +
    "is never changed.",
  "validation.translation.english": TRANSLATION_FIELD_LABELS.english.label,
  "validation.translation.english.description":
    "Translate the validated Ilocano sentence — your correction if you wrote one, otherwise the " +
    "sentence above — into English.",
  "validation.translation.filipino": TRANSLATION_FIELD_LABELS.filipino.label,
  "validation.translation.filipino.description":
    "Isalin sa Filipino ang validated na pangungusap — ang iyong correction kung may isinulat ka, " +
    "kundi ang pangungusap sa itaas.",
  "validation.translation.required":
    "Both translations are required for this answer, and neither can be skipped.",
  "validation.submit": "Save and continue",
  "validation.submitting": "Saving…",
  "validation.savingNote":
    "Each sentence is saved as soon as you finish it, so you can stop at any point without losing " +
    "what you have already done.",
  "validation.failure.invalid":
    "We could not accept that answer, and nothing was saved. Check the highlighted inputs.",
  "validation.failure.notConfigured": "The study is not open right now, and nothing was saved.",
  "validation.failure.persistence":
    "We could not save that answer. Nothing was saved, so nothing is lost — you can try again in a " +
    "moment.",

  // -- Session states --------------------------------------------------------
  "validate.finished.label": "This batch is finished",
  // The stale sentence that used to close this paragraph — "Asking for another batch is not part of
  // this part of the study yet" — is GONE, in both catalogs, and its removal is the requirement.
  //
  // What replaces it is deliberately NOTHING that promises a further batch either, and that is STILL
  // the right call now that the continue control exists. It was right for two reasons when the control
  // did not exist — a promise the product could not keep, and the label being the honest place for
  // one — and it remains right for the second of them, which is the durable one. A paragraph that
  // said "ask for another batch whenever you like" would be an OPEN-ENDED offer, and the pool is not
  // unlimited: it runs out, and promising otherwise in prose is a claim the server cannot keep.
  //
  // So the paragraph still says only what is true — every sentence in this batch has an answer, and
  // each one was saved as it was given — and the offer lives on the control's own label, where a
  // participant presses it rather than reading about it. The guards that once forbade promising a
  // further batch were re-aimed when the control landed; see `ENCOURAGEMENT_EN` in
  // `tests/unit/locale-copy.test.ts` for what replaced them and why.
  "validate.finished.body":
    "You have answered every sentence in this batch. Each one was saved as you went.",
  // The two figures, and WHY they are labelled rather than presented as bare numbers (`design.md` D5).
  // "10" beside "30" is a number and a number; a validator who has just answered ten sentences should
  // not have to guess whether the pair means ten sentences in this batch or ten in their lifetime.
  //
  // The lifetime label says "entries answered" and NOT "contributions", "coverage", or anything that
  // reads as a credit (`design.md` D2). The figure counts every recorded response including one
  // recorded as "cannot confidently evaluate", so a wording that implied the study counted it would be
  // a claim the database does not support. The two labels are deliberately parallel and differ only in
  // their scope, because that is the only difference there is.
  "validate.finished.batchFigureLabel": "Entries answered in this batch",
  "validate.finished.lifetimeFigureLabel": "Entries answered in total",

  // -- The finished screen's two controls --------------------------------------
  // The paragraph above promises nothing, and that is still right: a promise belongs on the control
  // that keeps it, and the control now EXISTS. So the offer lives here and nowhere else — one label
  // that asks for another batch, one label that stops, and one sentence saying what stopping means.
  //
  // "Answer another batch" rather than "You can answer another batch", deliberately. The subject is
  // the participant and the verb is an action they can take; the second wording would be an offer
  // ABOUT them, which is the register a volume mechanic speaks in, and this figure is a record
  // rather than a running total for exactly that reason (`design.md` D7).
  "validate.finished.continue": "Answer another batch",
  // The in-button progress label, so the pending state is available as TEXT and not only as styling.
  // It says what is happening rather than how long it is taking: no countdown, no "almost there".
  "validate.finished.continue.working": "Preparing your sentences…",
  // The stop control, and the sentence that says what it does. A label like "Finish" alone invites
  // the reading that something was closed, and the sentence rules that out — nothing is written,
  // nothing is reverted, and coming back is still possible. It says NOTHING about how many batches a
  // participant ought to do, which the localization requirement forbids implying.
  "validate.finished.finish": "Finish for now",
  "validate.finished.finishNote":
    "Stopping here changes nothing you have already submitted, and you can still come back another " +
    "time.",
  // The exhausted pool, in this screen's own words. `validateStart.exhausted` cannot be reused here:
  // it says every available sentence "has already been answered by the required number of people",
  // which is COVERAGE vocabulary, and this screen also shows a lifetime figure that is deliberately
  // not a coverage figure (`design.md` D2). Reusing the key would also have hidden the string from
  // the `validate.finished.*` copy guard, which is scoped by namespace. The reassurance is kept
  // because it is true and because it is the thing a participant who pressed the button needs to hear.
  "validate.finished.exhausted":
    "There are no more sentences for you to answer right now. Everything you have already submitted " +
    "is unchanged. Thank you.",
  // Three failure sentences, and `not_configured` is distinct because "come back later" is true
  // there while "try again" would be a lie — retrying cannot succeed until somebody deploys. Each
  // says no batch was created, so a participant who pressed the button knows what did and did not
  // happen.
  "validate.finished.failure.notConfigured":
    "The study is not open right now, and no new batch was created.",
  "validate.finished.failure.invalid":
    "This browser could not be recognised as a validator, so no new batch was created. Answer the " +
    "Ilocano question first.",
  "validate.finished.failure.persistence":
    "Your next batch could not be prepared just now, and none was created. Everything you have " +
    "already submitted is unchanged.",
  "validate.absent.label": "We could not find that batch",
  "validate.absent.body":
    "The address may be incomplete, or the batch may belong to a different browser. Nothing you " +
    "have submitted is affected.",
  "validate.absent.cta": "Start a new batch",
  "validate.failed.label": "We could not read your batch",
  "validate.failed.body":
    "Nothing was changed and nothing was lost. You can try again in a moment.",
  "validate.failed.invalid": "That link did not name a sentence position, so nothing was read.",
  "validate.failed.persistence": "Your sentences could not be loaded just now.",
} as const;

/**
 * Every interface string, as a key. Derived from the English catalog, never written by hand.
 *
 * Derived rather than maintained so a key can never exist here without existing in the English
 * catalog, which is the direction the exhaustiveness check runs in.
 */
export type CopyKey = keyof typeof ENGLISH_COPY;

/**
 * A resolved catalog: every key, in one language.
 *
 * `Record<CopyKey, string>` rather than the literal type of `ENGLISH_COPY`, deliberately: the point
 * is that any key may hold any string, so the Filipino catalog is checked for COMPLETENESS and a
 * wrong value cannot be narrowed away by the type.
 */
export type Copy = Record<CopyKey, string>;

/**
 * Looks one string up by key.
 *
 * A function rather than a `Copy` object passed around, because the argument at every call site is
 * a string literal and a wrong one is a compile error. Passing the object instead would require
 * `catalog["some.key"]`, which checks the same way but reads worse at the two dozen call sites in
 * the routes, and would let a caller hold a whole catalog for no reason.
 */
export type Translate = (key: CopyKey) => string;

/**
 * The Filipino catalog.
 *
 * THE ANNOTATION IS THE MECHANISM. `Record<CopyKey, string>` is the load-bearing line of the
 * interface-localization capability, and it is the reason a half-localized page cannot ship:
 *
 *   - a key added to `ENGLISH_COPY` and not here is a MISSING PROPERTY, which TypeScript reports.
 *   - a key here that English does not have is an EXCESS PROPERTY, which TypeScript also reports.
 *
 * Either way `pnpm run typecheck` fails, and a failing type-check is the only failure mode that
 * cannot be talked past in review. See the module header for why this is not a test.
 *
 * The Filipino text is a rendering of the same approved meaning, not a new claim: nothing here
 * promises or denies anything the English string does not, because these are participant-facing
 * statements about what the study collects and what it does not.
 */
export const FILIPINO_COPY: Record<CopyKey, string> = {
  // -- Document ------------------------------------------------------------
  "meta.siteTitle": "Sadino — suriin ang datos ng nabigasyon sa Ilocano",
  "meta.siteDescription":
    "Tulungan sa pagsusuri ng mga tagubilin sa nabigasyong Ilocano para sa proyekto ng " +
    "pananaliksik na Sadino. Sampung maiikling pangungusap sa isang beses. Walang pangalan, " +
    "walang email, walang account.",

  // -- Shared chrome -------------------------------------------------------
  "common.beforeYouStart": "Bago ka magsimula",
  skipToContent: "Lumaktaw sa nilalaman",
  "switcher.label": "Wika ng interface",
  "switcher.englishName": "Ingles",
  // "Filipino" is the endonym and is the same word in both catalogs. The key exists so the
  // switcher has a localized accessible name, not because the string can differ.
  "switcher.filipinoName": "Filipino",

  // -- Landing -------------------------------------------------------------
  "landing.header.study": "pag-aaral ng pagpapatunay",
  "landing.badge.dataset": "Ilocano · datos ng nabigasyon",
  "landing.badge.recruit": "Kailangan ng mga mananaliksik",
  "landing.hero.title1": "Suriin ang Ilocano.",
  "landing.hero.title2": "Ayusin ang mali.",
  "landing.hero.lead":
    "Ang Sadino ay thesis dataset para sa lokal na nabigasyon sa Ilocano. Ito ay isinulat ng " +
    "isang makina. Ikaw ang bahagi ng proseso na nagiging maaasahan ito: binabasa mo ang isang " +
    "pangungusap, sinusuri mo kung tamang ang sinasabi nito, at kaayusan mo ito kapag hindi.",
  "landing.cta.start": "Simulan ang pagpapatunay",
  "landing.cta.hint":
    "Dalawang hakbang: isang tanong tungkol sa iyong Ilocano, pagkatapos ay magsisimula ka na.",
  "landing.expectations.heading": "Ano ang inaasahan",
  "landing.panel.task.label": "Ang gawain",
  "landing.panel.task.title": "Sampung pangungusap sa isang beses",
  "landing.panel.task.body":
    "Makikita mo ang isang maiikling tagubilin sa nabigasyong Ilocano kasama ang lugar na dapat " +
    "nitong ilarawan. Ikaw ang nagpasya kung tamang ang sinasabi ng pangungusap, at kaayusan mo " +
    "ito kapag hindi.",
  "landing.panel.ask.label": "Ang hinihingi",
  "landing.panel.ask.title": "Isang tanong tungkol sa iyo",
  "landing.panel.ask.body":
    "Itatanong namin kung gaano ka komportable sa Ilocano. Iyan ay impormasyong panlikod para " +
    "sa talaan ng pananaliksik. Hindi ito iskor, at hindi nito binabago ang hinihingi sa iyo.",
  "landing.panel.keep.label": "Ano ang itinatago namin",
  "landing.panel.keep.title": "Ang iyong paghatol, hindi ang iyong pagkakakilanlan",
  "landing.panel.keep.body":
    "Itinatago namin ang entry, ang iyong pagtataya, ang anumang kaayusan na isulat mo, at ang " +
    "isang opsyonal na pagsasalin. Hindi namin itatanong ang iyong pangalan, email, numero ng " +
    "estudyante, o telepono.",
  "landing.before.label": "Pakisuri, pakibasa",
  "landing.before.item1":
    "Boluntary ang pakikilahok. Maaari kang tumigil pagkatapos ng anumang batch, at hindi " +
    "naibabalik ang anumang naipasa mo na.",
  "landing.before.item2":
    "Hindi mo kailanman makikita ang parehong pangungusap nang dalawang beses, at titigil na sa " +
    "pagbibigay sa iyo ng mga pangungusap kapag sapat nang tao na ang nagsuri nito.",
  "landing.before.item3":
    "Kung mali ang isang pangungusap, mas gusto naming ang iyong bersyon kaysa usapanin ito. " +
    "Isulat ito gaya ng talagang sasabihin mo ito.",
  "common.footer.research": "Sadino · pananaliksik sa nabigasyon ng Ilocano",
  "landing.footer.noAccounts":
    "Walang account. Walang pangalan, walang email, walang numero ng estudyante.",

  // -- Returning-validator resume island ------------------------------------
  "resume.title": "Nagsimula ka na ba?",
  "resume.body":
    "Kung may ginawa ka na sa browser na ito, maaari mong magpatuloy bilang parehong anonymous " +
    "na validator.",
  "resume.continue": "Magpatuloy bilang validator na iyon",
  "resume.checking": "Sinusuri…",
  "resume.noneHeld":
    "Walang naka-save na pagkakakilanlan ang browser na ito. Piliin ang Simulan ang pagpapatunay " +
    "para magsimula — isang tanong lang ang kailangan.",
  "resume.unknown":
    "Hindi na kinikilala ang naka-save na pagkakakilanlan iyon, kaya ito ay nalinis. Piliin ang " +
    "Simulan ang pagpapatunay para magsimula muli bilang bagong anonymous na validator.",

  // -- Screening route ------------------------------------------------------
  "start.header.step": "hakbang 2 ng 3",
  "start.lead":
    "Isang tanong tungkol sa iyong Ilocano. Ito ay impormasyong panlikod para sa talaan ng " +
    "pananaliksik — hindi ito iskor, at hindi nito binabago ang hinihingi sa iyo. Maaari kang " +
    "magpatuloy nang hindi ito sagutin.",
  "start.beforeAnswer.label": "Bago ka sumagot",
  "start.beforeAnswer.item1":
    "Boluntary ang pakikilahok. Maaari kang tumigil anumang oras, kahit sa screen na ito, at " +
    "isara ang tab — walang nase-save maliban kung pindutin mo ang Magpatuloy.",
  "start.beforeAnswer.item2":
    "Hindi namin itatanong ang iyong pangalan, email, numero ng estudyante, o numero ng telepono, " +
    "at walang anumang field sa alinmang screen kung saan mo ito maaaring ilagay.",
  "start.beforeAnswer.item3":
    "Ang iyong pagkakakilanlan ay isang random na code. May kopya itinatago sa browser na ito " +
    "para makilala ka namin sa pagbalik mo, at iniingatan ang code sa database ng pag-aaral kasama " +
    "ang iyong mga sagot, kung saan ito hindi kayang iulat pabalik sa iyo. Kapag binura mo ang " +
    "datos ng browser, nawawala ang aming kakayahang kilalanin ka.",
  "start.meta.title": "Pagsusuri",
  "start.meta.description":
    "Isang tanong tungkol sa iyong kagandihan sa Ilocano, at walang anumang bagay tungkol sa " +
    "iyo ang nakokolekta. Walang pangalan, walang email, walang account.",

  // -- Screening form -------------------------------------------------------
  "screening.question": "Gaano ka komportable sa Ilocano?",
  "screening.supporting":
    "Nakakatulong ito sa amin na maunawaan ang background ng aming mga validator.",
  "screening.proficiency.native": "Katutubo / unang wikang ginagamit",
  "screening.proficiency.fluent": "Madaling gamitin",
  "screening.proficiency.conversational": "Kayang makipag-usap",
  "screening.proficiency.basic": "Pangunahing alam",
  "screening.proficiency.not_confident": "Hindi komportable",
  "screening.submit": "Magpatuloy",
  "screening.submitting": "Ini-save…",
  "screening.skip": "Laktawan at magpatuloy nang walang sagot",
  "screening.resumeNote":
    "Kung may pagkakakilanlan ng validator na ang browser na ito, magpapatuloy ito sa halip na " +
    "lumikha ng pangalawa, at hindi maaaring maidagdag sa orihinal ang sagot sa itaas.",
  "screening.resumed": "Magpapatuloy bilang validator na hawak na ng browser na ito.",

  // -- Failure copy. Per subject as well as per reason: see the English block for why.
  "screening.failure.notConfigured.enroll":
    "Hindi pa bukas ang pag-aaral sa ngayon. Walang nase-save, at hindi ka na-sign up.",
  "screening.failure.notConfigured.resume":
    "Hindi pa bukas ang pag-aaral sa ngayon, kaya hindi maaaring suriin ang naka-save na " +
    "pagkakakilanlan. Walang binago.",
  "screening.failure.invalid.enroll":
    "Hindi namin tinanggap ang sagot na iyon, at walang nase-save. Mangyaring pumili ng isa sa " +
    "mga pagpipilian, o magpatuloy nang walang sagot.",
  "screening.failure.invalid.resume":
    "Hindi maaaring suriin ang naka-save na pagkakakilanlan, at walang binago. Maaari mong " +
    "subukan ulit sa bahagyang sandali.",
  "screening.failure.persistence.enroll":
    "Hindi namin matapos ang pagpaparehistro sa iyo. Walang nase-save. Maaari mong subukan ulit " +
    "sa bahagyang sandali.",
  "screening.failure.persistence.resume":
    "Hindi maaaring suriin ngayon ang naka-save na pagkakakilanlan, at walang binago. Maaari " +
    "mong subukan ulit sa bahagyang sandali.",

  // -- Confirmation route ---------------------------------------------------
  "ready.header.step": "hakbang 3 ng 3",
  "ready.badge": "Paano ito gumagana",
  "ready.title": "Bago ka magsimula",
  "ready.lead":
    "Walang nang-identity na nakolekta, at walang account na kailangang pamahalaan. Ito ang " +
    "mangyayari kapag nagsimula ka.",
  "ready.starting.label": "Ang mangyayari kapag nagsimula ka",
  "ready.starting.item1":
    "Binubuo para sa iyo ang isang random na code at itinatago sa database. Hinango ito mula sa " +
    "anumang bagay tungkol sa iyo.",
  "ready.starting.item2":
    "Isang kopya lang ng code na iyon ang itinatago sa browser na ito, para makilala ka kapag " +
    "bumalik ka.",
  "ready.starting.item3":
    "Ang sagot mo sa tanong ng Ilocano ay itinatago kasama ang iyong pagkakakilanlan bilang " +
    "validator bilang impormasyong panlikod. Kung pinili mong laktawan ito, walang itinatala sa " +
    "lugar nito. Kung may pagkakakilanlan na ang browser na ito, ang sagot na naka-save na kasama " +
    "nito ang siyang nananatili.",
  "ready.notStarted.label": "Kung hindi ka pa nagsimula",
  "ready.notStarted.body":
    "Ang pagdating sa pahinang ito ay hindi nangangahulugang sinagot mo ang tanong ng Ilocano. Ang " +
    "tanong na iyon ang lumilikha ng iyong pagkakakilanlan bilang validator, at walang paraan " +
    "para gawin ito mula sa pahinang ito.",
  "ready.notStarted.cta": "Pumunta sa tanong ng Ilocano",
  "ready.next.label": "Ang susunod",
  "ready.next.body1":
    "Ibinibigay sa iyo ang mga pangungusap sa nabigasyong Ilocano nang isa-isa, sa " +
    "pagkakasunod-sunod na pinili ng pag-aaral, at sinusuriin ang bawat isa nang isa-isa. Ang " +
    "pagbalik sa browser na ito ay hindi magpapalit sa iyong sagot sa pagsusuri.",
  "ready.next.body2":
    "Nase-save ang bawat natapos na pangungusap kaagad, kaya puwede kang tumigil anumang oras " +
    "nang hindi nawawalan ng ginawa mo na, at makabalik sa browser na ito sa bandang huli.",
  "ready.begin.label": "Magsimula na",
  "ready.begin.body":
    "Humingi ng iyong mga pangungusap. Pinipili ng pag-aaral kung alin ang ibibigay sa iyo at " +
    "ilan, kaya maaaring hinihingi niya ang mga ito ngayon.",
  "ready.begin.cta": "Magsimula ng pagpapatunay",
  "ready.stop.label": "Kung gusto mong tumigil",
  "ready.stop.body":
    "Ang pag-clear ng datos ng site sa browser na ito ay nag-aalis ng code na nag-uugnay sa iyo " +
    "sa iyong pagkakakilanlan bilang validator. Dahil ang code lang ang ugnayan, iyon ay " +
    "permanent: magsisimula ka muli bilang bagong anonymous na validator, at mananatili ang iyong " +
    "mga naunang sagot sa talaan ng pananaliksik sa ilalim ng lumang pagkakakilanlan.",
  "common.footer.noAccounts": "Walang account. Walang nang-identity.",
  "ready.meta.description":
    "Ang mangyayari kapag nagsimula kang magpapatunay, at ano ang itinatago. Darating ang mga " +
    "pangungusap sa susunod na yugto.",

  // -- Not found ------------------------------------------------------------
  "notFound.title": "Wala rito ang pahinang ito.",
  "notFound.body":
    "Maaaring nagbago ang address, o hindi kumpleto ang link. Walang naaapektuhan sa ipinasa mo.",
  "notFound.cta": "Bumalik sa simula",
  "notFound.meta.title": "Hindi natagpuan ang pahina",

  // -- Simula ng batch -------------------------------------------------------
  // The `/ready` page's onward path. A batch id does not exist until the server has chosen one, so
  // the request is made from the participant's browser rather than linked to from `/ready`.
  "validateStart.meta.title": "Magsimula ng pagpapatunay",
  "validateStart.title": "Magsimula ng iyong batch",
  "validateStart.lead":
    "Bibigyan ka ng mga pangungusap na nabigasyon sa Ilocano, isa-isa, sa pagkakasunod-sunod na " +
    "pinili ng pag-aaral.",
  "validateStart.begin": "Bigyan ako ng mga pangungusap",
  "validateStart.working": "Inihahanda ang iyong mga pangungusap…",
  "validateStart.working.ariaLabel": "Inihahanda ang iyong mga pangungusap",
  "validateStart.noIdentity":
    "Walang naka-save na pagkakakilanlan ng validator ang browser na ito, kaya walang maaattach " +
    "na batch. Sagutin muna ang tanong tungkol sa Ilocano.",
  "validateStart.noIdentity.cta": "Pumunta sa tanong tungkol sa Ilocano",
  "validateStart.exhausted":
    "Sagot na ng kinakailangang bilang ng tao ang bawat pangungusap na abot ng validator na ito. " +
    "Salamat — wala nang kailangang gawin sa ngayon.",
  "validateStart.failure.notConfigured": "Bukas pa ang pag-aaral, at walang batch na nalikha.",
  "validateStart.failure.invalid":
    "Hindi makilala ang browser na ito bilang validator, at walang batch na nalikha. Sagutin muna " +
    "ang tanong tungkol sa Ilocano.",
  "validateStart.failure.persistence":
    "Hindi maipaghanda ang iyong mga pangungusap ngayon, at walang batch na nalikha. Puwede " +
    "mong subukan muli sa lalong madaling panahon.",

  // -- Pagpapatuloy ng naputol na batch ---------------------------------------
  // Ang tanging teksto sa katalogong ito na naglalarawan sa GINAWA na ng kag contribute, hindi sa
  // gagawin. Lahat ng string dito ay tungkol sa sarili mong hindi pa tapos na trabaho.
  //
  // WALA RITO NG TEKSTO PARA SA BIGO NA PAGKAMALI — ang kawalan ay kailangan, hindi pagkakamali. Ang
  // `design.md` D4 ay naglalarawan ng *none* at *unavailable* bilang magkaibang resulta at hinihingi
  // na magkatugma ang mga itinatampok ng screen, kaya ang isang pangungusap para sa isa at wala para sa
  // isa ay pahayagang pananaliksik tungkol sa aming imprastrukturang, nasa gitna ng gawain ng boluntaryo,
  // na hindi mabibeberipika o maisasagawa ng kag Contribute.
  //
  // At walang string na nag-aanyaya ng kumpirensya kung ilang batch ang dapat gawin ng isang tao, at
  // walang kabuuan. Ang tanging bilang ay natitira sa batch na ito — trabahong ibinigay na sa iyo.
  "validateStart.resume.title": "Mayroon kang bahagyang tapos na batch",
  // Pinagkukunan ng tatlong key ang bilang sa lugar ng pagtawag, gaya ng ginagawa ng
  // `validate.progress.*` sa itaas: "4 of 10" at "4 ng 10" ay iisang katotobanan na may dalawang
  // gramatika, at ang isang `{remaining} of {total}` ay pipilitin sa isang wika ang pagkakasunod-sunod
  // ng salita ng isa.
  "validateStart.resume.remaining.connector": "ng",
  "validateStart.resume.remaining.unit": "na pangungusap pa ang naghihintay sa iyo",
  "validateStart.resume.cta": "Magpatuloy ka sa kung saan ka tumigil",
  "validateStart.resume.note":
    "Nase-save na ang lahat ng ipinadala mo. Puwede ring magsimula ng bagong batch — nananatiling " +
    "available sa iyo ang mga pangungusap ng batch na ito.",

  // -- Ang validation session ------------------------------------------------
  // Ang mismong pahina. Lahat ng string dito ay chrome: ang mismong pangungusap ay materyal ng
  // pananaliksik at hinahango mula sa storage, hindi mula rito.
  "validate.meta.title": "Pagpapatunay",
  "validate.meta.description":
    "Isa-isa ang mga pangungusap sa nabigasyon na nasa Ilocano. Ang iyong paghusga, anumang " +
    "pagwawasto, at ang dalawang pagsasalin ay nase-save habang ginagawa mo.",
  "validate.header.step": "hakbang 4 sa 4",
  "validate.entry.label": "Ang pangungusap",
  "validate.entry.instructionLabel": "Pangungusap sa Ilocano",
  "validate.entry.originLabel": "Nilayong pinagmulan",
  "validate.entry.destinationLabel": "Nilayong puntahan",
  "validate.entry.transitModeLabel": "Nilayong paraan ng paglalakbay",
  "validate.entry.transitMode.absent": "Hindi nakasaad",

  // -- Progreso ---------------------------------------------------------------
  // Tatlong fragmento sa halip na isang pangungusap na may format, dahil ang “Pangungusap 3 ng 10” at
  // ang “Sentence 3 of 10” ay iisang bagay na magkaibayong gramatika, at ang isang format string ay
  // pipilitin sa isang wika na dalhin ang gramatika ng iba.
  "validate.progress.label": "Progreso sa batch na ito",
  "validate.progress.sentence": "Pangungusap",
  "validate.progress.of": "ng",
  "validate.progress.saved": "ang naisave",

  // -- Form kada entry --------------------------------------------------------
  "validation.evaluation.legend": "Ano ang ginagawa ng pangungusap na ito?",
  "validation.evaluation.hint":
    "Piliin ang pinakangkop. Hinihingi lamang ng pagwawasto ang ikalaw o ikatlong pagpipilian, at " +
    "dalawang pagsasalin ang hinihingi maliban kung pipiliin mo ang huli.",
  "validation.evaluation.correct_natural": "Tama at natural",
  "validation.evaluation.correct_natural.description":
    "Sinasabi ng pangungusap ang nais ipahayag at natural itong basahin sa Ilocano.",
  "validation.evaluation.correct_unnatural": "Tama ngunit hindi natural ang dating",
  "validation.evaluation.correct_unnatural.description":
    "Tama ang kahulugan, ngunit hindi natural ang dating para sa isang nagsasalita.",
  "validation.evaluation.incorrect": "Mali",
  "validation.evaluation.incorrect.description":
    "Hindi ipinapakita ng pangungusap ang impormasyong nais ipahayag.",
  "validation.evaluation.cannot_evaluate": "Hindi ko kayang suriin nang may katiyakan",
  "validation.evaluation.cannot_evaluate.description":
    "Hindi ka sapat ang kumpiyansa upang suriin ang entry na ito.",
  "validation.correction.label": "Tamang Ilocano",
  "validation.correction.description":
    "Isulat ito ayon sa tunay mong pangungusap. Itinatago ito sa tabi ng orihinal na pangungusap, na " +
    "hindi kailanman binabago.",
  "validation.translation.english": "Pagsasalin sa Ingles",
  "validation.translation.english.description":
    "Isalin sa Ingles ang validated na Ilocano — ang iyong pagwawasto kung may isinulat ka, kundi " +
    "ang pangungusap sa ibabaw.",
  "validation.translation.filipino": "Pagsasalin sa Filipino",
  "validation.translation.filipino.description":
    "Isalin sa Filipino ang validated na pangungusap — ang iyong pagwawasto kung may isinulat ka, " +
    "kundi ang pangungusap sa ibabaw.",
  "validation.translation.required":
    "Kailangan ang dalawang pagsasalin para sa sagot na ito, at wala sa dalawang maaaring laktawan.",
  "validation.submit": "I-save at magpatuloy",
  "validation.submitting": "Ini-save…",
  "validation.savingNote":
    "Nase-save ang bawat pangungusap sa oras na natatapos mo, kaya puwede kang tumigil anumang " +
    "oras nang hindi nawawalan ng ginawa mo na.",
  "validation.failure.invalid":
    "Hindi namin maaanggap ang sagot na iyon, at walang nase-save. Pakisuri ang mga naka-highlight na " +
    "input.",
  "validation.failure.notConfigured": "Bukas pa ang pag-aaral, at walang nase-save.",
  "validation.failure.persistence":
    "Hindi namin ma-save ang sagot na iyon. Walang nase-save, kaya walang nawala — puwede mong " +
    "subukan muli sa lalong madaling panahon.",

  // -- Mga kalagayan ng session -------------------------------------------------
  "validate.finished.label": "Tapos na ang batch na ito",
  // The retired sentence, gone here for the same reason and with the same constraint as in the
  // English catalog: it told the validator that asking for another batch was unavailable, which the
  // change removes. Nothing replaces it that promises a further batch either, and that is still the
  // right call now that the continue control EXISTS — the pool is not unlimited, so an open-ended
  // offer in prose is a claim the server cannot keep. The offer lives on the control's own label.
  "validate.finished.body":
    "Sinagot mo na ang bawat pangungusap sa batch na ito. Nase-save ang bawat isa habang ginagawa mo.",
  // The two figure labels, carrying the SAME meaning as the English pair rather than being a shorter
  // or looser rendering of it: what was answered within this batch, and what has been answered in
  // total. "Mga ambag" is deliberately absent — see `design.md` D2 and the English label's comment.
  "validate.finished.batchFigureLabel": "Mga entry na sinagot sa batch na ito",
  "validate.finished.lifetimeFigureLabel": "Mga entry na sinagot sa kabuuan",

  // -- Dalawang control ng tapos na ang screen ---------------------------------
  // Ang pangungusap sa itaas ay walang pangangako, at tama iyon: ang pangangako ay nasa control
  // na nagta-tago nito, at doon na umiiral ang control. Kaya dito lamang ang alok — isang label na
  // humihiling ng isa pang batch, isang label na tumitigil, at isang pangungusap na sinasabi kung
  // ano ang ibig sabihin ng pagtigil.
  //
  // "Sagutin ang isa pang batch" at hindi "Maaari kang sagutin ang isa pang batch", nang kamalayan.
  // Ang panauhan ay ang kalahok at ang pang verb ay isang aksyong magagawa niya; ang pangalawang
  // boses ay isang alok na TUNGOL sa kanya, at iyon ang boses ng isang volume mechanic — kaya ang
  // talaan ng natapos na trabaho ay tala lamang, hindi tumatagos habang nagtatrabaho (`design.md` D7).
  "validate.finished.continue": "Sagutin ang isa pang batch",
  // Ang label habang hinihingi, kaya ang estado ng paghihintay ay makikita bilang TEKSTO at hindi lamang
  // bilang anyo. Sinasabi nito kung ano ang nangyayari, hindi kung gaano katagal: walang countdown,
  // walang "halos na".
  "validate.finished.continue.working": "Inihahanda ang mga pangungusap…",
  // Ang control na tumitigil, at ang pangungusap na sinasabi kung ano ang ginagawa nito. Ang label
  // na "Tapusin" lamang ay nag-aanyaya ng pagbasa na may sarado na, at inaalis ng pangungusap na iyon
  // ang tanawin — walang isinusulat, walang ibinabalik, at puwede pa ring bumalik. Walang sinasabi
  // tungkol sa ilang batch ang dapat ang kalahok, at iyon ang ipinagbabawal ng kinakailangan sa
  // lokalisasyon.
  "validate.finished.finish": "Tapusin na muna",
  "validate.finished.finishNote":
    "Walang binabago sa ipinasa mo kung tatapusin mo na dito, at puwede ka pa ring bumalik sa ibang " +
    "pagkakataon.",
  // Ang naubos na pool, sa sariling salita ng screen na ito. Hindi maaaring gamitin ang
  // `validateStart.exhausted`: sinasabi nito na "sagot na ng kinakailangang bilang ng tao" ang bawat
  // pangungusap, at iyon ay salitang COVERAGE — samantalang ang lifetime figure sa screen na ito ay
  // sinadayang HINDI coverage figure (`design.md` D2). Kung muling gamitin ang key, nasa ilalim
  // ng `validate.finished.*` copy guard ang string, at hindi nito kailanman makikita iyon.
  "validate.finished.exhausted":
    "Wala nang pangungusap na maaari mong sagutin sa ngayon. Walang binabago sa lahat ng ipinasa mo. " +
    "Salamat.",
  // Tatlong pangungusap ng pagkabigo, at `not_configured` ay hiwalay dahil doon totoo ang
  // "balikan later" samantalang ang "subukan muli" ay pagkakaisa — hindi maaaring magtagumpay ang
  // pagsubok hanggang may mag-deploy. Sasabihin ng bawat isa na walang batch na nalikha, para alam
  // ng kalahok kung ano at hindi nangyari.
  "validate.finished.failure.notConfigured":
    "Bukas pa ang pag-aaral, at walang bagong batch na nalikha.",
  "validate.finished.failure.invalid":
    "Hindi makilala ang browser na ito bilang validator, kaya walang bagong batch na nalikha. " +
    "Sagutin muna ang tanong tungkol sa Ilocano.",
  "validate.finished.failure.persistence":
    "Hindi maipaghanda ang iyong susunod na batch ngayon, at wala ring nalikha. Walang binabago sa " +
    "lahat ng ipinasa mo.",
  "validate.absent.label": "Hindi namin mahanap ang batch na iyon",
  "validate.absent.body":
    "Maaaring hindi kumpleto ang address, o ibang browser ang may hawak ng batch. Walang " +
    "naaapektuhan sa ipinasa mo.",
  "validate.absent.cta": "Magsimula ng bagong batch",
  "validate.failed.label": "Hindi namin mabasa ang iyong batch",
  "validate.failed.body":
    "Walang binago at walang nawala. Puwede mong subukan muli sa lalong madaling panahon.",
  "validate.failed.invalid":
    "Hindi nagpangalan ang link na iyon ng posisyon ng pangungusap, kaya walang binasa.",
  "validate.failed.persistence": "Hindi ma-load ang iyong mga pangungusap ngayon.",
};

/**
 * Every catalog, keyed by locale.
 *
 * Built from `INTERFACE_LOCALES` rather than written as a literal, so a third approved language
 * cannot be added to the locale domain without this record demanding a catalog for it - the same
 * "derive, do not maintain" rule as `CopyKey` above, applied to the language list instead of the
 * key list.
 */
const CATALOGS: Record<InterfaceLocale, Copy> = {
  en: ENGLISH_COPY,
  fil: FILIPINO_COPY,
};

/**
 * A translator for one locale.
 *
 * Closed over the catalog rather than reading a global, so a component can be handed the locale it
 * is rendering and nothing else: there is no module-level "current language" for one component to
 * pick up by accident and no way for two rendered trees in the same process to disagree.
 *
 * The key is typed `CopyKey`, so a call site naming a string that does not exist is a compile
 * error rather than an `undefined` rendered into a paragraph.
 */
export function translatorFor(locale: InterfaceLocale): Translate {
  const catalog = CATALOGS[locale];
  return (key) => catalog[key];
}

/**
 * The catalog key carrying a proficiency level's human LABEL.
 *
 * The mapping is keyed by the machine-readable value and the lookup is by that value, so:
 *
 *   - the value a participant's answer is stored as NEVER comes from this module. It comes from
 *     `ILOCANO_PROFICIENCY_CHOICES[i].value`, exactly as it did before localization existed.
 *   - only the label is localized. A participant choosing "Madaling gamitin" is recorded as
 *     `fluent`, and a participant choosing "Fluent" is recorded as `fluent` too.
 *
 * `Record<IlocanoProficiency, …>` is itself a small exhaustiveness pin: a sixth approved
 * proficiency level, or a renamed one, fails `pnpm run typecheck` here rather than rendering a
 * screening screen with an untranslated option.
 */
export type ProficiencyLabelKey =
  | "screening.proficiency.native"
  | "screening.proficiency.fluent"
  | "screening.proficiency.conversational"
  | "screening.proficiency.basic"
  | "screening.proficiency.not_confident";

export const PROFICIENCY_LABEL_KEYS: Record<IlocanoProficiency, ProficiencyLabelKey> = {
  native: "screening.proficiency.native",
  fluent: "screening.proficiency.fluent",
  conversational: "screening.proficiency.conversational",
  basic: "screening.proficiency.basic",
  not_confident: "screening.proficiency.not_confident",
};

/**
 * The accessible name of each language control, as a catalog key.
 *
 * ============================================================================
 * WHY THIS EXISTS, WHICH A TERNARY DID NOT
 * ============================================================================
 * The switcher originally chose this key with `choice === "en" ? english : filipino`. That compiles,
 * passes every test, and is **wrong the moment a third locale is approved**: a new locale falls into
 * the `else` branch and is announced to assistive technology as "Filipino". Nothing fails, because
 * the ternary has no exhaustiveness to violate - and a language switcher that mislabels the active
 * language to a screen-reader user is about the worst defect this feature could ship.
 *
 * The comment above the switcher claimed that adding a locale "adds a third control here without
 * anyone editing this file". That claim was false: the control was mapped, but its NAME was not, so
 * the file did have to be edited - silently, and wrongly, if the editor did not notice. A comment
 * asserting a property the code does not have is worse than no comment, because it is the kind of
 * thing a reviewer reads and relies on.
 *
 * A `Record` over the closed union is the same mechanism as `PROFICIENCY_LABEL_KEYS` above, for the
 * same reason: a third approved locale is now a `pnpm run typecheck` failure naming a missing
 * property, rather than a control that lies about which language it selects.
 */
export type LocaleNameKey = "switcher.englishName" | "switcher.filipinoName";

export const LOCALE_NAME_KEYS: Record<InterfaceLocale, LocaleNameKey> = {
  en: "switcher.englishName",
  fil: "switcher.filipinoName",
};

/**
 * The label key for each approved evaluation.
 *
 * The same `Record`-over-a-closed-union mechanism as `PROFICIENCY_LABEL_KEYS`, for the same reason:
 * a fifth approved evaluation, or a renamed one, is a `pnpm run typecheck` failure naming a missing
 * property rather than a validation screen that renders an unlabelled option.
 *
 * Only the LABEL is localized. The value a validator's judgement is stored as is
 * `EVALUATION_CHOICES[i].value` and is never read from this module, so a participant choosing
 * "Mali" is recorded as `incorrect` and one choosing "Incorrect" is recorded as `incorrect` too.
 */
export type EvaluationLabelKey =
  | "validation.evaluation.correct_natural"
  | "validation.evaluation.correct_unnatural"
  | "validation.evaluation.incorrect"
  | "validation.evaluation.cannot_evaluate";

export const EVALUATION_LABEL_KEYS: Record<Evaluation, EvaluationLabelKey> = {
  correct_natural: "validation.evaluation.correct_natural",
  correct_unnatural: "validation.evaluation.correct_unnatural",
  incorrect: "validation.evaluation.incorrect",
  cannot_evaluate: "validation.evaluation.cannot_evaluate",
};

/**
 * The clarifier shown under each option label.
 *
 * All four are present and all four are rendered, which is the neutrality requirement expressed as
 * structure rather than discipline: a design that gave one option a clarifier would be visibly
 * flagging that option, so there is no way to add one without this map growing unevenly and a test
 * noticing.
 */
export type EvaluationDescriptionKey = `${EvaluationLabelKey}.description`;

export const EVALUATION_DESCRIPTION_KEYS: Record<Evaluation, EvaluationDescriptionKey> = {
  correct_natural: "validation.evaluation.correct_natural.description",
  correct_unnatural: "validation.evaluation.correct_unnatural.description",
  incorrect: "validation.evaluation.incorrect.description",
  cannot_evaluate: "validation.evaluation.cannot_evaluate.description",
};
