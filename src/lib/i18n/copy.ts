import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  type IlocanoProficiency,
} from "@/schemas/validator";

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
    "Receiving sentences is the next part of the study and is not switched on yet. When it is, a " +
    "browser that already answered the question is recognised as the same validator and is given " +
    "ten Ilocano navigation sentences to check. Coming back to this browser will not replace your " +
    "screening answer.",
  "ready.next.body2":
    "Until then, nothing is required of you. If you have already answered the Ilocano question in " +
    "this browser, closing this tab is a complete and legitimate way to finish.",
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
    "Ang pagtanggap ng mga pangungusap ay susunod na bahagi ng pag-aaral at hindi pa naka-on. " +
    "Kapag naganap na ito, kilalang muli bilang parehong validator ang browser na sumagot na sa " +
    "tanong, at bibigyan ito ng sampung pangungusap sa nabigasyong Ilocano na susuriin. Ang " +
    "pagbalik sa browser na ito ay hindi magpapalit sa iyong sagot sa pagsusuri.",
  "ready.next.body2":
    "Hanggang doon, walang kinakailangang gawin sa iyo. Kung sumagot ka na sa tanong ng Ilocano " +
    "sa browser na ito, ang pagtatapos ng browser na ito ay isang tunay at tanggap na paraan ng " +
    "pagtatapos.",
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
