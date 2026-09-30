# Tasks

## 1. Establish the gap is real, before writing anything that closes it

The gap is inherited from `thin-shell-call-sites`, where it was found by re-deriving an enumeration
rather than by reading the specs once. It must therefore be re-derived here independently, because
the predecessor's own supporting figure did not reproduce.

- [ ] 1.1 Re-derive the "no requirement mandates an inert control during a write" claim from
      `openspec/specs/` alone, and record the count reached. **Verify:** every requirement block and
      every scenario across all nine specs is enumerated, and the scenarios mandating an inert control
      during a write are listed by capability and scenario name. A count of 0 is the expected result;
      any non-zero count is a finding that contradicts the proposal and must be reported rather than
      written around.
- [ ] 1.2 Re-derive the `/ready` claim the same way, and record the count of specs naming the route.
      **Verify:** the nine specs are searched for `/ready` and the result is listed per spec. Expected 0
      of 9.
- [ ] 1.3 Confirm the predecessor's unreproducible `15` figure stays unreproducible, so this change
      does not silently re-import it. **Verify:** at least two independent definitions of "requirement
      block" are tried against the specs and neither yields 15. Record both counts.

## 2. Write the `design-system` delta

- [ ] 2.1 Add the pending-state requirement to
      `openspec/changes/pending-state-specification/specs/design-system/spec.md`, scoped to the control
      that **initiated** the action, with controls made inert alongside it required only to be inert and
      to change appearance uniformly. **Verify:** the requirement states both halves, and the scope
      matches design.md D1. The first draft of this delta said "an interactive control whose action has
      been accepted" without distinguishing the initiating control, which the screening choices violate
      because they change no text; that defect must not reappear.
- [ ] 2.2 Write the scenarios, each naming an existing binding, and **state on the face of the delta
      that "pending is distinguishable from unavailable" is currently vacuous.** **Verify:** every
      scenario has implementation evidence — `disabled={isPending}`, `disabled:opacity-50`,
      `t("screening.submitting")`, `aria-busy={submitState.ariaBusy}` — and the vacuity note is present
      so no future reader cites that scenario as coverage.

## 3. Write the `validator-onboarding` delta

- [ ] 3.1 Add the single-flight requirement, naming the decline affordance explicitly, and the
      `/ready` destination with what it must not render. **Verify:** the requirement text covers *both*
      submit affordances and both completion paths, and the block quote recording that `/ready` appears
      in 0 of 9 specs is present.
- [ ] 3.2 Write the scenarios and check each against the implementation. **Verify:**
      `disabled={submitState.disabled}` occurs on both buttons, `router.push("/ready")` occurs in both
      components, and `/ready/page.tsx` documents that it renders no identifier, proficiency, counter,
      or timestamp.

## 4. Verify the change is a specification change and nothing more

This change claims it edits no source. That claim is checkable from the diff, and a claim about the
diff that is not checked is the defect this repository has already made three times.

- [ ] 4.1 Assert the diff touches no runtime or test path. **Verify:**
      `git diff main --numstat -- src/ tests/ supabase/` is **empty**. A non-empty result means the
      change is not what it claims and the deltas must be re-read against the code.
- [ ] 4.2 Re-read both deltas against their implementations line by line, as a check that no scenario
      is a wish. **Verify:** each scenario is matched to a specific existing binding, and each binding
      is confirmed to occur where expected. **Do not point a probe at a file the behaviour is not in** —
      the label swap lives in `onboarding-flow.ts` and the key in the copy catalog, never in
      `screening-form.tsx`, and a probe pointed at the component reports a satisfied scenario as
      `UNBACKED`, which is indistinguishable from a spec that wishes for something unimplemented.
- [ ] 4.3 Confirm `skip_specs` is **not** set and the deltas are additive, so the change is not
      misfiled as a no-delta change. **Verify:** `.openspec.yaml` carries no `skip_specs: true`, and
      `openspec change validate pending-state-specification --strict` exits 0.
- [ ] 4.4 Run the full gate. **Verify:** `lint`, `format:check`, `typecheck`,
      `openspec validate --specs --strict`, `test:unit` (33 files / 897 tests), `test:dom`
      (3 files / 15 tests), `test:integration` (6 files / 100 tests), the dataset guard **scoped** to
      1 file / 7 tests by the literal command, and `build` all exit 0 — with every figure read out of a
      named step's own summary line rather than inferred from an exit code.

## 5. Record the boundaries

- [ ] 5.1 Update `docs/ROADMAP.md` `## Project Status` at archive time: the change is archived, the
      next objective is **Phase 5 `validation-experience`**, and the spec gap recorded in
      `Active Blockers` is closed **for the onboarding flow only**. **Verify:** the blocker entry is
      amended rather than deleted, so the parts that remain open stay visible.
- [ ] 5.2 Record what this change did **not** close, in both the ledger and this change's archived
      artifacts: `RV-4` still has only a source-scan guard; the `Archived Changes` table still has no
      automated guard; server-side idempotency is out of scope per design.md D2; and **no browser has
      ever rendered any screen in this project**, so nothing here is visual verification.
      **Verify:** each of the four appears in the archived record, and none is stated as resolved.
- [ ] 5.3 Confirm the vacuous scenario is carried forward as a known gap rather than allowed to look
      like coverage. **Verify:** `docs/ROADMAP.md` records that
      "pending is distinguishable from unavailable" becomes observable only in Phase 5.

## 6. Sync and archive

- [ ] 6.1 Sync the two deltas into `openspec/specs/`. **Verify:** `openspec validate --specs --strict`
      exits 0 and the item count rises from **9 to 9** — two ADDED requirements inside two existing
      capabilities, so the capability count must **not** change. A count that rises to 11 means a new
      capability was created, which the proposal explicitly rejects.
- [ ] 6.2 Re-read both synced requirements in `openspec/specs/` and confirm they match the approved
      delta bodies. **Verify:** requirement and scenario counts per capability are recorded before and
      after the sync — `design-system` 5 → 6 requirements, `validator-onboarding` 7 → 8 — and every
      other capability is unchanged.
- [ ] 6.3 Archive the change and update the ledger. **Verify:** `openspec archive
      pending-state-specification --yes` exits 0 with `Task status: Complete`, the directory is at
      `openspec/changes/archive/2026-10-01-pending-state-specification/`, and the `Archived Changes`
      table lists **9** changes — **manually, with the absence of an automated guard stated**, since
      `grep -r ROADMAP tests/` returns no matches and that absence must not be papered over with a
      sentence that sounds like one.