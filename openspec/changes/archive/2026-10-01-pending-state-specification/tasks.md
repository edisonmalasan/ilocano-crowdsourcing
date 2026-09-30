# Tasks

## 1. Establish the gap is real, before writing anything that closes it

The gap is inherited from `thin-shell-call-sites`, where it was found by re-deriving an enumeration
rather than by reading the specs once. It must therefore be re-derived here independently, because
the predecessor's own supporting figure did not reproduce.

- [x] 1.1 Re-derive the "no requirement mandates an inert control during a write" claim from
      `openspec/specs/` alone, and record the count reached. **Verify:** every requirement
      block and every scenario across all nine specs is enumerated, and the scenarios mandating
      an inert control during a write are listed by capability and scenario name. A count of 0
      is the expected result; any non-zero count is a finding that contradicts the proposal and
      must be reported rather than written around.
> **Evidence.** Re-derived from all nine in-force specs by enumerating 50 requirement blocks and 181
> scenarios, cross-checked against an independent recount (50 / 181, agreeing). **0 of 181
> scenarios** pair an inert-control notion with a write in progress. The predicate was proved
> able to match by running it against a synthetic scenario that plainly satisfies it, because
> a 0 from a predicate that cannot match is indistinguishable from a 0 that means something.
> The three requirements whose text carries any of the vocabulary are named individually
> rather than counted, because two definitions of the phrase produce two different sets of 3 —
> see design.md D4.
- [x] 1.2 Re-derive the `/ready` claim the same way, and record the count of specs naming the
      route. **Verify:** the nine specs are searched for `/ready` and the result is listed per
      spec. Expected 0 of 9.
> **Evidence.** **0 of 9 specs** name `/ready`. The check used `\/ready\b`, and the difference from a loose
> substring was measured rather than assumed: `ready` appears **13** times across the specs,
> all 13 inside other words such as *already*, so a substring check would have reported 13 and
> implied the route was specified 13 times. The word boundary is what makes the count mean
> what it claims.
- [x] 1.3 Confirm the predecessor's unreproducible `15` figure stays unreproducible, so this change
      does not silently re-import it. **Verify:** at least two independent definitions of
      "requirement block" are tried against the specs and neither yields 15. Record both
      counts.
> **Evidence.** Six definitions tried, measured against all 50 blocks: pending-state vocabulary in
> name-or-text **3**, in text **3**, disabled-word **1**, disabled-word AND write-word **0**,
> pending vocabulary in name alone **0**, scenarios mentioning a pending word **2**. **Highest
> reached: 3. `15` does not reproduce under any of them.** Members of the set of 3 are
> `domain-contracts` *dataset is not mutated*, `interface-localization` *English by default*,
> `validator-onboarding` *the onboarding sequence*.

## 2. Write the `design-system` delta

- [x] 2.1 Add the pending-state requirement to
      `openspec/changes/pending-state-specification/specs/design-system/spec.md`, scoped to the
      control that **initiated** the action, with controls made inert alongside it required
      only to be inert and to change appearance uniformly. **Verify:** the requirement states
      both halves, and the scope matches design.md D1. The first draft of this delta said "an
      interactive control whose action has been accepted" without distinguishing the initiating
      control, which the screening choices violate because they change no text; that defect
      must not reappear.
> **Evidence.** The requirement states both halves: the initiating control is inert, reports its in-progress
> status and swaps its label; controls made inert alongside it are required only to be inert
> and to change appearance uniformly. The first draft said "an interactive control whose
> action has been accepted and has not yet completed" with no such split, and was **violated
> literally by the screening choices** — `AnswerGroup` receives `disabled={isPending}`, so
> they dim, change no text and carry no `aria-busy`, because they start no action. The defect
> was found by reading `answer-option.tsx` and `onboarding-flow.ts`, not by re-reading the
> draft.
- [x] 2.2 Write the scenarios, each naming an existing binding, and **state on the face of the
      delta that "pending is distinguishable from unavailable" is currently vacuous.**
      **Verify:** every scenario has implementation evidence — `disabled={isPending}`,
      `disabled:opacity-50`, `t("screening.submitting")`, `aria-busy={submitState.ariaBusy}` —
      and the vacuity note is present so no future reader cites that scenario as coverage.
> **Evidence.** All 7 scenarios matched to existing bindings: `disabled={isPending}` (1, screening-form),
> `disabled:opacity-50` (1, answer-option), `t("screening.submitting")` (1, onboarding-flow),
> `label: isPending ? t("screening.submitting")` (1, onboarding-flow), `transition-[transform`
> (1, answer-option). **12 of 13 scenario/evidence pairs LOCATED, 0 UNBACKED.** The vacuity
> note is present in the delta itself, not only in this file, so a reader who never opens this
> task list still sees it.

## 3. Write the `validator-onboarding` delta

- [x] 3.1 Add the single-flight requirement, naming the decline affordance explicitly, and the
      `/ready` destination with what it must not render. **Verify:** the requirement text
      covers *both* submit affordances and both completion paths, and the block quote recording
      that `/ready` appears in 0 of 9 specs is present.
> **Evidence.** The requirement text names **both** submit affordances — submit and decline — and states
> that the decline is a write and not merely a cancellation, which is why it is covered. Both
> completion paths are named, and `/ready` is specified to confirm without rendering
> identifier, proficiency, timestamp or counter. The block quote recording `/ready` in 0 of 9
> specs is present.
- [x] 3.2 Write the scenarios and check each against the implementation. **Verify:**
      `disabled={submitState.disabled}` occurs on both buttons, `router.push("/ready")` occurs
      in both components, and `/ready/page.tsx` documents that it renders no identifier,
      proficiency, counter, or timestamp.
> **Evidence.** 5 scenarios checked against the implementation: `disabled={submitState.disabled}` occurs
> **2** times in `screening-form.tsx` — once per button, which is what makes the "both
> affordances" claim measured rather than asserted; `router.push("/ready")` occurs once in
> each of `screening-form.tsx` and `resume-validator.tsx`; `src/app/ready/page.tsx` documents
> that it renders no identifier, proficiency, counter or timestamp. **0 UNBACKED.**

## 4. Verify the change is a specification change and nothing more

This change claims it edits no source. That claim is checkable from the diff, and a claim about the
diff that is not checked is the defect this repository has already made three times.

- [x] 4.1 Assert the diff touches no runtime or test path. **Verify:** `git diff main --numstat --
      src/ tests/ supabase/` is **empty**. A non-empty result means the change is not what it
      claims and the deltas must be re-read against the code.
> **Evidence.** `git diff main --numstat -- src/ tests/ supabase/` is **empty**, run on the branch against
> updated `main`. The change adds exactly six files, all under
> `openspec/changes/pending-state-specification/`: `.openspec.yaml`, `proposal.md`,
> `design.md`, `tasks.md`, and two delta specs. This is the check that makes the change a
> specification change rather than a behaviour change wearing its name.
- [x] 4.2 Re-read both deltas against their implementations line by line, as a check that no
      scenario is a wish. **Verify:** each scenario is matched to a specific existing binding,
      and each binding is confirmed to occur where expected. **Do not point a probe at a file
      the behaviour is not in** — the label swap lives in `onboarding-flow.ts` and the key in
      the copy catalog, never in `screening-form.tsx`, and a probe pointed at the component
      reports a satisfied scenario as `UNBACKED`, which is indistinguishable from a spec that
      wishes for something unimplemented.
> **Evidence.** Each of the 13 scenario/cross-check rows was matched to a specific binding and the
> occurrence count recorded. **The probe itself was wrong twice and both were fixed rather
> than reported as findings.** First, it left each requirement block's body empty, so six C3
> definitions returned 0 and printed "highest reached: 2" — the recurring defect in its purest
> form, a guard that cannot read the value it guards. It now asserts `blocks with an EMPTY
> body: 0` before counting. Second, it reported two satisfied scenarios as UNBACKED for
> pointing at `screening-form.tsx` when the label swap lives in `onboarding-flow.ts`; an
> UNBACKED verdict is indistinguishable from a spec that wishes for something unimplemented.
- [x] 4.3 Confirm `skip_specs` is **not** set and the deltas are additive, so the change is not
      misfiled as a no-delta change. **Verify:** `.openspec.yaml` carries no `skip_specs:
      true`, and `openspec change validate pending-state-specification --strict` exits 0.
> **Evidence.** `.openspec.yaml` carries `schema: spec-driven` and `created: 2026-10-01` and **no
> `skip_specs`**, confirmed by reading the file rather than by assuming the absence. `openspec
> change validate pending-state-specification --strict` exits **0** with `Change
> "pending-state-specification" is valid`, and `openspec status --change
> pending-state-specification --json` reports `isPlanningComplete: true`, `isComplete: true`.
- [x] 4.4 Run the full gate. **Verify:** `lint`, `format:check`, `typecheck`, `openspec validate
      --specs --strict`, `test:unit` (33 files / 897 tests), `test:dom` (3 files / 15 tests),
      `test:integration` (6 files / 100 tests), the dataset guard **scoped** to 1 file / 7
      tests by the literal command, and `build` all exit 0 — with every figure read out of a
      named step's own summary line rather than inferred from an exit code.
> **Evidence.** Ten gate steps, every exit code 0, and every figure read out of a **named step's own summary
> line** by a reader that refuses rather than reports a partial answer: lint 0, format:check
> 0, typecheck 0, `openspec validate --specs --strict` 0, `openspec validate --changes
> --strict` 0, **test:unit 33 files / 897 tests**, **test:dom 3 files / 15 tests**,
> **test:integration 6 files / 100 tests**, the dataset guard **scoped to 1 file / 7 tests by
> the literal command and verified distinct from the whole suite**, build 0. The trailer's own
> `10 steps, 0 failed` was cross-checked against the 10 parsed blocks rather than trusted.
> Dataset hashed directly: `39f757e61b70386b87ec1bb9410e881df342027bf580bed9c2f9beeb2f2e8965`,
> unchanged.

## 5. Record the boundaries

- [x] 5.1 Update `docs/ROADMAP.md` `## Project Status` at archive time: the change is archived, the
      next objective is **Phase 5 `validation-experience`**, and the spec gap recorded in
      `Active Blockers` is closed **for the onboarding flow only**. **Verify:** the blocker entry is
      amended rather than deleted, so the parts that remain open stay visible.
> **Evidence.** Recorded at Apply, with the archive-time remainder named rather than assumed. The
> `## Project Status` table now reports `Current OpenSpec change` as `applying`
> `pending-state-specification` on `test/pending-state-specification-apply`, `Lifecycle state` as 11
> of 17 boxes plus the re-derived gap (181 scenarios, 50 requirement blocks, 0 mandating an inert
> control, `/ready` in 0 of 9 specs, the `15` unreproducible and its correction's *membership*
> wrong), and `Next eligible objective` as Sync, then Archive, then Phase 5. **The `Active Blockers`
> entry was amended, not deleted**: the spec-gap bullet keeps its `0 of 181 scenarios` finding, gains
> the membership correction with both vocabularies set out as a table, and gains a sub-bullet stating
> that the blocker **stays open until Sync lands**, because the deltas sit in
> `openspec/changes/pending-state-specification/specs/` and not yet in `openspec/specs/`.
> `git diff --numstat -- docs/ROADMAP.md` is **70 insertions / 22 deletions**; the ledger table is 10
> lines of uniform 3 pipes; the archive table is 8 data rows against 8 directories in
> `openspec/changes/archive/`, compared after stripping each directory's date prefix; and all 7 tables
> in the file are rectangular. **Still owed by the Archive stage:** the `Archived Changes` row, and
> flipping the blocker to closed-for-the-onboarding-flow-only.
- [x] 5.2 Record what this change did **not** close, in both the ledger and this change's archived
      artifacts: `RV-4` still has only a source-scan guard; the `Archived Changes` table still has no
      automated guard; server-side idempotency is out of scope per design.md D2; and **no browser has
      ever rendered any screen in this project**, so nothing here is visual verification.
      **Verify:** each of the four appears in the archived record, and none is stated as resolved.
> **Evidence.** All four are present in **both** halves, and the check is a presence check *and* an
> absence check, because a presence assertion on the string `RV-4` passes just as happily against
> "RV-4 is now fixed" — the wording itself has to be constrained. Six presence assertions pass and
> four forbidden-wording assertions all return no match (an item "resolved", the ledger "guarded",
> server-side idempotency "delivered", a browser having "rendered"). Locations, re-derived rather
> than assumed: `RV-4` at `proposal.md` and `design.md`; the un-guarded `Archived Changes` table at
> `proposal.md` and `design.md`; server-side idempotency rejected as out of scope at `design.md` D2,
> **re-read in full** because it needs a migration and a schema decision this change may not touch;
> and the visual-verification admission at `proposal.md` under *What this change does not establish*.
> **A search for `browser|visual` reported that last one absent, and it was wrong** — the artifact
> says "no *human* has ever rendered any screen", so the pattern could not find the sentence it was
> looking for. A term that cannot match the text produces a confident wrong "it is missing", which is
> the same shape as the unreproducible `15` and the wrong membership set this change exists to
> correct. The ledger half is a new sub-bullet under the spec-gap bullet listing all four.
- [x] 5.3 Confirm the vacuous scenario is carried forward as a known gap rather than allowed to look
      like coverage. **Verify:** `docs/ROADMAP.md` records that
      "pending is distinguishable from unavailable" becomes observable only in Phase 5.
> **Evidence.** Recorded in the ledger as its own sub-bullet, and the ledger states the *claim*
> rather than paraphrasing it, because a paraphrase is where a vacuous scenario starts looking like
> coverage. "Pending is distinguishable from unavailable" **cannot fail** today: no control in `src/`
> is disabled for unavailability as opposed to in-flight work, so there is no second control to
> confuse pending with, the scenario has no pair of controls, and it is not evidence that the
> requirement is implemented. The ledger says it becomes observable when a control is disabled for
> being *unavailable* rather than busy, which is expected in Phase 5 when a validation control is
> gated on a required correction — **marked expected rather than designed, and deliberately not
> scheduled here** — and that until then it is a specified promise with no test behind it. The delta
> in `specs/design-system/spec.md` already carried this on its own face under a block quote headed
> *"must not be cited as existing coverage"*, so the ledger **agrees with** the delta rather than
> correcting it; that is the outcome worth having, and it is the reason the ledger entry was written
> to match the delta's reasoning rather than to improve on it.

## 6. Sync and archive

- [x] 6.1 Sync the two deltas into `openspec/specs/`. **Verify:** `openspec validate --specs --strict`
      exits 0 and the item count rises from **9 to 9** — two ADDED requirements inside two existing
      capabilities, so the capability count must **not** change. A count that rises to 11 means a new
      capability was created, which the proposal explicitly rejects.
> **Evidence.** Done on `docs/pending-state-specification-spec-sync`. `openspec validate --specs
> --strict` exits **0** with `Totals: 9 passed, 0 failed (9 items)`. The item count is **9 → 9**: two
> ADDED requirements inside two existing capabilities, `design-system` and `validator-onboarding`, and
> **no new capability directory exists** — checked by listing `openspec/specs/` rather than by
> subtracting counts, since a count cannot name what it contains. Merged **verbatim**, agent-driven
> per the sync workflow, appended at the end of each `## Requirements` section; no ordering was
> invented, because neither spec states one. **A pre-merge measurement decided the block quote's
> fate:** all **47** block-quote lines in the entire in-force spec set sit INSIDE `## Requirements`
> sections, in these same three capabilities, as notes of exactly this genre ("**Amended during
> Apply.**", "**Scoped during Apply, because the original was not executable.**"). So the delta's
> quotes were kept — **28** and **13** lines, none lost — and had the convention been the other way,
> tidying the quotes out would have deleted the sentence stating that one of the new scenarios
> **must not be cited as existing coverage**, which is the sentence this ledger now depends on. **A
> merge that improves a document's shape by discarding its caveats is not a merge.** I had drafted the
> opposite plan before measuring it; the measurement is what settled it.
- [x] 6.2 Re-read both synced requirements in `openspec/specs/` and confirm they match the approved
      delta bodies. **Verify:** requirement and scenario counts per capability are recorded before and
      after the sync — `design-system` 5 → 6 requirements, `validator-onboarding` 7 → 8 — and every
      other capability is unchanged.
> **Evidence.** Recorded **before and after**, because "the counts rose correctly" is compatible with
> a sync that also reworded a neighbouring requirement, so a baseline captured afterwards would
> establish nothing. Every requirement block and every scenario was hashed in both states, keyed by
> heading:
> `design-system` **5 → 6** requirements and **13 → 20** scenarios; `validator-onboarding`
> **7 → 8** and **24 → 29**. Totals reconcile exactly: **50 + 2 = 52** requirements,
> **181 + 12 = 193** scenarios, the 12 being the two deltas' own scenario counts (7 and 5).
> **The other seven spec files are byte-identical** to their pre-Sync state, and inside the two that
> changed, **0 pre-existing requirements altered, 0 lost, 0 scenarios altered, 0 lost.**
>
> **The gap claims were re-run after the sync and came back CONTRADICTED — 5 of 193, and `/ready` 7
> times — which is the expected direction.** A verifier still reporting 0 after the change that
> exists to close the gap would be broken, so that exit code is not a regression. But "expected" is
> not "verified", so the load-bearing question was asked instead: **does every match live inside the
> newly added requirement?** All **5** inert-during-a-write scenarios and all **7** `/ready` mentions
> were required to fall inside an added block, and **0 fall outside**. Had any sat in a pre-existing
> requirement, the "0 of 181" would have described a state that never existed.
>
> **A defect in this verification is worth recording, because it is the exact error this change
> exists to correct.** The differential verifier restated the gap predicate as THREE terms
> (`INERT && IN-FLIGHT && WRITE`) when the real one is TWO (`INERT && WRITE`), whose `WRITE` term
> *already contains* the in-flight words. The stricter question returned **4** instead of **5**,
> dropping "Pending is distinguishable from unavailable". It was caught only because
> `verify-spec-gap-claims.mjs` independently returned 5 and **the disagreement was treated as the
> finding** rather than resolved by preferring one number. **Guessing a predicate from its prose is not
> a shortcut around restating it — it is a way of inventing a different predicate while appearing to
> check the same one.** Two further defects in the same round: a reserved word (`const in = ...`) made
> the reconciler fail to parse, and the nested vocabulary table in the ledger was flush-left, so the
> splice would have promoted it to a document-level table. The parse failure is why `node --check` is
> run before any verdict from a probe is believed — `DID-NOT-PARSE` is not a count of 4.
- [x] 6.3 Archive the change and update the ledger. **Verify:** `openspec archive
      pending-state-specification --yes` exits 0 with `Task status: Complete`, the directory is at
      `openspec/changes/archive/2026-10-01-pending-state-specification/`, and the `Archived Changes`
      table lists **9** changes — **manually, with the absence of an automated guard stated**, since
      `grep -r ROADMAP tests/` returns no matches and that absence must not be papered over with a
      sentence that sounds like one.
> **Evidence.** The `Archived Changes` table gains its **ninth** row. Building an automated
> ledger-consistency guard is **deliberately not done here**: it introduces a test class this project
> has never had, and a change must not be broadened because a related opportunity turned up. Recorded
> as a known gap, for a change that wants it.
>
> **The guard's absence was re-derived, and doing so nearly produced a false correction — which is
> worth recording because the ledger was right and I was the instrument.** The ledger states that
> `grep -r ROADMAP tests/` returns no matches. I re-ran the check and got **four** files, so I was one
> step from filing a correction saying the ledger's cited evidence is false. It is not: PowerShell's
> `Select-String` is **case-insensitive by default**, and those four files are the English word
> "roadmap" in prose comments. The cited `grep` is **case-sensitive** and returns **0** — confirmed
> with `-CaseSensitive`, and confirmed the harder way by searching all **107** files in `tests/`,
> `src/`, `.github/` and `supabase/` for `ROADMAP.md`, for the archive table's header, for the
> ledger's section heading, and for any read of a `docs/` path: **0 each**. The claim holds, so the
> ledger is **unchanged**. This is the recorded `git show | node -e` and `U+2026` lesson arriving a
> third time in a fourth command: **judge a run by the bytes, not by what a PowerShell pipeline
> printed.** The measurement also self-tests in three halves — a control token that must match, an
> absent token that must not, and a check that what the reporter **prints** agrees with what it
> **computes**, which is the only component in this round that had never been measured. That last
> check earned itself: a `+` binding tighter than `>` made both self-tests print `false` while the
> script exited 0, and the first version of the fix compared a count to a boolean and so cried wolf
> on correct input. **A self-test that is always red is as useless as one that is always green.**
>
> **A second stale figure was found in the very table being edited, and repaired rather than added
> beside.** The `thin-shell-call-sites` row's *Merged as* cell still read **"Archive in flight in this
> PR, so no archive merge commit is named"** — written when that stage had not yet merged. It merged as
> PR #35, `80a8dba`, taken from `git log --merges` rather than memory. A known-stale enumeration inside
> a file you are editing is the defect, not a historical record, and this stage's whole subject is
> figures that read as current after they stopped being true.
>
> **The `openspec archive` exit code and destination path are NOT claimed here, on purpose.** This
> file is frozen into `openspec/changes/archive/` at the moment the command runs, so an evidence
> block written before it cannot state a result measured after it without the archived copy asserting
> something unmeasured — the same class of error as a count read off after the change it measures. Those
> two facts are verified immediately after the command and recorded in `docs/ROADMAP.md`, which is
> live rather than frozen and can therefore hold them honestly.
>
> **One risk was guarded before running it.** `openspec archive` is documented as archiving a change
> *and updating the main specs*, and the two deltas are **already** synced. A re-application would
> duplicate both requirements silently, and the total would read a plausible 54 rather than an
> obviously wrong one. So the **post-Sync** state was frozen first (9 capabilities, 52 requirements,
> 193 scenarios, per-block hashes) and the spec files are re-hashed **after** the command; a
> re-application is then a difference with a byte count rather than a suspicion.