# ROADMAP.md

# Sadino Crowdsourcing Validation Platform

## Project Status

> This block is a **progress ledger owned by the root orchestrator**, not a behavioral
> specification. `AGENTS.md` and `openspec/` remain the source of truth for rules and for
> specified behavior. Reconcile this block against Git, OpenSpec, and the repository before
> trusting it.

| Field | Value |
| --- | --- |
| Current roadmap phase |  **Phases 1-5 are CLOSED and ARCHIVED — eleven changes**, enumerated in `Completed milestones` below and readable on disk under `openspec/changes/archive/`. **Phase 6 — batch completion, continuation, and interrupted-batch handling — is IN PROGRESS, as two bounded slices:** `batch-completion` archived as **#46** (`c067cf7`), and `interrupted-batch-recovery` at its Propose stage. The first slice carried roadmap tasks 1-5; the second carries task 6, *restore interrupted active batches where practical*, and is the last outstanding task in the phase. |
| Current OpenSpec change |  **`interrupted-batch-recovery`** — roadmap **Phase 6, second bounded slice and its last task**, at its **Propose** stage on `docs/interrupted-batch-recovery-proposal`. Adds **one** capability, `batch-recovery`, and modifies **zero**: 7 requirements and 20 scenarios, every one ADDED, cross-checked by the OpenSpec CLI's own parse against the markdown source rather than counted once by one reader. An independent verification pass re-derived every factual claim in the proposal from source and found **five defects, all corrected before merge**; `tasks.md` section 0.5 records them one by one. Predecessor `batch-completion` archived as **#46** (`c067cf7`). |
| Lifecycle state |  `proposing` — **`interrupted-batch-recovery`**, roadmap **Phase 6 (second and final slice)**. Proposal artifacts written; `openspec change validate --strict` reports **valid**, and `openspec change show --json --deltas-only` parses the delta, which it could not do for `batch-completion`. The Apply has not begun. The framing that governs this change is recorded here because it is the line most likely to be misremembered: **this is not a data-loss fix.** Measured — `selectBatchEntries` excludes a candidate only when it is already **answered** or already covered, so an abandoned batch's unanswered entries stay allocatable to anyone, including the same validator. No coverage is destroyed by abandonment, and the answers already recorded cannot be re-asked, because `UNIQUE (validator_id, dataset_entry_id)` forbids it. What is lost is the participant's sense of continuity, and that is the whole of the case. Separately measured: `/validate/[batchId]` **already resumes**, since `resolveSessionEntry` returns the first unanswered placement when no position is requested, so this change is one discovery read plus one affordance and writes no resume logic. |
| Completed milestones | Repository + roadmap + synthetic dataset bootstrap (`main` @ `81b3115`); Project Status ledger + roadmap reference reconciliation (PR #1, `567ab42`); `project-foundation` proposal (PR #2, `f451a01`); `project-foundation` implementation, review, sync, archive (PR #4, `b2128a4`); line-ending fix (PR #5, `53754de`); `od-dataset-schema-and-import` proposal (PR #6, `f14c0bb`); `od-dataset-schema-and-import` implementation + verification repairs (PR #7, `d2eea22`); `od-dataset-schema-and-import` Sync + Archive (PR #8, `1ed3340`); roadmap ledger reconciliation (PR #9, `1736b0b`); ledger self-reference fix (PR #10, `3518514`); `landing-and-screening` proposal (PR #11, `d111a9d`); **`landing-and-screening` Apply (PR #12, `e1390ba`)**; `landing-and-screening` Sync + Archive (PR #13, `411e18f`); bilingual requirements into this roadmap (PR #14, `523cfd0`); bilingual proposal (PR #15, `d4c40cd`); status reconciliation (PR #16, `0c042ed`); bilingual requirements into `AGENTS.md` `AGENTS.md` durable rules); `required-bilingual-translations` proposal (PR #15, `d4c40cd`), implementation (PR #18, `438b691`), spec sync (PR #19, `aaa8810`) and archive (PR #20, `76fd7a3`); `coverage-aware-allocation` proposal (PR #22, `d2fd596`), implementation (PR #23, `1134da9`), spec sync (PR #24, `304d450`) and archive (PR #25, `174fa2c`); `research-schema-guarantee-coverage` proposal (PR #26, `8ae4bc3`), spec sync (PR #27, `06dc92e`) and archive (PR #28, `5788383`); `interface-localization` proposal (PR #29, `50ff9eb`), implementation (PR #30, `2aaca46`), spec sync (PR #31, `f03bf65`) and archive (PR #32, `794aaf5`); **`thin-shell-call-sites` proposal (PR #33, `b5b59b2`), implementation (PR #34, `73ab777`) and archive (PR #35, `80a8dba`); `pending-state-specification` proposal (PR #36, `cb347cf`), implementation (PR #37, `bf76173`), spec sync (PR #38, `d3e1627`) and archive (PR #39, `ab1c7be`). **This row previously ended "archive in flight in this PR", which was written during the `thin-shell-call-sites` Archive and had still not been corrected two changes later** — a third instance of a forward-looking ledger figure outliving the stage that wrote it, the same defect the `Archived Changes` table carried |
| Last merged OpenSpec stage |  **#46 — `c067cf7` — `chore/archive-batch-completion`**, merged 2026-10-01: the Sync and Archive of `batch-completion`. Read back from `git`; `git log -1 --format=%p` reported **two parents**, `cb197fe a290817`, and `git merge-base --is-ancestor` reported it an **ancestor of `main`**. Stated plainly, as every stage's wording of this row is: it is **stale for the whole of its own stage by construction**, which is why it is re-derived from `git` each time rather than carried forward from the previous stage's number. |
| Doc-only PRs since that stage |  **None yet — #47, this Propose, becomes the first when it merges.** The count is stated separately from the enumeration, and the two are reconciled when it is known, because a count and a list that disagree are worse than either one alone. |
| Next eligible objective |  **Apply `interrupted-batch-recovery`** — then an independent verification pass, then Sync and Archive, each on its own branch cut from the updated `main`. The design's two open questions are carried into that Apply: whether `validation_batches.created_at` must match the existing application-written session timestamps, and whether the `(validator_id, created_at DESC, id DESC)` index can be justified on reasoning when no Supabase project exists on which to measure it. This row deliberately names **no branch**: the branch-existence check treats a live row naming a branch that does not exist as a stale reference, and an objective legitimately looks forward to one. |
| Blockers | **No Supabase project credentials** — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are all absent, so `getServerEnv()` throws on every real request and **no Supabase client has ever been constructed**. PostgREST wire behaviour, `code === "23505"`, and RLS as enforced by the Supabase API gateway are therefore unverified. **No browser has ever rendered any screen** — `happy-dom` is synthetic, so nothing in this repository counts as visual verification and a human still has to look at the pages. **CI integrity: four runs have reported `success` with steps absent from the step list**, on both jobs, including one where the dataset-guard job reported success having run only *Install pnpm*. `gh run rerun` fixed every instance and it has not recurred since, but **merge on the log, never on the checkmark.** **No failing CI run has ever been observed**, so "a failing test blocks the pull request" remains inferred from the required checks rather than demonstrated. **No `docker`, `psql`, or `supabase` CLI** locally. **Known pre-existing defect, out of scope:** `tests/integration/pglite-harness.test.ts` is order-dependent under `--sequence.shuffle` (4 of 11), confirmed untouched by `git diff`. **Found during the Sync stage, recorded not fixed:** `openspec/specs/research-schema/spec.md` contains **two different scenarios sharing the heading "The refusal is proven, not assumed"** (lines 252 and 344, unrelated bodies), so scenario headings are **not unique identifiers** in these specs; any tool keying on them must key by name **and** occurrence, or a change deleting one of the pair reads as no change at all. **The custom ESLint boundary rule is INERT on Windows for a component that omits its own `"use client"`
directive** — newly discovered by the Phase 5 verification pass on 2026-10-01, **pre-existing**, and
deliberately **not repaired** by the change that found it, because `AGENTS.md` puts CI/CD and security
tooling outside a change's scope. `eslint.config.mjs:74` gates on
`context.filename.includes("/components/")`, and on Windows `context.filename` is a native path with
backslashes, so the substring is absent and `isComponent` is false. Measured with five isolation cases:
a file under `src/components/` **with** `"use client"` fires the rule; the same path **without** the
directive does **not**; `src/lib/` and `src/app/` without the directive correctly do not fire. So a
presentation component that omits its own directive and imports a privileged module escapes the gate on
this platform, and a local `pnpm run lint` gives false assurance. **There is no live breach** —
`src/components/validation/entry-card.tsx` imports only `@/schemas/batch` — and **CI is not weakened**,
because `ubuntu-latest` reports forward-slash paths and the rule fires normally there.
`eslint.config.mjs` is **unchanged from `main`**. The repair is a path-separator-agnostic test on the
resolved path rather than the raw string, and it should be its own small change with its own probe
rather than a drive-by edit to a shared config file. **Read the `Verification project tools` claim that
the rule "accepts every file" as a statement about the files it was run over, never as proof that the
gate fires for a file not yet written on this platform** — which is the same
absence-is-invisible shape as the CI truncation recorded below.

**TWO INDEPENDENT VERIFICATION ROUNDS, and the second one found a vacuous test I had written one commit earlier.** The Phase 5 Apply stage went through two full independent verification passes before merge, and both returned work rather than approval — which is the first time this project has recorded that for a stage whose *behaviour* was sound throughout. The distinction matters: neither round found a product defect, and both found **ticked boxes that were not true as written**. That is the failure mode this ledger exists to prevent, and on this evidence it is the more common one.
The first pass returned **NO** with four findings, all re-derived and confirmed before any repair: a guard that enumerated rendered controls with a regex **demanding a closing tag** and so could never see a void `<input>`, while its own comment and `tasks.md` both named `input` as covered (**W1**); a tick asserting a stale `/ready` comment had been corrected when the tick's own author had only *quoted* it as false (**W2**); a `dom` test that proved a **dead export** correct — `resolveNextSessionEntry` had **zero** production callers, and one of its two importers was the test asserting that advancing works, so it demonstrated a function nobody used rather than the product (**W3**); and a **pre-existing** ESLint boundary-rule defect recorded rather than fixed (**W4**, below).
The repairs in `a0ca3f1` were then re-verified, and that pass returned **YES** for W1, W2 and W4 and YES for W3's substance, with **three** reservations. **One of them was a vacuous test, and it was the re-mount test `a0ca3f1` had just written to fix a vacuous guard of the same shape.** Its fixture marked positions 1, 2 and 3 complete over four placements, leaving **exactly one** remaining entry, so every requested position — `4`, `1`, and `999` alike — resolved to that same entry, and reading the position back out of the pushed URL was **decoration**: the test passed identically with the resolver ignoring its `requestedPosition` argument *and* identically with the form pushing `position + 2`. Two probes measured it (green before the fix, red after). The fixture now leaves **two** outstanding so the request genuinely chooses between them.
**The generalisation is the part worth keeping: a fixture that cannot discriminate is not a neutral choice — it converts an assertion into one that passes by construction, and it does so while looking like a thorough test.** This was the **third** instance in one session: the `interactiveControls` can-fire control, then that control's own first draft, then the re-mount test. And the comment added alongside it claimed it had *repaired* the re-mount's read, which was **false** for a reason worth stating separately: **a control in a different test with a different fixture cannot repair a fixture in another test.** Both comments now say what each test actually witnesses.
The second round also found a **production comment still naming the deleted export** as the mechanism that decides what comes next — the same defect class as **W2**, left standing in `src/` while the deletion was recorded in two other files. Fixing it in one place and not another is fixing the symptom. And a **newly reachable** assertion: the void-element repair meant a labelless `<input>` could now be enumerated at all, but the failure message was `expected false to be true`, naming neither the control nor the cause, so the next reader would have been looking at a skip-affordance guard while the real problem was a missing `aria-label`.
**A FOURTH defect was in my own probe harness, and it is the same one this file already records twice.** The repair harness reported two probes as `COLLECT-FAILED` — "1214 -> 1212 tests: FEWER than the control" — which reads as *the guards do not fire*. They do. It compared the **passed** count against the control's **passed** count and checked that drop **before** checking whether any test had failed, so a run with two failures (which reports `1212 passed`) was reclassified as a collection break. **A number compared against the wrong number is indistinguishable from a finding**, which is precisely the conflation the harness exists to prevent. The discriminator is the **total**, `passed + failed`, with failures checked first. A fifth probe was then **refused correctly**: its mutation did not type-check, so `tsc` exited 2 and the harness reported NOT-ATTRIBUTABLE rather than a red — again the recorded rule that a mutation which does not compile makes almost any assertion fail, and that `tsc` exits **2**, so the discriminator is never the exit code.
**Ten probes across the two rounds, all CONFIRMED, each with a negative control and a byte-identical restore, and each requiring `tsc --noEmit` green on the mutant before its verdict was believed.** One probe is recorded as a **LIMIT** rather than a pass, and it is a limit on this change's own new test: the route test witnesses the **progress line** but **not** `position={session.position}`, because a Server Component's props are not attributes in rendered HTML and the only other instrument is a source scan, which proves a string is present and never that the code behaves as the string suggests. Mutating that prop leaves the suite **green at 1214/1214**. Closing it properly needs a real server render plus a real navigation, which needs a browser and a Supabase project; **neither exists**.
**The Sync stage decided BOTH questions the Apply stage raised, and one of them turned out not to be a question.** The out-of-order advance — which `proposal.md` carried as an open question — is **already decided by the approved requirement**. It states that completing an entry advances the session "to the next entry in the order the server allocated", and the allocated order is `batch_entries.position`, so a validator who reaches position 7 with 1-6 unanswered is next shown position 8, which is what the implementation does. Two rules are satisfiable by both readings whenever a validator answers in order — the only way the session is meant to be driven — so the requirement *looked* like it did not decide the case. **It does**, and the deleted unit test had asserted the other rule all along. Sync therefore added **one scenario** making that explicit, flagged in-file so a reviewer can reject it, with the note that a reviewer who prefers the other rule must change the **implementation**, not just the scenario. It adds no rule: it states what the requirement already mandates. **No entry is lost either way** — once the requested position passes the end of the batch the session falls back to the first entry still needing an answer, so an earlier unanswered entry is never permanently skipped.
The `/ready` handoff question was decided the other way: **not specified, and not written.** `validation-experience` declares **zero modified capabilities**, and the handoff belongs to `validator-onboarding`; writing it would modify a capability this change does not touch. Writing it into the new capability instead would invert the layering, since the link lives in the onboarding page. So it stays a recorded gap with a test that asserts `/ready`'s internal hrefs against routes that exist, which is what keeps it from silently regressing. **This is a deliberate decision, not an omission**, and it is the only participant-visible behaviour in Phase 5 with no requirement behind it.
**THE SYNC TRANSFORM WAS DONE MECHANICALLY, and the faithfulness claim is scoped accordingly.** 229 lines were not retyped into `openspec/specs/validation-experience/spec.md`; a script derives it from the approved delta, and a line-level LCS diff attributes **every** differing hunk to a named edit — **4 hunks, 4 edits**: the header (`# Spec Delta` → `# … Specification`, `## ADDED Requirements` → `## Requirements`), the duplicated defer wording, and the added out-of-order scenario. The claim is **"the transform moved the approved delta's text intact"**, and it is explicitly **not** "no requirement was lost": the second only becomes true when the delta is compared against what the Propose review approved, which no instrument here can do. That is what Sync review is for, and it is why the diff prints hunks rather than one verdict — a verdict about a 200-line body is unfalsifiable by eye, a list of the four differing lines is checkable in a second.
**Two edits, both recorded in the transform.** The delta said the session *"SHALL NOT offer any control that skips, defers, or **defers-to-later**"* — "defers" and "defers-to-later" say the same thing twice, and the scenario directly below already reads "skips, defers, or **postpones**", so the fix restores the delta to its own intent and changes no rule. The second is the added scenario above.
**THE SYNC VERIFIER WAS WRONG TWICE BEFORE IT WAS RIGHT, and its first failure is the more instructive one.** It compared whole requirement bodies and reported *"differs but no edit accounts for it"* for a requirement that **is** accounted for: its normalisation knew how to undo one of the two recorded edits and not the other, so a **correct** transform produced a failing verdict. **A verifier that reports failure for correct work is worse than no verifier**, because it teaches the reader to ignore it — which is how the same class of defect survives a review. Its second failure was subtler and would have gone unnoticed: the uniqueness check printed **nothing**, because its pass/fail line was gated on `problems === 0` from the *earlier* checks. **A check that reports nothing when an unrelated check fails is a check with no result, and "no result" is read as "no problem."** Each check now reports independently. A third defect was an outright crash — a `push(kind, aLine, bLine)` signature called as `push("+", b[j])`, so every pure-insertion hunk carried `undefined` into the array and took out an edit-matching predicate. **An instrument that crashes on a real input is reporting that it cannot classify it**, not that the input is fine.
**THE PROJECT STATUS TABLE HAS BEEN TWO TABLES SINCE THIS SESSION'S OWN COMMIT `746da72`, and the Sync stage found it by nearly repeating it.** `746da72` appended a prose block at what it read as the end of this ledger. The ledger is not prose: it is a **markdown table**, and the `Blockers` row is a single row whose cell wraps across **17 unprefixed continuation lines**. Appending prose after the `Lifecycle state` row therefore inserted it **between two rows of the same table** — and a markdown table with a blank line in the middle is **two tables**, so every renderer and every reader has been seeing the status rows as two unrelated one-row blocks since that commit merged. The Sync stage was about to commit the identical mistake one block further down when it was caught. **A "progress ledger" whose rows silently render as two tables is not a ledger**, and it is worse than no ledger, because it still looks like one. This file's own standing rule applies with the force of a rule here: *a ledger row that is only narrowed when it becomes inconvenient is the same defect as a check whose absence is invisible* — and a ledger that does not render is the same defect one level up.

**Three instruments had to be wrong before the table was repaired, and each failed in the direction that looks like "the file is broken".**

The **repair script** first located the table's end by "the first blank line followed by another `| ` row" — which is **exactly the signature of the defect**, so it reproduced the break and correctly refused to write. **Detecting a structural fault by the same pattern that creates it cannot repair it**; the extent is now anchored on a **named** row, `| Blockers |`. It then asserted **7** rows and failed on **8**, because my count was wrong and not the file — so the assertion now names the exact ordered set of eight rather than counting, since a bare count accepts the right number in the wrong order. It also asserted "every line in the table starts with `|`", which is **false** for this table and was false before the repair: the true invariant is *no unprefixed line appears before the `Blockers` header*. **Asserting a stronger false invariant is how a correct repair gets reported as a broken one.** And it selected rows by `|`-prefix, which **silently dropped all 17 continuation lines of the `Blockers` cell** and moved them out of the ledger's most important row.

That last one is the reason the **verifier exists**. It compares the **multiset** of non-blank lines before against after — ordered comparison would be useless, since reordering is the whole point, and only a multiplicity check can fail. It reported **1679 lines before, 1662 after, with 17 distinct lines `had 1, now 0`** — content lost, not merely reordered — which is precisely the failure the prefix-based selection had hidden from the repair script's own summary output. After the fix: **1679 → 1679, 1447 distinct → 1447, every line present with identical multiplicity**, so the repair is a **pure permutation** of content plus blank-line collapsing. Ordered comparison would have called this file fine.

And the verifier was **proved capable of failing before it was trusted to pass** — twice, in both directions. Run against the **pre-repair** file (real data, genuinely broken) it exits **1** on the structural failures while still reporting the multiset check OK; that separation is the point, because *no content lost* and *the table is well-formed* are **independent** properties and a check that conflates them reports the reassuring one when the important one is false. And a copy with **one line deleted from the `Blockers` row** makes it report **`LOST 1 line(s)`**, naming the line. A guard that has only ever been seen to fire on the defect it was built for has not been shown to fire on loss.

**Two further instrument defects in this same stage, both of the family this ledger keeps re-recording.**

A dedupe helper was written as `const count = (n) => s.split(n).length - 1` and then called to check the **post-cut** text — a **closure over the file**, asked about a **derived value**. It therefore re-measured the pre-cut text, so the assertion could never pass, and it **refused a perfectly correct cut three times in a row**. What makes this worth recording is that it survived an exact-text cut, a positional cut, and three re-runs: the failure always looked like *"the cut is not working"*, and never like *"the count is not looking at the cut"*, because those two produce identical output. **A helper named for its subject being asked about a derivation will keep failing in the direction that looks like the other bug.** The fix was not a better algorithm but a rename — `occurrencesIn(text, n)` — which is the whole remedy: **make the wrong call impossible to write rather than trying to remember not to write it.**

And the content verifier reported added lines and lost lines under **one verdict**, *"content was lost or invented"*, so a run that **deliberately added five paragraphs** was indistinguishable from a run that **dropped five lines**. One of those is a defect and the other is the entire point, and no single verdict can say which. This is *"a number compared against the wrong number is indistinguishable from a finding"* one level up: **a verdict compared against the wrong claim is indistinguishable from a false alarm.** Lost content is now **fatal**; added content is **listed and must be acknowledged explicitly** on the command line, so adding to the ledger is a decision a person makes rather than something a tool permits silently. 
**The CI reader was also wrong FIVE times, and it refused rather than guessed on four of them.** Its first refusal — "no vitest summary found" — was **correct behaviour and the wrong reason**, which is the most dangerous combination this ledger records: a reader that cannot see is indistinguishable from a run that reported nothing. Diagnosing it took printing bytes rather than reasoning:

1. it assumed the job was named `verify` and detected it with a pattern ending `\s`, which can never match a line beginning `<job>\t` — the job is **`lint, types, and tests`**;
2. it modelled **three** vitest steps and the workflow has **four**, so `DOM tests` would have run unexamined — a summary in an unmodelled step is **silently ignored coverage**, which is worse than not running it, so the reader now **refuses** on one;
3. the timestamp field carries a **trailing space** before the content, so a prefix written `...Z\t` matched **0 of 682 lines**;
4. **26 U+FEFF BOM characters** are scattered through the log, one per step block — a **third** BOM source after PowerShell redirection and file writes — and the check that matters is not "was there a BOM" but **"did it cost any lines"**, measured by comparing prefixed lines against parsed lines (685 of 685);
5. the timestamp and content are separated by a **space, not a fourth tab**. **A regex that matches nothing does not look like a regex that matches nothing** — it looks like a run that reported nothing, which is the one distinction the reader exists to preserve.
The reader also required the dataset guard's output to carry a sha256, and **it never does**: `immutable-dataset.test.ts` *asserts* the hash and vitest prints only names and counts. That requirement could never be satisfied and **would have refused every healthy run** — a guard that cannot fire in the passing direction is as useless as one that cannot fire in the failing one. This is the **eleventh** time this session an expected value written down rather than measured failed against correct behaviour. What actually proves the scope is checked instead: the step's own **command** names `tests/integration/immutable-dataset.test.ts`, and it reports **`1` file** rather than the six-file integration project — which is precisely the recorded defect, where `pnpm run test:integration -- <path>` dropped the path filter on Linux and the job claiming to isolate one file ran the whole suite, green either way.
**The reader was proved capable of FAILING before it was trusted to pass.** Run `36814667839` reports VERIFIED with exit 0. Run `36809077114`'s predecessor `36809077172` — which genuinely had unit **1077** and DOM **39** — produces **exit 1** with eight problems, and it *refused to guess* when `gh` labelled steps `UNKNOWN STEP` rather than attributing summaries to a step it could not name. That is the recorded CI truncation incident, and the reader treats it as a refusal instead of a pass. |

**THE ARCHIVE ITSELF FAILED ITS OWN FIRST VERIFICATION TWICE, and both failures were in the measurement rather than the move.** The move itself is the least interesting part and was never in doubt: `openspec archive validation-experience --skip-specs -y` relocated the change to `openspec/changes/archive/2026-10-01-validation-experience/`, and `--skip-specs` is the correct flag **because Sync already put the delta in force** — without it the command would try to re-apply requirements that now exist, which is the `Archive would refuse this delta: … already exists` INFO recorded for every earlier archive. What needed proving was that relocating five files changed **nothing about their content**.

`git diff --cached --stat -M` reported **5 files changed, 0 insertions(+), 0 deletions(-)**, which reads as conclusive and was **not**. The per-file check written alongside it compared `git cat-file -p :<old-path>` against `git cat-file -p :<new-path>` — and by that moment `git add -A` had already staged the deletion, so the old paths no longer resolved in the index. **The check compared two empty strings for four of five files and reported `identical=False`, and for the fifth it reported `identical=True` because both sides were empty.** A `false` read as *the content changed* and a `true` read as *the content matched*, from the same instrument, on the same run, with neither meaning anything. **The one check that could distinguish the two outcomes could not fire, and the two that reported were reporting on nothing** — which is the recorded "a check that reports nothing is a check with no result, and no result reads as no problem", except here one of the no-results was `false` and therefore read as a *finding*. The working check compares `git rev-parse HEAD:<old>` against `git rev-parse :<new>`, which resolves against **two different trees**, so it survives staging: **five for five identical blob SHAs**, alongside the `0 insertions/0 deletions` rename detection. Neither check is sufficient alone — one proves the blob survived, the other proves the history records a move rather than a delete plus an unrelated add — and **a rename is a claim about two things at once**, so it takes two measurements, and the first pair of measurements this archive used could measure neither.

**A ledger of commit references is only as good as the resolver behind it, and this one had begun recording hashes that do not name anything.** The Phase 5 Sync merge was written as `524bbbcc`; the real abbreviation is `524bbbc`. One duplicated character, and the string is indistinguishable from a hash to every reader and to every tool that does not resolve it. The correction is worth more than the typo: the fixing script **refuses to write unless the replacement both resolves to an object and is an ancestor of `main`** — checked with `cat-file -t` and `merge-base --is-ancestor`, not by eye — so a corrected-*looking* string that names nothing cannot be reintroduced by the same careless mechanism. **A recorded SHA that does not name a commit is worse than no SHA**, because a reader who tries it and fails cannot distinguish a typo from a rewritten commit, and those two present identically. It was found only because the archive stage re-derived the figure from `git` instead of carrying the previous row's text forward — which is the argument for the "re-derive, do not inherit" rule being applied to *figures* and not only to *enumerations*.

And the obvious way to write that resolver failed in a way that pointed at the wrong thing: the natural "is this a commit?" check is `git rev-parse --verify <sha>^{commit}`, and it reported **`524bbbc does not resolve to a commit`** — a claim about a SHA that had been read out of `git log` moments earlier. The peel was silently mangled because the script spawns with `shell: true`, and on Windows that means **`cmd.exe`, in which `^` is the escape character**, so `^{commit}` arrived at git as an escaped `{`. The instrument wrote a confident false statement about the repository, and only the underlying git error (`Needed a single revision`) distinguished "the instrument is broken" from "the thing I am checking is broken". The peel is now expressed as two ordinary commands. **An instrument written the obvious way can fail in a way that looks exactly like its subject failing**, and this repository has now recorded that shape in a reader, in a harness, and in a resolver.

**And the content verifier's third conflation — *replacement* reported as *loss* — was found, characterised, and closed inside this same stage rather than deferred to another change.** The Sync stage left it open and recorded here as a known false alarm: a ledger row that is **corrected in place** is the normal way this file is maintained, and the verifier reports every such row as a lost line. At Archive the ledger rewrites **six** rows in one sitting, and it duly reported **LOST 6** — six false alarms, all of them correct work. A check that cries wolf on the ordinary workflow does not get weaker; it gets ignored, and then it catches nothing.

**And the instrument was wrong once more on its first use in a new stage, producing a reading that would have been reported as catastrophe.** Building the Phase 6 baseline, `git show main:docs/ROADMAP.md > "$env:TEMP/…/ROADMAP.main.md"` wrote the file as **UTF-16LE with a BOM** — the PowerShell `>` redirection defect this file records twice already — and the verifier, which reads text, then reported **`non-blank lines: 2205 -> 1695`** and **`LOST 1470 line(s)`**, naming the entire previous ledger as deleted. Every one of those 1470 was present. In UTF-16LE each line ends in a `NUL`, which `trim()` does not remove, so all 2205 baseline "lines" were distinct strings and none matched. **A false positive of this size is more dangerous than a false negative**, because it is not something a reader would dismiss: it reads as the ledger having been destroyed, and the correct response to that reading is to abandon the change. The baseline is now produced by `git cat-file -p` through Node with no shell in the path — **bytes in, bytes out** — and reads `1695 -> 1695`, `LOST 0`, `REPLACED 4`. This is the third distinct instrument in this repository to be defeated by an encoding the tool between it and the bytes could change silently, and the generalisation is the one already written twice: **read bytes with `node`, never with a shell pipeline.** What is new here is not the lesson but the magnitude — the earlier instances produced *a missing match*, and this one produced *a fabricated loss affecting every line in the file*.

**And an expected value written into a row before it was measured was wrong again, in the exact way this file has already recorded most often.** Correcting `AGENTS.md`'s three stale test rows required saying *how* many places `tests/unit` is mentioned, so the claim that no test counts the `unit` project could be supported by a number rather than by an assertion of absence. The first draft wrote **"29 places"**. I had **not measured it** — I counted the lines of a previous grep's terminal output by eye, in a scrollback, which is the weakest possible instrument and the one this repository has been caught by repeatedly. The measured figure is **32 lines across 18 files**. The wrong number would have been indistinguishable from the right one in review, because a reviewer has no reason to recount a figure that is stated as fact. **An invented expected value is a fabricated measurement even when it is close.** What made it catchable here was not vigilance but that the same sentence needed a **control** anyway: the only filesystem read of any `tests/` path in the suite is `guard-weakness-audit.test.ts:199` reading the single file `tests/dom/feasibility-spike.test.tsx`, and that control had to be found to make the claim non-vacuous — which meant running the search properly rather than reading it. The generalisation is already written in this file and is worth restating because the failure is common rather than exotic: **measure the number, then write it down. Never write it down and then measure it.** A figure that arrived before its measurement is a guess wearing a measurement's clothes, and this file has now been lied to that way by the encoding layer, by the exit-code layer, and by my own arithmetic.

**And a tool I wrote to repair this file damaged it, and its own verification reported the damage as a pass.** The prose-insertion helper splices a paragraph in after an anchor. It asserted that the anchor was unique and that the anchor was followed by a blank line, and it re-read the file afterwards to confirm the block was present **in order** — and then printed `OK the Project Status table is still one table.` It did all of that on a file it had just corrupted, because the splice was `slice(0, at + 2).concat(block, slice(at + 2))`: it **consumed** the anchor's blank line and emitted **no separator after the block**. The inserted paragraph was therefore glued to the next one, and in markdown two consecutive non-blank lines are a single paragraph, so the previous paragraph's last sentence became the new paragraph's opening and rendered as one run-on block. **The re-read could not fail**, because checking that the block is in the right *order* says nothing about whether it is in the right *shape*; that is the same defect this file has recorded for `not.toContain`, for a `cat-file` guard pointed at its own input, and for a CI step that reported success with its steps absent. **A verification step must be asked what input would make it fail**, and this one had no answer.

**And the independent verification pass returned one real warning, one false warning, and one warning that was mine to fix — and my own re-derivation of the second one reproduced the first one's mistake before it caught it.** The pass reported **0 CRITICAL, 3 WARNING, 4 NOTE**, and the adjudication is worth recording because the shape of the three is one shape.
The **real** warning: the finished screen's single-flight latch had **no failing mutation**. Its test called `view.press()` twice, and each `press` opens and closes its own `act`, so React committed `disabled` between the two clicks — the second press was always stopped by `disabled`, never by the latch, and **deleting the latch outright left the whole DOM suite green.** So the test passed for the wrong reason, while `finished-batch.tsx` asserted in a comment that "the latch is what makes the guarantee", and `design.md` records an orphaned batch as this change's accepted ordering risk. The repair adds `pressMany(el, n)` to the DOM harness, which dispatches all `n` clicks inside **one** `act` — which is what a browser does on a double press — plus a `CAN FIRE` control that mounts a **latch-less** button and proves `pressMany` counts **2** against it. Measured: control green at 17/17; removing the latch's guard and its assignment turns the suite **red, `1 failed | 16 passed`, naming `makes exactly ONE request for two presses dispatched in the same task`**; restore byte-identical at sha `3c410b94…`. **The mechanism that had no witness now has one that fails.**
The **false** warning: task 2.5 was reported unmet because "a recursive search for any test mentioning both the finished screen and answered-entry exclusion returned zero files". It returned zero because **the correct test does not mention the finished screen** — it lives at the action seam, in `allocation-actions.test.ts:322`, under the describe block *"continuing after a finished batch, through the action the continue control calls"*, and drives `runAllocateBatch`, which is what `requestBatchAction` delegates to (`actions.ts:79`) and therefore what a press reaches. Confirmed from source, not from the block's own header: `onClick` → `requestBatchAction` → `runAllocateBatch` → `listEntryIdsForValidator` (`allocate-batch.ts:231`). It also has the differential `CAN FIRE` control the task's own warning demands, and its fixture is built so the exclusion is **load-bearing** rather than incidental — a pool of six against a batch of four, with the answered ids asserted still *in* the pool, so a fixture that quietly omitted them cannot make the assertion pass. **Rejected on evidence, and the search that produced it is the recorded defect in a new disguise: a probe scoped to a conjunction that is deliberately false finds nothing, and nothing-found looks like a finding.**
The **mine** warning: every checkbox in all nine `tasks.md` sections read `- [ ]`, including tasks whose verifications demonstrably pass, so the ticked-box ledger the file exists to create did not exist. Now **33 of 35** are ticked, each carrying the measurement that satisfies it, and two are left open on purpose (`8.3` and `9.1`, both satisfied by this commit). Ticking them mechanically would have been the failure mode the file warns about, so each box was tied to a named artifact and the script **refused** on any box it could not find or that was already ticked.
**Two of my own checks were wrong about that ledger in the same round, and both were found by re-deriving rather than by reading.** Asserting "no interrupted-batch feature exists" with `git grep -i resume src/` returned **13 files** — every one the Phase 3 **identity** resume (`resumeValidatorAction`, `ResumeValidator`, `resume.*` catalog keys), a different feature that *should* exist; the check tested a word instead of the thing, and would have had the Phase 3 code reported as a violation of this change's deferral. And asserting `0.3` by reading the task's own sentence — "no code reads or writes the profile column" — is asserting something **false**: `validators.total_validations` appears in **4** files in `src/`. What is true, and what the requirement needs, is that nothing **maintains** it: one `.insert(toRow(profile))` at `validators.ts:123`, one `.update()` at `L178` that writes only `last_active_at`, no increment helper anywhere, and the insert payload established by **following `toRow`** after a thirty-line forward scan found nothing. The box is amended to the true claim and records which sentence it replaced. **An assertion written from a task's prose rather than from the artifact it describes fails in both directions at once** — it accepts unrelated work and rejects correct work.
And the same shape appeared in a **figure**. `tasks.md` 9.2 recorded "6 mentions, 0 call sites"; the verification pass independently reported **9** and concluded the 6 "does not reproduce under the natural reading". Measured with `git grep -n` at merge-base `377a816a`, scope `src/`: **6 matching lines, 9 occurrences, 0 call sites** — three of the six lines match *twice*, carrying both `OPS.countForValidator` and the string `"validations.countForValidator"`. **Neither number was wrong. Both were correct under an unstated unit**, and a reader who cannot tell which is measuring which has no way to distinguish a re-derivation from a contradiction. The box now states all three figures with their units. The instrument was proved on a positive control (`resolveSessionEntry` → 8 lines, matching the earlier independent measurement), so the zero is a real absence rather than a search that found nothing. **A count without a unit is not a fact, it is a unit test.**
Finally, a check of mine **passed on a file it was supposed to police**. `check-project-status.cjs` had a section testing whether the Project Status rows carried this stage's measured figures; it reported every one **"not present"** and still exited **0**, labelled "may be fine". The rows are right and the check was wrong — measured command output belongs in `AGENTS.md`, and a status row should not restate a count that changes every commit — but the section was deleted rather than annotated, because **"not present" prints identically whether the figure is absent because the row is correct or because the regex is wrong**, and a check with one possible output is not a check. That is this same change's NOTE 3 reproduced on the check side: `COVERAGE_CLAIM` catches 8 of 8 of its own can-fire strings and misses 7 of 8 ordinary phrasings, the price of enumerating instead of deriving. **Enumerating is right when the alternative is false positives on real copy; it is wrong when the thing being enumerated is the check itself.** The same script also asserted "every row has three pipes" and was wrong three ways — it counted rows across the whole document (55, not 8, because the file has other tables), it truncated the table at the `Blockers` row whose cell wraps onto 17 pipe-less continuation lines, and it demanded a shape **the `Blockers` row has never had in `main` either**. The invariant it should have asserted was comparative and available all along: **the table's shape is identical to the baseline's.** Measured on the artifact instead of assumed from it, and three wrong premises become one that cannot reject correct work.

**And a tool I wrote to tick the task ledger silently deleted one of the boxes it was ticking, while printing that every box was ticked.** Worth recording in full, because the shape is new: not a wrong measurement, but a **completion check that could not detect the damage the same script had just done**. `tick-final.cjs` gave each box an extent by scanning forward to the next blank line. The reasonable assumption was that boxes are blank-line separated. They are not — **9.1 is immediately followed by 9.2 with no blank line between them**, one continuation line and nothing else — so the scan ran off the end of 9.1 and consumed 9.2's entire block. The file went from **35 boxes to 34**. The script then printed its final line, *"EVERY box is ticked, and each was gated on named evidence rather than on the script having run"*, and exited **0**.
That final line is the whole lesson. Its check was `unticked === 0`, and a box that **no longer exists** is trivially not unticked — so the one defect that mattered most was the one defect the check was structurally unable to see. Every other gate in that script passed honestly: the four `## Project Status` rows really were checked for the Apply stage's markers, and `0.3`'s amendment really was gated on the artifact rather than on the prose. **A check is only as good as the states it can distinguish, and "absent" and "successfully handled" were collapsed into the same state.** The repair is two independent guards rather than one: the extent stops at the next **box line**, which is the file's actual structure, and the box-id set is compared against `HEAD`'s, naming any id that disappeared. Neither alone would have been enough, and the second is the one that catches the first failing.
The new guard was **proved able to fire before being relied on**, on a scratch copy, with the repository never opened for writing. It required three things to hold and refuses to score if any does not: that the baseline really does place 9.2 immediately after 9.1 with no blank line between them (**confirmed** — one continuation line, `the doc-only PR count.`, between line 179 and line 181); that the old scan, applied for real, **removes** 9.2 (confirmed, box count 35 → 34); and that the guard then **names** `9.2` as missing (confirmed, exit 0 with `9.2` reported). A control that cannot reproduce the condition must report `INCONCLUSIVE` rather than a pass, and had a blank line separated those two boxes, this control would have said so and exited non-zero — because a blank line separating them would mean the defect was never possible, and a green control would then have been proving nothing at all. **Restore from `HEAD` rather than repair by hand was what made the mutation reproducible**: the first run's damage was already in the file, so the condition under test could no longer be observed, and only the committed baseline could supply it.

**The sync did not work the first time, and the failure was in a file the tool generated, so the check that mattered was one I did not think to run.** `openspec archive batch-completion` reported success: `+ 6 added, ~ 0, - 0, → 0`, `Specs updated successfully`, and the change archived. It also wrote a **placeholder** into the new in-force spec — `## Purpose` / `TBD - created by archiving change batch-completion. Update Purpose after archive.` — because the delta carried **no `## Purpose` section at all**, which I could have measured beforehand and did not. The consequence was not a warning but a red gate: `openspec validate --specs --strict` came back **`Totals: 10 passed, 1 failed (11 items)`**, naming `batch-completion`. **A sync can report success and leave the repository failing its own documented gate**, and the only reason this was caught is that the ledger treats a rising item count as a thing to re-derive rather than assume — the count went 10 to 11 as it should, and the *failure* is what the count alone would have hidden.\n\nThe repair is the path the tool's own message points at, and the distinction in that message is the useful part: *\"a `## Purpose` in a delta is read only when the capability is created, so it cannot replace this one\"* — meaning for a **new** capability the Purpose belongs in the delta, and only an **existing** capability is repaired by hand-editing the main spec. So the archive was undone (`git reset --hard` to the merge plus `git clean` on the two untracked directories, since `git checkout` does nothing for an untracked path), the delta was given a real Purpose in the sibling deltas' shape — `# Spec Delta`, `## Purpose`, prose, `## ADDED Requirements` — and the archive re-run. Two of the three prior archived deltas that carry a Purpose were checked for the convention rather than my assumption of it, and the repair was proved surgical: the requirement section is **byte-identical to `main`'s** at sha `67691925170e2862…`, 10627 chars, 6 requirements and 18 scenarios. Re-archived: **11 passed, 0 failed (11 items)**, and the new capability is the eleventh in force.\n\n

**Two openspec commands disagree about what a proposal must contain, and the one this file documents as the gate does not catch the disagreement.** `openspec archive` warned — non-blocking — that `proposal.md` is *\"Missing required sections. Expected headers: `## Why` and `## What Changes`\"*, and the proposal in fact uses `# Why` (an H1, not an H2) and `## What`. Yet `openspec change validate batch-completion --strict` reported **valid** on that same file, and `AGENTS.md` presents that command as the gate proving a change's artifacts *\"satisfy the OpenSpec schema strictly\"*. **The archived artifact is therefore not what the gate claimed to have checked**, and the warning that noticed arrived from a command nobody runs as a gate. The change is archived, so the proposal is history and was not rewritten; the finding is recorded here instead. The general form: **when two tools in the same toolchain assert different invariants over the same file, at least one gate is not measuring what it names** — and the one that merely *warns* is the one that was right.\n\n

**And my CI reader's expectations were four typed constants, so it would have reported that CI agrees with CI.** Run `36835788573` printed `41 files / 1126 tests`, `5 / 57` and `8 / 109`, while the reader refused with three mismatches against expectations of `40/1074`, `4/40` and `6/100` — the **Phase 5** figures. The tempting fix was to paste the run's own numbers in, which would have turned the reader into a machine that confirms whatever the last run said. Instead the four constants became **derived values**: the three suite figures are read out of `AGENTS.md`'s committed `pnpm run test:*` rows, and the dataset guard's test count is the number of `it(` blocks in `tests/integration/immutable-dataset.test.ts`, with its file count **1 by construction** because the step's own command names exactly one path. That makes the reader a cross-check between **two independent artifacts** — the CI log and the repository's own recorded claim about what the suite contains — written from local measurement and committed *before* the run being compared against existed, so agreement is evidence and disagreement is a finding. A missing figure now makes the reader **refuse** rather than skip, because a check that quietly stops checking is the failure this project keeps finding.\n\n

The derivation was **proved able to fire before being relied on**, using a mutation that is not synthetic: the `test:dom` row set back to **56**, the value it actually held before the WARNING 1 repair added a test. Measured — green against the real file (exit 0, all four summaries attributed and matching); red against the historical state (exit 1, naming the `dom` step, the actual `57` and the expected `56`, refusing to verify); and refusing outright when the figure is deleted from the row. **A stale expectation is a defect worth finding, not a constant to update** — and this is the third time in this project that a measured figure sat stale in a ledger row while nothing noticed, after the `test:dom` row at 56 and the `--specs` count at 9. The control also refused twice before it ran, both times correctly: once because the mutation target did not exist in the file it was pointed at, and once because I asserted the row would be one character shorter when `57` and `56` are the same width. **Both refusals were my premise being wrong rather than the mutation being malformed**, which is the fourth time that distinction has decided a result, and it is why the control now states the mutation's two figures as constants instead of deriving one from the other by substitution.\n

**A stale baseline produced a confident wrong finding, and the general form is worse than the bug: a comparative check's baseline is itself a claim that expires silently.** The four ledger verifiers compare this stage's `docs/ROADMAP.md` against `ROADMAP.main.md`, a scratch copy captured with `git cat-file` earlier in the session. After the #45 merge, `main`'s ledger had **grown** — 2205 lines to 2232 — while the scratch copy stayed at 2205. Every comparative check kept running, kept printing confident numbers, and one of them reported a **defect that did not exist**: `SEPARATION INVENTED at baseline line 87: a joined pair was split`, implying I had broken a paragraph. Re-deriving it from `git` showed the pair was joined in the *stale* baseline and untouched in the tree, and after refreshing the baseline with `git cat-file` the same check reads **baseline 1102, tree 1102, 0 additions, 0 rewrites, control 1102** — clean. **Nothing about the checker changed; only the thing it was compared against had gone out of date, and it had no way to notice.** A checker cannot detect a stale baseline by looking at the tree, because the staleness is in its own argument. The only defence is to treat the baseline as derived state and re-derive it from the merge-base every time, exactly as a stage re-derives its own commit row — and this is the **fourth** instrument in this project to go stale quietly, after the `test:dom` count, the `--specs` item count, and the typed expectations in the CI reader. **A measured figure is only as fresh as the moment it was measured, and a figure measured against a snapshot is measured against a snapshot.**\n\n

**A check whose expectations name one stage is a check that must be rewritten at every stage, so I deleted the expectations rather than update them.** `check-project-status.cjs` verified the four live rows by matching the **Apply** stage's facts — `/\*\*Apply\*\*/`, `/docs\/batch-completion-apply/`, `"verifying"`, `"WARNING 1 fixed"`, `/\*\*Four: #40/`. The archive moved the rows on, and it correctly reported three rows missing their markers: the rows were right and the check was stale. This is the same verdict the project reached once already, when a dead "expected markers" section was deleted for reporting `not present` and exiting 0, so it is now the established rule rather than a one-off. What replaces the list is **derived from `git` and cannot expire**: *a live row must not name a branch that does not exist*, tested with `git rev-parse` against `refs/heads/` and `refs/remotes/origin/`. A row still saying "at its Apply stage on `docs/batch-completion-apply`" after that branch is deleted is making a false claim, and that is the defect the regex list was standing in for. The scope is the four **live** rows only, because `Last merged OpenSpec stage` and `Completed milestones` legitimately name branches deleted after merging, and requiring existence there would be a false positive on correct history. It replaces a five-item list that fires once per stage with one test that is **silent until the fact becomes false** — and it was witnessed doing exactly that: green on the real ledger (1 branch reference), red on a scratch copy whose `Current OpenSpec change` row was switched back to `docs/batch-completion-apply`, naming the branch and calling the reference stale. That branch is not a hypothetical ref; it was deleted by `--delete-branch` on the merge that had just happened.\n\n

**And the tool that inserts prose into this ledger wrote five paragraphs as one 5781-character line, which is the inverse of the wrap defect already recorded here.** `insert-prose.cjs` drops a block file's blank lines and re-inserts its non-blank lines contiguously — correct only when the file has one line per paragraph, which the earlier block did and reported as `paragraphs inserted: 3`. This time the write tool flattened the newlines, so the file arrived as a single line and the tool faithfully reported `paragraphs inserted: 1 (longest 5781 chars)`: a **valid line in the file and an unreadable run-on paragraph in the document**. The report is the tell, and the lesson is the recorded one pointed the other way: **assert the convention, not the count.** The boundaries were recoverable without re-authoring anything, because each paragraph began with a phrase unique to it, and the repair was proved text-preserving by requiring the pieces to concatenate back to **5781 == 5781** characters. That proof earned its keep immediately: my first version trimmed each piece and rejoined with a space, and came back **3 characters longer**, which identified the cause — the write tool had removed the newlines with *nothing* between them, so a separator had to be `""` and not `" "`. Two further faults were mine and both were caught before anything was trusted: the splice put the blank lines only at the *end*, leaving the same run-on spread over four lines, which markdown still reads as one paragraph; and the post-write assertion located the block by scanning to the first blank, which is wrong for exactly the shape being repaired **because the repaired block now contains blanks** — it reported `0` separators for a block that had three, and would have reverted a correct repair. The assertion is now positional, finding each piece and requiring the line after it to be blank. **Three of my own instruments were wrong in the same round about a file that was correct, and in every case the instrument, not the file, was the defect** — which is the fifth time that has happened on this ledger, and the reason each of these tools now refuses rather than reporting. The last of the three is the one worth keeping, because it is about a guard being **tested at the wrong scale and blamed for the result**. `insert-prose.cjs` now refuses a block file that is a single line longer than 1.5x the target's own longest paragraph, which would have caught the 5781- and 5630-character flattenings immediately. My control built the mutation from two 50-character paragraphs, joined them into a 101-character line, and reported **NOT CONFIRMED: the guard is decoration**. The guard was fine; the mutation was 1/56th the size of the thing it guards against, and below the tool's 400-character floor. **A guard must be tested at the scale of the real occurrence, and a miss at 1/56th scale is a statement about the test, not the guard** — a test that blames its subject for the test's own scale produces exactly the false finding this project has now produced in four different instruments. The control also exposed a real limit rather than a real pass, which is recorded in the tool: a run-on *shorter* than 1.5x the target's longest paragraph is below the guard's resolution and would be written, so the ledger's structural check is what carries the guarantee, not the length rule. Two smaller faults, both the control's and both caught before anything was trusted — a `shell: true` spawn, adopted here from the `pnpm`-shim workaround where it is genuinely needed, word-split an anchor phrase containing spaces so the tool received arguments it was never given and the control read that refusal as the tool refusing *correct* input; and the "did the refusal write anything?" snapshot was taken before a legitimate insertion, so the comparison reported a difference the control itself had made. **A control that cannot tell its own two steps apart will blame the tool for its own setup**, and `process.execPath` without a shell is the correct form for any binary that is not a Windows shim.

**A corrupt baseline does not announce itself, and it manufactures findings that look better than silence.** Refreshing `ROADMAP.main.md` after the #46 merge with `git cat-file -p main:docs/ROADMAP.md | Out-File -Encoding utf8 -NoNewline` produced a 171166-byte file on **one line** with a UTF-8 BOM, and every verifier run against it then reported confident nonsense — 40 lost lines, and 1102 paragraph separations in the tree against **zero** in the baseline. The checks were working exactly as designed and the *input* was garbage, which is the most dangerous shape there is: the finding was specific, quantified, and wrong. Switching from `git show` to `git cat-file` does not help when the result still passes through PowerShell, and `Out-File -Encoding utf8` prepends a BOM even when the pipeline is the only thing that touched it. The refresh now runs in Node with nothing between `git` and the file, and **refuses to write** a baseline carrying a BOM, carrying no newline, carrying any CR byte, or carrying fewer lines than the working tree — each of those a corruption signature rather than a style opinion. Two smaller things in the same round, both argument handling: an object path in `main:<path>` must be forward-slashed, and `docs\ROADMAP.md` fails with *"exists on disk, but not in 'main'"*, which is true, useless, and reads as though `main` were missing the file.

**Two OpenSpec commands disagreed about the same file again, and this time the second one is the one I needed.** `openspec change validate <change> --strict` reported the proposal **valid** while `openspec change show <change> --json --deltas-only` failed outright with *"Change must have a What Changes section"*. Chasing that answered a finding recorded last round: **eleven archived proposals, and ten use `## What Changes`.** `batch-completion` is the sole outlier at `## What`, so its deviation was never a house style — it is the only proposal in the repository the CLI cannot read, its proposal is history now, so it stays that way, and the ledger carries the note. The new change follows the convention and `change show --deltas-only` parses it. A second limitation of that command, found while building the check: **its JSON discards the `### Requirement:` heading entirely.** The shape is `spec`, `operation`, `description`, and `requirement: {text, scenarios}` — no name field anywhere. Two drafts of my reader asked for `capability` and `name`, both `undefined`, and printed a list of seven `?` that looked like a result and carried no information. So the reader now **counts the delta twice**, once from the CLI's own parse and once from the markdown source, and refuses if they differ — which makes the CLI's parse an independent witness rather than the only witness. Proved able to fire: green on the real delta at 7 requirements and 17 scenarios, and red on a single renamed scenario heading, naming *"the CLI parsed 17 scenarios, the source has 16"*.

**The branch-existence invariant fired on the row I had just written, and the right response was to reword the row rather than weaken the check.** `Next eligible objective` named `feat/interrupted-batch-recovery`, which does not exist until the Apply branch is cut, and the check reported the row as a stale reference. Both readings are defensible — the rule exists to catch a row naming a *deleted* branch, and an objective legitimately looks forward to one — but an invariant that is conditional on which way a row points is worth less than a strict one, and the branch name was carrying nothing the sentence did not already say. The reworded row states that omission on purpose, so the next reader does not re-add a branch to satisfy their own tidiness and trip the check. This stage also replaced the archive stage's row writer, which resolved and proved every SHA correctly and then hard-coded `#45` and `cb197fe` — a per-stage expectation in the exact shape this ledger has already paid for once. The replacement derives every commit reference from `git` and refuses to write a row unless each resolves to a real commit **and** is an ancestor of `origin/main`, which is what catches an eight-character `524bbbcc` that one of these rows once carried. Its first run refused correctly for the wrong reason, comparing the *cell text* against the *whole old line* — a value with no pipes against a row with three — so the guard was measuring the wrong pair of things and would have had to be weakened rather than fixed. **A guard that has stopped being correct is worse than no guard, because the next reader trusts it.**

**A claim scoped to a function is not a claim scoped to the system, and strict validation cannot tell the difference.** An independent verifier re-derived every factual claim in the `interrupted-batch-recovery` proposal from source, and the load-bearing one — *abandoning a batch destroys no coverage* — came back **true of `selectBatchEntries` and false of the system**. The function tests two conditions, which is what the claim said; the *pool* it selects from is filtered separately on `is_active`, which the claim never mentioned. Both halves were accurate sentences. Composed, they were a false statement about where an abandoned entry goes. A requirement built on it would have inherited the gap, and `openspec change validate --strict` would have reported the result **valid**, because strict validation checks that a delta is well formed and never asks whether it is **satisfiable**. So the unsatisfiable-requirement failure mode has a second instance too: *"the offer reveals no stored identifier"* is impossible to satisfy while `defaultBatchId` embeds the validator's own id and the mandated resume link therefore renders it — and that delta validated cleanly too. Restating it as *introduces no identifier beyond the one it leads to* made it both true and enforceable.

**A constraint can be real, load-bearing, and still be attributed to the wrong layer.** The proposal credited `UNIQUE (validator_id, dataset_entry_id)` with preventing an answered entry being **asked** twice. It forbids a second **recorded** response; what prevents the asking is the allocation filter, at a different layer — and the repository says so itself, recording that if the filter's row cap were ever reached the result would be **short**, the missing entries **would be offered again**, and the database would refuse the second response. So the constraint is a backstop *behind* the filter, and the code documents a path where re-asking genuinely happens. Two layers, two jobs, and the sentence merged them. **A verification pass that checks a claim is true but not which mechanism makes it true verifies half the risk**, because a claim with the right conclusion and the wrong reason will be re-derived wrongly by the next reader.

**A row can be individually well formed and contradict the row beside it, and a structural checker cannot see it.** Updating `Current OpenSpec change` at line 15 and leaving `Current roadmap phase` at line 14 stale produced a table asserting *\"no OpenSpec change exists for it yet\"* and listing ten archived changes while the next row named the live change and its eleven-change predecessor. `check-project-status.cjs` passed, because what it checks is shape and branch existence — both of which were fine. **A ledger row is not verified because the row below it agrees with it.** The general form: a per-row invariant is satisfied by any row that is internally consistent, including one that is wrong in the same way as its predecessor; only a cross-row check would have caught this, and building one is outstanding rather than done.

**The correction to a wrong reason can itself be the wrong reason.** The design justified the `created_at DESC, id DESC` tiebreaker by claiming two batches minted in the same millisecond tie. They cannot: both halves of `` `${validatorId}-${now.toISOString()}` `` match, so the ids are *identical*, which is a primary-key collision and a **refused insert**, not a tie. The tiebreaker survived anyway, for two better reasons — `id` is unique by primary key so the order is total, and the migration's backfill stamps every pre-existing row with **one identical instant**, so a real tie exists in the world rather than only in the argument. Worth keeping because the first reason was plausible, was written from the code rather than assumed, and was still false: **a reason assembled from correct facts can be wrong in its conclusion**, and only re-derivation catches that.



**The checker that was written to catch that damage reported six defects that were not defects, and the first proof that it could fire reported a failure that was not one.** Both halves are the same mistake seen from opposite sides, and both are recorded here because the tool is left in the repository's toolkit rather than discarded.

The **false positive**: run against the real ledger, the checker reported **6 lost separations and 6 invented ones**, naming the six `## Project Status` rows this change had rewritten — and it claimed each row "was its own paragraph, now joined to" the next. They are table rows, and **a markdown table requires its rows to be adjacent**: a blank line between them ends the table and turns the rest of the block into loose paragraphs. Adjacent `|` lines are the only correct arrangement, so whether two of them are neighbours carries no editorial meaning whatsoever, and a checker that reads them as "joined paragraphs" will report the table's required shape as damage — **in both directions at once**, which is what gave it away. A genuine separation loss cannot simultaneously be an invented separation, and asserting that impossibility is now part of the checker, because it is the property that made a self-contradictory result identifiable rather than merely annoying. The lesson generalises past markdown: **a check written against a document must know which lines in that document are structural rather than editorial**, and the cheapest way to find out is to run it against the real file first and read what it names.

The **no-op control**: the first attempt to prove the checker could fire used `splice(i, 0, "")` at the position of the paragraph whose separator had been eaten — which **inserts** a blank line one slot too far right and changes no adjacent-pair relationship at all. The checker was handed an undamaged file, correctly said `OK`, and the control read as a failure of the checker. **A control that cannot discriminate is not a neutral choice** — and this is now the third distinct instance of that sentence in this file, each with a different disguise: a marker matching zero real instructions, an anchor matching nothing while printing "line 0" and concluding anyway, and now a mutation that changes nothing while being reported as a failed control. The rebuilt control refuses to score anything until it has established that the baseline **had** a separator, that the mutant **does not**, and that the joined-pair count moved by **exactly one**. Each of those three can fail independently, and each failing yields `INCONCLUSIVE` rather than a verdict.

One further note on the artefact rather than the logic: the first version of that script contained **two NUL bytes where two literal spaces had been written**, so it read back as a binary file and could not be inspected with the normal reader. The logic was unaffected — NUL is a perfectly good pair separator, and a better one than a space, since it cannot occur in the text — but **a probe nobody can read is a probe nobody can audit**, so the separator is now built with `String.fromCharCode(31)`. Same family as the encoding defects above, and the generalisation is the one already written twice: **judge a file by its bytes, not by what a pipeline printed and not by what a write was asked for.**

It was caught only by reading the file, and **three separate instruments then lied about it in the same investigation**, which is worth recording because the pattern recurred within one short stretch of work. A whole-document scan for "a paragraph line immediately followed by another" returned **hundreds of hits** — consecutive non-blank lines are how a hard-wrapped markdown paragraph is *supposed* to look, so a scan that naive measures nothing. An anchor written as `…to be **decidable` returned **`findIndex` = −1 in both files**, and the script printed *"line 0"* followed by the confident sentence *"The baseline itself has no separator here, so there is nothing to restore"* — **an anchor matching nothing produced output indistinguishable from an anchor matching the first line**, and it concluded. That anchor was correct, and the `-1` was **PowerShell mangling the `**` inside `node -e "…"`** — the fourth time in this repository that a script was handed to PowerShell instead of to a file, and the reason the rule is absolute rather than advisory. And the repair script's final `VERDICT` line tested the paragraph's **index** (`at >= 1`) rather than the blank line it had just printed as evidence, so it printed `VERDICT: … no damage` **one line below `preceded by blank? false`**. Three defects, one shape: **a check whose output cannot contradict its own conclusion.** The fix in each case was the same and is the transferable part — assert the property itself (a blank line *after* the block), refuse when a marker is not unique, and derive the verdict from the evidence printed rather than from a variable that merely resembles it. The splice helper now emits the separator **and** refuses with `MALFORMED INSERTION` if the block is not terminated, which is a check that can fail because the exact failure has happened.

The distinction turned out to be **decidable rather than a matter of judgement**, which is why it was closed instead of documented. A missing markdown line is a **replacement** if and only if a line with the **same row header** still exists: same header present means the row was rewritten, and same header absent means the row was deleted, which is a real loss. A missing line that is **not** a table row — prose, a heading — is always a loss, because there is no header identity to match on, and inventing one would be precisely the guess this file keeps refusing to make. On the real pair it now reports **`LOST 0`** and **`REPLACED 6`**, naming all six headers.

**Proving it can fire was the part that mattered, and the first control set was wrong in a way worth recording.** Three controls were built: delete a prose line, delete a whole table row, and compare a file against itself. The first two went GREEN immediately — both correctly reported `LOST 1` and made no `REPLACED` claim. **The third went RED**, and the check was right to: it compared the **pre-repair** ledger against itself, and that file has prose inside the status table, so its structural check fails legitimately. The control had asked *"does the verifier report a clean run for an unchanged file?"* using a file that is not clean. Repointed at the current, repaired ledger it is GREEN. **A control that exercises the wrong baseline does not test the thing it names** — and the only reason that surfaced is that it was **scored RED rather than quietly swapped for a file that passes**, which is the discipline applied throughout and worth naming as the reason it worked here too. All three are now GREEN, and they use **real lines from this ledger** rather than invented ones, because a control drawn from a fixture tests the fixture — the same lesson twice recorded in this table.

**The `Archived Changes` table has no automated guard, and this row's own measurement of that was WRONG when it was written.** `grep -r ROADMAP tests/` does return **0**, confirmed case-sensitively, and no test reads any `docs/` path — that half still holds, and it is the half that matters, because the defect is that *nothing would notice a row being dropped*. But this row previously also claimed that a search of all **107** files in `tests/`, `src/`, `.github/` and `supabase/` found **0** naming `ROADMAP.md`, and **that was already false when it was written**: `supabase/migrations/README.md:93` has said *"applying them to a project is a separate deployment step recorded in `docs/ROADMAP.md`"* since **`17f6893`**, and the claim was committed later, in **`23dd7c3`**. A search could not have found 0. The honest reading is that the count was taken over a narrower set than it described and the description was then written as though it were the wider one — **a measurement reported with a scope it did not have**, which is the same shape as the CI step that claimed to run a subset and was green. Re-derived on 2026-10-01 over **135** files: **2** name `ROADMAP.md` — the pre-existing `supabase/migrations/README.md:93`, and `src/lib/domain/validation-response-id.ts:21`, added by **this** change, whose module comment points at this ledger for the 32-bit entropy concern below. **Neither is a guard**: one is prose about a deployment step, the other is prose about an open concern, and **nothing anywhere reads this file**. The substantive claim therefore stands and the count did not, and both are recorded because a correction that keeps the conclusion and drops the number is how a bad measurement survives. The table is correct when written and will drift silently at the next archive, exactly as it did once before. |

> **Why this block splits "OpenSpec stage" from "PR".** A block that names "the last merged PR"
> is self-referential: the PR that corrects the number is itself a PR, and its own merge falsifies
> the correction. PR #8 recorded #7, and the PR that fixed it (#9) then made #8 the stale value.
> Chasing that regress produces an endless sequence of PRs whose only content is the previous PR's
> number. So this block reports the last merged **OpenSpec stage** — a stable fact — and lists
> documentation-only PRs separately, where appending a line is honest rather than contradictory.
> The trade-off is that "Doc-only PRs since that stage" is not self-updating; read git history for
> the authoritative commit list.

### Archived Changes

| Change | Archived | Merged as | Notes |
| --- | --- | --- | --- |
| `project-foundation` | `openspec/changes/archive/2026-09-30-project-foundation/` | PR #3, `f43d722` | Synced into `openspec/specs/`: `application-foundation` (5 req), `design-system` (5), `domain-contracts` (7), `data-access-boundary` (4). Verified with a `PASS WITH WARNINGS` review; every finding repaired before merge (task group 7 in the archived `tasks.md`). |
| `od-dataset-schema-and-import` | `openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/` | Apply stage merged by PR #7, `d2eea22` (merge commit; proposal was PR #6, `f14c0bb`). Sync + Archive merged by PR #8, `1ed3340` | Synced into `openspec/specs/`: `dataset-import` (3 req, new), `research-schema` (6 req, new), `domain-contracts` (1 requirement modified — the at-most-once rule flipped from "not yet implemented" to implemented). Verified with an independent `PASS WITH FINDINGS` review carrying one CRITICAL; the CRITICAL and all seven warnings and eight notes were repaired before the Apply merge. `openspec validate --specs --strict` reports **6 passed, 0 failed**. |
| `interface-localization` | `openspec/changes/archive/2026-10-01-interface-localization/` | Propose PR #29, `50ff9eb` (`a6031c5`). Apply PR #30, `2aaca46` (merge commit; branch commits `33d1cf8` → `2f66ea4` → `822233c`). Sync PR #31, `f03bf65` (merge commit) | Synced into `openspec/specs/`: `interface-localization` (**6 req / 17 scenarios, new**), modifying no existing requirement. `openspec validate --specs --strict` reports **9 passed, 0 failed**. A separate verification pass found **no CRITICAL and four real WARNINGs, all fixed rather than waived**; the most consequential was a catalog guard that asserted the catalogs held no Ilocano instruction via markers which **match zero of the 600 real instructions**, so it could never fail. Rewritten to compare all 600 records bilaterally against both catalogs, proved red in both directions by probe. Two limitations are recorded in the archived `tasks.md` rather than papered over: `<html lang>` rests on a proven three-link chain rather than an observation, and scenario S3 is half-untested |
| `landing-and-screening` | `openspec/changes/archive/2026-09-30-landing-and-screening/` | Propose PR #11, `d111a9d`. Apply PR #12, `e1390ba` (the review round that the client-shell call-site enumeration came out of). Sync + Archive PR #13, `411e18f` | Phase 3: landing page, Ilocano proficiency screening, anonymous validator create and restore. Synced `validator-onboarding` |
| `required-bilingual-translations` | `openspec/changes/archive/2026-09-30-required-bilingual-translations/` | Propose PR #15, `d4c40cd`. Apply PR #18, `438b691`. Sync PR #19, `aaa8810`. Archive PR #20, `76fd7a3` | Both research translations required for every evaluable validation, the forward migration, and the qualifying-coverage definition. Synced `research-schema` |
| `coverage-aware-allocation` | `openspec/changes/archive/2026-09-30-coverage-aware-allocation/` | Propose PR #22, `d2fd596`. Apply PR #23, `1134da9`. Sync PR #24, `304d450`. Archive PR #25, `174fa2c` | Phase 4: server-authoritative coverage-aware batch allocation. Synced `batch-allocation`. Two limitations are carried forward rather than fixed, because fixing either is a spec change that was not made |
| `research-schema-guarantee-coverage` | `openspec/changes/archive/2026-09-30-research-schema-guarantee-coverage/` | Propose PR #26, `8ae4bc3`. Sync PR #27, `06dc92e`. Archive PR #28, `5788383` | Made the qualifying-coverage target enforceable in the database and split each bilingual rule across two non-overlapping `CHECK` constraints. Synced `research-schema` |
| `thin-shell-call-sites` | `openspec/changes/archive/2026-10-01-thin-shell-call-sites/` | Propose PR #33, `b5b59b2`. Apply PR #34, `73ab777` (merge commit, verified an ancestor of `origin/main`). Archive PR #35, `80a8dba` (merge commit) | Pure verification repair: seven client-shell call sites that already behaved correctly and now carry behavioural guards, plus the `dom` browser-test project. **Declares `skip_specs: true`** — no product behaviour changed, and the correction to its own rationale is recorded rather than resolved by inventing a requirement |
| `validation-experience` | `openspec/changes/archive/2026-10-01-validation-experience/` | Propose PR #40, `982dcea`. Apply PR #41, `c527a4b` (merge commit, verified two parents `982dcea 746da72`). Sync PR #42, `524bbbc` (merge commit, verified two parents `c527a4b b640ca1`). **Archive in this PR, so no archive merge commit is named** | **The first participant-facing research-writing capability, and the first stage to pass two independent verification rounds before merge — both of which returned work rather than approval, and neither of which found a product defect.** One new capability, **zero** modified: `validation-experience` (7 requirements, 24 scenarios), capability count **9 → 10**. Apply grew the `dom` project from **3 files / 15 tests** to **4 / 40** and the `unit` project from **33 / 901** to **40 / 1074**, and the whole suite from **48 files / 1164** to **50 / 1214**. **The two verification rounds found ticked boxes that were untrue as written** — a guard enumerating rendered controls with a regex demanding a closing tag, so it could never see a void `<input>`; a tick asserting a stale `/ready` comment had been corrected when the author had only *quoted* it as false; a dead export with **zero** production callers, proven correct by a test; and then, one commit after the fix for that last one, **a test of my own that was vacuous in the same way** — its fixture left exactly **one** remaining entry, so reading the requested position back out of the pushed URL was **decoration**. That was the **third** instance of that shape in one session, and the generalisation is recorded below: *a fixture that cannot discriminate is not a neutral choice.* **Ten mutation probes** across the two rounds, each with a negative control, a `tsc --noEmit` green mutant, and a byte-identical restore. **One thing is specified but unwitnessed, and says so:** `position={session.position}` is not observable in rendered HTML because a Server Component's props are not attributes — mutating it leaves the suite **green at 1214/1214**, and closing it needs a real browser and a real Supabase project, **neither of which exists**. Sync added **one** scenario and corrected **one** wording slip, both flagged in-file, with the transform verified as **4 hunks / 4 attributed edits**. The `/ready` handoff was left **unspecified on purpose** — the change declares zero modified capabilities, so a requirement there would modify `validator-onboarding`. |
| `pending-state-specification` | `openspec/changes/archive/2026-10-01-pending-state-specification/` | Propose PR #36, `cb347cf`. Apply PR #37, `bf76173`. Sync PR #38, `d3e1627` (all three verified merge commits with two parents). **Archive in this PR, so no archive merge commit is named** | **Specification-only** — no `src/`, `tests/`, or `supabase/` file has ever been touched by it. Closed the gap that **0 of 181 scenarios** mandated a control be inert during a write and that `/ready` appeared in **0 of 9** specs. Synced `design-system` **5 → 6** requirements and `validator-onboarding` **7 → 8**, capability count unchanged at **9**, scenarios **181 → 193**. Verified as a *difference*, not read off afterwards: every requirement and scenario hashed before and after, the other **seven** spec files **byte-identical**, and both spec diffs **pure insertions**. The gap flipped because of the sync and for no other reason — all **5** post-Sync matches were required to fall inside the *added* block and **0** fall outside. **One scenario is specified but vacuous today** and says so on its own face: "Pending is distinguishable from unavailable" cannot fail, because no control is currently disabled for *unavailability* rather than in-flight work. It was **predicted** to become observable in Phase 5, which has now been **decided against** — see the note beneath this table. |

> **This table previously listed 3 of the 8 archived changes.** The omission was recorded at
> the time and deliberately left in place; that decision was wrong, because this stage edits the
> table anyway, and a known-stale enumeration inside a file you are editing is the defect
> rather than the omission. Every row above was **re-derived by hand during this stage** by
> listing `openspec/changes/archive/` and asserting the row count against that directory.
>
> **AND THERE IS NO AUTOMATED GUARD KEEPING THIS TABLE IN STEP.** `grep -r ROADMAP tests/`
> returns no matches: this repository has no ledger-consistency test of any kind. So the honest
> position is that the table was correct when written and will drift silently at the next archive,
> exactly as it did here — which is now stated rather than papered over with a sentence that
> sounds like a guard. Building one is **deliberately not done in this stage**: it introduces a
> new class of test the project has never had, and a change must not be broadened because a
> related opportunity turned up. **Recorded as a known gap, for a change that wants it.**

### Phase 2 verification approach (executed; hosted half still outstanding)

There are no Supabase credentials, so the schema, the import, and the 600-record verification are
proven against a **real PostgreSQL engine** (PGlite, PostgreSQL compiled to WebAssembly), which
evaluates the same SQL for constraints, foreign keys, and RLS policies. This converts "we have no
database, so we can check nothing" into "we can check the schema; only the hosted deployment is
unverified".

The import was deliberately split into a **pure parse** and a thin idempotent write so that the
PGlite verification and a future hosted run execute the same parsed records. An importer that
talked to Supabase directly would have left the whole Phase 2 deliverable unverifiable.

What remains for Phase 2: applying `supabase/migrations/` to a hosted Supabase project and
repeating the 600-record verification there. That is a deployment step, not a code step.

The three Supabase repositories under `src/lib/repositories/supabase/` are the other half of what
PGlite cannot reach. They are unit-tested against a recording fake — the fake asserts the *query
shape*, so an explicit column list, `head: true` on a count, and `maybeSingle()` over `single()`
are all checked — and none of that is evidence about PostgREST. Specifically unverified until a
project exists: that `.in()`, `.range()`, and `count: "exact"` behave as the code assumes, that a
uniqueness violation actually arrives with `code === "23505"` (the code is written to the
documented SQLSTATE, not to an observed payload), and this project's maximum rows per request, which
two methods depend on in order to detect truncation. The repositories are deliberately not
constructed at runtime anywhere yet.

While filing the Phase 1 archive, `pnpm run format:check` failed on all 56 formatter-owned files.
It was pre-existing — a clean `main` checkout failed identically. The repository had no
`.gitattributes`, so line endings were decided by each contributor's local `core.autocrlf`;
`.editorconfig` declared `end_of_line = lf` but git does not read `.editorconfig`.

The larger consequence was found while probing: a fresh clone on a machine with
`core.autocrlf=true` produced `data/ilocano-synthetic-data.json` with CRLF and SHA-256
`152ae7e8…` against the guard's expected `39f757e6…`. The immutability guard hashes the
working-tree file, so it would fail for autocrlf users and pass on CI. PR #5 adds
`.gitattributes` (`* text=auto eol=lf`, `*.ico binary`) and states `endOfLine` explicitly in
`.prettierrc.json`. A fresh clone with `core.autocrlf=true` now yields 0 CRLF and the expected
dataset hash. `git add --renormalize .` produced no index changes, proving the committed bytes
were already LF.

### Sync was performed by the archive step, not as a separate stage

`AGENTS.md` describes Sync and Archive as separate stages. They were run as one here, deliberately:
the OpenSpec CLI exposes no sync-without-archive command, and `openspec/archive` writes
`openspec/specs/*.spec.md` from the change's deltas. Hand-writing the main specs to keep the stages
apart would mean editing generated files by hand, which `AGENTS.md` forbids and which risks the
main specs and the deltas drifting. The archive branch therefore carries both operations, and the
synced specs are validated with `openspec validate --specs --strict` — **6 passed, 0 failed** (the four capabilities above plus
`dataset-import` and `research-schema`).

### Local Verification Evidence — `project-foundation` (2026-09-30)

Recorded so the ledger reflects observed results rather than intent. Every command below was
executed and exited 0 on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`.

| Command | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm run lint` | exit 0, no errors or warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 12 files, **244 tests passed** |
| `pnpm run test:integration` | exit 0 — 2 files, **18 tests passed** (real PostgreSQL via PGlite/WASM) |
| `pnpm run build` | exit 0 — Next.js 16.3.6 (Turbopack), routes `/` and `/_not-found` prerendered static |
| `openspec validate project-foundation --strict` | exit 0, "Change 'project-foundation' is valid" |

What this evidence explicitly does **not** establish:

- No Supabase client has ever been constructed at runtime, and no migration has ever been
  applied to a real project. `data/ilocano-synthetic-data.json` is byte-identical to `main`
  (guarded by SHA-256 in `tests/integration/immutable-dataset.test.ts`).
- PGlite proves SQL, constraints, and Row Level Security **as the PostgreSQL engine evaluates
  them**. It does not prove Supabase Auth, Storage, Realtime, PostgREST behavior, or RLS as
  enforced by the Supabase API gateway.
- `.github/workflows/verify.yml` passed on run 36614647692 (PR #3, `ubuntu-latest`) with counts
  matching local at that commit, and the dataset-guard job was confirmed from that run's log to be
  scoped to `1 file / 7 tests`. The job-selection defect found in an earlier run is fixed. No
  *failing* CI run has ever been observed, so "a failing test blocks the PR" is still inferred.
- There is **no screenshot-based or human-eye visual verification** of the design. No desktop
  browser was connected. The design was verified through rendered-HTML assertions, emitted-CSS
  inspection, and component markup tests. A human still needs to look at the landing page.
- `getServerEnv()` / `getClientEnv()` are covered only by type-check and by tests of their pure
  `parse*(source)` functions; the `process.env`-reading wrappers are not executed by any test.
- No repository *implementation* exists yet. `src/lib/repositories/` is interfaces only by design,
  so no persistence semantics (the `UNIQUE (validator_id, dataset_entry_id)` constraint, RLS, or
  distinct-validator coverage counting) are proven by anything in this change.

### Post-Implementation Review — `project-foundation` (2026-09-30)

An independent verification pass compared the implementation against all four capability specs and
all 26 tasks. Verdict: **PASS WITH WARNINGS**, with one CRITICAL that was an artifact conflict
rather than a code defect. All findings were repaired before merge; the repairs are itemised as task
group 7 in `openspec/changes/project-foundation/tasks.md`. The three that changed behavior:

- **The supported Node range was not enforced.** The `application-foundation` spec claimed "the
  package manager emits an engine mismatch error", but pnpm 12 does not: a probe declaring
  `engines.node: ">=99 <100"` installed with exit 0, with and without `engine-strict=true`. The
  scenario was empirically false. Fixed by adding `devEngines.runtime` with `onFail: "error"`,
  which verifiably fails (exit 1, naming both versions), and by correcting the scenario wording.
- **Body prose rendered below the declared 1rem floor.** `--text-small` was 0.9375rem (15px) and the
  landing page used it for whole paragraphs, while the token file's own comment claimed the floor
  "is enforced here". The class-string tests could not catch this because the class resolved to a
  legitimately named token. Raised to 1rem, and a test now reads `globals.css` and asserts every
  prose role against the floor.
- **The uniqueness-constraint requirement contradicted the change's own scope.** The
  `domain-contracts` delta demanded a data-layer `UNIQUE (validator_id, dataset_entry_id)`
  constraint "independently of application code", which the proposal and the design's non-goals both
  exclude. Rather than archive with an unmet requirement, it was split: the repository-level
  contract stays, the constraint and its PGlite proof are deferred to `od-dataset-schema-and-import`
  and listed under `tasks.md` -> "Deferred".

Carried into `od-dataset-schema-and-import` as required work, not as loose ends: the
`UNIQUE (validator_id, dataset_entry_id)` constraint with a PGlite assertion; the `supabase/`
repository implementations; the "preserve unknown fields" rule, which was a documented contract
with no implementation to assert it against; and the default `supabase/migrations/` applier path,
which had never run end to end because that directory was empty. All four are now delivered — see
the evidence section below.

### Local Verification Evidence — `od-dataset-schema-and-import` (2026-09-30)

Executed on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`, on `feat/od-dataset-schema-and-import`.

| Command | Observed result |
| --- | --- |
| `pnpm run lint` | exit 0, no errors or warnings |
| `pnpm run format:check` | exit 0, **after** `prettier --write` on two files (see below) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 14 files, **312 tests passed** |
| `pnpm run test:integration` | exit 0 — 4 files, **69 tests passed** (real PostgreSQL via PGlite/WASM) |
| `pnpm run build` | exit 0 — Next.js 16.3.6 (Turbopack), routes `/` and `/_not-found` prerendered static |
| `openspec validate od-dataset-schema-and-import --strict` | exit 0, "Change 'od-dataset-schema-and-import' is valid" |

An independent verification pass (a separate agent with no stake in the implementation) returned
**PASS WITH FINDINGS, one CRITICAL**. The CRITICAL was a real defect in a *specification*: the
`research-schema` delta claimed a denied `update` or `delete` under Row Level Security "fails
loudly". Measured against a real engine, only `insert` raises — `select`, `update`, and `delete` are
all filtered to zero rows with no error. A throwaway probe test measured all four statement kinds
for all three roles and confirmed the data was untouched. The spec now carries the measured table
and a scenario that states the silent case plainly, and the migration's header comment was rewritten
to match rather than to sound better than it is. This is also the sharpest reason the repository
contract forbids reading an unremarkable write as success: `SupabaseValidatorsRepository
.touchLastActive` is an `update`.

The verification pass raised seven warnings and eight notes. All were repaired before this evidence
was written, and each is recorded in
`openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/tasks.md`
against the task it corrects, because a reviewer who cannot see why a task was annotated cannot tell
a deliberate decision from an oversight:

- Three were **claims the code did not support**: task 4.7 was ticked although nothing asserted the
  source file is never *opened* for writing (the SHA-256 comparison proves the content, not the
  absence of a write path — a new source scan now does, proved load-bearing by injecting a
  `writeFile` import); task 7.8 described `countForEntry` as a count of *distinct* validators when
  it is a plain row count made equivalent by the uniqueness constraint; and the `dataset-import`
  spec said the stored record is "byte-equivalent in content" to the source, which `jsonb` cannot
  promise, since it preserves neither key order nor insignificant whitespace.
- Two were **spec-versus-implementation contradictions**: the structural tables
  (`validation_sessions`, `validation_batches`, `batch_entries`) carried `started_at`, `ended_at`,
  `requested_size` with a `1..50` check, `created_at`, `completed_at`, and `assigned_at` — all
  lifecycle claims the spec forbids and design D3 explains why. All were removed and two closed-set
  tests now pin the exact columns and assert via `pg_constraint` that these tables define no `CHECK`
  constraint at all. And every `expectRejected` pattern ended in `|check constraint`, so the wrong
  constraint firing would still have matched; each now names its constraint, which required probing
  the engine to learn that every violation message names it.
- One was **order dependence** in the import integration test: three tests only passed because of
  the order they ran in, including the one asserting "600 inserted". Each test now resets and
  imports for itself, verified by running the file under two different `--sequence.shuffle` seeds.

`format:check` failed twice on files this change had already committed — first on four files
(`synthetic-source.ts`, `migrations/README.md`, and both `dataset-import.test.ts` files), then on
the two integration test files after the verification repairs. Both times the cause was committing
without running the gate, which is the failure mode `AGENTS.md` warns about: a green build is not a
green format check. Fixed with `prettier --write` each time; the resulting diff was inspected, and
each touched file re-checked for a BOM, for CRLF, and for U+FFFD — the corruption signature that hit
`AGENTS.md` and `migrations/README.md` in an earlier change.

Assertions proved load-bearing by temporarily breaking the implementation, confirming the expected
tests go red, and restoring it. `openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/tasks.md`
tasks 9.8,
9.9, and 9.12 record exactly which tests failed in each case; the source-write scan added during
verification was proved the same way. A test that has never failed is not known to test anything.

Dataset immutability re-confirmed on this branch: `git hash-object` reports
`acaaa05ac83c3a67f9eb1e81b4432d4b11da6263` (identical to `main`), SHA-256 is
`39F757E61B70386B87EC1BB9410E881DF342027BF580BED9C2F9BEEB2F2E8965`, and `git diff main -- data/` is
empty.

What this evidence explicitly does **not** establish:

- No Supabase client has ever been constructed at runtime and no migration has ever been applied to
  a real project. PostgREST behaviour — including whether a uniqueness violation reports
  `code === "23505"`, whether `.range()` and `count: "exact"` behave as the code assumes, and what
  this project's maximum rows per request is — remains written to documentation, not to observation.
- RLS is proved as the *PostgreSQL engine* evaluates it, through PGlite. Not as the Supabase API
  gateway enforces it. No `authenticated` policy exists yet, by design.
- The three cross-column consistency constraints on `validations` are proved against PGlite only,
  and their correspondence with `applyValidationIntegrityRules` in `@/schemas/validation` is held by
  review rather than by anything executable. They are the same rules stated twice, which is the
  duplication that it is, and the error direction is asymmetric: a constraint that drifts narrower
  lets an invalid row exist, one that drifts wider refuses a real research response. The vocabulary
  *acceptance* tests added during verification read their expected values from the shipped domain
  modules rather than retyping them, so a divergence between SQL and the domain is now caught for
  the accepted values too — but only for the values those modules currently declare.
- The repositories are exercised only against a recording fake. The fake asserts query *shape*; it
  cannot report what a server did with the query.
- `DatasetEntrySink` has no production implementation. The interface and both of its contract clauses
  are proven against a real engine by a test-local sink, but the repository contains no
  Supabase-backed one, so tasks 5.2 and 5.3 are a decided and proven *contract* rather than
  shipping code. Recorded in this change's `tasks.md` under "Explicitly not done here".
- There is still **no screenshot-based or human-eye visual verification** of the landing page, and
  no Vercel deployment — `next start` has never been run.

### Active Blockers

- **No Supabase project credentials.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are absent from the environment and from the repository.
  Schema migrations and application code can be authored and reviewed, but migrations cannot
  be applied and database behavior cannot be verified end to end until a project exists.
  Required to unblock Phase 2+ runtime verification: a Supabase project the team controls,
  with migrations applied via the Supabase CLI or the hosted SQL editor.
- **No local container/PostgreSQL runtime.** `docker`, `psql`, and the `supabase` CLI are not
  installed on this machine, so `supabase start` (local Supabase) is not available as a
  substitute.
  - *Mitigation delivered in `project-foundation`:* a `@electric-sql/pglite` (real PostgreSQL
    compiled to WASM) integration harness now exists, so schema, constraint, and transactional
    logic can be applied and asserted in CI without a container.
    `pnpm run test:integration` exits 0 with 69 passing tests against a real engine, applied from
    the production `supabase/migrations/` directory. The remaining unverified surface is
    Supabase-managed behavior (Auth, Storage, Realtime, the `auth` schema, PostgREST, and RLS as
    enforced by the Supabase API gateway) and the first real migration deploy.
  - *Mitigated, with a caveat recorded:* CI can prove SQL and RLS, and `.github/workflows/verify.yml`
    passed on run 36628918700 (PR #8, `ubuntu-latest`): 14 files / 312 unit tests and 4 files / 69
    integration tests, matching the local counts of the same commit, plus "Compiled successfully"
    for the production build. The preceding run 36628108347 (PR #7) passed with identical counts.
    That run's dataset-guard job was read back from the log and confirmed scoped to
    `1 file / 7 tests` against the literal command
    `pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts`. An
    earlier run had exposed a
    defect in the workflow itself — the guard job's path filter was dropped on Linux, so it ran the
    whole integration suite instead of the file it claimed to isolate. Green did not mean correct.
    No *failing* CI run has ever been observed, so "a failing test blocks the PR" remains inferred.
- **The in-force specs under-describe the screening screen as it actually behaves** (found during
  `thin-shell-call-sites` Apply; **pre-existing, not introduced by any change**, and not closable
  inside that change).
  An independent verification pass checked the claim that `validator-onboarding` "already specifies
  all seven behaviours" the client-shell tests pin, by enumerating the requirement blocks of all
  **nine** in-force specs rather than by grepping for words — because `design-system` contains
  "WHEN a control is disabled THEN it does not respond to activation", which uses the whole
  vocabulary while specifying only the *semantics* of a disabled control, conditioned on *when* it is
  disabled. The measurement:
  — **CLOSED for the onboarding flow by `pending-state-specification`, measured before and after.**
    **Before**, re-derived from the nine in-force specs with no reference to any inherited figure:
    **0 of 181 scenarios** mandated that a control be inert while a write is in flight, and
    `/ready` was named in **0 of the 9** specs. **After** the Sync: **5 of 193**, and `/ready` is named
    7 times. **The load-bearing check is not that those numbers rose — it is that every one of them
    lives inside the requirement this change added.** All 5 inert-during-a-write scenarios and all 7
    `/ready` mentions were required to fall inside an added block; **0 fall outside**. Had any sat in
    a pre-existing requirement, the "0" would have described a state that never existed, the proposal
    would have been wrong, and this entry would be describing a gap that was never there. Measured as
    a **membership** claim, not a count, because a count confirms itself and a membership does not.

    **The retraction history is kept, and its figures are labelled as pre-Sync.** This bullet once read
    "**15** requirement blocks". That figure **does not reproduce** — probed against six definitions of
    both terms, the highest any reached was 3. Its own correction then had the **right count and the
    wrong members**: two definitions yield two **different sets of 3**.

    | Vocabulary | Pre-Sync count | Members |
    | --- | --- | --- |
    | `pending`, `in progress`, `submitting`, `writing`, `busy` | 3 | `domain-contracts`, `interface-localization`, `validator-onboarding` |
    | `disable`, `disabled`, `inert` | 1 | `design-system` |

    The superseded version named `design-system` and omitted `interface-localization`, which matches
    only on the phrase *"the response in progress"* in a scenario about switching language — nothing to
    do with a control being inert during a write. `design-system` was the better match (it says *"and
    disabled states"*), so the earlier correction was right in spirit and wrong in enumeration.
    **Two instruments agreeing on a count over different members is worse than a mismatched count,
    because it reads as confirmation.** That is why the deltas quote only the scenario count, which is
    definition-independent, and name blocks individually wherever any count is given.

    **Post-Sync, the same definitions now reach 5 blocks and 10 scenarios, highest reach 10** — and the
    increase is exactly the two new blocks. **A count measured after the change measures the change**,
    which is the concrete reason the pre-Sync figures are labelled as pre-Sync instead of quietly
    deleted or quietly left standing as if still current.
    The three **pending-state bindings** (`SF-1`
    options inert mid-write, `SF-2` Continue disabled mid-write, `SF-3` skip disabled mid-write) are
    specified **nowhere**, and `SF-2` is one of the sites `design.md` classes as **critical**.
  — the route **`/ready`** is named in **0** of the nine specs, though onward movement after
    screening and enrollment is implied by the `validator-onboarding` sequence.
  What *is* specified: `SF-4` ("Screening precedes identity creation") and `RV-1` ("An existing
  validator is restored").
  — *Consequence for this change:* `skip_specs: true` is **unaffected**. Its criterion is that no
    spec-level behaviour changed, and `git diff main --numstat -- src/` is empty. What was wrong was
    the *rationale* written to support it, which has been corrected in `proposal.md` and `design.md`
    — D7 in place rather than quietly dropped.
  — *Why no requirement was added:* the pending-state bindings **already exist in the
    implementation**, so this is existing behaviour with no requirement, not new behaviour
    introduced here. Writing a requirement for it inside a change that alters no product behaviour is
    precisely the invention `openspec instructions specs` forbids, and that the same proposal
    paragraph already declines on its own reasoning.
  — *What would close it:* a change that **specifies the behaviour that already exists** — a
    `validator-onboarding` requirement for the pending state, and one naming the onward route. That
    is a specification change with a delta, so it needs its own bounded change and is **not**
    `skip_specs`. **That change was `pending-state-specification`**, which has since run all four stages
    (Propose PR #36 `cb347cf`, Apply PR #37 `bf76173`, Sync PR #38 `d3e1627`, Archive PR #39 `ab1c7be`).
    It was sequenced
    **before Phase 5** for the stated reason: Phase 5 extends these same components, so the behaviour
    being extended should be the behaviour that is specified.
  — *Closed at **Sync**, and closed only for what it actually closed.* The blocker is not deleted: the
    four items under *what this change does **not** close* below stay open, and so does the vacuous
    scenario beneath them. What is closed is the **specification gap** — the one this change was created
    to close.
    Measured at Sync, by the transition itself rather than by a comment about it:
    `design-system` **5 → 6** requirements, `validator-onboarding` **7 → 8**, capability count
    unchanged at **9**, scenarios **181 → 193** (+7 and +5, the two deltas' own scenario counts). The
    other **seven** spec files are **byte-identical** to their pre-Sync state, and within the two that
    changed, **no pre-existing requirement or scenario was altered or lost** — each block hashed
    before and after. A count that rose correctly is also compatible with a sync that reworded a
    neighbour, and the per-block hashes are what rule that out.
    **The new requirements were synced verbatim, block quote included** — 28 and 13 block-quote lines
    respectively, none lost. That was measured before merging rather than assumed, because all **47**
    block-quote lines in the entire in-force spec set already sit inside `## Requirements` sections, in
    these same three capabilities, as notes of exactly this genre. Had the convention been the other
    way, "tidying" the quote out of the merged spec would have deleted the sentence saying one of the
    new scenarios **must not be cited as existing coverage** — the sentence this very entry depends on.
    **A merge that improves the document's shape by discarding its caveats is not a merge.**
  — *Four things this change explicitly does **not** close*, recorded so that a reader cannot infer
    them from its title or from the fact that it archived:
    - **`RV-4` still has only a source-scan guard.** "A failed resume must report" is asserted by
      scanning source text for a string. A source scan proves a string is present; it never proves the
      code behaves as the string suggests. The repair is to drive a *failed* resume through an effect
      in the `dom` Vitest project. **This entry previously said that repair "is the first item Phase 5
      should take up", and Phase 5 then declined it — so the prediction was falsified by the work it
      predicted, which is the only kind of falsification worth having.** `validation-experience`
      recorded the decision as its task `0.1` rather than quietly skipping it: `RV-4` is an
      **onboarding** concern, the repair means changing an onboarding component and the onboarding
      tests, and `AGENTS.md` is explicit that a change must not be broadened because a related
      opportunity turned up. The item is therefore **still open**, and what it gained is a worked
      example of the fix's shape rather than a fix. What the example shows, taken from the `dom`
      harness this change built: a resume that fails is a *rejected action*, so it must be driven by
      pressing the control against an injected rejection and asserting what the screen then says — and
      the write has to be **held open** and released by `afterEach`, because a `neverResolves` promise
      left pending leaks into every later test in the file, which is a signature indistinguishable
      from a code defect.
    - **The `Archived Changes` table still has no automated guard.** `grep -r ROADMAP tests/` returns
      no matches, so nothing would notice a row being dropped, a change being archived without a row,
      or a merge SHA going stale. This is the same class of defect as the CI job that reported
      `success` with its steps absent from the step list: **a check whose absence is invisible is not
      a check that passed.**
    - **Server-side idempotency is out of scope**, per `design.md` D2. Single-flight is specified
      against the *client* controls, including the decline affordance, which is a write carrying a
      null answer rather than a cancellation. A server-side guarantee is the stronger one and it would
      need a migration and a schema decision, and this change may not touch `supabase/`. Recorded as a
      Phase 4/5 question rather than smuggled in here.
    - **No browser has ever rendered any screen in this project.** `happy-dom` is a synthetic DOM, so
      every rendering claim anywhere in this ledger is a claim about generated markup and never about
      a pixel. **No human has looked at a page.**
  — *One scenario in the new `design-system` requirement is vacuous today, and the spec says so on its own
    face.* It reached the in-force specs at Sync, and it still cannot fail: "Pending is distinguishable, because no control in `src/`
    is currently disabled for unavailability as opposed to in-flight work — there is no second control
    to confuse pending with, so the scenario has no witness and is not coverage. It is specified
    anyway, because the requirement states the design system's contract rather than today's
    implementation, and a contract may be specified before it is exercised. It becomes observable when a control is disabled for being *unavailable* rather than busy. **That is now
decided, and the decision is NO.** `validation-experience` chooses to **hide** the conditional correction
and translation inputs rather than render them disabled, since hiding is strictly better for a validator
than an inert field they might retype into — and hiding is not disabling, so the scenario **remains
vacuous**. The prediction written here that Phase 5 would close it was wrong in the direction that
flatters the work, which is the kind of claim that survives review precisely because nobody wants to be
the person who reduces a deliverable. **No change is currently scheduled to close it**, and it must not
be counted as evidence that the requirement is implemented.

### Planned Change Sequence

The roadmap is executed as a sequence of bounded OpenSpec changes, one architectural step
The roadmap is executed as a sequence of bounded OpenSpec changes, one architectural step
each, in dependency order. **Items 1-8 are delivered and archived; item 9 is next and has not
been proposed yet.**

> **This list was stale by five completed changes and its numbering was duplicated** — it ran
> 1, 2, 3, 4, 5, 6, 7, 8 and then 6, 7, 8, 9 again, because `required-bilingual-translations` was
> inserted as item 5 without renumbering. The original order also did **not** match the
> dependency rule stated in its own preamble: it placed `coverage-aware-allocation` (Phase 4)
> at item 4 and `required-bilingual-translations` at item 5, while also recording that the
> latter "sits between Phases 3 and 4 in dependency order". The list below is renumbered into
> dependency order, and each item's completion state is read from `openspec/changes/archive/`
> rather than from this prose. **A list that states its own ordering rule and then violates it
> is worse than no list, because the next reader inherits the rule as trustworthy.**

1. ~~`project-foundation`~~ — Phase 1: Next.js/TypeScript/Tailwind shell, design tokens, lint,
   test harness, Zod schemas, Supabase client boundary. **Delivered and archived** (PRs #2-#5).
2. ~~`od-dataset-schema-and-import`~~ — Phase 2: migrations for the six tables, constraints,
   indexes, RLS, and import/verification of the 600 `OD_*` entries. **Delivered and archived**
   (PRs #6-#9) (spec-level only; the hosted half is still outstanding — see Active Blockers).
3. ~~`landing-and-screening`~~ — Phase 3: landing, Ilocano proficiency screening, anonymous
   validator create/restore. **Delivered and archived** (PRs #11-#13).
4. ~~`required-bilingual-translations`~~ — both research translations required for every
   evaluable validation, the forward migration, and the qualifying-coverage definition. A
   prerequisite of Phases 4 and 5, which is why it sits here rather than after item 5.
   **Delivered and archived** (PRs #15-#20).
5. ~~`coverage-aware-allocation`~~ — Phase 4: server-authoritative batch allocation engine.
   **Delivered and archived** (PRs #22-#25), with two limitations carried forward rather than
   fixed, because fixing either is a spec change that was not made.
6. ~~`research-schema-guarantee-coverage`~~ — enforceable qualifying coverage in the database.
   **Delivered and archived** (PRs #26-#28).
7. ~~`interface-localization`~~ — the ENG/FIL public interface, English by default,
   browser-local, never research data. Ordered after the research-translation change because it
   touches the same participant-facing screens. **Delivered and archived** (PRs #29-#32).
8. ~~`thin-shell-call-sites`~~ — the client-shell call sites, whose count and criticality were
   both wrong in the version of this list that inherited them, plus the Phase 4 browser test
   runner. Carried forward from `landing-and-screening`. **Delivered and archived** (PRs
   #33-#34, archive in this PR).
9. **`pending-state-specification`** — **new, and next**: specify the pending-state bindings and
   the onward route that **already exist in the implementation but carry no requirement** (Active
   Blockers). Bounded, changes no product behaviour, and is a specification change **with a
   delta**, so it is explicitly **not** `skip_specs`. Placed before Phase 5 because Phase 5
   extends these same components.
10. **`validation-experience`** — Phase 5: per-entry validation, conditional correction,
    required bilingual translation, immediate persistence. Extends the existing `dom` project.
11. `batch-continuation` — Phase 6: batch completion, continue-or-finish, interrupted-batch
    recovery.
12. `admin-dashboard` — Phase 7: protected researcher dashboard.
13. `export-system` — Phase 8: research-data export pipeline.
14. `quality-assurance` — Phase 9: cross-cutting QA/verification hardening.

### Open Decisions (do not block development)

These correspond to Phase 0 and require thesis-team/adviser input. The roadmap explicitly
allows development to proceed before they are finalized; they are not implemented as
assumptions and must be confirmed before production crowdsourcing (Phase 11):

- target independent validations per entry (planning default: 3, kept configurable);
- which proficiency levels count as *eligible* validations;
- whether `Conversational` validators are eligible;
- disagreement/adjudication rules;
- **anonymous-identifier entropy** (raised by Phase 3, needs a decision before Phase 11).
  The identifier is `VAL_` plus four random bytes, so 32 bits. `createAnonymousValidatorId` and
  the `validators` primary key both pin the 8-hex-character format, so widening it is a
  migration against an already-archived spec rather than a field to change quietly. 2^32 is
  brute-forceable by a determined party against a reachable enrollment surface. The identifier
  is not a credential — it grants no access beyond resuming an anonymous session — but a
  successful guess would let someone continue as another participant and contaminate that
  participant's research record. The right answer depends on the participation model (a
  link-shared pilot versus a public deployment) and on whether an enumeration rate limit is in
  scope, neither of which this repository can decide. **There is no interim mitigation.** An earlier
  version of this entry claimed one - "resume is the only surface that accepts a client-supplied
  identifier, and it answers a yes/no question with no distinguishing error" - and the Phase 3
  design record retracts that claim verbatim as false. The resume action **is** the enumeration
  oracle: unauthenticated, unmetered, no rate limit, a clean boolean over 2^32. "There is no
  second surface" is a restatement of there being one surface, and one is sufficient. A successful
  guess also discloses the other participant's self-reported proficiency. See `design.md` D5 for
  the deferral and the three cheap schema-free options if the exposure is reduced before Phase 11;
- ~~whether optional translations enter the final dataset~~ — **settled by the approved requirements: both translations are required for every evaluable validation**, and the final choice among them is an adjudication-stage decision rather than a collection-stage one;
- whether any demographic data is academically required;
- whether ethics/consent language is required before participation.

### Local Verification Evidence — `landing-and-screening` (2026-09-30, Apply stage)

Recorded from the commands actually run on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`.
**This change is still in Apply. It has not been independently verified and is not archived.**

| Command | Observed result |
| --- | --- |
| `pnpm run lint` | exit 0, no errors, no warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 22 files, **514 tests passed** (up from 14 files / 312) |
| `pnpm run test:integration` | exit 0 — 4 files, **69 tests passed** (unchanged; this change adds no migration) |
| `pnpm run build` | exit 0, "Compiled successfully"; `/`, `/_not-found`, `/ready`, `/start` all prerendered static |
| `openspec validate landing-and-screening --strict` | exit 0, "Change 'landing-and-screening' is valid" |
| `openspec validate --specs --strict` | "Totals: 6 passed, 0 failed (6 items)" — the six main specs are untouched by an unarchived change |

What this evidence explicitly does **not** establish:

- **No Supabase client has ever been constructed.** All three of `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are absent, so `getServerEnv()` throws
  `ServerEnvError` on every real request. The enrollment and resume logic is proven against an
  in-memory fake with exact-value assertions; the hop from the repository to PostgREST is
  unexercised, exactly as in Phase 2. The action logic was deliberately split into
  `onboarding-actions-core.ts` (pure, injected dependencies) and a `"use server"` wrapper precisely
  so that no test needs a database, and so that no test can be mistaken for one that reached one.
- **No browser ever rendered any of this.** `renderToStaticMarkup` produces the HTML a server
  render would. It does not run effects, does not fire click handlers, and does not execute the
  Server Action round trip. The submit-time resume check, the `localStorage` write, and the
  navigation to `/ready` are proven by pure decision functions and unit tests on
  `browser-identity`, not by anything that clicked a button.
- **A successful build is not a behavioural result.** It proves four routes compile. The
  behavioural evidence is the unit suite and the probe runs below. The figure those probes ran
  against has moved across four review rounds, and each probe is recorded against the suite size
  at the time it was run rather than against the current one.
- **WCAG contrast is inferred from token values, not measured.** There is still no human visual
  review of any screen, and `next start` has still never been run.

#### Load-bearing proof

15 deliberate single-line breaks of this change's guarantees, each reverted immediately.
**14 turned the suite red in the expected file.** The one that did not is recorded rather than
hidden: removing the Server Action's identifier check changes no behaviour, because
`isAnonymousValidatorIdFormat` inside the service rejects the same values from the same
`ANONYMOUS_VALIDATOR_ID_PATTERN`. So the check is a duplicate, not a boundary. It was kept and
relabelled in `onboarding-actions-core.ts` as what it actually is — a narrowing parse from
`unknown` to the branded type, with no cast — and a new test
(`tests/unit/validators-identifier-format.test.ts`, 4 valid and 17 near-miss inputs) now pins
that the two format checks agree, so a future second pattern definition cannot make them diverge
silently.

Two defects in the probe harness itself were found and fixed, both of which had briefly produced
false evidence. Worth recording because both are easy to repeat:

1. The first harness restored files with `git checkout --`, which does nothing for an untracked
   file. Three breaks leaked into later probes and inflated the failure counts. Replaced with
   in-memory content restore.
2. The first harness scored a suite that failed to **collect** as "did not go red". A probe
   referencing an unimported component threw at collection time, Vitest reported "no tests", and
   the probe was recorded as a pass. The harness now reports collection failure as its own
   outcome, because *no tests* is not *passed*.

A residue check confirmed all nine probed files were byte-identical afterwards.

#### Phase 3 architecture decisions worth reviewing

- **Screening is answered before the identifier exists** and rides in the single `create` write.
  Creating first and recording proficiency second would need a repository method that does not
  exist, cost two writes, and leave a participant holding an identity with no screening answer if
  they abandoned the flow. This is why the change adds **no migration and no new
  `ValidatorsRepository` method**: the nullable `ilocano_proficiency` column already models the
  state, and this ordering makes it reachable only by *declining*, never by *abandoning*.
- **`localStorage`, not an httpOnly cookie.** A cookie would let the server render "welcome
  back" with no round trip, but it would transmit the identifier on every request to the origin
  — a worse fit for a project whose headline property is anonymity. The cost is that resume is
  an explicit client action, which also means a shared device never silently hands one person
  another's session.
- **Resume is checked at submit time, not revealed on load.** This was originally justified
  as lint compliance — a load-time reveal needs a post-hydration `setState`, "the pattern the
  React lint rules rightly reject". Review checked it and half the claim is false:
  `useSyncExternalStore` lints and typechecks clean, so the reason is not compliance. The
  reason that holds is that storage can say an identifier is *stored* while only the server
  can say it is *recognised*; resolving first would enroll a stale-id participant with no
  screening answer. The submit-time check is also a plain synchronous read and closes a real
  hole: a participant who already holds an
  identity and submits the screening form must not be issued a second one, because that would
  split one person's research record in two with nothing in the stored data able to tell.

#### Phase 3 independent verification: what it found, and what it cost

Verification ran adversarially against the spec and returned **FAIL**, with 2 CRITICAL and 9
WARNING findings. All were repaired before merge. Two are worth recording here rather than only in
the change's `tasks.md`, because both are about the *evidence* rather than the code, and both are
the kind of thing that repeats.

**A collected screening answer was being silently discarded.** The stale-identifier fallback in
`onboarding-flow.ts` returned a hardcoded `answer: null`, and the component forwarded it into the
enrollment. A participant who selected "Fluent" and whose stored identifier had expired was
enrolled as having **declined** — a research datum silently replaced by a different one. The unit
tests were all green, because they were green about the decision function and silent about the call
site. The bug survived a comment that explained the `answer` field existed "so a caller reaching it
with a different answer must not have to re-derive the rule", while the only producer of the field
hardcoded `null`. A field that is always `null` reads as though something is using it. Fixed by
threading the answer through as an explicit parameter, with a regression test over all five
approved values.

**The neutrality claim had no executable evidence, and the record claimed it did.** The test
asserting "screening options are no more weighted than validation options" compared
`answerOptionClasses({selected:false})` to itself. The reviewer proved it empty by replacing the
screening form's `AnswerGroup` with a bespoke group that accented one *unselected* option, and by
deleting the pending state and all error rendering: **the entire 445-test suite stayed green.** The
replaced assertion now reads the *rendered* `class` attribute of every `role="radio"` and compares
it to the shared constant, and the reviewer's exact bypass now goes red.

**The general lesson, because it is the transferable part.** A probe table reporting a high red
ratio invites the reader to assume the remaining behaviours are guarded. Three were not, and no
table can tell you which three. A task file that ends "no requirement is left without executable
evidence" is making a claim about the *whole* suite from evidence about *part* of it, and the
`landing-and-screening` record did exactly that and has retracted it.

Two further honesty notes, because they are the kind that get lost:

- **The review damaged the working tree.** It ran probes in a throwaway `%TEMP%` copy, and all 13
  dependency junctions in the real `node_modules` ended up pointing into it. Deleting the copy left
  them dangling, and `pnpm run typecheck` failed with `Cannot find module
  node_modules/typescript/bin/tsc` — a failure that reads exactly like a code problem and was not
  one. Repaired with `pnpm install --frozen-lockfile`; `git status` and the dataset hash confirmed
  the source tree was untouched.
- **One of my own probe harnesses reported real failures as passes**, because its ANSI-stripping
  regex omitted the escape character so the `Tests … failed` pattern never matched. It was caught
  only by re-checking one probe by hand. A harness that reports "no failures" is
  indistinguishable from one that cannot detect failures.

### A correction about an ARCHIVED change's claims, and what it does not say

The archived `landing-and-screening` review recorded that its findings **S2** (`SF-5`, the missing
`router.push("/ready")` after enrollment) and **R6** (`RV-2`, the same push inside the resume
component's click handler) had been repaired. **That claim does not hold against the current code.**
Re-derived by mutation on `feat/thin-shell-call-sites`, both sites were measured **unguarded**: no
test in the `unit` project observed either one, and at the time of measurement `router.push` had
**0 hits anywhere in `tests/unit`**.

**What this does NOT say.** It does **not** say the archived change was wrong when it was written, and
it does **not** modify any archived artifact. Its line-number anchors had simply moved across four
changes merged since, and a repair claim tied to a line number is a claim about a location rather than
about a behaviour. `git diff main -- openspec/changes/archive/ openspec/specs/` is empty for this
change.

**Both sites are now guarded behaviourally**, by real clicks and real form submits in `tests/dom/`
rather than by a source scan — which is the only reason the claim could be re-tested at all. The
general lesson is recorded in `AGENTS.md`: **a remediation claim inherited from an archive is an
enumeration to be re-derived, not a fact to be inherited**, and its labels did not survive re-reading
either. The archived table called one line "S21, the PRIMARY submit disabled, critical"; in the
current file `disabled={isPending}` occurs exactly **once** and belongs to the `AnswerGroup`, while
**both** buttons bind `disabled={submitState.disabled}` — so a probe anchored on the archived label
mutates the *skip* affordance and calls it the primary submit.

## 1. Project Goal

Build a lightweight crowdsourcing website for validating the synthesized Ilocano navigation dataset used by the Sadino thesis project.

The website will present synthetic Ilocano navigation instructions to human validators, collect structured judgments, request corrections when needed, collect both an English and a Filipino translation of every evaluable validated Ilocano sentence, and store all responses for later research analysis and final dataset construction.

The platform should be easy to deploy, easy to use on mobile devices, and simple enough that validators can complete repeated 10-item batches without fatigue.

---

## 2. Core Product Principles

### Research-first
The website exists to collect reliable validation data. Visual design should support accuracy, readability, and low cognitive load.

### Anonymous by default
Do not require personally identifying information unless the thesis methodology later requires it.

Each validator receives an anonymous identifier such as:

```json
{
  "validator_id": "VAL_a81d92c1"
}
```

### Small-batch participation
No validator is expected to review the full dataset.

Validators receive 10 entries per batch and may either:

- validate another batch of 10; or
- finish for the current session.

### Independent validation
The same dataset entry may be shown to multiple different validators.

The same validator should not receive the same entry more than once.

### Bilingual research response
Every **evaluable** validation carries **both** an English translation and a Filipino translation of the validated Ilocano sentence. This is research data, collected per validator, and it is required rather than optional. See section 6.7.

### Bilingual interface
The public validator interface is available in **English** and **Filipino**, with English as the default. This is interface accessibility so that a participant who is comfortable in Ilocano is not blocked by an English-only website. It is presentation only: it never changes a stored research value, never translates the synthetic Ilocano dataset, and is never recorded as research data. See section 6.10.

### Preserve raw synthetic data
Never overwrite the original synthesized dataset.

The platform stores validation responses separately and produces the final validated dataset only after research review or adjudication.

---

## 3. Approved Technology Stack

### Application
- Next.js
- TypeScript
- App Router

### Styling
- Tailwind CSS
- shadcn/ui where useful
- Custom soft neo-brutalist design system

### Backend and Database
- Supabase
- PostgreSQL
- Supabase server/client libraries

### Validation
- Zod

### Hosting
- Vercel

### Repository
- GitHub

### Intended Agent / Frontend Skills

Use the following skills when they are available in the coding environment:

- `industrial-brutalist-ui` — primary visual foundation for the soft neo-brutalist interface.
- `high-end-visual-design` — refinement layer for spacing, hierarchy, polish, restraint, and overall visual quality.
- `full-output-enforcement` — helps ensure implementation work is complete rather than placeholder-driven or partially finished.
- `design-taste-frontend` — optional and primarily intended for the public landing/introduction experience, not as the governing skill for the multi-step validation workflow.

#### Skill hierarchy

When multiple design skills are active, apply them in this order of responsibility:

1. **`industrial-brutalist-ui`** defines the core visual language.
2. **`high-end-visual-design`** softens and refines that language into a polished, accessible soft neo-brutalist experience.
3. **`full-output-enforcement`** governs implementation completeness.
4. **`design-taste-frontend`** may enhance the landing page, but must not override the approved validation flow or research UX constraints.

The implementation model must interpret these skills with the following project-specific instruction:

> Use `industrial-brutalist-ui` as the visual foundation and `high-end-visual-design` as the refinement layer. The target aesthetic is strictly **soft neo-brutalism**. Preserve creative freedom over layout, composition, component placement, spacing, responsive arrangement, visual rhythm, and decorative treatment. Do not mechanically copy a reference layout. Usability, accessibility, readability, and validation accuracy take priority over visual experimentation.

Do not let any skill override the approved product behavior in this roadmap. In particular, screening order, anonymous validator handling, batch allocation, validation choices, correction requirements, translation behavior, persistence rules, and batch continuation are product requirements rather than creative design decisions.

---

## 4. Visual Design Direction

The visual design is **strictly soft neo-brutalism**.

The implementation model should have creative freedom over:
- component placement;
- composition;
- spacing;
- responsive arrangement;
- visual rhythm;
- decorative treatment;
- exact landing-page composition;
- interaction presentation.

Do **not** prescribe a rigid pixel-by-pixel layout in advance.

The design must still follow these constraints:

- bold, visible borders;
- hard offset shadows;
- tactile buttons and controls;
- strong typographic hierarchy;
- warm or light neutral backgrounds;
- restrained accent colors;
- slightly softened corners;
- generous whitespace;
- clear focus states;
- mobile-first responsive behavior;
- subtle and fast motion;
- readable body text;
- accessible contrast;
- no chaotic or overly aggressive brutalist treatment.

Avoid:
- military or terminal aesthetics;
- excessive black/red styling;
- giant novelty typography for body content;
- unnecessary animation;
- excessive decorative noise;
- layouts that make validation harder;
- visual choices that bias users toward a particular answer.

The interface should feel playful and memorable without looking like a conventional Google Form.

---

## 5. Current Dataset

The first supported category is:

**Origin + Destination**

Current synthetic dataset file:

```text
data/ilocano-synthetic-data.json
```

Current record schema:

```json
{
  "id": "OD_0001",
  "instruction": "Synthetic Ilocano navigation instruction",
  "output": {
    "origin": "Origin Place",
    "destination": "Destination Place",
    "transit_mode": null
  }
}
```

The architecture must not be hard-coded only for `OD_*` records.

The long-term system should support all five dataset categories through a shared dataset-entry model.

---

# 6. User Flow

## 6.1 Landing Page

Purpose:
- explain what Sadino validation is;
- explain that participation is voluntary;
- explain that validators will review short Ilocano navigation sentences;
- explain that each round contains 10 entries;
- provide a clear Start Validation action.

Keep the explanation short enough to understand in a few seconds.

---

## 6.2 Validator Screening

Before receiving dataset entries, ask:

> **How comfortable are you with Ilocano?**
>
> This helps us understand the background of our validators.
>
> - Native / first-language speaker
> - Fluent
> - Conversational
> - Basic
> - Not confident

Store the answer as a self-reported validator attribute.

Example:

```json
{
  "validator_id": "VAL_a81d92c1",
  "ilocano_proficiency": "fluent"
}
```

Do not automatically treat proficiency as a quality score.

The thesis team will determine later which proficiency levels count toward the required number of independent validations.

---

## 6.3 Anonymous Validator Creation

When a new participant begins:

1. Generate an anonymous validator ID.
2. Store it in the database.
3. Store the ID locally in the browser.
4. Reuse the same ID on later visits when possible.
5. Do not ask for name, email, student ID, phone number, or other identifying information unless explicitly required by the research methodology.

---

## 6.4 Batch Assignment

Each batch contains:

```text
10 dataset entries
```

The backend, not the frontend, decides which entries are assigned.

Assignment should be **coverage-aware randomized distribution** rather than pure random selection.

### Allocation rules

For a validator requesting a batch:

1. Exclude entries already answered by that validator.
2. For each candidate, count its **qualifying completed validations** (section 9). This is **not** the raw validation count.
3. Exclude entries whose qualifying count has reached the configured target.
4. Prioritize entries with the lowest **qualifying** count.
5. Randomize entries within the lowest-qualifying-count candidate pool.
6. Return up to 10 entries.
7. Reserve or assign those entries to the active batch.

A `cannot_evaluate` response raises the qualifying count by **zero**. Neither does a partial response, nor a legacy row that predates the bilingual requirement and is missing either translation. Three raw responses of which only two carry both translations is **not** coverage: the entry stays in the pool and is offered to another validator.

Different validators are allowed and expected to receive the same dataset entry.

The same validator must not validate the same entry twice.

Recommended database constraint:

```text
UNIQUE (validator_id, dataset_entry_id)
```

### Initial validation target

Use a configurable target, initially:

```text
3 QUALIFYING completed validations from 3 distinct validators per entry
```

This value must be configurable because the final number should be approved by the thesis team/adviser.

Worked example for `OD_0123`, target 3:

```text
Validator A   evaluation + correction where required + English + Filipino   -> qualifying
Validator B   evaluation + correction where required + English + Filipino   -> qualifying
Validator C   evaluation + correction where required + English + Filipino   -> qualifying

3 / 3 qualifying  ->  coverage complete  ->  remove from normal allocation
```

A fourth validator is **not** collected merely because their free-text corrections or translations disagree with the first three. Disagreement after collection is flagged for researcher review and adjudication instead.

---

## 6.5 Validation Screen

For each assigned entry, display:

- the Ilocano instruction;
- intended origin;
- intended destination;
- category if useful;
- batch progress;
- four evaluation choices;
- **when the evaluation is evaluable**, required fields for an English translation and a Filipino translation of the validated Ilocano sentence (section 6.7).

Question:

> **Does the Ilocano sentence correctly express the intended information?**

Choices:

- Correct and natural
- Correct but sounds unnatural
- Incorrect
- Cannot confidently evaluate

The frontend model may creatively decide how to arrange these elements, provided the hierarchy remains clear and the interface stays accessible.

---

## 6.6 Conditional Correction

### If `Correct and natural`
No correction is required, and **a correction is not accepted** for this evaluation.

The original synthetic Ilocano instruction is the validated Ilocano sentence for this response.

Proceed to the **required** bilingual translation step.

### If `Correct but sounds unnatural`
Require:

> Provide a more natural Ilocano version.

The validator must enter a corrected/rephrased Ilocano sentence before continuing.

Both translations must correspond to the **corrected** Ilocano sentence, not to the original unnatural wording.

### If `Incorrect`
Require:

> Provide the corrected Ilocano version.

The validator must enter a corrected Ilocano sentence before continuing.

Both translations must correspond to the **corrected** Ilocano sentence.

### If `Cannot confidently evaluate`
No correction, **no English translation, and no Filipino translation**. The response is still persisted where appropriate for the research record.

It does **not** count toward qualifying coverage and does not move the entry closer to completion.

Proceed to the next dataset entry.

---

## 6.7 Required Bilingual Research Translation

For every **evaluable** validation, the validator supplies **both** translations of the validated Ilocano sentence:

> **English translation**

> **Filipino translation**

Both are required. There is no "Skip translation" choice for an evaluable response, and a response that omits either one is incomplete.

Only show the translation step after the validator has completed the Ilocano evaluation and any required correction. This ordering matters: the translations are of the **validated** sentence, which is the correction where one was required, and the original synthetic instruction where it was not.

| Evaluation | Correction | English | Filipino |
| --- | --- | --- | --- |
| Correct and natural | not accepted | required | required |
| Correct but sounds unnatural | required | required | required |
| Incorrect | required | required | required |
| Cannot confidently evaluate | none | absent | absent |

The conceptual flow for an evaluable entry:

```text
Ilocano sentence
    ->
Evaluation
    ->
Correction if required
    ->
English translation of the validated Ilocano
    ->
Filipino translation of the validated Ilocano
    ->
Submit completed response
```

These translations are **research response data**. They belong to the validator's response, they are attributed to that validator, and they never overwrite the synthetic dataset. Three validators' translations are **not** collapsed into one string during collection; choosing the final validated Ilocano, English, and Filipino is the later, thesis-approved adjudication step (section 11).

---

## 6.8 Saving Strategy

Save progress after every completed entry.

Do not wait until all 10 entries are finished before persisting responses.

Benefits:
- browser closure does not lose completed work;
- mobile connection interruptions lose less data;
- partial sessions remain usable;
- batch recovery becomes possible.

---

## 6.9 Batch Completion

After 10 entries:

Show a completion state with:

- number validated in the batch;
- validator's total contribution count;
- option to validate another 10;
- option to finish.

Example behavior:

```text
Batch complete

You validated 10 sentences.
Total contributions: 30

[ Validate 10 More ]
[ Finish For Now ]
```

If the validator continues, request a new coverage-aware batch.

If the validator finishes, retain all submitted responses.

---

## 6.10 Interface Localization (separate from research translation)

> **This section is not about dataset translation.** The ENG/FIL switcher below and the required
> research translations in 6.7 are two unrelated features that happen to share a word. Research
> translations are validator-authored data about a dataset entry. Interface localization is
> browser-local presentation state. They must never be described with the same term.

| | Research translation | Interface localization |
| --- | --- | --- |
| What | English + Filipino rendering of a validated Ilocano sentence | English or Filipino rendering of the website's own interface copy |
| Who writes it | the validator, as research data | the project, as approved copy |
| Where it lives | validation research data | a browser-local preference |
| Required | yes, for every evaluable validation | no; English is the default and switching is always optional |

The public validator interface supports **ENG** and **FIL**, with an obvious language switcher such as `ENG | FIL`. The visual placement of the control is left to the design, provided it is consistently accessible and easy to discover without dominating the validation task.

Localization covers user-facing interface text: landing copy, navigation labels, buttons, screening instructions, participation and privacy notices, the validation question, the four evaluation choice labels, correction instructions, the English and Filipino translation-field instructions, progress, error messages, empty states, batch-completion copy, and the continue and finish controls.

Localization must **not** touch:

- the synthetic Ilocano dataset instruction;
- a validator's corrected Ilocano text;
- a validator's English or Filipino translation text;
- place names;
- dataset identifiers;
- machine-readable evaluation values;
- research records.

The stored value stays `correct_natural` whether the interface shows its English label or its Filipino label. **Localization changes presentation only and never changes the meaning or the stored research value of an answer.**

**Persistence and state.** English is the default for a new browser or session. If a validator switches to Filipino, the preference is remembered locally and preserved across navigation and later visits where practical. Switching language must **not** erase or reset the current screening answer, the current validation selection, any correction text, either translation text, or batch progress. It is presentation state and is not automatically treated as research data.

Do **not** infer that a Filipino interface indicates lower English proficiency, or draw any similar research conclusion from the locale. Do **not** persist the interface locale to the research database unless a future approved methodology explicitly requires it.

The interface currently hardcodes `lang="en"` in `src/app/layout.tsx`; there is no locale infrastructure at all. This is greenfield.

---

# 7. Recommended Data Model

## 7.1 `dataset_entries`

Stores imported synthetic data.

Suggested fields:

```text
id
category
instruction
origin
destination
transit_mode
created_at
is_active
```

Example:

```json
{
  "id": "OD_0123",
  "category": "origin_destination",
  "instruction": "...",
  "origin": "...",
  "destination": "...",
  "transit_mode": null
}
```

---

## 7.2 `validators`

Stores anonymous validator profiles.

Suggested fields:

```text
id
ilocano_proficiency
created_at
last_active_at
total_validations
```

Do not store personally identifying information by default.

---

## 7.3 `validation_sessions`

Represents one site session or one contribution run.

Suggested fields:

```text
id
validator_id
started_at
completed_at
status
```

Possible status values:

```text
active
completed
abandoned
```

---

## 7.4 `validation_batches`

Represents a batch of up to 10 assigned entries.

Suggested fields:

```text
id
validator_id
session_id
created_at
completed_at
status
```

---

## 7.5 `batch_entries`

Tracks which entries were assigned to a batch.

Suggested fields:

```text
batch_id
dataset_entry_id
position
assigned_at
completed_at
```

This prevents accidental reordering or reassignment while a validator is already working through a batch.

---

## 7.6 `validations`

Stores the actual human judgment.

Suggested fields:

```text
id
validator_id
session_id
batch_id
dataset_entry_id
evaluation
corrected_instruction
english_translation
filipino_translation
created_at
updated_at
```

> **Superseded representation.** The earlier single pair `translation_language` +
> `translation_text` cannot express the approved requirement, because one response must carry
> **both** translations. It is replaced by the two explicit columns above rather than extended,
> because a nullable language discriminator on a now-required pair of values is a representation
> that permits states the research forbids. A **forward migration** is required; migration history
> is not rewritten.

Allowed `evaluation` values:

```text
correct_natural
correct_unnatural
incorrect
cannot_evaluate
```

Examples, each of which is a legal row and each of whose neighbours is not:

```json
// evaluable, natural, both translations present - qualifying
{
  "evaluation": "correct_natural",
  "corrected_instruction": null,
  "english_translation": "Go left at the intersection, then continue straight.",
  "filipino_translation": "Pumunta sa kaliwa sa intersection, pagkatapos ay magpatuloy nang tuwing."
}

// evaluable, correction supplied, both translations describe the CORRECTED sentence
{
  "evaluation": "correct_unnatural",
  "corrected_instruction": "Pumunta sa kaliwa pagkatapos ay magpatuloy.",
  "english_translation": "Turn left, then continue.",
  "filipino_translation": "Pumunta sa kaliwa, pagkatapos ay magpatuloy."
}

// cannot_evaluate: no correction, no translations
{
  "evaluation": "cannot_evaluate",
  "corrected_instruction": null,
  "english_translation": null,
  "filipino_translation": null
}
```

The database rejects: an evaluable row missing English, an evaluable row with blank English, an evaluable row missing Filipino, an evaluable row with blank Filipino, a `cannot_evaluate` row carrying either or both translations, a `correct_unnatural` or `incorrect` row without its correction, and a `correct_natural` row carrying a correction.

---

# 8. Validation Integrity Rules

Implement the following rules at both application and database levels where possible.

### Rule 1
A validator cannot validate the same dataset entry twice.

### Rule 2
A validation must reference an existing dataset entry.

### Rule 3
`correct_unnatural` requires a corrected Ilocano instruction.

### Rule 4
`incorrect` requires a corrected Ilocano instruction.

### Rule 5
`cannot_evaluate` must not require correction.

### Rule 6
Every **evaluable** validation requires an **English** translation and a **Filipino** translation of the validated Ilocano sentence. Both are non-empty. There is no skip option for an evaluable response.

### Rule 7
Both translations describe the **validated** Ilocano sentence: the correction where one was required, and the original synthetic instruction where none was. A translation of the pre-correction wording alongside a correction is not a valid response.

### Rule 11
`cannot_evaluate` must carry **no** English translation and **no** Filipino translation.

### Rule 12
A `correct_natural` response must not carry a correction; the original synthetic instruction is the validated Ilocano sentence for that response.

### Rule 13
Corrections and translations are response data. They belong to the validator's response and never overwrite the synthetic dataset.

### Rule 14
Only a **qualifying completed validation** counts toward coverage: an evaluable evaluation, any required correction present, both translations non-empty, all integrity checks satisfied, and a distinct anonymous validator. A `cannot_evaluate`, a partial response, and a legacy or incomplete response missing either translation all count **zero**.

### Rule 8
Do not alter the original synthetic instruction when a validator submits a correction.

### Rule 9
Store each validator's correction separately.

### Rule 10
Completion counts must be based on unique independent validators, not raw duplicate submissions.

This is necessary but **not sufficient**: see Rule 14. Counting distinct validators over all rows would still let a `cannot_evaluate` or an incomplete response advance an entry, which the approved requirements forbid.

---

# 9. Validation Coverage Logic

For each dataset entry, the system should be able to determine:

```text
total validations                    (diagnostic only; NOT the coverage number)
qualifying completed validations     (the coverage number)
correct-natural count
correct-unnatural count
incorrect count
cannot-evaluate count               (tracked, never counts toward coverage)
incomplete bilingual responses      (tracked, never counts toward coverage)
```

**A QUALIFYING COMPLETED VALIDATION requires all of:**

- the evaluation is `correct_natural`, `correct_unnatural`, or `incorrect`;
- any required Ilocano correction is present;
- the English translation is non-empty;
- the Filipino translation is non-empty;
- every domain, server, and database integrity check succeeds;
- it belongs to a **distinct** anonymous validator.

`cannot_evaluate` does not count. A partial response does not count. A legacy or incomplete response missing either required translation does not count. The raw validation count must not be used as a proxy for any of this, because three raw responses of which only two carry both translations is **not** coverage.

The site should distinguish between:

### Pending
The entry has not yet received the configured number of **qualifying** completed validations from distinct validators. It remains eligible for allocation.

### Coverage complete
The entry has reached the configured target of qualifying completed validations from 3 distinct validators. Normal allocation **stops**. A fourth validator is not collected merely because free-text corrections or translations disagree.

### Requires research review
The entry has sufficient qualifying validations but contains meaningful disagreement or competing corrections. This is flagged for researcher review and adjudication; it does not trigger further collection during the crowdsourcing phase.

Do not automatically create the final validated Ilocano sentence solely through majority voting unless the thesis methodology explicitly approves that rule.

---

# 10. Researcher / Admin Dashboard

> Researchers must be able to inspect, per validator and per entry: the evaluation, the Ilocano correction where applicable, the **English** translation, the **Filipino** translation, and **whether that response qualifies toward coverage** (section 9). Exports preserve the two translations as separate fields. Three validators' translations are never collapsed into one string during collection; choosing the final validated Ilocano, English, and Filipino belongs to the later, thesis-approved adjudication stage (section 11).

> The admin area must not present an interface-language preference as a research attribute, and must not treat a Filipino interface as evidence about a validator's English proficiency.

Create a protected admin area for the thesis team.

Minimum dashboard features:

### Overview
- total synthetic entries;
- total validations;
- total validators;
- active dataset categories;
- overall completion percentage.

### Coverage
- entries with 0 validations;
- entries with 1 validation;
- entries with 2 validations;
- entries with target validation count;
- entries beyond target if manually allowed.

### Evaluation distribution
- correct and natural;
- correct but unnatural;
- incorrect;
- cannot confidently evaluate.

### Proficiency breakdown
- native / first-language speaker;
- fluent;
- conversational;
- basic;
- not confident.

### Entry review
Researchers should be able to inspect one dataset entry and see:

```text
Original synthetic instruction
Origin
Destination
Transit mode

Validator A
Proficiency
Evaluation
Correction
Translation

Validator B
Proficiency
Evaluation
Correction
Translation

Validator C
Proficiency
Evaluation
Correction
Translation
```

### Filters
Allow filtering by:

- category;
- validation status;
- validation count;
- evaluation;
- validator proficiency;
- entries requiring review.

### Export
Support export of:

- raw validation responses;
- per-entry validation summaries;
- final adjudicated dataset;
- JSON;
- CSV where useful.

---

# 11. Final Dataset Workflow

The platform should maintain a clear separation between:

```text
Synthetic dataset
       ↓
Human validation responses
       ↓
Research review / adjudication
       ↓
Final validated dataset
```

Never mutate the imported source dataset in place.

The final validated JSON should be generated only after the thesis team defines and applies its adjudication rules.

The final export should preserve the schema expected by the model-training pipeline.

---

# 12. Security and Privacy

### Public validation area
- no direct database credentials in the browser;
- validate all writes server-side;
- rate-limit suspicious submission patterns where practical;
- sanitize text input;
- use Zod schemas for request validation;
- use Supabase Row Level Security where appropriate.

### Admin area
- protected authentication;
- only approved research team members can access raw validation records and exports.

### Privacy
By default, do not collect:
- full name;
- email;
- student ID;
- phone number;
- address;
- social-media account.

If personally identifiable or demographic information is later required, update the methodology, consent flow, database schema, and privacy notice before collection.

---

# 13. Accessibility and UX Requirements

The site should be usable on:
- smartphones;
- tablets;
- laptops;
- desktop browsers.

Requirements:

- large tap targets;
- keyboard navigation;
- clear focus states;
- sufficient contrast;
- readable font sizes;
- semantic form controls;
- screen-reader labels;
- no essential information conveyed only by color;
- responsive layout;
- no forced hover interaction;
- no horizontal scrolling during validation;
- clear progress indication;
- confirmation before losing unfinished correction text where appropriate.

---

# 14. Suggested Application Routes

The exact page composition is intentionally left to the implementation model.

Suggested route responsibilities:

```text
/
Landing / introduction

/start
Screening and anonymous validator setup

/validate
Active validation batch

/complete
Batch completion / continue-or-finish state

/admin
Research dashboard

/admin/entries
Dataset coverage and entry review

/admin/validators
Anonymous validator statistics

/admin/export
Dataset and validation exports
```

Route naming may change if a cleaner implementation is discovered.

---

# 15. Recommended Project Structure

The implementation model may refine this structure.

```text
src/
  app/
    (public)/
    (validation)/
    admin/
    api/

  components/
    validation/
    screening/
    progress/
    admin/
    ui/

  lib/
    supabase/
    validation/
    allocation/
    datasets/
    exports/

  schemas/
    validator.ts
    validation.ts
    dataset.ts

  types/

  styles/

supabase/
  migrations/
  seed/

data/
  data/ilocano-synthetic-data.json
```

---

# 16. Development Phases

## Phase 0 — Methodology Confirmation

Before production crowdsourcing begins, confirm with the thesis team/adviser:

- target number of independent validators per entry;
- which Ilocano proficiency levels count toward the target;
- whether `Conversational` validators are considered eligible;
- disagreement/adjudication rules;
- ~~whether optional translations will be used in the final dataset~~ — **settled by the approved requirements: both are collected, and adjudication chooses among them**;
- whether any demographic information is academically required;
- whether ethics/consent language is required before participation.

Development may begin before all of these are finalized, but production data collection should not.

---

## Phase 1 — Project Foundation

Tasks:

- initialize Next.js + TypeScript project;
- configure Tailwind;
- configure shadcn/ui if used;
- configure Supabase project;
- configure environment variables;
- establish soft neo-brutalist design tokens;
- set up linting and formatting;
- define shared TypeScript types;
- define Zod schemas.

Deliverable:

```text
Deployable application shell
```

---

## Phase 2 — Database and Dataset Import

Tasks:

- create database migrations;
- create `dataset_entries`;
- create `validators`;
- create `validation_sessions`;
- create `validation_batches`;
- create `batch_entries`;
- create `validations`;
- add constraints and indexes;
- import `data/ilocano-synthetic-data.json`;
- verify all 600 records;
- add category support.

Deliverable:

```text
Supabase database containing the Origin + Destination dataset
```

---

## Phase 3 — Landing and Screening

Tasks:

- build public landing experience;
- explain crowdsourcing task;
- build Ilocano proficiency screening;
- generate anonymous validator IDs;
- persist validator ID locally;
- create or restore validator record;
- add basic participation/privacy notice.

Deliverable:

```text
User can start as an anonymous validator
```

---

## Phase 4 — Allocation Engine

Tasks:

- implement coverage-aware assignment driven by **qualifying** coverage (section 9), not raw validation count;
- exclude previously answered entries;
- for each candidate, count qualifying completed validations from distinct validators;
- treat a `cannot_evaluate` response as **zero** toward the qualifying count;
- treat a partial or legacy-incomplete response, one missing either required translation, as **zero**;
- prioritize lowest **qualifying** count;
- randomize candidate selection within the lowest-qualifying-count pool;
- create 10-entry batch;
- reserve batch entries;
- prevent duplicate validator-entry assignments;
- stop normal allocation once the qualifying count reaches the target;
- **do not** collect a fourth validator merely because corrections or translations disagree; flag it instead;
- make the qualifying-coverage target configurable, initially 3.

> **Dependency.** This phase requires the required-bilingual-translations change, because the
> qualifying definition depends on both translations being present. Building it against the
> superseded optional-translation model would produce allocation logic that counts responses the
> approved methodology says do not count.

Deliverable:

```text
A validator receives a valid randomized 10-entry batch, chosen by qualifying coverage
```

---

## Phase 5 — Core Validation Experience

Tasks:

- display one entry at a time;
- show instruction + intended origin + destination;
- show progress;
- implement four evaluation choices;
- implement conditional correction;
- implement **required bilingual translation**: English and Filipino, both required for every evaluable response;
- make the translations describe the **validated** Ilocano sentence, not the pre-correction wording;
- provide **no** skip-translation option for an evaluable response;
- carry neither translation on a `cannot_evaluate` response;
- save each completed response immediately;
- support safe navigation between entries in the active batch;
- prevent invalid submissions.

Per evaluable entry the flow is:

```text
Ilocano sentence
    ->
Evaluation
    ->
Correction if required
    ->
English translation
    ->
Filipino translation
    ->
Submit completed response
```

> **Dependency.** Requires the required-bilingual-translations change. The composition and
> layout stay under the approved soft neo-brutalist direction, but there is no longer a layout in
> which "Skip translation" is one of the options.

Deliverable:

```text
Complete end-to-end human validation flow with both research translations
```

---

## Phase 6 — Batch Completion and Continuation

Tasks:

- build batch-complete state;
- show contribution count;
- allow `Validate 10 More`;
- allow `Finish For Now`;
- create a new batch when continuing;
- restore interrupted active batches where practical.

Deliverable:

```text
Continuous voluntary crowdsourcing loop
```

---

## Phase 7 — Admin Dashboard

Tasks:

- protect admin routes;
- implement overview statistics;
- implement coverage visualization;
- implement entry-level review;
- show validator proficiency metadata;
- show submitted corrections;
- show the **English and Filipino** translations per validator and per entry, side by side and **not** merged;
- show whether each response **qualifies toward coverage**, and why not when it does not;
- keep coverage displays computed from qualifying counts;
- flag disagreement/review cases;
- add useful filters and search;
- never present the interface locale as a research attribute.

Deliverable:

```text
Research team can monitor validation progress and inspect responses
```

---

## Phase 8 — Export System

Tasks:

- export raw validations with `english_translation` and `filipino_translation` as **separate fields**, preserving each validator's own text;
- export validation summaries, reporting qualifying and non-qualifying counts distinctly;
- never collapse three validators' translations into one string during export;
- export category-specific data;
- add JSON export;
- add CSV export where useful;
- prepare final-dataset export pipeline;
- keep final adjudication logic configurable.

Deliverable:

```text
Research-ready dataset exports
```

---

## Phase 9 — Quality Assurance

> Added to the QA scope by the required-bilingual-translations change: the schema must be verified to **reject** an evaluable response missing English, an evaluable response with blank English, an evaluable response missing Filipino, an evaluable response with blank Filipino, a `cannot_evaluate` response carrying English, carrying Filipino, or carrying both, a correction-required evaluation without its correction, and a prohibited correction on `correct_natural`. It must be verified to **accept** `correct_natural` with both translations, `correct_unnatural` with a correction and both translations, `incorrect` with a correction and both translations, and `cannot_evaluate` with no correction and no translations. Each rejection is matched against the **named** constraint, because a generic "check constraint" pattern passes when the wrong constraint fires.

Test:

### Dataset
- all imported records exist;
- IDs remain unique;
- categories are correct;
- source data is unchanged.

### Assignment
- same validator never receives duplicate entry;
- different validators can receive same entry;
- lowest-coverage entries are prioritized;
- completed entries stop being assigned when appropriate.

### Validation
- conditional fields work correctly;
- correction is required for unnatural/incorrect;
- both English and Filipino translations are required for every evaluable response;
- both translations describe the validated Ilocano sentence, not the pre-correction wording;
- the schema rejects an evaluable response missing either translation or carrying a blank one;
- cannot-evaluate carries neither translation and does not count toward qualifying coverage;
- an incomplete bilingual response does not count toward qualifying coverage;
- progress is saved after each item.

### UX
- mobile;
- tablet;
- desktop;
- keyboard;
- slow connection;
- page refresh;
- interrupted batch.

### Security
- unauthorized users cannot access admin;
- invalid writes are rejected;
- duplicate validation attempts fail;
- server-side validation is enforced.

Deliverable:

```text
Production candidate
```

---

## Phase 10 — Pilot Validation

Before full crowdsourcing:

1. Recruit a small pilot group.
2. Ask them to validate a limited number of entries.
3. Observe confusion points.
4. Review corrections and answer patterns.
5. Verify randomization and coverage.
6. Verify database integrity.
7. Review whether validators understand the four evaluation choices.
8. Review whether the visual design causes any answer bias.
9. Adjust copy or flow if necessary.
10. Freeze the production validation protocol.

Deliverable:

```text
Approved production validation workflow
```

---

## Phase 11 — Production Crowdsourcing

Tasks:

- deploy production site;
- distribute validation link;
- monitor coverage;
- monitor error logs;
- monitor suspicious duplicate behavior;
- monitor category balance;
- periodically export backups;
- stop assigning entries when target coverage is reached.

Deliverable:

```text
Collected crowdsourced validation dataset
```

---

## Phase 12 — Research Review and Finalization

After enough responses are collected:

- identify agreement cases;
- identify disagreement cases;
- review submitted corrections;
- apply thesis-approved adjudication rules;
- determine final validated Ilocano instruction;
- retain provenance linking final records to source entries and validator responses;
- export final validated dataset;
- document methodology and counts for the thesis.

Deliverable:

```text
Final validated Ilocano dataset
```

---

# 17. MVP Scope

The first usable MVP should include only:

- Origin + Destination dataset;
- anonymous validator creation;
- Ilocano proficiency screening;
- batch assignment;
- 10 entries per batch;
- four evaluation choices;
- conditional correction;
- **required bilingual research translation** (English and Filipino, both required for every evaluable response);
- **bilingual public interface** (ENG/FIL, English default, browser-local);
- immediate response persistence;
- contribution count;
- continue or finish;
- minimal admin progress view.

Do not delay the MVP for:

- advanced gamification;
- public leaderboards;
- social features;
- badges;
- accounts for validators;
- complex analytics;
- AI-powered correction;
- automated adjudication;
- map rendering;
- navigation/routing features.

---

# 18. Post-MVP Expansion

After the Origin + Destination category is stable:

1. import the remaining dataset categories;
2. reuse the same validator workflow;
3. extend intended-information display per category;
4. balance allocation across categories;
5. add category-level completion tracking;
6. improve admin analysis;
7. add final adjudication workflow;
8. refine exports for the full thesis dataset.

---

# 19. Explicit Non-Goals

This crowdsourcing website is **not**:

- the final Sadino navigation application;
- a route planner;
- a map interface;
- a transport recommendation engine;
- a social network;
- a general-purpose translation service (it collects research translations as validator response data; it is not a translation product);
- an AI correction service;
- a replacement for human validation.

Its purpose is specifically to support **human validation of synthesized thesis dataset entries**.

---

# 20. Definition of Success

The platform is successful when:

- validators can understand the task with minimal explanation;
- validators can complete a 10-item batch comfortably on mobile;
- the same person is not shown the same entry twice;
- entries are distributed fairly across validators;
- each record can reach the configured target of **qualifying** validations from distinct validators, where a `cannot_evaluate` or an incomplete bilingual response does not count;
- every evaluable response carries both an English and a Filipino translation of the validated Ilocano sentence;
- corrections and translations are stored as the validator's response data, without altering source data;
- a validator who prefers the Filipino interface can complete the whole task, and switching language never disturbs their in-progress answers;
- the stored research value of an answer is identical whichever interface language displayed it;
- researcher progress is visible;
- raw data can be exported;
- the system supports later adjudication;
- the interface remains distinctly soft neo-brutalist without reducing usability.

---

# 21. Implementation Guidance for the Coding Model

The coding model should use this roadmap as the product and architecture contract.

For visual implementation:

> The visual design is strictly soft neo-brutalism. The model has creative freedom to determine where objects should be placed, how pages should be composed, and how the interface should visually express the design system. Do not mechanically recreate wireframes or force predetermined component positions. Maintain the approved validation flow, research requirements, accessibility, responsive behavior, and data rules.

For product behavior:

> Do not creatively reinterpret the validation protocol. Screening, batch allocation, evaluation choices, correction conditions, translation behavior, persistence rules, interface localization, and batch continuation must follow this roadmap unless the specification is explicitly changed.
>
> "Follow this roadmap" means the sections as currently written, not any earlier revision of them. Sections 6.4, 6.7, 6.10, 7.6, 8, 9, and 17 were rewritten when bilingual research translations and interface localization were approved, and the **optional** single-translation model they replaced is superseded. An agent that finds an older statement about an optional translation anywhere in this file is reading a superseded line, not an alternative reading of the current requirement.

This separation is intentional:

```text
Visual composition
→ creative freedom

Validation protocol
→ strict implementation
```

---

# 22. Immediate Next Step

Begin with:

```text
Phase 0
Methodology confirmation
```

and in parallel:

```text
Phase 1
Project foundation
```

The first technical milestone should be:

> Import `data/ilocano-synthetic-data.json` into Supabase and successfully serve a coverage-aware randomized batch of 10 entries to one anonymous validator.