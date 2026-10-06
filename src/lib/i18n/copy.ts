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
  "landing.hero.title1": "Check the Ilocano.",
  "landing.hero.title2": "Fix what’s off.",
  "landing.hero.lead": "Data validation for SADINO",
  "landing.cta.start": "Start validation",
  "landing.cta.continue": "Continue validation",
  "landing.expectations.heading": "What to expect",
  "landing.panel.task.label": "The task",
  "landing.panel.task.title": "Ten sentences at a time",
  "landing.panel.task.body":
    "You will see a short Ilocano navigation instruction plus the place it is meant to " +
    "describe. You decide whether the sentence says what it should, and you fix it when it " +
    "does not.",
  "landing.panel.ask.label": "The ask",
  "landing.panel.ask.title": "One question about you",
  "landing.panel.ask.body":
    "We ask how comfortable you are with Ilocano. That is background for the research record. " +
    "It is not a score, and it does not change what you are asked to do.",
  "landing.panel.keep.label": "What we keep",
  "landing.panel.keep.title": "Your judgment, not your identity",
  "landing.panel.keep.body":
    "We store the entry, your evaluation, corrections you write, and any translations. We never " +
    "ask for your name, your email, your student number, or your phone.",

  // -- Landing action, scoped to ONE browser session -------------------------------------
  // The single entry button keeps no card and no explanation: where it goes depends on what this
  // browser holds, and the platform resolves that at press time rather than asking the participant
  // to choose. Every string here therefore names the SESSION rather than the browser, the person,
  // or the past — a reload or a navigation within one session is exactly what it still covers.
  // The press-time outcome messages are the only sentences this island renders besides the button.
  "resume.checking": "Checking…",
  "resume.unknown":
    "We no longer recognise that saved identity, so we cleared it. Start validation to begin " +
    "again as a new anonymous validator.",

  // -- Screening route ------------------------------------------------------
  "start.lead":
    "Before we begin, please answer this quick question about your Ilocano background. " +
    "It isn't a test and won't affect what you do next, but an answer is required to " +
    "continue.",
  "start.beforeAnswer.label": "Before you answer",
  "start.beforeAnswer.item1":
    "Taking part is completely voluntary. You can stop at any time just by closing the " +
    "tab. Nothing is saved unless you press Continue.",
  "start.beforeAnswer.item2":
    "We do not ask for your name, email, student number, or phone number, and there's " +
    "nowhere to enter them anyway.",
  "start.beforeAnswer.item3":
    "You're identified only by a random code. This tab remembers it so you won't lose your" +
    "progress if you refresh, and the database saves it with your answers where it can't be traced" +
    "back to you. Once you close the tab, that progress will be gone.",

  "start.meta.title": "Screening",
  "start.meta.description":
    "One question about your Ilocano, and nothing collected about you. No name, no email, no " +
    "account.",

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
  "screening.resumed": "Picking up where this browser's validator left off.",

  // -- Failure copy. Keyed by outcome reason AND by subject, because a single shared string
  //    was actively wrong: the enrollment `invalid` message tells a participant to pick one of
  //    the screening options, and the resume path has no options to pick. See
  //    `messageForFailure` in `@/lib/validators/onboarding-flow`.
  "screening.failure.notConfigured.enroll":
    "The study is closed at the moment. Nothing was saved, and you were not signed up.",
  "screening.failure.notConfigured.resume":
    "The study is closed at the moment, so the saved identity could not be checked. Nothing " +
    "changed.",
  "screening.failure.invalid.enroll":
    "That answer did not go through, and nothing was saved. Please pick one of the options.",
  "screening.failure.invalid.resume":
    "We could not check the saved identity, and nothing changed. Try again in a moment.",
  "screening.failure.persistence.enroll":
    "Signing you up did not finish. Nothing was saved. Try again in a moment.",
  "screening.failure.persistence.resume":
    "The saved identity did not check out just now, and nothing changed. Try again in a moment.",

  // -- Confirmation route (direct visits only; the normal flow no longer passes through) --
  // Doubles as the page title. The document title and the heading are the same approved string,
  // so they are one key rather than two that could drift.
  "ready.title": "Before you begin",
  "ready.lead":
    "We collected nothing identifying, and there is no account to manage. Here is what happens " +
    "when you start.",
  "ready.starting.label": "What happens when you start",
  "ready.starting.item1":
    "You get a random code, saved to the database. It is not derived from anything about you.",
  "ready.starting.item2":
    "Only this browser keeps a copy of that code, so it still recognises you when you come " +
    "back.",
  "ready.starting.item3":
    "Your Ilocano answer stays with your validator identity as background information. If this " +
    "browser already held an identity, the answer stored with it is the one that stands.",
  "ready.notStarted.label": "If you have not started yet",
  "ready.notStarted.body":
    "Landing here does not mean you answered the Ilocano question. Only that question creates " +
    "your validator identity, and there is no way to make one from this page.",
  "ready.notStarted.cta": "Go to the Ilocano question",
  "ready.next.label": "What happens next",
  "ready.next.body1":
    "You get Ilocano navigation sentences one at a time, in the order the study chose, and each " +
    "one is judged on its own. Coming back to this browser will not replace your screening " +
    "answer.",
  "ready.next.body2":
    "Each finished sentence is saved straight away, so you can stop at any point without losing " +
    "what you have done, and come back later from this same browser.",
  "ready.begin.label": "Start now",
  "ready.begin.body": "Ask for your sentences. The study chooses which ones you get, and how many.",
  "ready.begin.cta": "Start validating",
  "ready.stop.label": "If you want to stop",
  "ready.stop.body":
    "Clearing this browser's site data removes the code that links you to your validator " +
    "identity. Because the code is the only link, that is permanent: you would begin again as a " +
    "new anonymous validator, and your earlier answers would remain in the research record under " +
    "the old identity.",
  "ready.meta.description":
    "What happens when you start validating, and what gets kept. Your sentences come next.",

  // -- Not found ------------------------------------------------------------
  "notFound.title": "This page isn’t here.",
  "notFound.body":
    "The address may have changed, or the link may be incomplete. Nothing you submitted is " +
    "affected.",
  "notFound.cta": "Go back to the start",
  "notFound.meta.title": "Page not found",

  // -- Starting a batch -----------------------------------------------------
  // The orchestration screen reached after screening. The batch is requested
  // from the server rather than linked to, because a batch id does not exist until the server has
  // chosen one.
  "validateStart.meta.title": "Start validating",
  "validateStart.lead":
    "You will get a set of Ilocano navigation sentences, one at a time, in the order the study " +
    "chose.",
  "validateStart.begin": "Give me my sentences",
  "validateStart.working": "Preparing your sentences…",
  "validateStart.working.ariaLabel": "Preparing your sentences",
  "validateStart.noIdentity":
    "This browser holds no saved validator identity, so there is nothing to attach a batch to. " +
    "Answer the Ilocano question first.",
  "validateStart.noIdentity.cta": "Go to the Ilocano question",
  "validateStart.exhausted":
    "Every sentence available to this validator has already been answered by the required number of " +
    "people. Thank you. There is nothing more to do right now.",
  "validateStart.failure.notConfigured":
    "The study is closed at the moment, and no batch was created.",
  "validateStart.failure.invalid":
    "We could not recognise this browser as a validator, and no batch was created. Answer the " +
    "Ilocano question first.",
  "validateStart.failure.persistence":
    "Your sentences did not come through just now, and no batch was created. Try again in a moment.",
  "validateStart.screeningRequired":
    "This attempt was created before the Ilocano question became required, so it cannot receive " +
    "sentences. Start a new attempt to answer it. Nothing you have already submitted is affected.",
  "validateStart.restart": "Start a new attempt",

  // -- Interrupted batches need no offer copy ------------------------------------
  // The orchestration navigates straight to a recognised interrupted batch, so
  // there is no offer card and no resume sentence. The offer SHAPE (three
  // fields, both languages, identifier only) is still decided in
  // `decideRecovery` and still tested there; only the presentation is gone.

  // -- The validation session ------------------------------------------------
  // Doubles as the document title. Every string on this route is chrome: the sentence itself is
  // research material and is rendered from storage, never from here.
  "validate.meta.title": "Validating",
  "validate.meta.description":
    "One Ilocano navigation sentence at a time. Your judgment, any correction, and your " +
    "translations are saved as you go.",
  "validate.entry.label": "The sentence",
  "validate.entry.instructionLabel": "Ilocano sentence",

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
    "Pick the closest fit. A correction is only asked for on the second or third option, and " +
    "translations on anything but the last.",
  "validation.correction.label": "Corrected Ilocano sentence",
  "validation.correction.description":
    "Write it the way you would actually say it. It sits beside the original sentence, which " +
    "never changes.",
  "validation.translation.english": TRANSLATION_FIELD_LABELS.english.label,
  "validation.translation.english.description":
    "Put the validated Ilocano sentence into English: your correction if you wrote one, " +
    "otherwise the sentence above.",
  "validation.translation.filipino": TRANSLATION_FIELD_LABELS.filipino.label,
  "validation.translation.filipino.description":
    "Isalin sa Filipino ang validated na pangungusap: ang iyong correction kung may isinulat ka, " +
    "kundi ang pangungusap sa itaas.",
  "validation.translation.choice.legend": "Would you like to translate this sentence?",
  "validation.translation.choice.hint": "One language, both, or skip. Skipping costs you nothing.",
  "validation.translation.choice.english": "English",
  "validation.translation.choice.filipino": "Filipino",
  "validation.translation.choice.both": "Both",
  "validation.translation.choice.skip": "Skip translation",
  "validation.translation.choice.required": "Say whether you will translate, or skip.",
  "validation.submit": "Save and continue",
  "validation.submitting": "Saving…",
  "validation.failure.invalid":
    "That answer did not go through, and nothing was saved. Check the highlighted inputs.",
  "validation.failure.notConfigured": "The study is closed at the moment, and nothing was saved.",
  "validation.failure.persistence":
    "That answer wouldn't save. Nothing was saved, so nothing is lost. Try again in a " + "moment.",

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
    "You've answered every sentence in this batch. Each one was saved as you went.",
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
  // the reading that something was closed, and the sentence rules that out — nothing is written and
  // nothing is reverted. It used to end "and you can still come back another time", which under
  // session-scoped attempts is the one clause that became FALSE: coming back is not a continuation,
  // it is a new screened attempt. What replaces it says what finishing actually ends — this attempt,
  // in this browser session — and that taking part again means starting one.
  //
  // It says NOTHING about how many batches a participant ought to do, which the localization
  // requirement forbids implying, and it promises no resumption, which would be promising a stored
  // identity this platform deliberately no longer keeps.
  "validate.finished.finish": "Finish for now",
  "validate.finished.finishNote":
    "Stopping here changes nothing you have already submitted. It ends this attempt in this browser " +
    "session. To take part again, start a new one.",
  // The exhausted pool, in this screen's own words. `validateStart.exhausted` cannot be reused here:
  // it says every available sentence "has already been answered by the required number of people",
  // which is COVERAGE vocabulary, and this screen also shows a lifetime figure that is deliberately
  // not a coverage figure (`design.md` D2). Reusing the key would also have hidden the string from
  // the `validate.finished.*` copy guard, which is scoped by namespace. The reassurance is kept
  // because it is true and because it is the thing a participant who pressed the button needs to hear.
  "validate.finished.exhausted":
    "There is nothing left for you to answer right now. Everything you already submitted is " +
    "unchanged. Thank you.",
  // Three failure sentences, and `not_configured` is distinct because "come back later" is true
  // there while "try again" would be a lie — retrying cannot succeed until somebody deploys. Each
  // says no batch was created, so a participant who pressed the button knows what did and did not
  // happen.
  "validate.finished.failure.notConfigured":
    "The study is not open right now, and no new batch was created.",
  "validate.finished.failure.invalid":
    "We could not recognise this browser as a validator, so no new batch was created. Answer " +
    "the Ilocano question first.",
  "validate.finished.failure.persistence":
    "Your next batch did not come through just now, and none was created. Everything you " +
    "already submitted is unchanged.",
  "validate.finished.failure.screeningRequired":
    "This attempt was created before the Ilocano question became required, so it cannot take " +
    "another batch. Finish here, then start a new one. Nothing you already submitted is " +
    "affected.",
  "validate.absent.label": "We could not find that batch",
  "validate.absent.body":
    "The address may be incomplete, or the batch may belong to a different browser. Nothing " +
    "you submitted is affected.",
  "validate.absent.cta": "Start a new batch",
  "validate.failed.label": "We could not read your batch",
  "validate.failed.body": "Nothing changed and nothing was lost. Try again in a moment.",
  "validate.failed.invalid": "That link did not name a sentence position, so nothing was read.",
  "validate.failed.persistence": "Your sentences did not come through just now.",
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
  "landing.hero.title1": "Suriin ang Ilocano.",
  "landing.hero.title2": "Ayusin ang mali.",
  "landing.hero.lead":
    "Ang Sadino ay thesis dataset para sa lokal na nabigasyon sa Ilocano. Ito ay isinulat ng " +
    "isang makina. Ikaw ang bahagi ng proseso na nagiging maaasahan ito: binabasa mo ang isang " +
    "pangungusap, sinusuri mo kung tamang ang sinasabi nito, at kaayusan mo ito kapag hindi.",
  "landing.cta.start": "Simulan ang pagpapatunay",
  "landing.cta.continue": "Magpatuloy sa pagpapatunay",
  "landing.expectations.heading": "Ano ang inaasahan",
  "landing.panel.task.label": "Ang gawain",
  "landing.panel.task.title": "Sampung pangungusap sa isang beses",
  "landing.panel.task.body":
    "Makikita mo ang isang maikling tagubilin sa Ilocano kasama ang lugar na tinutukoy nito. " +
    "Ikaw ang magpapasya kung tama ang sinasabi ng pangungusap, at aayusin mo ito kapag hindi.",
  "landing.panel.ask.label": "Ang hinihingi",
  "landing.panel.ask.title": "Isang tanong tungkol sa iyo",
  "landing.panel.ask.body":
    "Tatanungin namin kung gaano ka komportable sa Ilocano. Background lang iyan para sa " +
    "research record. Hindi ito iskor, at hindi nito babaguhin ang ipapagawa sa iyo.",
  "landing.panel.keep.label": "Ano ang itinatago namin",
  "landing.panel.keep.title": "Ang iyong paghatol, hindi ang iyong pagkakakilanlan",
  "landing.panel.keep.body":
    "Itinatago namin ang entry, ang hatol mo, mga pagwawasto mo, at mga pagsasalin. Hindi " +
    "namin hihingin kailanman ang pangalan, email, student number, o telepono mo.",

  // -- Landing action, scoped to ONE browser session -------------------------------------
  // Tulad ng Ingles: isang button, walang card, session ang tinutukoy.
  // The press-time outcome messages are the only sentences this island renders besides the button.
  "resume.checking": "Sinusuri…",
  "resume.unknown":
    "Hindi na namin kinikilala ang naka-save na pagkakakilanlan, kaya binura na namin ito. " +
    "Pindutin ang Simulan ang pagpapatunay para magsimula ulit bilang bagong anonymous na " +
    "validator.",

  // -- Screening route ------------------------------------------------------
  "start.lead":
    "Isang tanong tungkol sa iyong Ilocano. Ito ay impormasyong panlikod para sa talaan ng " +
    "pananaliksik. Hindi ito iskor, at hindi nito binabago ang hinihingi sa iyo. Kailangan " +
    "mong sagutin ito para magpatuloy.",
  "start.beforeAnswer.label": "Bago ka sumagot",
  "start.beforeAnswer.item1":
    "Boluntary ang pakikilahok. Maaari kang tumigil anumang oras, kahit sa screen na ito, at " +
    "isara ang tab. Walang nase-save maliban kung pindutin mo ang Magpatuloy.",
  "start.beforeAnswer.item2":
    "Hindi namin itatanong ang iyong pangalan, email, numero ng estudyante, o numero ng telepono, " +
    "at walang anumang field sa alinmang screen kung saan mo ito maaaring ilagay.",
  "start.beforeAnswer.item3":
    "Random code ang iyong pagkakakilanlan. May kopyang nananatili sa browser na ito para sa " +
    "session na ito, kaya tuloy ka lang kung mag-reload o mag-navigate ka; kasama ng mga sagot " +
    "mo ang code sa database ng pag-aaral, kung saan hindi ka pa rin matutunton. Kapag binura " +
    "mo ang datos ng browser, hindi ka na namin makikilala.",
  "start.meta.title": "Pagsusuri",
  "start.meta.description":
    "Isang tanong tungkol sa Ilocano mo, at walang kinokolektang tungkol sa iyo. Walang " +
    "pangalan, walang email, walang account.",

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
  "screening.resumed": "Itutuloy ang validator na hawak na ng browser na ito.",

  // -- Failure copy. Per subject as well as per reason: see the English block for why.
  "screening.failure.notConfigured.enroll":
    "Sarado ang pag-aaral sa ngayon. Walang nase-save, at hindi ka na-sign up.",
  "screening.failure.notConfigured.resume":
    "Sarado ang pag-aaral sa ngayon, kaya hindi ma-check ang naka-save na pagkakakilanlan. " +
    "Walang nagbago.",
  "screening.failure.invalid.enroll":
    "Hindi umubra ang sagot na iyon, at walang nase-save. Pumili ka ng isa sa mga pagpipilian.",
  "screening.failure.invalid.resume":
    "Hindi ma-check ang naka-save na pagkakakilanlan, at walang nagbago. Subukan mong muli " +
    "maya-maya.",
  "screening.failure.persistence.enroll":
    "Hindi natapos ang pag-sign up sa iyo. Walang nase-save. Subukan mong muli maya-maya.",
  "screening.failure.persistence.resume":
    "Bigo ang pag-check sa naka-save na pagkakakilanlan, at walang nagbago. Subukan mong muli " +
    "maya-maya.",

  // -- Confirmation route (direct visits only; the normal flow no longer passes through) --
  "ready.title": "Bago ka magsimula",
  "ready.lead":
    "Wala kaming nakolektang pagkakakilanlan, at walang account na aalagaan. Ito ang mangyayari " +
    "kapag nagsimula ka.",
  "ready.starting.label": "Ang mangyayari kapag nagsimula ka",
  "ready.starting.item1":
    "Makakakuha ka ng random na code, naka-save sa database. Hindi ito hinango mula sa anumang " +
    "bagay tungkol sa iyo.",
  "ready.starting.item2":
    "Tanging ang browser na ito ang may kopya ng code na iyon, kaya kikilalanin ka pa rin nito " +
    "kapag bumalik ka.",
  "ready.starting.item3":
    "Nananatili kasama ng pagkakakilanlan mo bilang validator ang sagot mo sa Ilocano bilang " +
    "background. Kung may hawak nang pagkakakilanlan ang browser na ito, ang sagot na nauna " +
    "nang naka-save ang mananatili.",
  "ready.notStarted.label": "Kung hindi ka pa nagsimula",
  "ready.notStarted.body":
    "Ang pagpunta rito ay hindi ibig sabihing sinagot mo ang tanong sa Ilocano. Ang tanong na " +
    "iyon lang ang lumilikha ng pagkakakilanlan mo bilang validator. Walang paraan para " +
    "gumawa nito mula sa pahinang ito.",
  "ready.notStarted.cta": "Pumunta sa tanong ng Ilocano",
  "ready.next.label": "Ang susunod",
  "ready.next.body1":
    "Makakakuha ka ng mga pangungusap sa Ilocano nang isa-isa, ayon sa ayos ng pag-aaral, at " +
    "bawat isa'y huhusgahan nang sarili. Ang pagbabalik sa browser na ito ay hindi magpapalit " +
    "sa sagot mo sa screening.",
  "ready.next.body2":
    "Nase-save agad ang bawat tapos na pangungusap, kaya puwede kang huminto anumang oras nang " +
    "hindi nawawala ang natapos mo na, at bumalik mamaya sa browser ding ito.",
  "ready.begin.label": "Magsimula na",
  "ready.begin.body":
    "Humingi ka ng mga pangungusap mo. Pinipili ng pag-aaral kung alin ang mapupunta sa iyo " +
    "at ilan.",
  "ready.begin.cta": "Magsimula ng pagpapatunay",
  "ready.stop.label": "Kung gusto mong tumigil",
  "ready.stop.body":
    "Ang pag-clear ng site data sa browser na ito ay nag-aalis ng code na nag-uugnay sa iyo " +
    "sa pagkakakilanlan mo bilang validator. Dahil ang code lang ang ugnayan, permanente ito: " +
    "magsisimula kang muli bilang bagong anonymous na validator, at mananatili sa research " +
    "record ang mga nauna mong sagot sa ilalim ng lumang pagkakakilanlan.",
  "ready.meta.description":
    "Ang mangyayari kapag nagsimula kang mag-validate, at ano ang nananatili. Susunod na ang " +
    "mga pangungusap mo.",

  // -- Not found ------------------------------------------------------------
  "notFound.title": "Wala rito ang pahinang ito.",
  "notFound.body":
    "Maaaring nagbago ang address, o kulang ang link. Walang naaapektuhan sa mga ipinasa mo.",
  "notFound.cta": "Bumalik sa simula",
  "notFound.meta.title": "Hindi natagpuan ang pahina",

  // -- Simula ng batch -------------------------------------------------------
  // The `/ready` page's onward path. A batch id does not exist until the server has chosen one, so
  // the request is made from the participant's browser rather than linked to from `/ready`.
  "validateStart.meta.title": "Magsimula ng pagpapatunay",
  "validateStart.lead":
    "Makakakuha ka ng set ng mga pangungusap sa Ilocano, isa-isa, ayon sa ayos ng pag-aaral.",
  "validateStart.begin": "Bigyan ako ng mga pangungusap",
  "validateStart.working": "Inihahanda ang iyong mga pangungusap…",
  "validateStart.working.ariaLabel": "Inihahanda ang iyong mga pangungusap",
  "validateStart.noIdentity":
    "Walang naka-save na pagkakakilanlan ng validator sa browser na ito, kaya walang maa-attach " +
    "na batch. Sagutin muna ang tanong sa Ilocano.",
  "validateStart.noIdentity.cta": "Pumunta sa tanong tungkol sa Ilocano",
  "validateStart.exhausted":
    "Sagot na ng kinakailangang bilang ng tao ang bawat pangungusap na abot ng validator na ito. " +
    "Salamat. Wala nang kailangang gawin sa ngayon.",
  "validateStart.failure.notConfigured":
    "Sarado ang pag-aaral sa ngayon, at walang batch na nalikha.",
  "validateStart.failure.invalid":
    "Hindi namin makilala ang browser na ito bilang validator, at walang batch na nalikha. " +
    "Sagutin muna ang tanong sa Ilocano.",
  "validateStart.failure.persistence":
    "Hindi dumating ang mga pangungusap mo ngayon, at walang batch na nalikha. Subukan mong " +
    "muli maya-maya.",
  "validateStart.screeningRequired":
    "Nilikha ang pagsubok na ito bago naging required ang tanong sa Ilocano, kaya hindi ito " +
    "mabibigyan ng mga pangungusap. Magsimula ng bagong pagsubok para sagutin ito. Walang " +
    "naaapektuhan sa mga naipasa mo na.",
  "validateStart.restart": "Magsimula ng bagong pagsubok",

  // -- Hindi na kailangan ng teksto ng alok -------------------------------------------
  // Direktang nagna-navigate ang orchestration sa kinikilalang naputol na batch, kaya walang card
  // ng alok at walang pangungusap ng resume. Nananatili ang hugis ng alok sa `decideRecovery`;
  // ang presentasyon lang ang nawala.

  // -- Ang validation session ------------------------------------------------
  // Ang mismong pahina. Lahat ng string dito ay chrome: ang mismong pangungusap ay materyal ng
  // pananaliksik at hinahango mula sa storage, hindi mula rito.
  "validate.meta.title": "Pagpapatunay",
  "validate.meta.description":
    "Tig-iisang pangungusap sa Ilocano. Ang hatol mo, mga pagwawasto, at mga pagsasalin ay " +
    "nase-save habang ginagawa mo.",
  "validate.entry.label": "Ang pangungusap",
  "validate.entry.instructionLabel": "Pangungusap sa Ilocano",

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
    "Piliin ang pinakatamang akma. Hihingian ka lang ng pagwawasto sa ikalawa o ikatlong " +
    "opsyon, at ng mga pagsasalin sa lahat maliban sa huli.",
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
    "Isulat ito ayon sa aktwal mong pagsasalita. Nananatili ito sa tabi ng orihinal, na hindi " +
    "kailanman nagbabago.",
  "validation.translation.english": "Pagsasalin sa Ingles",
  "validation.translation.english.description":
    "Ilagay sa Ingles ang validated na Ilocano: ang pagwawasto mo kung may isinulat ka, kundi " +
    "ang pangungusap sa itaas.",
  "validation.translation.filipino": "Pagsasalin sa Filipino",
  "validation.translation.filipino.description":
    "Isalin sa Filipino ang validated na pangungusap: ang iyong pagwawasto kung may isinulat ka, " +
    "kundi ang pangungusap sa ibabaw.",
  "validation.translation.choice.legend": "Gusto mo bang isalin ang pangungusap na ito?",
  "validation.translation.choice.hint":
    "Isang wika, pareho, o laktawan. Walang mawawala sa iyo ang paglaktaw.",
  "validation.translation.choice.english": "Ingles",
  "validation.translation.choice.filipino": "Filipino",
  "validation.translation.choice.both": "Pareho",
  "validation.translation.choice.skip": "Laktawan ang pagsasalin",
  "validation.translation.choice.required": "Sabihin kung magsasalin ka o lalaktawan.",
  "validation.submit": "I-save at magpatuloy",
  "validation.submitting": "Ini-save…",
  "validation.failure.invalid":
    "Hindi umubra ang sagot na iyon, at walang nase-save. Pakitsek ang mga naka-highlight na " +
    "input.",
  "validation.failure.notConfigured": "Sarado ang pag-aaral sa ngayon, at walang nase-save.",
  "validation.failure.persistence":
    "Ayaw ma-save ang sagot na iyon. Walang nase-save, kaya walang nawala. Subukan mong " +
    "muli maya-maya.",

  // -- Mga kalagayan ng session -------------------------------------------------
  "validate.finished.label": "Tapos na ang batch na ito",
  // The retired sentence, gone here for the same reason and with the same constraint as in the
  // English catalog: it told the validator that asking for another batch was unavailable, which the
  // change removes. Nothing replaces it that promises a further batch either, and that is still the
  // right call now that the continue control EXISTS — the pool is not unlimited, so an open-ended
  // offer in prose is a claim the server cannot keep. The offer lives on the control's own label.
  "validate.finished.body":
    "Sinagot mo na ang lahat ng pangungusap sa batch na ito. Naka-save ang bawat isa habang " +
    "ginagawa mo.",
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
  // ang tanawin — walang isinusulat, walang ibinabalik. Ang dating huling pangungusap ("puwede ka pa
  // ring bumalik sa ibang pagkakataon") ang unang naging MALI, dahil sa session-scoped na attempt hindi
  // na pagpapatuloy ang pagbalik kundi bagong pagsubok. Ang pumalit sa lugar nito ay sinasabi kung ano
  // talaga ang tinatapos: ang pagsubok na ito, sa browser session na ito.
  //
  // Walang sinasabi tungkol sa ilang batch ang dapat ang kalahok, at iyon ang ipinagbabawal ng
  // kinakailangan sa lokalisasyon.
  "validate.finished.finish": "Tapusin na muna",
  "validate.finished.finishNote":
    "Walang binabago sa ipinasa mo kung tatapusin mo na dito. Tinatapos nito ang pagsubok na ito sa " +
    "browser session na ito. Para makilahok muli, magsimula ng bago.",
  // Ang naubos na pool, sa sariling salita ng screen na ito. Hindi maaaring gamitin ang
  // `validateStart.exhausted`: sinasabi nito na "sagot na ng kinakailangang bilang ng tao" ang bawat
  // pangungusap, at iyon ay salitang COVERAGE — samantalang ang lifetime figure sa screen na ito ay
  // sinadayang HINDI coverage figure (`design.md` D2). Kung muling gamitin ang key, nasa ilalim
  // ng `validate.finished.*` copy guard ang string, at hindi nito kailanman makikita iyon.
  "validate.finished.exhausted":
    "Wala nang masasagot para sa iyo ngayon. Walang nagbago sa lahat ng ipinasa mo na. " +
    "Salamat.",
  // Tatlong pangungusap ng pagkabigo, at `not_configured` ay hiwalay dahil doon totoo ang
  // "balikan later" samantalang ang "subukan muli" ay pagkakaisa — hindi maaaring magtagumpay ang
  // pagsubok hanggang may mag-deploy. Sasabihin ng bawat isa na walang batch na nalikha, para alam
  // ng kalahok kung ano at hindi nangyari.
  "validate.finished.failure.notConfigured":
    "Bukas pa ang pag-aaral, at walang bagong batch na nalikha.",
  "validate.finished.failure.invalid":
    "Hindi namin makilala ang browser na ito bilang validator, kaya walang bagong batch na " +
    "nalikha. Sagutin muna ang tanong sa Ilocano.",
  "validate.finished.failure.persistence":
    "Hindi maihanda ang susunod na batch mo ngayon, at wala ring nalikha. Walang nagbago sa " +
    "lahat ng ipinasa mo.",
  "validate.finished.failure.screeningRequired":
    "Nilikha ang pagsubok na ito bago naging required ang tanong sa Ilocano, kaya hindi ito " +
    "mabibigyan ng panibagong batch. Tapusin dito, pagkatapos ay magsimula ng bagong " +
    "pagsubok. Walang naaapektuhan sa naipasa mo na.",
  "validate.absent.label": "Hindi namin mahanap ang batch na iyon",
  "validate.absent.body":
    "Maaaring kulang ang address, o ang batch ay sa ibang browser. Walang naaapektuhan sa mga " +
    "ipinasa mo.",
  "validate.absent.cta": "Magsimula ng bagong batch",
  "validate.failed.label": "Hindi namin mabasa ang iyong batch",
  "validate.failed.body": "Walang nagbago at walang nawala. Subukan mong muli maya-maya.",
  "validate.failed.invalid": "Walang posisyon ng pangungusap ang link na iyon, kaya walang binasa.",
  "validate.failed.persistence": "Ayaw mag-load ang mga pangungusap mo ngayon.",
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
