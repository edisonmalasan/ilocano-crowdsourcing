/**
 * The weakest mutation of every guard in the two pre-existing textual test files.
 *
 * =============================================================================================
 * WHY THIS IS A TABLE AND NOT 63 INLINE COMMENTS
 * =============================================================================================
 * Task 3.6 asked for each guard's weakest mutation "as a comment". The table is the same content,
 * and it is better in three ways that matter here — but the deviation is deliberate and is recorded
 * as such in `tasks.md` rather than slipped in:
 *
 *   1. It is REVIEWABLE. Sixty-three scattered comments cannot be read as a set; a table can, and
 *      the reader can see at a glance that the twelve markup assertions all share one honest limit
 *      and that the one genuinely weak family is the source-text scans.
 *   2. It is CHECKABLE, which comments are not. `tests/unit/guard-weakness-audit.test.ts` asserts
 *      every `it(` in these files has an entry here, that no entry names a test that no longer
 *      exists, and that no two entries are byte-identical. The last of those is the point: a
 *      table filled with sixty-three copies of "weak" satisfies a count check, and this is the
 *      check that refuses it.
 *   3. These files ALREADY document their historical defect in prose — several at length, and
 *      several recording the exact mutation that once left the suite green. What they lack is the
 *      RESIDUAL limit: the mutation that still passes TODAY, after those fixes. That is different
 *      content, not a restatement, and it is what this table adds.
 *
 * =============================================================================================
 * WHAT EVERY ENTRY IS
 * =============================================================================================
 * A mutation that this guard does NOT catch. Not the defect it was written for — the file
 * comments cover that, and in most cases at greater length. An entry that merely repeats the
 * historical defect would be the decoration this repository has found six of.
 *
 * Entries are keyed `describe path > it name`, not by `it` name alone, because
 * `onboarding-routes.test.tsx` contains THREE tests named "has exactly one h1" and two named
 * "declares real route metadata rather than a placeholder". Keying by name would make coverage
 * ambiguous — and an audit that cannot say which test it cleared is not an audit. The audit test
 * asserts that this parse is self-consistent rather than trusting it.
 */

/** The audited files. The `dom` files are audited too; they carry inline `WEAKNESS:` comments. */
export const AUDITED_FILES = [
  "tests/unit/screening-form-wiring.test.ts",
  "tests/unit/onboarding-routes.test.tsx",
  "tests/dom/screening-form.test.tsx",
  "tests/dom/resume-validator.test.tsx",
] as const;

export const GUARD_WEAKNESS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "tests/unit/screening-form-wiring.test.ts": {
    "the screening form passes the participant's answer to the decision > does not hand `decideResume` a literal null":
      "`decideResume(result, answer ?? null)` — the regex requires `null` to be the LITERAL second argument, so any expression evaluating to null passes and the answer is still discarded.",
    "the screening form passes the participant's answer to the decision > passes the submit argument through to `decideResume`":
      "`enroll(answer ?? undefined)` — the assertion reads the token `answer` at argument position 1 of the FIRST `decideResume` call only, so a second call site, or a coerced value spelled `answer`, passes.",
    "the screening form passes the participant's answer to the decision > enrolls with the same answer on the stale-identifier fallback":
      "`await enroll(answer ?? null)` — matches both `/enroll\\(\\s*null\\s*\\)/`'s absence and `/await enroll\\(answer\\)/`, while silently discarding the answer on exactly the path this exists to protect.",
    "the screening form awaits every write > contains no fire-and-forget enrollment":
      "a bare floating `enroll(answer);` statement — only the `void` keyword is forbidden, so the unawaited call this test is named for survives without it.",
    "the screening form awaits every write > has no unawaited call to either Server Action":
      "`const p = enrollValidatorAction(x); await p;` routed through an intermediate binding — neither the forbidden `void ` prefix nor the required `await enrollValidatorAction(` literal is present.",
    "the screening form awaits every write > routes the whole flow through a single submit function":
      "a second write path that calls a DIFFERENT function (a repository write, or a newly added Server Action) — the count is one per known name, so an unlisted writer is invisible.",
    "the server still has no access to browser storage > the screening form does not reach `globalThis` or a storage key directly":
      "storing the identifier in `indexedDB` or a `document.cookie` — the guard forbids three literal names and proves nothing about any other storage API.",
    "the server still has no access to browser storage > persists the minted identifier, and does so only from a real one":
      "`writeStoredValidatorId(decision.validatorId);` moved into a helper that is never invoked — the whole-statement match is satisfied by text that never executes, and this is the one guard here whose subject is a research-data write.",
    "the server still has no access to browser storage > the resume component does not reach `globalThis` either":
      "`window.localStorage` — only the literal `globalThis.` is forbidden in this component, so the same class of access it is guarding against is reachable by another route.",
    "the resume path performs no write, anywhere > the restored branch of the action core returns only, and creates nothing":
      "the slice runs from the restored marker to END OF FILE, so it is simultaneously too broad — any later action's legitimate write fails it for the wrong reason — and blind to whether the marker is genuinely inside the restored branch.",
    "the resume path performs no write, anywhere > a restored validator is applied and the function returns, never enrolling again":
      "an early return extracted into a helper, or moved past the 200-character window — the window is a magic number, so a correct refactor fails it and a correct-looking reorganization can escape it.",
    "the resume path performs no write, anywhere > the whole resume action touches the repository read-only":
      "a repository method named `.insert(`, `.save(`, or `.patch(` — the forbidden set is four exact names, so renaming a writer closes this guard without changing behaviour.",
    "the skip control records a decline and never a fabricated answer > the skip control calls the decline path, and no approved level appears near it":
      "`run(levels[0])` with `levels` imported from another module — the check is that no approved level appears as a string LITERAL in this file, so a fabricated level arriving by import is invisible.",
    "a rejected submission reaches the field > the error state is forwarded to the control, not just held in state":
      "`error={error}` on a control that never renders it — the regex proves the value reached SOME JSX attribute, not that it is rendered or announced.",
    "the resume component's promises are backed by its calls > clears the stale identifier unconditionally on the path that claims it did":
      "`clearStoredValidatorId();` inside a nested function that is never called, or the message moved beyond the 120-character window — both satisfy the whole-statement match and the adjacency check respectively.",
    "the resume component's promises are backed by its calls > reports a failed resume rather than swallowing it":
      "`setMessage(decision.message)` followed later by `setMessage(null)` — the pattern proves the call exists somewhere, not that the failure is what the participant finally sees. THIS IS ALSO THE ONE SITE WITH NO BEHAVIOURAL GUARD; see tasks 3.6/3.7.",
    "the resume component never enrolls > does not import the enrollment action at all":
      "importing the enrollment action under an alias, or through a barrel module that re-exports it — the guard matches one identifier, not the dependency.",
    "the resume component never enrolls > passes null as the answer, because that route collects none":
      "a second `decideResume` call in the same component passing a non-null answer — only the FIRST call is inspected, so a second enrolment-capable path passes.",
  },

  "tests/unit/onboarding-routes.test.tsx": {
    "the internal route inventory this suite relies on > found the routes it expects, so a wrong directory fails loudly instead of vacuously":
      "an app directory containing ONLY `/start` and `/ready` — `arrayContaining` proves two names are present and asserts no count, so an over-narrow read passes.",
    "the screening answer cannot be fabricated at the answer control > accepts each of the five approved proficiencies":
      "adding an UNAPPROVED sixth value to `ILOCANO_PROFICIENCY_CHOICES` — the array under test is the input to its own approval check, so widening the vocabulary passes.",
    "the screening answer cannot be fabricated at the answer control > rejects anything that is not one of them, rather than narrowing it":
      "any fabricated value outside the ten hand-written cases — including a future sixth level, or `Native` with different casing or whitespace — is untested by construction.",
    "the screening answer cannot be fabricated at the answer control > is what the screening form actually calls, so the cast is gone from the file":
      "a COMMENT naming `toIlocanoProficiency(value)` — this read does NOT go through `code()`, unlike every other source assertion in the sibling file, so prose satisfies it.",
    "landing route > hands off to the screening route with a real link":
      "the `href` appearing inside a hidden or `aria-hidden` element, or in markup that never becomes visible — `toContain` proves presence, not reachability.",
    "landing route > no longer says the study is not open":
      "a reworded equivalent such as “not yet available” — exactly two phrasings are forbidden.",
    "landing route > has exactly one h1":
      "a second `h1` rendered only after hydration — `renderToStaticMarkup` sees one server pass, so any client-inserted heading is invisible to this count.",
    "landing route > offers a resume path for a returning participant":
      "the resume control being present in markup but wired to nothing — copy text only. The wiring is now observed separately in `tests/dom/resume-validator.test.tsx`.",
    "landing route > keeps the introduction copy from the shell phase":
      "legitimate rewording of the introduction — two literal substrings, so a copy improvement fails for a purely cosmetic reason.",
    "screening route > has exactly one h1 and a distinct page title":
      "a page title identical to `/ready`'s — despite the test's name, ONLY the `h1` count is asserted. Distinctness is claimed and not tested.",
    "screening route > declares real route metadata rather than a placeholder":
      "a metadata description that is long, non-placeholder, and still wrong — the guard checks shape and length, never agreement with the page body.",
    "screening route > does not promise sentences that /ready says are not switched on yet":
      "a reworded promise such as “you will soon be checking sentences” — three forbidden phrasings, none of them a shape.",
    "screening route > asks the approved question verbatim":
      "the question appearing in a comment, a hidden element, or a `title` attribute — `toContain` over raw markup does not distinguish visible text from any other occurrence.",
    "screening route > shows the approved supporting copy":
      "the supporting copy appearing in a `title` attribute, a comment, or an element hidden from view — `toContain` over raw markup cannot tell rendered text from any other occurrence, so a participant never sees it and the guard is still green.",
    "screening route > states the voluntary-participation notice on the same screen as the question":
      "the notice sitting BELOW the submit control — that ordering is a separate test, so this one passing says nothing about position on its own.",
    "screening route > states that no identifying information is collected":
      "the page ALSO asking for a postal address in different words — one specific sentence is required and nothing else is forbidden.",
    "screening route > does not claim the code exists only in the browser, because it does not":
      "a third sentence on the same subject contradicting both required ones — one phrase is forbidden and two are required, which is not the same as consistency.",
    "screening route > places every notice statement ABOVE the first submit control":
      "a notice inside a later DOM subtree that happens to appear earlier in the serialized string — offsets in markup are not offsets in the accessibility tree.",
    "screening form neutrality > renders every unselected option with the exact frozen unselected class":
      "adding an accent token to `answerOptionClasses` itself — the rendered markup is compared to the SAME constant the component uses, so the two change together and this stays green. Comparing a function to itself is the defect this file's own header names.",
    "screening form neutrality > gives no unselected screening option an accent surface":
      "a static nudge smuggled in under a `hover:`/`focus-visible:`/`group-` prefixed token — those are stripped before the weight check, so they are never inspected.",
    "screening form neutrality > raises the resting weight only after selection":
      "any change in how the two class constants are COMPOSED rather than what they contain — a pure-function comparison that never renders markup.",
    "screening form neutrality > renders exactly the five approved choices, in the approved order":
      "a label that also appears in the page's prose before the group — `indexOf` finds the first occurrence anywhere in the document, so ordering can be satisfied by unrelated copy.",
    "screening form neutrality > adds no hint to any screening option":
      "a hint worded “Most people choose this” — four literal strings, none of them a shape.",
    "screening form neutrality > labels the group with the approved question, for assistive technology":
      "an empty or wrong `aria-labelledby` alongside a correct `aria-label` — only one of the two labelling mechanisms is inspected, and precedence goes to the one not checked.",
    "screening form neutrality > offers an explicit way to continue without answering":
      "the control being present but calling the enrolment path instead of the decline — copy only; the decline behaviour is asserted in the sibling wiring file.",
    "screening form neutrality > tells the participant an existing identity will be resumed, not duplicated":
      "the guarantee being false — this asserts two sentences exist, which is the opposite of the attestation test on `/ready` and is knowingly weaker.",
    "the submit control while a Server Action is in flight > disables and marks the control busy while pending":
      "the control NOT BINDING this value — `submitControlState` is pure, so `submitState.disabled` could have been replaced with a literal `false` and every test here stays green. That was site SF-2, measured unguarded and closed by `tests/dom`.",
    "the submit control while a Server Action is in flight > leaves the control enabled and ready when idle":
      "the same unobserved binding — a control hardcoded to `disabled={false}` passes this and the one above it in reverse.",
    "the submit control while a Server Action is in flight > never reports the control as idle while a write is in flight":
      "the same — it restates a property of the pure function and observes no control at all.",
    "the submit control while a Server Action is in flight > omits aria-busy entirely when idle, rather than setting it false":
      "the `Button` component dropping the prop — a bare `<div>` is rendered here, so the real control's forwarding of `ariaBusy` is never exercised.",
    "the answer control in a pending or errored state > disables every option while pending, so the answer cannot change mid-write":
      "the call site not passing `disabled` at all — `AnswerGroup` is rendered directly with the prop, so the screening form's binding (site SF-1) was invisible here and is now covered in `tests/dom`.",
    "the answer control in a pending or errored state > keeps the unselected class while disabled, so a disabled option is not restyled":
      "a restyle applied through the disabled class token — the comparison is again to the same constant the component uses, so widening that constant keeps it green.",
    "the answer control in a pending or errored state > announces an error assertively, marks the group invalid, and wires the description":
      'the error being rendered but never re-announced when it CHANGES — `role="alert"` is asserted in one static render, and no live-region update is observed.',
    "the answer control in a pending or errored state > renders no alert at all when there is no error":
      "a component that rendered an alert whenever `disabled` was set — the no-error render here passes `disabled` as false only by omission, never as an explicit `disabled={false}`.",
    "the answer control in a pending or errored state > marks exactly the selected option, and no other":
      "the selected option being additionally distinguished by a non-class attribute — the guard counts class-string equality and nothing else.",
    "confirmation route > has exactly one h1":
      "a second `h1` rendered only after hydration, or one inside an `aria-hidden` subtree that still counts toward the match.",
    "confirmation route > declares real route metadata rather than a placeholder":
      "a metadata description that is long, non-placeholder, and contradicts the page body — and it is never compared for distinctness against `/start`'s.",
    "confirmation route > attests to nothing that has not happened":
      "a NEW over-confident sentence not on the nine forbidden list — the failure mode this test exists for is a page that is slightly too confident and reads perfectly well, so an unlisted instance passes.",
    "confirmation route > states that nothing identifying was collected":
      "the page collecting something identifying in different words — one required sentence, no forbidden set.",
    "confirmation route > says plainly that receiving sentences is not switched on yet":
      "the reassurance being removed and reworded rather than deleted — two required phrases, so only their total absence fails.",
    "confirmation route > does not promise the screening question will not be asked again, because it can be":
      "a reworded version of the same false promise — two forbidden phrasings, none of them a shape.",
    "confirmation route > promises the one thing that is actually guaranteed about a return visit":
      "the promise being kept in copy but broken in behaviour — a textual claim about an invariant this suite never executes. The behaviour is asserted nowhere on this route.",
    "confirmation route > describes the screening answer in a way that is true on every path here":
      "a FOURTH clause added to the same sentence that is false on the decline path — three required clauses are pinned and no clause count is asserted, so the sentence can grow back into a falsehood.",
    "confirmation route > links only to routes that exist, and offers a way in for someone who has not started":
      "a link to a route that EXISTS but is not a participant destination — `KNOWN_ROUTES` is directory-derived, so it answers “does this path exist”, never “should a participant go there”.",
    "confirmation route > does not display a validator identifier or a proficiency value":
      "a proficiency shown by its human label (“Fluent”) — the guard forbids two stored vocabulary strings and a hex identifier shape, and a readable level is the likelier leak.",
  },
};
