# Proposal

## Why

The approved thesis methodology was corrected from "three qualifying completed validations from
three distinct validators per dataset entry" to **one complete validation package per entry**, and
the platform's identity model still encodes the superseded one. A validator is currently a
`localStorage` token that survives every visit to the site indefinitely, which makes one browser
profile one long-lived "validator" for the life of the study. Under the corrected methodology the
unit of participation is an **attempt**: a fresh anonymous identity created at screening, scoped to
one browser session, retired when the participant finishes, and re-screened next time. Nothing else
can be built correctly on top of the old model — allocation, global completion, the dashboard
figures and both exports all read "who is this validator", and each of them reads it differently
once an attempt and a person are no longer the same thing.

This is the first slice of the correction. It establishes the attempt and nothing else: completion
semantics, allocation, and the dashboard/export wording are named follow-up changes so that each
one is reviewable on its own.

## What Changes

- **BREAKING** The browser-local anonymous identifier moves from `localStorage` to `sessionStorage`.
  An attempt therefore ends when the browser session ends, which is the behaviour the corrected
  methodology requires and which the previous model actively prevented.
- **BREAKING** The finished batch screen's **Finish** control stops being a bare link. It retires the
  attempt's browser-local token and then navigates. It still writes **no row** and records no
  participation-end fact about the participant, so the existing "finishing writes nothing" guarantee
  is preserved at the server boundary and extended rather than weakened at the client one.
- **BREAKING** A stored identifier may only be *restored*, never *recognized across attempts*: a new
  browser session is a new participation, so the landing page's resume control has nothing to resume
  in a fresh session and the participant is re-screened.
- `AGENTS.md`'s durable rules, which still state the three-distinct-validators target and the
  never-ending validator identity, are corrected to the approved methodology and name the change that
  implements each rule.
- No migration, no repository change, and no server-side data change. `validations` already carries
  `UNIQUE (validator_id, dataset_entry_id)`, which under an attempt-scoped identity is exactly the
  approved within-attempt rule: one attempt never answers the same entry twice.

### Not in this change

Completion semantics (what makes an entry finished), allocation over incomplete entries, the
dashboard figures, and both exports. Each is a named follow-up. This change must not touch them,
because each of them asserts something about attempts that this change is only now establishing.

## Capabilities

### New Capabilities

- `participation-attempt`: what a participation attempt is — a fresh anonymous identity minted at
  screening, scoped to one browser session, preserved across reload and navigation, retired by
  finishing, re-screened on the next participation — and the rule that no attempt identifier is ever
  presented as evidence of a distinct person.

### Modified Capabilities

- `validator-onboarding`: "The anonymous identifier is kept in browser-local storage" becomes
  session-scoped storage, and "A returning validator is restored without their screening answer being
  overwritten" becomes a within-attempt restore rather than a cross-visit one.
- `batch-completion`: "Finishing is offered as a distinct action that discards nothing" keeps its
  no-row guarantee and gains the explicit statement that finishing also retires the attempt's
  browser-local token, so that a reader cannot take "writes nothing" to mean "does nothing".

## Impact

- **Code:** `src/lib/validators/browser-identity.ts` (the storage the module reads and writes, and
  the rationale it documents), `src/app/validate/[batchId]/finished-batch.tsx` (the Finish control),
  and the comment in `src/app/validate/start-batch.tsx` that names `localStorage` as its reason for
  reading identity at press time.
- **Tests:** `tests/unit/validators-browser-identity.test.ts` (rewritten against `sessionStorage`,
  plus a guard that the module never touches `localStorage`), `tests/dom/finished-batch.test.tsx`
  (Finish now clears the token and navigates, so the existing assertion that Finish issues no write
  is replaced by one that asserts it issues no write **to the server** and does clear), and
  `tests/unit/screening-form-wiring.test.ts` (its "no storage API" guard currently names three
  literals and is scoped to one component).
- **Durable rules:** `AGENTS.md` lines 90–93, which currently state the superseded three-validator
  target twice and the persistent-identity model.
- **Not affected:** every server module, every migration, `data/ilocano-synthetic-data.json`, and
  the researcher area.
