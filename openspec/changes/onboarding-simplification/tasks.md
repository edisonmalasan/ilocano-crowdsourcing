# Tasks

## 1. Required proficiency (methodology correction)

- [ ] 1.1 Tighten enrollment **intake** to non-nullable (`enrollmentIntentSchema`,
  `EnrollmentRequest`, `parseScreeningAnswer`): missing or explicit `null` is
  `invalid`. Keep `validatorProfileSchema.ilocanoProficiency` nullable and the
  DB column nullable; no fabrication for legacy rows. Verify: new invalid cases
  green; legacy-null read still valid.
- [ ] 1.2 Remove the decline affordance from `screening-form.tsx` (one submit
  control; empty submit surfaces the field-attached required error and sends
  nothing). Keep neutral `AnswerGroup` mapping and single-flight latch.
  Verify: DOM submitted-without-choice sends no request; in-flight blocks a
  second submit.
- [ ] 1.3 Update copy both languages: retire `screening.skip`; rewrite
  `screening.failure.invalid.enroll` without the skip offer; compress the
  pre-enrollment notice to three sentences; edit `ready.starting.item3`
  skip clause. Verify: `locale-copy` parity green.

## 2. Auto-orchestration (exit retarget + /validate effect)

- [ ] 2.1 Retarget post-enrollment navigation (`screening-form.tsx`,
  `resume-validator.tsx`) from `/ready` to the orchestration screen.
  Preserve store-before-navigate and resume-no-overwrite behavior. Verify:
  DOM navigation assertions retargeted; in-flight negatives kept.
- [ ] 2.2 Replace the manual batch request in `start-batch.tsx` with the auto
  effect (recovery lookup → resume-or-allocate → single navigation;
  identity-absent returns to screening; `exhausted`/failure render honestly
  with retry). Reuse `{validatorId}`-only intents; single-flight latch;
  StrictMode-mount issues exactly one allocation request. Verify: DOM effect
  tests; no duplicate request under double-mount.
- [ ] 2.3 Keep `/ready` as a direct-visit fallback (no normal-flow links to
  it). Verify: route-inventory tests updated; direct-visit honesty
  properties kept.

## 3. Single header + landing simplification

- [ ] 3.1 Merge per-page headers into the root-layout bar (`Sadino` +
  `ENG | FIL`); delete step eyebrows, dataset/recruit badges, and the public
  footer on `/`+`/start`. Preserve skip-link-first, switcher-before-children,
  switcher-outside-forms, one-h1-per-page. Verify: layout/route/a11y suites.
- [ ] 3.2 Fold the landing resume card into the primary CTA ("Continue
  validation" when the session holds an attempt at press time; server
  re-check authoritative). Preserve press-time read, no-person language both
  languages. Verify: DOM resume tests retargeted.

## 4. Ledger and spec hygiene

- [ ] 4.1 Confirm `openspec validate --specs --strict` is **still 19** (deltas
  live under `openspec/changes/`, no new capability) and no migration file
  was added or modified.
- [ ] 4.2 Update `docs/ROADMAP.md` Project Status rows and verify
  `tests/unit/ledger-integrity.test.ts` passes.
