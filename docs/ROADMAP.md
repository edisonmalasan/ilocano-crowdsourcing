# ROADMAP.md

# Sadino Crowdsourcing Validation Platform

## Project Status

> This block is a **progress ledger owned by the root orchestrator**, not a behavioral
> specification. `AGENTS.md` and `openspec/` remain the source of truth for rules and for
> specified behavior. Reconcile this block against Git, OpenSpec, and the repository before
> trusting it.

| Field | Value |
| --- | --- |
| Current roadmap phase | **Phases 1-7 are CLOSED and ARCHIVED and Phase 8's first slice is complete — seventeen changes — and Phase 9 is UNDERWAY on its second bounded slice.** Seventeen changes are archived and readable on disk under `openspec/changes/archive/`; the count is re-derived from that directory rather than carried forward — it read thirteen two changes ago, and the direction of the change is the evidence the archive landed. **The seventeenth is `consistency-guards`, Phase 9's first slice, and it is the first change whose deliverable is a set of assertions rather than a capability** — it guards this very ledger, which is why its own archive was the event that proved its count guard fires. Phase 8's first slice (`research-export`) is archived; the rest of Phase 8 and the rest of Phase 9 are written into this file below and neither is blocked on a decision. **The archive count is unchanged by the second Phase 9 slice now proposed, because a proposal creates no archive directory and moves no file** - it was re-measured as seventeen both before and after the proposal stage rather than incremented, and the sentence above states seventeen because that is what the directory holds, not because seventeen is the previous figure plus something. |
| Current OpenSpec change | **NO LIVE CHANGE, and the reason is an approved methodology correction rather than a finished stage.** `allocation-overlap` reached Propose on `docs/allocation-overlap-proposal` (`c8e9bd6`) and was **SUPERSEDED before Apply**, by this commit. Its argument was sound *given its premise*: coverage by **3 qualifying validations from 3 DISTINCT validators** is reachable only through cross-validator overlap, so an allocator that withheld other validators' answered entries would stall every entry at 1 of 3 forever while every suite in this repository stayed green. **That premise is now false by approved decision.** Each dataset entry needs **ONE COMPLETE VALIDATION PACKAGE** - one validated Ilocano sentence, one English translation, one Filipino translation - and the entry then leaves the allocation pool. The one requirement worth keeping is a **within-attempt** claim ("prevent accidental overlapping or simultaneous allocation inside the SAME active validation attempt"), which is a different claim and is re-proposed as `attempt-scoped-allocation` after the identity and completion changes land. The superseded delta is preserved in history at `c8e9bd6`; nothing was rewritten. **The superseded proposal was never Applied and produced no product change**, so its removal touches no file under `src/`, no migration, and no test. |
| Lifecycle state | `superseded` - **`allocation-overlap`**, roadmap **Phase 9, second bounded slice**. **The approved thesis-methodology correction supersedes it on its central premise**, so it is removed rather than applied: coverage is now defined by ONE complete validation package per entry, not by three qualifying validations from three distinct validators, and the unit of interest is INCOMPLETE ENTRY vs COMPLETE ENTRY rather than a coverage level of 0, 1, 2 or 3. **What survives is one requirement, and it is not this one**: allocation must not hand the same dataset entry to one active attempt twice, and accidental overlapping batches for the same active attempt must be prevented or reconciled. Different fresh attempts are independent of one another, and because the same real person may participate as many times as they like, **no part of the platform may claim an attempt identifier proves a distinct human**. The measured real state that prompted the correction is recorded in `Next eligible objective`, and it includes a production-blocking defect that must be repaired before normal roadmap progression resumes. |
| Completed milestones | Repository + roadmap + synthetic dataset bootstrap (`main` @ `81b3115`); Project Status ledger + roadmap reference reconciliation (PR #1, `567ab42`); `project-foundation` proposal (PR #2, `f451a01`); `project-foundation` implementation, review, sync, archive (PR #4, `b2128a4`); line-ending fix (PR #5, `53754de`); `od-dataset-schema-and-import` proposal (PR #6, `f14c0bb`); `od-dataset-schema-and-import` implementation + verification repairs (PR #7, `d2eea22`); `od-dataset-schema-and-import` Sync + Archive (PR #8, `1ed3340`); roadmap ledger reconciliation (PR #9, `1736b0b`); ledger self-reference fix (PR #10, `3518514`); `landing-and-screening` proposal (PR #11, `d111a9d`); **`landing-and-screening` Apply (PR #12, `e1390ba`)**; `landing-and-screening` Sync + Archive (PR #13, `411e18f`); bilingual requirements into this roadmap (PR #14, `523cfd0`); bilingual proposal (PR #15, `d4c40cd`); status reconciliation (PR #16, `0c042ed`); bilingual requirements into `AGENTS.md` `AGENTS.md` durable rules); `required-bilingual-translations` proposal (PR #15, `d4c40cd`), implementation (PR #18, `438b691`), spec sync (PR #19, `aaa8810`) and archive (PR #20, `76fd7a3`); `coverage-aware-allocation` proposal (PR #22, `d2fd596`), implementation (PR #23, `1134da9`), spec sync (PR #24, `304d450`) and archive (PR #25, `174fa2c`); `research-schema-guarantee-coverage` proposal (PR #26, `8ae4bc3`), spec sync (PR #27, `06dc92e`) and archive (PR #28, `5788383`); `interface-localization` proposal (PR #29, `50ff9eb`), implementation (PR #30, `2aaca46`), spec sync (PR #31, `f03bf65`) and archive (PR #32, `794aaf5`); **`thin-shell-call-sites` proposal (PR #33, `b5b59b2`), implementation (PR #34, `73ab777`) and archive (PR #35, `80a8dba`); `pending-state-specification` proposal (PR #36, `cb347cf`), implementation (PR #37, `bf76173`), spec sync (PR #38, `d3e1627`) and archive (PR #39, `ab1c7be`); `validation-experience` proposal (PR #40, `982dcea`), implementation (PR #41, `c527a4b`), spec sync (PR #42, `524bbbc`) and archive (PR #43, `acf5741`); `batch-completion` proposal (PR #44, `377a816`), implementation (PR #45, `cb197fe`) and Sync + Archive (PR #46, `c067cf7`); `interrupted-batch-recovery` proposal (PR #47, `5962521`), implementation (PR #48, `3faa312`) and Sync + Archive (PR #49, `904ffd2`); roadmap `Archived Changes` table reconciliation (PR #50, `cafced6`).  **This change adds four:** `researcher-admin-access` proposal (PR #53, `21484d0`), implementation (PR #55, `1bd6781`), spec sync (PR #56, `d7fca89`) and archive (PR #57, `02de160`), and the count is re-derived from the archive directory rather than carried forward — **thirteen** archived changes at that stage, up from twelve. **It has since been re-derived twice more and is now fifteen**; the figure recorded in a given sentence is the figure measured at that stage, and the live count is re-read from `openspec/changes/archive/` rather than inherited from any of them. **Every stage in that enumeration now names its pull request AND its commit, and the placeholder convention has been RETIRED rather than quietly dropped.** Two stages wrote it — the `researcher-admin-access` archive and the `hosted-dataset-import` proposal — each correctly, because at the moment each was written no merge commit existed yet and naming a guessed one would have been worse than naming none. Both have since merged, as `02de160` and `4df2731` through merge commit `00d5cad`, so both now carry their real identifiers. **The convention existed only because a merge commit did not yet exist, and the honest description of that is a placeholder, not a rule:** a row filled in with the pull request it happens to be inside is a row that is wrong the moment it is read from any other pull request, and it will read correctly from exactly one. The residual cost of retiring it is that the ARCHIVE stage of a change is now identified by its PR rather than by its merge commit, which is a real loss of one identifier per change and is the right trade against a field that silently misdirects a reader.**  **A second stage begins here, for `hosted-dataset-import`:** its proposal (PR #58, `4df2731`), after which its implementation, spec sync and archive will be added by their own stages. The thirteen-archived-changes figure above is **unchanged by a proposal** — a proposal creates no archive directory and moves no file — and it is stated as unchanged rather than left ambiguous. The count is re-derived from that directory at every measurement, never carried forward: it read "thirteen" for several changes, the archive has since made it fourteen, fifteen (`2026-10-02-researcher-dashboard`), and then **sixteen** (`2026-10-03-research-export`), so the sentence that used to justify thirteen by pointing at the directory would have been justifying a number the directory no longer contained. The distinction is the whole reason this row records archive-derived counts separately from merge-derived ones: **a merged pull request and an archived change are different events, and conflating them is how this row was wrong three times.**  **Fifty-eight merged pull requests, and every SHA in this row was re-derived from `gh pr list` during the stage that wrote this sentence rather than carried forward.** The count is **re-measured in this correction stage, not incremented**: `gh pr list --state merged --limit 200 --json number` returns **58** numbered records with **#58 the highest**, against the **Fifty-six** this row claimed one stage earlier. The error is again upward drift — two pull requests merged and the figure did not move — which is the **fifth** occasion this row has been corrected for the same cause, and the fifth is what converts the pattern from an accident into a property. and the direction of the error is the point — an enumeration only stays correct while somebody re-derives it, and this row's own history records four separate occasions on which it was not. **A stated total is a claim about a moment, and the moment has to be named or the number is a rumour.** **This row had been short by ELEVEN PRs — #40 through #50 — and it went stale within a single change**, which is the fourth instance of the same defect and the sharpest one yet: the previous sentence in this cell already recorded that the row had once ended "archive in flight in this PR" and had survived two changes uncorrected, so the note describing the defect was itself written at the moment the defect recurred. The generalisation is the one the `Archived Changes` note now states: **a hand-maintained index drifts as a matter of course, so an index that must stay correct needs an assertion, not a habit.** This row and that table are both hand-maintained, and neither has a guard; **the two were corrected in consecutive PRs (#50 and this one) only because each stage happened to edit the file while a stage that caused the drift was closing.** `hosted-dataset-import` Apply (**PR #60**, merged as `f4861ec`, gate item 3 measured GREEN on the wire, suite read back as 58/1476 + 7/87 + 11/194), spec sync (**PR #61**, merged as `7cf4bfb`, `dataset-import` 3→5 requirements, 11→21 scenarios) and archive (**PR #62**, merged as `898768b`). **`researcher-dashboard` proposal (PR #63, `b8a63aa`), Apply (PR #64, `f7f02cb`, merged only after an independent verification pass returned PASS-WITH-FINDINGS and all three CRITICALs plus thirteen warnings were repaired, suite read back as 63/1521 + 7/87 + 12/197 + guard 1/7), spec sync (PR #65, `1938c3f`, creating `openspec/specs/researcher-dashboard/spec.md` and raising the in-force spec count 13→14) and archive (PR #66, `d3bce66`). **`research-export` proposal (PR #67, `bc46850`), Apply (PR #68, `cff96c8`, merged after verification returned PASS-WITH-FINDINGS and both CRITICAL guards plus seven warnings were repaired, suite read back as 68/1580 + 7/87 + 12/197 + guard 1/7), spec sync (PR #69, `3c0ad8f`, raising the in-force spec count 14→15) and archive (PR #70, `9790ac8`). **`consistency-guards` proposal (PR #71, `77eddaa`), Apply (PR #72, `8f55032`, merged only after a second independent verification round returned PASS-WITH-FINDINGS and both CRITICALs and all five WARNINGs were repaired, suite read back as 70/1598 + 7/87 + 12/197 + guard 1/7), spec sync (PR #73, `e8bb45e`, creating `openspec/specs/consistency-guards/spec.md` and raising the in-force spec count 15→16) and archive (PR #74, `84ca54f`). The phrase this sentence used to end with - "archive in this PR, whose number is fixed at creation below" - was a placeholder written when `research-export`'s archive pull request did not yet exist, and it outlived its pull request by four changes.** It is resolved here rather than left standing, which is the whole point of the retirement the placeholder convention record describes: a field filled in with the pull request it happens to sit inside is wrong the moment it is read from any other pull request. **`allocation-overlap` proposal is this PR**, and its Apply, Sync and Archive are named by their own stages.** |
| Last merged OpenSpec stage | **PR #74 - `chore/archive-consistency-guards`, merged as `84ca54f` - the ARCHIVE stage of `consistency-guards`**, a **merge commit**. It moved the change's directory to `openspec/changes/archive/2026-10-03-consistency-guards/`, updated the `Archived Changes` table to name it, and returned `main` to `84ca54f`. CI run **`37048117617`** on that merge commit, `success`, `headSha` matching `84ca54f` exactly - read back from its logs, not from the checkmark. Suite: `Unit tests` **70/1598**, `DOM tests` **7/87**, `Integration tests` **12/197**, dataset guard **1/7**. Full step lists are present on both jobs - `immutable research source` with 10 steps and `lint, types, and tests` with 15 - every one of them `success`, checked against the truncation this project has caught four times. **The previous stage named in this field was PR #61, thirteen pull requests stale, and it was corrected here rather than left: a pointer row that names an old merge is a pointer that misdirects, and this row exists to point.** **THE READER FOR THAT RUN HAD TO BE REBUILT, and the reason is a fifth CI-reading hazard rather than a code defect.** `gh run view --log` returned 741 lines for run `37048117617` and the second tab-separated field of **every one of them** was the literal string `UNKNOWN STEP` - one distinct value across the whole log. The existing reader attributes a summary by that field, so it found nothing, and **it refused and exited non-zero rather than reporting zero tests**, which is the only acceptable outcome and is why it was built to refuse. A new reader takes the per-job log from the REST API instead, whose lines carry an ISO timestamp prefix rather than a tab prefix, and attributes by the `##[group]Run <command>` marker the runner emits. **Three defects in that new reader were each found by the log contradicting it, and all three are recorded at their sites because a reader that reports a confident wrong number is worse than no reader**: (1) `--allow-escape-sequences` is MANDATORY on the API call, because without it `gh api` refuses the endpoint outright and writes the log to neither stream - an empty buffer there is indistinguishable from a job that logged nothing; (2) the segmenter first closed each step on `##[endgroup]` and reported all three test projects NOT-ATTRIBUTABLE **against a log that plainly contains all three summaries**, because the group marker wraps the command echo and the output follows the end marker - the proof that the fix is right is structural, since the unit summary is immediately followed by `##[group]Run pnpm run test:dom`; (3) the explained-step set stored the caller's SUBSTRING while the check compared the segment's MARKER, so the reader reported all three projects as unexplained seconds after attributing them successfully - **a reader that cannot agree with itself about its own output is not a reader.** Both readers are in the temp working directory and neither is committed; the figures above were produced by the second one, and the first one's refusal is why they were re-read at all rather than assumed from the previous row. The prior record of this row, kept for the audit trail rather than deleted, is the PR #61 text it replaces. |
| Doc-only PRs since that stage | **None yet**, and the figure is stated together with the merge it is as-of rather than incremented: **measured as of the PR #74 merge (`84ca54f`)**, the highest-numbered merged pull request at the moment this sentence was written, with `gh pr list --state merged --limit 200 --json number` returning **74** numbered records and **#74** the highest. **This proposal is itself doc-only** - it moves `docs/ROADMAP.md` and files under `openspec/changes/` and nothing else - so the figure becomes **one** on its merge, and the next stage must re-derive it rather than add to it. **The prior figure in this cell was stale by eight, and re-deriving it is what showed that.** It read `One: PR #62`, correct as of `7cf4bfb`, and it was still standing thirteen pull requests later. The whole interval has now been classified by the zone-file rule - `git diff --name-only <merge>^1 <merge>^2`, **not** `git show --name-only <merge>`, which returns zero files for every merge commit in this repository's history and would classify every implementation stage as doc-only - and the doc-only members of #61-#74 are **#61, #62, #63, #65, #66, #67, #69, #70, #71, #73** while **#64, #68, #72 and #74 are stages**, because each moved files under `src/` or `tests/`. **This cell still has no automated guard, and that is a measured fact rather than an assumption**: a guard needs `gh` and the network, so a test asserting it would fail on an unauthenticated CI runner, and a guard that fails for the wrong reason is one people learn to ignore. The `Archived Changes` table beside it is different - it *is* guarded, by `tests/unit/ledger-integrity.test.ts`. |
| Next eligible objective | **A production-blocking batch-route defect, measured against the REAL hosted project, not inferred.** `GET /validate/<batchId>` renders **"We could not find that batch"** for every stored batch, so allocation succeeds, batches and batch entries are persisted, and no validation response can ever be submitted. Measured on the live project through the Supabase REST API with the service-role key: `dataset_entries` **600**, `validators` **1**, `validation_batches` **5**, `batch_entries` **50** (five batches of ten), `validations` **0**. A stored id is `VAL_720f59cd-2026-10-02T19:46:56.320Z`, and `validation_batches?id=eq.<that id>` returns the row while the once-encoded form returns none. **The root cause is measured, and it is NOT only the client's pre-encoding.** Next.js 16.3.6 hands a Server Component the dynamic segment **percent-encoded regardless of how the request path spelled it**: requesting `/validate/VAL_720f59cd-2026-10-02T19:46:56.320Z` with literal colons still delivered `params.batchId === "VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z"`, so `findById` was handed an identifier no row can have. The three producers that also call `encodeURIComponent` before handing the id to `router.push` or `Link` make it worse by encoding a second time into `%253A`. So the repair is a **canonical route serialization and parsing contract** applied to every producer and the one consumer, not a patch to the observed caller. After that, the order is: session-scoped attempt identity, then the single-complete-package completion model, then allocation and global completion, then dashboard and export semantics, then `attempt-scoped-allocation`, then real-flow regression verification, then the remainder of Phases 8 and 9. |
| Blockers | **The schema blocker is RESOLVED, and it was resolved by measurement rather than by a credential appearing.** It previously read: the hosted project is **EMPTY**, PostgREST exposes **0 relation paths**, the migrations have never been applied, no Supabase client has ever been constructed, and applying the SQL is a **MANUAL SUPABASE ACTION** needing a PAT, the `supabase` CLI, or `psql`/`docker`. **Every one of those claims is now false and is corrected here rather than left for a reader to discover.** The five production migrations were applied to the real project **unchanged, in filename order, one request per file**, through the Supabase Management API. PostgREST's OpenAPI root exposes **7 relation paths and 2 RPC paths**; `service_role` reads every research table over the real wire with the column counts derived from the live schema; the hosted `validations` table carries `english_translation` and `filipino_translation` and does **not** carry `translation_language` or `translation_text`, so the forward bilingual migration is confirmed on a real server and not only in PGlite. **The migration history was NOT rewritten to make the deploy easier.** **The blocked period was never about SQL, and the reason is the part worth keeping:** the Supabase SQL Editor runs a pasted script as a **single transaction**, so one failing statement rolls back all five migrations **and still reports success**, and a paste can land in the **wrong project**, which no in-database check can detect because the emptiness is identical either way. The project reference cannot be read from the new opaque key format, which carries no `ref` claim, so the two explanations were separable only by querying `pg_class` in the project the paste had actually run in. **All six gate items are now measured: 1 reachable, 2 schema present, 4 anon denied by the real gateway, 5 privileged reads work, 6 unauthenticated admin request refused by the real running app — all SATISFIED. Item 3 is the only one open**, and it needs the production `DatasetEntrySink` named in `Next eligible objective`. **RLS was measured in both available shapes and the distinction is load-bearing:** all seven `insert` probes are rejected with the **named** policy and PostgreSQL code `42501`, and `select`/`update`/`delete` were measured against a probe row that **demonstrably existed** — anonymous **0** rows against an `service_role` control of **exactly 1**, with the table confirmed returned to its prior count. The second measurement exists because **zero rows on an empty table cannot distinguish a deny-all policy from a permissive one**, and a probe that scored that as a pass would have been a vacuous guard on the project's single most important security property. **Two residuals are stated rather than implied away.** No desktop browser has ever rendered any screen in this project, so there is still no visual verification and a successful sign-in round trip is unexercised. And **the repository's own query builders — `.eq()`, `.in()`, `.order()`, `.limit()`, `.range()`, `.select(cols, { count: "exact" })`, `.insert()`, `.insert().select().single()`, `.maybeSingle()`, `.update()` — have still never executed against a real PostgREST**, because those reads were issued by a purpose-built gate probe using the service key as a raw header rather than by `factory.ts`; that gap closes when production code first reads or writes, which is the next change. **A credential problem is reported as `?? UNVERIFIED`, never as a migration refusal:** the Management API answers a bad token with `401` having evaluated no SQL at all, and conflating the two would send the next reader to debug the wrong thing. |
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

**THIS NOTE DESCRIBES A GAP THAT NO LONGER EXISTS, and it is corrected rather than deleted because the whole passage is about corrections that keep a conclusion.** `tests/unit/ledger-integrity.test.ts` now reads this file and the archive directory and fails if they disagree — it was added by the `consistency-guards` change, and it found real drift on its first run. The rest of this note remains a record of a measurement that was WRONG when written. At the time `grep -r ROADMAP tests/` did return **0**, confirmed case-sensitively, and no test read any `docs/` path — that half was true then, and it was the half that mattered, because the defect was that *nothing would notice a row being dropped*. But this row previously also claimed that a search of all **107** files in `tests/`, `src/`, `.github/` and `supabase/` found **0** naming `ROADMAP.md`, and **that was already false when it was written**: `supabase/migrations/README.md:93` has said *"applying them to a project is a separate deployment step recorded in `docs/ROADMAP.md`"* since **`17f6893`**, and the claim was committed later, in **`23dd7c3`**. A search could not have found 0. The honest reading is that the count was taken over a narrower set than it described and the description was then written as though it were the wider one — **a measurement reported with a scope it did not have**, which is the same shape as the CI step that claimed to run a subset and was green. Re-derived on 2026-10-01 over **135** files: **2** name `ROADMAP.md` — the pre-existing `supabase/migrations/README.md:93`, and `src/lib/domain/validation-response-id.ts:21`, added by **this** change, whose module comment points at this ledger for the 32-bit entropy concern below. **Neither is a guard**: one is prose about a deployment step, the other is prose about an open concern, and **nothing anywhere reads this file**. The substantive claim therefore stands and the count did not, and both are recorded because a correction that keeps the conclusion and drops the number is how a bad measurement survives. The table is correct when written and will drift silently at the next archive, exactly as it did once before. |

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
| `project-foundation` | `openspec/changes/archive/2026-09-30-project-foundation/` | Apply PR #3, `f43d722` (merge commit). Archive PR #4, `b2128a4` (merge commit) | Synced into `openspec/specs/`: `application-foundation` (5 req), `design-system` (5), `domain-contracts` (7), `data-access-boundary` (4). Verified with a `PASS WITH WARNINGS` review; every finding repaired before merge (task group 7 in the archived `tasks.md`). |
| `od-dataset-schema-and-import` | `openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/` | Apply stage merged by PR #7, `d2eea22` (merge commit; proposal was PR #6, `f14c0bb`). Sync + Archive merged by PR #8, `1ed3340` | Synced into `openspec/specs/`: `dataset-import` (3 req, new), `research-schema` (6 req, new), `domain-contracts` (1 requirement modified — the at-most-once rule flipped from "not yet implemented" to implemented). Verified with an independent `PASS WITH FINDINGS` review carrying one CRITICAL; the CRITICAL and all seven warnings and eight notes were repaired before the Apply merge. `openspec validate --specs --strict` reports **6 passed, 0 failed**. |
| `interface-localization` | `openspec/changes/archive/2026-10-01-interface-localization/` | Propose PR #29, `50ff9eb` (`a6031c5`). Apply PR #30, `2aaca46` (merge commit; branch commits `33d1cf8` → `2f66ea4` → `822233c`). Sync PR #31, `f03bf65` (merge commit). **Archive PR #32, `794aaf5`** (merge commit) | Synced into `openspec/specs/`: `interface-localization` (**6 req / 17 scenarios, new**), modifying no existing requirement. `openspec validate --specs --strict` reports **9 passed, 0 failed**. A separate verification pass found **no CRITICAL and four real WARNINGs, all fixed rather than waived**; the most consequential was a catalog guard that asserted the catalogs held no Ilocano instruction via markers which **match zero of the 600 real instructions**, so it could never fail. Rewritten to compare all 600 records bilaterally against both catalogs, proved red in both directions by probe. Two limitations are recorded in the archived `tasks.md` rather than papered over: `<html lang>` rests on a proven three-link chain rather than an observation, and scenario S3 is half-untested |
| `landing-and-screening` | `openspec/changes/archive/2026-09-30-landing-and-screening/` | Propose PR #11, `d111a9d`. Apply PR #12, `e1390ba` (the review round that the client-shell call-site enumeration came out of). Sync + Archive PR #13, `411e18f` | Phase 3: landing page, Ilocano proficiency screening, anonymous validator create and restore. Synced `validator-onboarding` |
| `required-bilingual-translations` | `openspec/changes/archive/2026-09-30-required-bilingual-translations/` | Propose PR #15, `d4c40cd`. Apply PR #18, `438b691`. Sync PR #19, `aaa8810`. Archive PR #20, `76fd7a3` | Both research translations required for every evaluable validation, the forward migration, and the qualifying-coverage definition. Synced `research-schema` |
| `coverage-aware-allocation` | `openspec/changes/archive/2026-09-30-coverage-aware-allocation/` | Propose PR #22, `d2fd596`. Apply PR #23, `1134da9`. Sync PR #24, `304d450`. Archive PR #25, `174fa2c` | Phase 4: server-authoritative coverage-aware batch allocation. Synced `batch-allocation`. Two limitations are carried forward rather than fixed, because fixing either is a spec change that was not made |
| `research-schema-guarantee-coverage` | `openspec/changes/archive/2026-09-30-research-schema-guarantee-coverage/` | Propose PR #26, `8ae4bc3`. Sync PR #27, `06dc92e`. Archive PR #28, `5788383` | Made the qualifying-coverage target enforceable in the database and split each bilingual rule across two non-overlapping `CHECK` constraints. Synced `research-schema` |
| `thin-shell-call-sites` | `openspec/changes/archive/2026-10-01-thin-shell-call-sites/` | Propose PR #33, `b5b59b2`. Apply PR #34, `73ab777` (merge commit, verified an ancestor of `origin/main`). Archive PR #35, `80a8dba` (merge commit) | Pure verification repair: seven client-shell call sites that already behaved correctly and now carry behavioural guards, plus the `dom` browser-test project. **Declares `skip_specs: true`** — no product behaviour changed, and the correction to its own rationale is recorded rather than resolved by inventing a requirement |
| `validation-experience` | `openspec/changes/archive/2026-10-01-validation-experience/` | Propose PR #40, `982dcea`. Apply PR #41, `c527a4b` (merge commit, verified two parents `982dcea 746da72`). Sync PR #42, `524bbbc` (merge commit, verified two parents `c527a4b b640ca1`). **Archive PR #43, `acf5741`** (merge commit) | **The first participant-facing research-writing capability, and the first stage to pass two independent verification rounds before merge — both of which returned work rather than approval, and neither of which found a product defect.** One new capability, **zero** modified: `validation-experience` (7 requirements, 24 scenarios), capability count **9 → 10**. Apply grew the `dom` project from **3 files / 15 tests** to **4 / 40** and the `unit` project from **33 / 901** to **40 / 1074**, and the whole suite from **48 files / 1164** to **50 / 1214**. **The two verification rounds found ticked boxes that were untrue as written** — a guard enumerating rendered controls with a regex demanding a closing tag, so it could never see a void `<input>`; a tick asserting a stale `/ready` comment had been corrected when the author had only *quoted* it as false; a dead export with **zero** production callers, proven correct by a test; and then, one commit after the fix for that last one, **a test of my own that was vacuous in the same way** — its fixture left exactly **one** remaining entry, so reading the requested position back out of the pushed URL was **decoration**. That was the **third** instance of that shape in one session, and the generalisation is recorded below: *a fixture that cannot discriminate is not a neutral choice.* **Ten mutation probes** across the two rounds, each with a negative control, a `tsc --noEmit` green mutant, and a byte-identical restore. **One thing is specified but unwitnessed, and says so:** `position={session.position}` is not observable in rendered HTML because a Server Component's props are not attributes — mutating it leaves the suite **green at 1214/1214**, and closing it needs a real browser and a real Supabase project, **neither of which exists**. Sync added **one** scenario and corrected **one** wording slip, both flagged in-file, with the transform verified as **4 hunks / 4 attributed edits**. The `/ready` handoff was left **unspecified on purpose** — the change declares zero modified capabilities, so a requirement there would modify `validator-onboarding`. |
| `pending-state-specification` | `openspec/changes/archive/2026-10-01-pending-state-specification/` | Propose PR #36, `cb347cf`. Apply PR #37, `bf76173`. Sync PR #38, `d3e1627` (all three verified merge commits with two parents). **Archive PR #39, `ab1c7be`** (merge commit) | **Specification-only** — no `src/`, `tests/`, or `supabase/` file has ever been touched by it. Closed the gap that **0 of 181 scenarios** mandated a control be inert during a write and that `/ready` appeared in **0 of 9** specs. Synced `design-system` **5 → 6** requirements and `validator-onboarding` **7 → 8**, capability count unchanged at **9**, scenarios **181 → 193**. Verified as a *difference*, not read off afterwards: every requirement and scenario hashed before and after, the other **seven** spec files **byte-identical**, and both spec diffs **pure insertions**. The gap flipped because of the sync and for no other reason — all **5** post-Sync matches were required to fall inside the *added* block and **0** fall outside. **One scenario is specified but vacuous today** and says so on its own face: "Pending is distinguishable from unavailable" cannot fail, because no control is currently disabled for *unavailability* rather than in-flight work. It was **predicted** to become observable in Phase 5, which has now been **decided against** — see the note beneath this table. |
| `batch-completion` | `openspec/changes/archive/2026-10-01-batch-completion/` | Propose PR #44, `377a816`. Apply PR #45, `cb197fe` (merge commit). **Sync + Archive PR #46, `c067cf7`** (merge commit) | Phase 6, first slice: the finished-batch screen, the two labelled lifetime figures, the continue intent, and the requirement that **Finish issues no write at all**. Synced `batch-completion` (**6 requirements, 18 scenarios, new**), capability count **10 → 11**. Two additions there are worth carrying forward because they are the only mechanisms of their kind in the suite: `pressMany(el, n)` dispatches all `n` clicks inside **one** `act`, which is the only way a **single-flight latch** is observable at all — an ordinary two-press arrangement opens and closes its own `act`, so React commits `disabled` between the clicks and the second is stopped by `disabled` rather than by the latch, and the arrangement passes with the latch deleted. Measured: control green at `17 passed (17)`, deleting the latch's guard and assignment turns the project red at `1 failed / 16 passed of 17`. And the **CAN FIRE** companion mounts a deliberately latch-less button and proves `pressMany` counts **2** against it, so the real component's count of 1 is a measurement rather than a limitation of the instrument. |
| `researcher-admin-access` | `openspec/changes/archive/2026-10-03-researcher-admin-access/` | Propose PR #53, `21484d0`. **Apply PR #55, `1bd6781`** (merge commit, verified two parents `1c1ec63` and `3e7bb72`). **Sync PR #56, `d7fca89`** (merge commit, verified two parents `1bd6781` and `4879667`). **Archive PR #57, `02de160`** (merge commit) | Phase 7, first slice: the researcher area's **access boundary only**, deliberately not the dashboard. Synced `researcher-admin-access` (**8 requirements, 31 scenarios, new; zero MODIFIED**), capability count **12 -> 13**. **The only change in this project's history that was held from merging by its own gate**, and the gate was not a formality: `tasks.md` 7.5 sat unticked through six rounds while the hosted schema was empty, and ticking it then would have been a claim of enforcement that did not hold. **It is also the first change whose authorization boundary was observed to WORK, not only to refuse** — `26 satisfied, 0 not satisfied, 0 unverified` against the live project. RLS was measured in both available shapes: all seven `insert` probes rejected with the **named** policy and code `42501`, and `select`/`update`/`delete` measured against a probe row that **demonstrably existed** (anonymous 0 rows against an `service_role` control of exactly 1), because zero rows on an empty table cannot distinguish a deny-all policy from a permissive one. **Three defects in the measuring instrument itself were found and fixed before any conclusion was drawn from it**, and they are the substance of what this change taught: the first probe certified all seven RLS probes against a project with **zero tables** because it treated any error as a denial; the second then reported five **false violations** because it parsed `Content-Range` as `^/0` while PostgREST emits a leading star; and both guessed a column name (`source_entry_id`, which does not exist) and a function arity that do not exist. **Two approved-requirement tensions were resolved in favour of the requirement, not the code** — `SameSite` went `Lax` -> `strict` against a live constraint rather than the requirement being reworded to match the weaker cookie, and a dangling `Active Blockers` cross-reference was fixed by **writing the missing section** rather than by weakening the two source comments that cite it. |
| `interrupted-batch-recovery` | `openspec/changes/archive/2026-10-01-interrupted-batch-recovery/` | Propose PR #47, `5962521`. Apply PR #48, `3faa312` (merge commit, verified two parents `5962521 164f782`). **Sync + Archive PR #49, `904ffd2`** (merge commit, verified two parents `3faa312 d75c8b1`) | Phase 6, second and final slice: offering a validator's most recently created interrupted batch back to them on the start screen. Synced `batch-recovery` (**7 requirements, 20 scenarios, new; zero MODIFIED**), capability count **11 → 12**. **It is not a data-loss fix and the change says so on its own face** — `selectBatchEntries` already left abandoned entries allocatable and `/validate/[batchId]` already resumed, so only **discovery** was missing. Adds one forward migration (`validation_batches.created_at`, nullable, backfilled, then `NOT NULL`) and no lifecycle column, because a stored flag would be a **second authority** that could fall out of step with the stored entries. **Its independent verification pass returned NO with 3 CRITICAL, 4 WARNING, 8 NOTE, and all three CRITICALs were claims of ENFORCEMENT that did not hold rather than missing behaviour** — two type-layer pins advertised in two ledgers as making a fourth field fail `typecheck` turned out to be exported aliases with no assertion site, so the compiler never evaluated them, and the migration's own backfill statement was executed by no test at all. Every CRITICAL and WARNING was repaired and measured before the Apply merged. `tasks.md` **3.5 is left deliberately unticked** in the archive, with its reason written at the line: the decision is made and covered at both ends, but the one test that would execute the junction of a real residue row and the real lookup is not writable without PostgREST. |
| `hosted-dataset-import` | `openspec/changes/archive/2026-10-03-hosted-dataset-import/` | Propose PR #58, `00d5cad`; Apply PR #60, `f4861ec`; spec sync PR #61, `7cf4bfb`; archive PR #62, `898768b` | Phase 7's second slice: the operator import command, the forward migration, and the hosted schema and dataset. Gate item 3 was measured GREEN on the real project before the merge — 600 rows, byte-identical instructions, `anon` refused with `42501`. Synced `dataset-import` 3→5 requirements, 11→21 scenarios. |
| `researcher-dashboard` | `openspec/changes/archive/2026-10-02-researcher-dashboard/` | Propose PR #63, `b8a63aa`; Apply PR #64, `f7f02cb`; spec sync PR #65, `1938c3f`; archive PR #66, `d3bce66` | Phase 7's third slice and **the completion of Phase 7**: the protected overview (eleven approved figures) and per-entry review behind the access boundary. Merged only after an independent verification pass returned PASS-WITH-FINDINGS and three CRITICAL false claims plus thirteen warnings were repaired — one of which exposed a guard the read-only scan could be defeated by. Synced a new capability, 13→14 specs. |
| `research-export` | `openspec/changes/archive/2026-10-03-research-export/` | Propose PR #67, `bc46850`; Apply PR #68, `cff96c8`; spec sync PR #69, `3c0ad8f`; archive PR #70, `9790ac8` | Phase 8's first slice: the research-data export pipeline — one record per stored validation with each validator's own English and Filipino text as separate fields, per-entry and per-category summaries, JSON and CSV, and an explicit refusal to adjudicate. Both CRITICAL verification findings were guards that could not see what they claimed to. Synced a new capability, 14→15 specs. |
| `consistency-guards` | `openspec/changes/archive/2026-10-03-consistency-guards/` | Propose PR #71, `a4eb7e3`; Apply PR #72, `8f55032`; spec sync PR #73, `e8bb45e`; archive PR #74 | Phase 9's first slice, and **tests only — zero files under `src/`, `scripts/`, `supabase/` or `data/`**. Adds the two guards this table's own note had asked for since it first recorded the gap: cross-consumer agreement over one hand-counted corpus, and an assertion that this table matches `openspec/changes/archive/`. Merged only after **two** verification rounds, the second returning 2 CRITICAL and 5 WARNING — all repaired, none waived — and both CRITICALs were *claims that did not hold* rather than missing behaviour. Synced a new capability, 15→16 specs. **Its can-fire proof arrived as a real event rather than a probe:** archiving this very change took the directory to seventeen, and the count guard failed naming itself, because its word list stopped at sixteen. |

> **This table previously listed 3 of the 8 archived changes.** The omission was recorded at
> the time and deliberately left in place; that decision was wrong, because this stage edits the
> table anyway, and a known-stale enumeration inside a file you are editing is the defect
> rather than the omission. Every row above was **re-derived by hand during this stage** by
> listing `openspec/changes/archive/` and asserting the row count against that directory.
>
> **AND IT WAS STILL TWO ROWS SHORT AFTER THAT STAGE.** This table listed **10** rows against
> **12** directories on disk: `batch-completion` and `interrupted-batch-recovery` were both
> missing, each from a completed archive. The note above predicted exactly this — *"will drift
> silently at the next archive, exactly as it did here"* — and then the prediction came true at
> the following archive anyway. **So the drift is not a one-off that a careful stage avoided; it
> is the default outcome of a table with no guard, and the two missing rows were added only
> because the stage that caused the drift also edited this file and therefore had to look at
> it.** The row count is now asserted by hand against `openspec/changes/archive/` at **12 of 12**.
>
> **AND THERE WAS NO AUTOMATED GUARD KEEPING THIS TABLE IN STEP.** `grep -r ROADMAP tests/`
> returned no matches: this repository had no ledger-consistency test of any kind. So the honest
> position was that the table was correct when written and would drift silently at the next
> archive, exactly as it did here — which is now stated rather than papered over with a sentence
> that sounds like a guard. Building one was **deliberately not done** by that stage: it introduces
> a new class of test the project had never had, and a change must not be broadened because a
> related opportunity turned up. It was **recorded as a known gap for a change that wants it**, and
> `consistency-guards` is that change. `tests/unit/ledger-integrity.test.ts` now asserts every
> archive directory is named in this table, that nothing is named that is absent, that no row is
> duplicated or malformed, and that the stated count equals the directory. **What it does NOT cover,
> and what this table still gets wrong by hand:** the `Merged as` column and the notes. An
> independent verification pass found five rows whose `Merged as` cell was false — three read
> "Archive in this PR" for archives that merged as **PR #39**, **#43** and **#57**, and one cited an
> Apply commit where the archive was intended. Those cells are corrected below by measurement, and
> guarding prose is **recorded as the next gap** rather than claimed as covered. The
> generalisation worth carrying is unchanged and now has an example: **a hand-maintained index
> drifts as a matter of course, so an index that must stay correct needs an assertion, not a
> habit** — and an assertion over half a table must say which half.**

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

- ~~**No Supabase project credentials.**~~ **SUPERSEDED 2026-10-02 by measurement — a real project
  EXISTS and is reachable, and this entry was false.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are all present in a local `.env.local`, all non-blank, and
  `GET {SUPABASE_URL}/auth/v1/health` returns **200**. Verified by NAME and LENGTH only; no value was
  printed, and none is recorded here. `NEXT_PUBLIC_SUPABASE_URL` equals `SUPABASE_URL` and the two
  anon-key variables are equal, which was checked rather than assumed.
  - **~~The hosted schema is EMPTY.~~ RESOLVED 2026-10-03 by measurement.** PostgREST's OpenAPI root
    now exposes **7 relation paths and 2 RPC paths**. The five production migrations were applied to
    the real project **unchanged, in filename order, one request per file**, through the Supabase
    Management API. The hosted `validations` table carries `english_translation` and
    `filipino_translation` and does **not** carry `translation_language` or `translation_text`, so the
    forward bilingual migration is confirmed on a real server and not only in PGlite. All five files
    were accepted; the migration history was **not** rewritten to make the deploy easier.
  - **Why the manual route failed, recorded because it will recur and because the failure is
    invisible.** The Supabase SQL Editor runs a pasted script as a **single transaction**, so one
    failing statement rolls back all five migrations and still reports success. A paste can also land
    in the **wrong project**, and no in-database check can detect that: the observable result is
    identical either way. The project reference cannot be read from the new opaque key format, which
    carries no `ref` claim. Both explanations were live for six rounds; the only thing that separated
    them was querying `pg_class` in the project the paste had actually run in.
  - **A Supabase personal access token is now present in the local `.env.local` as
    `SUPABASE_ACCESS_TOKEN`,** verified by name and length only. The Management API
    (`POST /v1/projects/{ref}/database/query`) applies existing migration files and reports the
    server's error verbatim, which removes the paste, the transaction, and the wrong-project failure
    classes at once. A `401` from that endpoint is a credential problem and is reported as
    `?? UNVERIFIED` rather than as a migration refusal, because no SQL was evaluated.
  - **RESOLVED 2026-10-03 by measurement, on the real wire: gate item 3 is SATISFIED.**
    `dataset_entries` holds **600 rows**. The stored id set equals the source id set exactly (0 missing,
    0 unexpected), and all **600 stored instructions are byte-identical to the source by SHA-256**.
    `public.dataset_entries_import` is deployed and callable — the production sink wrote through it and
    reported `inserted`, then `updated` on each of three further runs, so the idempotence
    discriminator is measured over the wire rather than only in PGlite. The anonymous role is **refused
    by the real gateway**: a write through the *production sink* returned PostgreSQL `42501`, "new row
    violates row-level security policy for table `dataset_entries`", and a direct read returned status
    200 with **zero rows**. The row count was printed **before and after** every access probe (600
    before, 600 after), because a denial measured against an empty table is indistinguishable from a
    denial measured against a real one.
    - The former blocker text said the dataset had not been imported and that the change was
      "PROPOSED". It is kept as history rather than deleted, and the reason it survived a reader is the
      point: **a proposal that closed a blocker would have been exactly the kind of claim this ledger
      keeps catching**, and because it did not, the gate was measurable at all.
    - **A credential was disclosed during this measurement, and it is recorded here rather than only
      in a transcript. `SUPABASE_SERVICE_ROLE_KEY` must be treated as compromised and rotated in the
      Supabase dashboard.** A throwaway diagnostic probe printed it into its own output, and a hash
      comparison against `.env.local` confirmed the printed string was byte-identical to that key. The
      cause was the probe's own code: a helper with `(label, path, key, init)` positional parameters
      was called with **three** arguments, so the key landed in the `path` slot and a log line that read
      like a URL printed it. Repaired by taking a single object parameter and asserting `path` starts
      with `/` before any request is made. **The general form: a helper with a credential in one of its
      positional slots will eventually be called with the wrong arity, and the wrong arity stays
      invisible until something prints.** It was *found* only because a redaction harness re-ran the
      probe with a secret-shaped pattern in front of the output — and that harness refuses to report a
      run with **zero** substitutions as clean, because "no secret was emitted" and "the patterns do
      not work" are different findings.
  - **The consequence for Phase 7, updated 2026-10-03: the boundary is now proved to WORK, not only to
    refuse.** Gate item 1 (project reachable), item 2 (schema present), item 4 (anonymous access
    denied by the **real gateway**), and item 5 (privileged server-side PostgREST reads) are all
    **satisfied by measurement**, with a tally of **26 satisfied, 0 not satisfied, 0 unverified**.
    RLS was measured in both available shapes: every `insert` was rejected with the **named** policy
    and PostgreSQL code `42501`, and `select`/`update`/`delete` were measured against a probe row
    that genuinely existed — anonymous 0 rows against a `service_role` control of exactly 1, with the
    table confirmed returned to its prior count. Both attempt-counter functions were exercised on the
    real wire. **Two gaps are stated rather than implied away:** no desktop browser has ever rendered
    any screen in this project, so a successful sign-in round trip remains unexercised; and the
    repository's own query builders (`.eq()`, `.in()`, `.order()`, `.limit()`, `.range()`,
    `.select(cols, { count: "exact" })`, `.insert()`, `.single()`, `.maybeSingle()`, `.update()`) have
    still never run against a real PostgREST, because the reads above were issued by a gate probe
    rather than by `factory.ts`. (An earlier version of this list named `.neq()`; no such member
    exists on the narrow client and no caller uses one.) **These are now SPLIT, because "both close with the next change" was wrong and was
    written without checking what the next change contains.** `hosted-dataset-import` adds no UI, so
    the browser gap does **not** close there and will not close until someone opens the app in a
    desktop browser — no amount of local checking substitutes, and a design verified only by rendered
    HTML and emitted CSS has still never been looked at. That gap is now stated as **open and
    unclosable by any command.** The PostgREST gap **narrows** rather than closes: the import path
    uses `.rpc()`, so the RPC surface reaches the real gateway for the first time, while `.eq()`,
    `.in()`, `.order()`, `.limit()`, `.range()`, `.single()`, and `.maybeSingle()` stay proved only
    against the recording fake. **"Has reached a
    real PostgREST" is a per-method property, not a property of a file** — the claim is only meaningful
    with the method named, and the same sentence claiming it for a file is what made it useless.
    **`factory.ts` itself has still never been executed**, so no repository it constructs has reached
    the wire. Its header claimed "No Supabase project and no credential exist in this environment"
    until 2026-10-03, which was false — it mistook the absence of a local Supabase RUNTIME for the
    absence of a hosted project. Rewritten against measurements: `.rpc()` has reached a real PostgREST
    via `SupabaseDatasetEntrySink`; `.eq()`, `.in()`, `.order()`, `.limit()`, `.range()`,
    `.select(cols, {count})`, `.insert()`, `.single()`, `.maybeSingle()`, and `.update().eq()` have
    not, and each still rests on a recording fake plus PGlite.
    Two further absences are named there rather than left to a reader's inference: the `authenticated`
    role has not been exercised on the dataset table (it needs a signed-in JWT no probe holds), and the
    `23505` payload the uniqueness branch depends on has not been observed on the wire.
  - **Older sections of this file still say the three variables are absent, and they have been left
    saying so on purpose.** Each `What this evidence explicitly does not establish` list is a record of
    what was true **at the phase it belongs to**, and three of them name the absent credentials. Those
    were accurate when written. Rewriting them would make the file claim that Phase 3 had a real
    project, which it did not, and the value of these sections is that they are dated. This entry
    supersedes them; it does not delete them.
- **Researcher administration adds two deployment obligations that no local check can discharge.**
  Introduced by `researcher-admin-access`, and **this entry exists because two source comments cite
  it by name** — `src/lib/admin/actions.ts` and `src/lib/admin/origin.ts` both tell a reader that the
  reason for their trade-off is "the deployment obligation in `docs/ROADMAP.md`". A cross-reference to
  a section that does not exist is a claim of documentation that does not document anything, which is
  the same defect family this ledger has now found repeatedly; the citation and the entry are repaired
  together rather than either alone.
  - **`ADMIN_OPERATOR_SECRETS` and `ADMIN_SESSION_SECRET` must be set wherever the application is
    served, and they must be set to different values.** The first is the comma-separated list of
    operator credentials; the second protects the integrity of an open session and must not be one of
    them. Both ship **empty** in `.env.example`, and an empty value is treated as absent.
  - **An environment missing either variable refuses every admin request by design.** It never falls
    open, and it never breaks the public validator experience — which is precisely why these are
    validated separately from `serverEnvSchema` rather than added to it. Adding them there would fail
    every public path in any environment that has no researcher credential, i.e. **fail closed in the
    wrong direction.** Measured: making `ADMIN_OPERATOR_SECRETS` a required member of
    `serverEnvSchema` turns the public-path tests red.
  - **The sign-in attempt counter lives in a table, so the migrations must be applied before sign-in
    can succeed — and they now are, on the real project.** The table and both counter functions exist
    and were exercised end to end over the real wire. The obligation is retained rather than struck
    through, because it is a property of the design and not of one deployment: a deployment that has
    not applied the migrations refuses sign-in indistinguishably from one whose counter is merely
    down, and this project has no error-reporting service to tell the two apart. That trade is
    deliberate; the diagnosis is the operator's, from their own project settings.
  - **The proxy in front of the application must set or overwrite `x-forwarded-for`, and must not
    strip `x-real-ip`.** Both halves are load-bearing and neither is fixable in code, because code
    cannot know which proxy is in front of it. On a deployment that passes a client-supplied
    `x-forwarded-for` through, an unauthenticated party can choose its own counter key; on one that
    strips both headers, every request without a forwarded header shares **one** counter, so one party
    can exhaust a bucket others share. **This is a RATE LIMIT and not an authorization control**: the
    authorization decision is the credential comparison, and nothing in this path participates in it.
### Local Verification Evidence — `hosted-dataset-import` (2026-10-03, Apply stage)

Every figure below was produced by running the command named. Nothing here is incremented from a
previous row; where a figure changed, the old one is named so the change is visible rather than
silent.

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run lint` | exit 0, no errors and no warnings | Every file lints. The `sadino/no-privileged-imports` rule fires only on client modules (a `"use client"` directive or a path under `src/components/`), so `scripts/` is outside its scope by construction — the separation there is enforced by the write-scan and credential unit tests, not by the linter. The two new `PRIVILEGED_SPECIFIERS` entries protect every client module they can see. | That the boundary rule would catch a *new* violation, or that it covers `scripts/`; its probe file was deleted after the `project-foundation` change proved it fires on a client module. |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" | Every formatter-owned file matches the committed configuration. | Anything about correctness. `AGENTS.md`, `openspec/`, `docs/`, `data/`, and `.agents/` are excluded by `.prettierignore`. |
| `pnpm run typecheck` | exit 0 | `tsc --noEmit` over `src/`, `tests/`, **and `scripts/`** — the last was measured rather than assumed, by inserting a `string` where a `number` is declared in `scripts/import-dataset.ts` and confirming `tsc` exits **2** naming that file and line, then restoring byte-identical with the control back at exit 0. | Any runtime behaviour. |
| `pnpm run test:unit` | exit 0 — **58 files, 1476 tests** | The domain contracts, the sink against a recording fake, the sink's **loadability in plain Node**, the one-construction-site boundary, the operator command's reporting and exit codes, and — added by the repair round — the four no-request-path tests behind scenario 2. Previously 54 files / 1434 tests at the change's start; the repair added **4** tests and no files. | Anything needing a database or a browser. |
| `pnpm run test:dom` | exit 0 — **7 files, 87 tests** | Unchanged by this change, which adds no UI. | Anything about a real browser. **No human has ever rendered any screen in this project**, and this change does not alter that. |
| `pnpm run test:integration` | exit 0 — **11 files, 194 tests** | The migration's inserted/updated discriminator, that `instruction`/`source_payload`/`created_at` survive a re-run unchanged, the named refusal on a differing instruction, the EXECUTE grants, **all 600 records** through the production sink against a real PostgreSQL engine, and — added by the repair round — one behavioural test per arm of the corrected guard in `20261004120000_dataset_entries_import_guard.sql` (clean apply, missing column named, wrong key named, absent key, absent table, absent function). Previously 10 files / 170 tests at the change's start. | That this is Supabase. PGlite is PostgreSQL compiled to WebAssembly: it proves SQL, constraints, and RLS *as the engine evaluates them*, and does not cover PostgREST, Auth, or RLS as the Supabase gateway enforces it. |
| `pnpm run build` | exit 0, "Compiled successfully" | The application compiles for production under the committed TypeScript and Tailwind configuration. | That any test passed. A successful build is not a behavioural result. |
| `openspec change validate hosted-dataset-import --strict` | exit 0, 'Change "hosted-dataset-import" is valid' | The change's proposal, design, and its capability delta satisfy the OpenSpec schema strictly. The deprecation warning recommending verb-first commands is **expected and is not a failure**; judge by the exit code and the verdict line. | That the implementation matches the change. That is verified by inspecting the code and tests. |
| `openspec validate --specs --strict` | exit 0, "Totals: **13** passed, 0 failed (13 items)" | All thirteen in-force capabilities satisfy the schema. **Still 13, unchanged** — and that is the measurement that matters here: during an Apply the delta must live only under `openspec/changes/`, so a new directory appearing under `openspec/specs/` would mean the delta had been written to the wrong place. | That the implementation matches the specs. |
| `pnpm run import:dataset` (against the real project) | exit 0, three runs: `600 inserted / 0 updated`, then `0 inserted / 600 updated` twice | The command reads 600 records, writes every one through the production sink, and is **idempotent on the wire**. `parsed`, `inserted`, `updated`, and `refused` are printed from counts the run actually took; the credential line prints a variable NAME and a LENGTH and nothing else. | That the data is correct. A row count says nothing about content — that is the separate probe below. |
| gate probe, `dataset_entries_import` | exit 0 — **7 claims, 7 satisfied, 0 not satisfied, 0 unverified**, measured twice: once before and once after the guard migration was applied | Gate item 3, against the real project: 600 rows; the stored id set equals the source id set (0 missing, 0 unexpected); all 600 stored instructions byte-identical to the source by SHA-256; function presence proven **through the production sink as `service_role`** *before* any access probe; the anonymous role refused with `42501` "new row violates row-level security policy"; a direct anonymous read returning **0 rows**; and the row count **600 before / 600 after** the access probes. The second run confirms the guard deploy changed no data. | Anything about the `authenticated` role — it needs a signed-in JWT no probe holds. Nor Auth, Storage, or Realtime. |

**Four defects were found in my own new tooling and are recorded because three of them would have been
reported as findings about the system rather than about the harness.**

1. **A gate probe reported a deployed function as absent, and the function was not absent.** It built
   its own eight-argument RPC payload from the **raw source record**, whose keys are `id`,
   `instruction`, and `output` — so four arguments were `undefined`, and `JSON.stringify` **drops a
   key whose value is `undefined`**. PostgREST received four arguments, searched for a four-argument
   overload, found none, and returned `404 PGRST202`; its own `hint` field named the correct eight.
   The database confirmed `proargnames` were exactly those eight. The probe rewrote itself to import
   `parseSyntheticDataset` and `SupabaseDatasetEntrySink`, so the payload is produced by production
   code and the only variable under test is the credential — which is also a **stronger** claim. **The
   lesson is the one this ledger keeps re-learning in a new place: a probe carrying its own copy of a
   mapping will disagree with the code, and the disagreement gets reported as a fact about the system.**
2. **A probe classified `PGRST202` as absence, which is PostgREST's masking of a permission failure
   too** — it returns the same code for an object that does not exist and for one the calling role may
   not execute, because distinguishing them would leak the existence of objects a role cannot use. The
   classification rule was **conservative in the right direction and that is why this surfaced at
   all**: it refused to score the claim and reported `?? UNVERIFIED` rather than closing the gate. A
   probe that scored `PGRST202` as a denial would have closed gate item 3 on a function that was never
   called.
3. **A probe function name was hard-coded and wrong** (`import_dataset_entry` for
   `dataset_entries_import`). It now reads the constant out of `supabase-sink.ts`, which removes the
   class rather than the instance.
4. **A wrapper reported `DID-NOT-RUN` on two runs that had plainly succeeded.** It read
   `const status = error?.status` and treated `undefined` as a spawn failure — the rule this project
   has used for a year, and it is correct for `execFileSync`'s `catch` block. It is **wrong in the
   callback form, where success passes `error === null`**, so `error?.status` is `undefined` on
   success. The instrument could not tell "it worked" from "it never ran". **A discriminator copied
   between two API shapes is a new rule, not a ported one: check what the value is in the case you
   have not yet seen, which here was the success case.**

**Two new unit guards went red on first run, and one was my assertion being wrong rather than the
code.** The write scan over `scripts/` failed on the command's own documentation, because
`/\brename(?:Sync)?\b/` matches the English word "rename". Three repairs were available — strip
comments, drop `rename` from the list, or reword the documentation — and only the first is a fix. **The
third is the one refused:** it is this repository's recorded lesson that a guard whose subject is prose
forces the prose to change, and the documentation is correct. The credential test asserted that
`readImportEnvironment`'s **return value** did not contain the key, and went red — because that value
carries `credentials` on purpose, so the caller can build a client with them. The assertion was
nonsense, not the code, which is why `formatCredentialDescription` is now exported and pure: an output
promise is only checkable if the formatter can be reached without a credential.

**Can-fire, with a green control before and after every probe and a byte-identical restore.** Eleven
probes, all RED with the intended test named: S1 a second `createClient` site · S2 the constructor
reading the credential variable · S3 renaming the `key` parameter · S4 removing `server-only` from a
marked module · S5 handing the service-role key to the cookie-backed server client · S6 removing the
credential read from the module behind the marker · S6b a direct `process.env` read in the sink · S8 a
second caller of the privileged constructor · S9 a real filesystem write in the command · S10 the
credential name printed in place of its length · S11 the refused record no longer named.

**Three of those eleven probes were themselves defective on first run and produced a GREEN, which is
the more instructive half.** S3 renamed the parameter and then rebound a local named `key`, leaving the
`createClient` argument list byte-identical — and the mutant's sha256 had **changed**, so the hash was
not sufficient to catch it; what was needed was reading the mutant in the region the assertion
inspects. S6 took two attempts, and the second left the variable named in a `return` statement below
the line it replaced. S7 — adding the env **import** to the sink — did go red, but as a **collection
failure**, `server-only` throwing while the module loaded: the strongest possible evidence that the
marker is transitive and the weakest possible attribution for an import assertion. It was replaced by
**S6b**, which adds no import at all, and that probe found a real gap: `server-only` is only ever
pulled in **transitively**, so an import assertion cannot see a module that reads `process.env`
directly. `dataset-sink.test.ts` now asserts that too. A fourth probe defect: S8's anchor
`import { createClient } from "@supabase/supabase-js"` occurred **zero** times in `browser.ts`, which
uses `createBrowserClient` from `@supabase/ssr`; the harness's occurrence-count assertion reported
`?? INCONCLUSIVE` and refused to mutate, which is the behaviour it exists for. **Guessing which of a
file's import lines to mutate instead would have made it a different experiment wearing this one's
name.**

**Repair round, 2026-10-04: the independent verification failed this change, and it was right to.**
Two CRITICAL findings — the import migration's column arm and primary-key arm cannot fire in the
states they name — plus five WARNINGs, one of which (the `.neq()` phantom) named a method that does
not exist anywhere in `src/`. The repairs, each with its own can-fire:

- **New forward migration `20261004120000_dataset_entries_import_guard.sql`.** The defective file is
  applied and therefore immutable history, so the correction is a second file, not an edit: columns
  by set difference with every missing name in the refusal, the primary key by exact column set
  (`<> 'id'` names the actual key), and a `to_regprocedure` check that the function exists. One
  behavioural test per arm, six in all. Can-fire M1/M2/M3: each arm removed → the named test goes
  red (`expected '' to contain 'dataset_entries_import guard failed'` — the guard goes silent, which
  is exactly the old file's defect reproduced on purpose), green controls before and after,
  byte-identical restores. Applied to the hosted project (status 201), and the gate probe re-run
  after it: still 7/7, 600 rows intact.
- **Scenario 2 finally has tests.** "No HTTP route, Server Action, or page performs the write" is
  enforced by enumerating `src/app/**` and every `"use server"` module from the filesystem and by
  asserting no module under `src/` imports the sink implementation. Can-fire P1: a route importing
  the sink → both tests red by name. The old file's substring-only coverage of its own precondition
  stays as history; the new arms rest on behaviour, not substrings.
- **The write-scan control now covers all sixteen patterns**, with one real call per pattern in the
  fixture and an exact-length assertion. Can-fire P2: one call removed → red. The scan itself is now
  recursive, so a command in a subdirectory is covered.
- **The instruction-absence check is now a real test**: a full `importEntries` run over entries with
  distinctive instructions, asserting the text appears in no output line. Can-fire P3: printing the
  instruction → red. The decorative `formatProgress` regex it replaces could never fail.
- **The sink's import regex now reads to the semicolon**, so a multi-line forbidden import is
  captured. Can-fire P-IMPORT: a five-line `supabase-js` import in the sink → the named test red,
  with the module still loading (no collection failure to hide behind).
- **Corrections to prose that was false**: the stripping-cost paragraph had the failure direction
  backwards (a string-only identifier MATCHES — noisy, not missed; the real hole is an opener inside
  a string); the lint row no longer claims the boundary rule covers `scripts/`; `factory.ts`,
  `AGENTS.md`, and the roadmap no longer name `.neq()` as a live method — the string survives
  only in dated notes recording that it was removed — and now list the methods actually called
  (`.order()`, `.limit()`, `.insert().select().single()`, `.maybeSingle()`); `tasks.md` 2.1, 4.1, and 6.4 describe what
  actually holds.
- **Two defects in the repair's own probes, recorded because both reported working guards as
  unattributable.** The ANSI strip was written without the escape byte, so `FAIL` lines matched
  nothing while the run reported "1 failed" — the repository's fifth occurrence of that defect, this
  time in its own newest harness. Then the FAIL-line regex assumed one token before the first `>`,
  but the line carries the project label AND the file path. Both were caught because the probes
  refuse to score an unnamed red, which is the behaviour that justifies the machinery.

### Local Verification Evidence — `hosted-dataset-import` (measurement instruments)

The tools used above live outside the repository, in `%TEMP%\opencode`, and four of their rules are
worth carrying forward because each was learned by getting it wrong.

- **Redaction is a filter, not a control.** `redacted-rerun.mjs` wraps a probe's output in
  secret-shaped patterns and prints only the redacted text — which is the only way to diagnose a
  disclosure without repeating it. It reports the **number** of substitutions, treats any surviving
  `sb_`-prefixed token as a failure, and **refuses to score a run with zero substitutions as clean**,
  returning `?? UNVERIFIED` instead. That refusal is the difference between "no secret was emitted"
  and "the patterns do not work", which look identical in the output.
- **Compare a suspected secret by hash, and report a near-match as a near-match.** `compare-key.mjs`
  compares a candidate against every secret-shaped variable in `.env.local` and prints lengths and
  SHA-256 prefixes. It never prints a value. An inline `node -e` was tried first and PowerShell
  mangled it into a syntax error — the recorded hazard, hit again, and the reason every one of these
  is a file.
- **Verify a probe against a fixture, not against a string built inside it.**
  `tests/fixtures/write-capable-sample.ts` is a real module containing a real `writeFileSync`, and it
  lives outside `scripts/` precisely so the guard over `scripts/` is not made to fail for the right
  reason at the wrong time.
- **`node --check` before trusting any verdict from a probe.** It caught a TypeScript non-null
  assertion inside a `.mjs` file — where `!` is a **syntax error**, not a type annotation — and the
  run correctly reported `DID-NOT-PARSE` rather than a confident `GREEN`.

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
    - **(SUPERSEDED — this gap was closed by `consistency-guards`, which added
      `tests/unit/ledger-integrity.test.ts`; the statement below is kept as the record of what was
      outstanding at this stage.)** The `Archived Changes` table still has no automated guard.
      `grep -r ROADMAP tests/` returns
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

### Local Verification Evidence — `consistency-guards` (Apply stage)

Every figure below was produced by running the command named.

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run lint` | exit 0, no errors and no warnings | Every file lints, including the two new suites. | That a new violation would be caught. |
| `pnpm run format:check` | exit 0 | Every formatter-owned file matches. | Anything about correctness. |
| `pnpm run typecheck` | exit 0 | `tsc --noEmit` under `strict`. | Any runtime behaviour. |
| `pnpm run test:unit` | exit 0 — **70 files, 1598 tests** (was 68/1580) | Cross-consumer agreement over one hand-counted corpus, and ledger integrity against the archive directory. | Anything needing a database, a network, or a browser. |
| `pnpm run test:dom` | exit 0 — **7 files, 87 tests, unchanged** | Nothing new: this change adds no screen. | Anything about a real browser. |
| `pnpm run test:integration` | exit 0 — **12 files, 197 tests, unchanged** | Nothing new: no schema or repository change. | PostgREST behaviour not already covered. |
| `pnpm run build` | exit 0, "Compiled successfully" | The application still compiles. | That any test passed. |
| `openspec change validate consistency-guards --strict` | exit 0, valid | The change's artifacts satisfy the schema strictly. | That the implementation matches the change. |
| `openspec validate --specs --strict` | exit 0, **15 passed, 0 failed** | No delta leaked into `openspec/specs/`. | That the implementation matches the specs. |

**What the ledger guard found on its FIRST run, which is the whole argument for it.** The
`Archived Changes` table named **13** changes while the archive directory held **16**:
`2026-10-02-researcher-dashboard`, `2026-10-03-hosted-dataset-import` and
`2026-10-03-research-export` were missing. That is the **fourth consecutive archive** in which a
hand-maintained figure in this file was stale, and it is the first one a command found rather than a
reader.

**Two defects in the guard itself, both found while writing it.**

- **The reader consumed the first data row as the header.** It treated the first line after the header
  as the header itself, so `project-foundation` was reported MISSING from the ledger when the ledger
  names it — a false positive against a correct row. One row lost to an off-by-one is the same failure
  class as the earlier checker that discarded a malformed row and every row beneath it.
- **Cell-counting was the wrong rule, and was dropped.** This ledger carries at least one literal pipe
  inside a cell, so a split-on-pipe reports a different cell count than the row has — a defect this
  file's own tooling notes already record. Rows are now located by the archive path they carry, which
  is the one thing every such row must contain, and a row whose other cells were damaged is still
  counted.

**Can-fire, with green controls before and after and byte-identical restores.** Cross-consumer:
X-DASH-TOTAL, X-DASH-BUCKET, X-DASH-REVIEW and X-EXPORT-TOTAL — breaking **either** consumer is
detected, and the last one breaks the export specifically so the comparison is not one-directional.
Ledger: L-UNLISTED, L-PHANTOM, L-COUNT, L-DUPLICATE, L-MALFORMED — each edits the LEDGER, never the
test, so what is measured is the guard's reaction to a stale ledger rather than a change to the guard.

**One correction this round is worth keeping.** The corpus comment was hand-counted wrong on the first
pass — it claimed 13 rows, `zero = 4` and `complete = 2`, and the suite failed on the bucket
literal. The measurement was right and the arithmetic was not. What matters is *where* the failure
landed: on my literal, with the two consumers having already agreed with each other, so the
export-side comparison was never reached. A hand-written count that disagrees with the code is caught
before the comparison it was meant to support — which is the reason the counts are written out at all.

### Local Verification Evidence — `research-export` (Apply stage)

Every figure below was produced by running the command named. Nothing here is incremented from a
previous row.

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run lint` | exit 0, no errors and no warnings | Every file lints, including the command and the four new suites. | That a new violation would be caught. |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" | Every formatter-owned file matches. | Anything about correctness. |
| `pnpm run typecheck` | exit 0 | `tsc --noEmit` over `src/`, `tests/`, `scripts/` under `strict`, including the export command's `Pick<>` read-only contracts. | Any runtime behaviour. |
| `pnpm run test:unit` | exit 0 — **68 files, 1580 tests** (re-measured after the verification repairs; it read 1577 before them) | Record shape and closed key set, CSV quoting with a round trip through a test-local parser, summary arithmetic over a hand-counted two-category fixture, the no-merge invariant over the serialized artifact, the command's refusals, and two read-only scans. | Anything needing a database, a network, or a browser. |
| `pnpm run test:dom` | exit 0 — **7 files, 87 tests, unchanged** | Nothing new, and correctly so: the export adds no screen, so there is no client behaviour to observe. | Anything about a real browser. |
| `pnpm run test:integration` | exit 0 — **12 files, 197 tests, unchanged** | Nothing new: the export reuses the existing repositories and adds no schema. | PostgREST behaviour not already covered. |
| `pnpm run build` | exit 0, "Compiled successfully" | The application still compiles with the command and export modules present; no client bundle reaches them. | That any test passed. |
| `openspec change validate research-export --strict` | exit 0, valid | The change's proposal, design, and delta satisfy the schema strictly. | That the implementation matches the change. **It caught a real mistake first**: a scripted edit of `tasks.md` dropped the `## 4. Close out` heading and the validator reported six group-numbering warnings before that. |
| `openspec validate --specs --strict` | exit 0, **14 passed, 0 failed** | No delta leaked into `openspec/specs/` during Apply. | That the implementation matches the specs. |
| Gate: `pnpm run export:research` against the hosted project | exit 0; **600 active entries read, 0 stored responses, 0 validator profiles**; three artifacts written and cross-checked (summary stored count = JSON record count, qualifying total = records flagged qualifying, CSV lines = records + 1 header, CSV header = the declared key set, no merge-suggesting key) | The command reaches the real hosted project with the real credential and produces internally consistent artifacts. | **Anything about real validator data.** The corpus holds **ZERO** validations, so no record-level behaviour was exercised against real rows. Recorded as PARTIAL, not as a pass. |

**Independent verification: PASS-WITH-FINDINGS, and the two CRITICAL findings were guards that
could not see what they claimed to.** Both were re-confirmed by measurement here before repair rather
than taken on the verifier's word.

- **C1 — a count is not a guard.** `export-read-only.test.ts` counted `writeFile`/`mkdir` calls
  and asserted the total, and its own comment claimed "nothing else that touches the filesystem". The
  verifier measured **nine** realistic filesystem mutations leaving it green — `appendFile`, `rm`,
  `unlink`, `rename`, `copyFile`, `createWriteStream`, `truncate`, `open(…, "w")`,
  `writeFileSync` — and the sibling 16-pattern scan in `import-dataset-command.test.ts` **exempts**
  this command, so for this one file the two-name count was the only guard there was. Replaced with an
  **allow-list over all sixteen APIs** (Sync variants listed separately) plus a per-call assertion that
  every `writeFile` names one of the three declared artifacts.
- **C2 — scope that named Server Actions and reached none of them.** The unreachability scan walked
  `src/app` and `src/components`: **30 of this repository's 110 modules, and none of the six
  `"use server"` ones** — while the requirement it discharges names Server Actions explicitly.
  `import { runExport }` dropped into `src/lib/validation/actions.ts` would have failed no test. The
  walk now covers all of `src/`, and the two empty-capture guards — the module total and **the number
  of Server Actions the walk actually reached** — make the scope visible rather than assumed.

**The repair had its own defect, found by its own probe.** The first allow-list matched with a
trailing `\w*`, and a `writeFileSync` mutant came back GREEN: `writeFile\w*` matched
`writeFileSync` as though it were `writeFile`, so the renamed API was reported under its old name
and the set never changed. The matcher is now exact — name, optional whitespace, `(` — and the Sync
variants are listed in their own right. Re-probed, all four mutants are RED by name with green
controls and byte-identical restores.

**Warnings repaired rather than deferred.** The fixture could not distinguish the shared qualifying
predicate from `evaluation !== "cannot_evaluate"`, because only `cannot_evaluate` was represented;
two partial rows were added and the naive restatement is now proved RED by two mutants (Q-NAIVE,
Q-NAIVE-FLAG). The per-category assertion had been `5 === 5` with only one category in the fixture; a
second category was added and the sums are now checked across all four figures. `EXIT_REFUSED` was a
dead export naming a category the command never produces, and is removed. The CSV parser's header
claimed it throws on any stray quote; measured, it does not throw on text after a closing quote, and
the comment now says what the parser actually rejects and why the per-cell assertions are what rule
that case out. The new `data/` check has a can-fire control covering the literal, template and
**`DEFAULT_SOURCE_PATH` constant** forms, plus innocent writes it must not flag.

**Three defects in my own tooling this round**, recorded because each would have read as a finding
about the system: the export gate probe read on after a non-zero command exit and reported an ENOENT
crash instead of the real failure; the same probe derived the expected CSV keys from `records[0]` and
so compared an 11-column header against an empty array on an empty corpus; and a scripted `tasks.md`
edit silently dropped a heading.

### Local Verification Evidence — `researcher-dashboard` (Apply stage)

Every figure below was produced by running the command named. Nothing here is incremented from a
previous row.

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run lint` | exit 0, no errors and no warnings | Every file lints, including the new dashboard routes, service, and domain modules. | That a new violation would be caught; that is proved per-rule by its own probe, not by a clean run. |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" | Every formatter-owned file matches the committed configuration. | Anything about correctness. |
| `pnpm run typecheck` | exit 0 | `tsc --noEmit` over `src/`, `tests/`, and `scripts/` under `strict`, including the dashboard's `Record` exhaustiveness (a new evaluation or proficiency value fails here rather than silently leaving a bucket out). | Any runtime behaviour. |
| `pnpm run test:unit` | exit 0 — **63 files, 1521 tests** (re-measured after the verification repairs; the figure previously read 62/1514 and this change added one file and 7 tests) | Review-flag predicates, disqualify reasons, the dashboard service over fakes on a hand-counted fixture, dashboard markup with paired label/value assertions, page wiring against a stubbed factory, the per-entry ROUTE, and the read-only scan. | Anything needing a database, a network, or a browser. |
| `pnpm run test:dom` | exit 0 — **7 files, 87 tests, unchanged** | Nothing new, and the reason is stated correctly here because the first version of this row did not: the dashboard routes add no new client component. They render `SignOutButton`, which IS a `"use client"` island, and its behaviour is already covered by `tests/dom/researcher-sign-in.test.tsx`. The dashboard's own navigation is plain anchors with no handler and no state, so there is nothing left for `happy-dom` to observe that the markup assertions do not already cover. | Anything about a real browser. **No human has ever rendered any screen in this project.** |
| `pnpm run test:integration` | exit 0 — **12 files, 197 tests** | The new `ValidatorsRepository.listByIds` round-trips against a real PostgreSQL engine from the production migration directory (caller order, missing ids omitted, null proficiency, empty list issues no query). | PostgREST's interpretation of `.in()`; PGlite is the engine, not the gateway. |
| `pnpm run build` | exit 0, "Compiled successfully" | Both new routes (`/researcher`, `/researcher/entries/[id]`) compile for production. | That any test passed. |
| `openspec change validate researcher-dashboard --strict` | exit 0, valid | The change's proposal, design, and delta satisfy the schema strictly. | That the implementation matches the change. |
| `openspec validate --specs --strict` | exit 0, 13 passed, 0 failed | The delta still lives only under `openspec/changes/`; no capability leaked into `openspec/specs/` during Apply. | That the implementation matches the specs. |
| Dashboard gate on the local dev server | 3/3 green, then the probe deleted | Real `runResearcherSignIn` accepts the operator credential and refuses a wrong one; the dashboard serves HTTP 200 with every figure label to a verified session (403 without); an entry review serves HTTP 200 with source fields (404 for unknown). The browser Server Action flight protocol was not exercised — no browser exists here; the form path is covered by `tests/dom/researcher-sign-in.test.tsx`. | Anything about a desktop browser rendering these screens. |

**Can-fire, with green controls before and after and byte-identical restores.** R1 raw-evaluation
counting, R2 case folding, R3 translation reads (each naming its test); wrong-column `.in()`
variant red in BOTH suites; P-WRITE (smuggled `.insert()` in the dashboard page); and, after the
verification round, V-SWAP-ENTRIES, V-SWAP-REVIEW, V-LABEL and V-LEAK (figure-value swaps, a
re-hardcoded coverage label, and a translation leaked into the shared source region). Two probe
defects found and repaired: the first R3 mutant nested its translation read inside the
correction-present branch (behavioural test passed, structural fired — the mutant was wrong, not
the guard); the FAIL-line regex assumed one token before the first `>` while the line carries
project label and file path. A third appeared in the view-pairing probe: an anchor that matched
nothing reported INCONCLUSIVE and then carried on applying the remaining anchors and scoring a
verdict anyway, so one probe printed both a refusal and a result. The fix refuses the WHOLE
mutation, and the anchors are now read off the post-prettier source.

**Independent verification: PASS-WITH-FINDINGS, all findings repaired before merge.** Three
CRITICAL findings were three **false claims**, each re-confirmed by measurement before repair
rather than taken on the verifier's word:

- `tasks.md` and two cells of this file claimed the dashboard "ships zero client JavaScript".
  **False**: both routes render `SignOutButton`, a `"use client"` island with `useTransition`,
  `useRef` and an `onClick`. The conclusion (no dom tests) survived; the reasoning was wrong, and
  a claim that is a stated reason for skipping work is not a claim that can be left standing.
- `design.md` D3 claimed the flag module "takes no translation parameter at all, so a future edit
  cannot just also compare them without changing the signature". **False**: both predicates take
  `QualifyingResponseShape[]`, which carries both translation fields — determining *qualifying*
  needs them. D3 now describes the two test halves and says plainly that the structural half is
  weaker than the type layer it replaced.
- `page.tsx` claimed "even the construction cannot hand this page a write it has no business
  holding". **False**: the factory returns concrete instances, and
  `SupabaseValidatorsRepository.create()` is a public write reachable from the page — the
  destructuring narrows which REPOSITORIES, not which METHODS. The comment now names the three
  layers that do hold, and says which one does not.

The first CRITICAL also revealed a **defeatable guard**, which is the more serious of the two
kinds of finding and is why it is recorded rather than closed as a comment fix. The read-only
scan forbade `.insert(`/`.update(`/`.upsert(`/`.delete(`/`.rpc(` and would have passed a page
calling `validators.create(…)` — a real production write, reachable, matching nothing. Measured
escapes closed: `.create(`, optional-chaining (`?.(`), a line break before the argument list, and
a single-quoted `'use server'` directive. The pattern list is now derived from the repository
interfaces' write methods, and each name has a REAL production module behind it as a can-fire
control, which is precisely what `.create(` lacked.

**Warnings also repaired, not deferred.** The figure test was **permutation-invariant**: it
asserted each label and each value independently over the whole document, so swapping any two
figures' values left the suite green while the screen reported two wrong research figures — proven
by V-SWAP-ENTRIES and V-SWAP-REVIEW. Now each card's label and value are read as an adjacent pair.
The per-validator scoping test asserted only segments 1 and 2, leaving the region BEFORE the first
response card unexamined — a merged-translation regression would have passed it; V-LEAK proves it
now goes red. A test asserting a validator id was satisfied by the `data-validator` attribute
itself rather than by the visible `<code>`. Only one of four disqualify reasons was asserted as
markup. The coverage-complete threshold was hardcoded `3` in three places while allocation reads
the configurable `INDEPENDENT_VALIDATION_TARGET_DEFAULT` — now a parameter carried in the result
and rendered from it. The per-entry ROUTE had no rendering test at all (the view and the service
each had one, the wiring between them had none): `tests/unit/entry-review-page.test.tsx` now
renders it, and `validation-routes.test.tsx` names that file as the per-route witness instead of
asserting one file's existence for three routes.

**Decisions taken during Apply and recorded here rather than left in commit messages.** (1) The
flag predicates take the shared `QualifyingResponseShape`: a narrower translation-free shape was
tried and is unworkable, because determining qualifying NEEDS the translations — so exclusion is
enforced by tests instead. (2) The disqualify reason lives in a separate `review-reasons.ts`,
because naming a missing translation requires reading translation presence, which the flag
module is structurally forbidden from doing. (3) "Total validators" counts validators with at
least one stored response, labeled as such on screen. (4) Dashboard chrome is English-only,
matching every other page under `src/app/researcher/`; research data renders as stored in all
three languages regardless. (5) No dom tests: the dashboard adds no new client component, and the
one client island it renders is already covered. (6) The placeholder-era "shows NO figures" tests
were replaced, not weakened — the approved spec contradicts them, and a test changed because the
behavior changed is legitimate only with that requirement behind it.

**Two corrections this section owed the next reader.** `totalEntries` counts **active** entries
while the approved figure reads "total dataset entries"; they are equal only because nothing in
the repository writes `is_active = false` (measured: the column default and the import function's
`coalesce(p_is_active, true)` are the only writers), and the narrowing is now stated in the type
rather than left to be discovered. And the fixture's hand-counted numbers were **re-derived by the
verifier from the fixture data itself** rather than read from the comment — 13 rows, 12 qualifying,
buckets `{zero:1, one:1, two:1, complete:3}`, 50% — and every figure matched.

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

### Ledger — `interrupted-batch-recovery`

**What this change is, stated so it cannot be misremembered.** It is **not** a data-loss fix, and that
is a measurement rather than a position. `selectBatchEntries` (`src/lib/domain/allocation.ts`) excludes
exactly two things: entries the validator has already answered, and entries already at the coverage
target. An abandoned batch's unanswered entries satisfy neither exclusion, so they remain allocatable
and no instruction is lost. **Only continuity was lost.** A second measurement points the same way:
`/validate/[batchId]` already resumes, because `resolveSessionEntry` returns the first placement that
is not complete. What was missing was **discovery** — the participant had no way to find the batch they
had left. Both facts are recorded in the change's `proposal.md`, and they are the reason the change
adds recognition and nothing else.

**A requirement met by an accident is not met.** The Server Action wrapper originally did not catch, on
the reasoning that the core already mapped a repository failure to *unavailable*. But `getServerEnv()`
runs while building the argument, so with no credentials the action **rejected** before the core was
reached — and the island calls it with `.then()` and no `.catch()`. The outcome would have stayed
`null`, and `null` collapses to `none`. D4 would therefore have held by coincidence: delete either
file and nothing turns red. The wrapper now catches and translates, in the same shape as
`src/lib/allocation/actions.ts`, and `tests/unit/recovery-actions-wrapper.test.ts` drives the **real**
wrapper with the environment module throwing — which is the only path that can run in this repository,
since all three `SUPABASE_*` are absent.

**Two guard names asserted falsehoods, and both were renamed rather than widened.** A test named
*"writes no timestamp, because the table has none"* became *"writes no timestamp beyond the one the
table now has, and no lifecycle column"* once D2 added `created_at`, and the `research-schema` closed
column-set comment was narrowed with an explicit retraction block. The generalisation: **a guard whose
name asserts a falsehood must be renamed, not silently widened**, because the next reader weighs the
name and not the body.

**A guard that a feature makes false is worse than no guard, and there were TWO in one file.**
`tests/unit/validation-routes.test.tsx` asserted `/href="\/validate\/batch/`, which cannot match a
real batch href: `defaultBatchId` mints `VAL_<identifier>-<instant>`. That one had been recorded here
as a pre-existing loose regex — the note described the symptom and not the cause. Repairing it revealed
that the **very next test in the same file carried the identical vacuous pattern**, written by a
different change whose author had not read the first. Both were repaired, and the second repair is the
more serious: a document-wide "no batch href" assertion is now a statement **the product itself
contradicts**, because a start screen showing a resume offer legitimately carries a batch href — while
being too weak to notice that it does. It is now scoped to the start control's own tag, so the offer
above it cannot affect the result. Four probes, all as expected: with a real batch href injected into
the island's server-rendered markup the **old** guard is GREEN (the finding) and the **repaired** guard
is RED, and one variable changes between them.

**A vacuity claim must be about the file as it existed BEFORE the repair.** Reverting only the regex
and leaving the repair's second assertion in place turned a probe RED for the wrong reason. Both files
are restored byte-identical after every probe.

**Three harness defects were mine, in the same probe file, and each produced a plausible wrong verdict.** The count was written as "two" while three bullets sat under it, which is the same defect this repository has now found twice in an enumeration whose labels no longer match its own text — and this time it was in the sentence *describing* enumerations. The honest number is three and all three are real.

- A probe mutated the guard by calling a **one-argument callback as if it took two**, so the "injected"
  href was the literal string `undefined`. It then reported GREEN — reading exactly like the finding
  it was written to produce. Offsets, lengths, and both SHA-256 digests were internally consistent and
  all three described a mutation that injected nothing of use. The fix was to read the value from a
  module constant and **assert it starts with `/validate/`**. The lesson is already recorded here in
  general form; what is new is that **a mutation must be inspected, not merely summarised**.
- The harness kept `files` and `edits` as two parallel lists kept in step by hand. The drift surfaced
  as a probe throwing on an anchor meant for a different file. `files` is now **derived** from
  `edits`.
- A sibling probe came back RED for the right reason and the wrong test: the *other* guard in the same
  file was still live and fired on the injected markup. The fix was to remove the other guard, not to
  explain the red away.

**Five of six failures in the new DOM file were harness errors, and one read like a pass** if only the
exit code were checked. This is the third change in a row where the defects hid in a test's own first
draft, and it is why every probe here runs a **negative control before every mutant**, classifies on
four outcomes (`GREEN` / `RED` / `DID-NOT-RUN` / `DID-NOT-PARSE`), and **refuses to score an
ambiguous anchor** — an anchor occurring twice is the refusal working, not an obstacle, and the sixth
occurrence of that refusal in this repository was in my own probe.

**A guard kept for legibility that is measured redundant.** The `entryIds.length === 0` early return in
the repository seam is retained for readability, and it was measured rather than assumed: deleting it
leaves 14/14 green. It is documented as redundant instead of being quietly relied upon.

**A measured figure inside prose is exactly where a table delimiter goes to hide.** Refreshing the three
`test:*` rows in `AGENTS.md` put vitest's own `4 failed | 11 passed (15)` into two table cells, and
`AGENTS.md` records that a literal `|` inside a cell splits the row — while those two rows were carrying
the very figures that distinguish a control from a probe, which is where a reader's attention goes. A
column count caught it: `test:dom` declared **6** columns against a 4-column header and
`test:integration` **5**. **Reading the diff would not have**, because the pipes sit mid-line in a 5 KB
row. The fix is `/` rather than `\|`: it reads the same and keeps the precision, whereas an escape
introduced in two cells would leave a reader wondering whether the unescaped ones are special too. All
four tables in the file now measure 4/4/4/4 against `main`'s 4/4/4/4, compared from the blob with
`git cat-file` rather than through a PowerShell pipe — a pipeline that re-encodes the bytes produces
*zero* tables, which is a checker that measured nothing and would have reported a pass.

**The encoding paragraph was itself carrying the corruption it warns about, and a false count sat under
three bullets.** `AGENTS.md` holds a lesson about judging a file by its bytes, and it held **three
`U+FFFD`** in its own committed bytes at exactly the character under discussion — hex-dumped as `ef bf bd`
three times, one per byte of a three-byte `U+2026`. `git show` piped through PowerShell reports **744** on
the same file; `git cat-file` reports **3**. Nothing would ever have repaired it, since `AGENTS.md` is
`.prettierignore`d and never formatter-owned. Repaired, with the measurement recorded beside the
paragraph. Separately, this ledger's own entry said "**Two** harness defects" above **three** bullets —
the same shape `AGENTS.md` records twice for an enumeration whose labels no longer match its text, and
here it was in the sentence *describing* enumerations. Corrected to three rather than dropping the third,
which is real.

**A pattern you have not read out of the file is a guess, and a guess that misses is indistinguishable
from an absent defect.** Two repair patterns were typed from memory of the diff and matched **zero**
times, reporting "pattern occurs 0 times" — the same empty-match shape this file records four times,
arrived at from a new direction. Both were located instead by printing the file's own bytes, which showed
the cells end on different sentences than the ones typed. The diagnostic that catches this now prints
the file's text when a pattern misses, distinguishes *already applied* from *not found*, and reports which
pattern of which file — because "pattern occurs 0 times" with no index is undiagnosable.

**What remains unwitnessed, and says so.** `created_at` is server-written and never client-supplied, but
no Supabase client has ever been constructed here, so PostgREST behaviour, `error.cause.code ===
"23505"`, and RLS as enforced by the API gateway are all unverified. **No browser has ever rendered any
screen in this project**, including the offer this change adds.

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