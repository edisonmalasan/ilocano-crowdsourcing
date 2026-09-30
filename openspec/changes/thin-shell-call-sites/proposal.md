# Proposal

## Why

The status ledger has pointed the roadmap at "21 unguarded client-shell call sites, two of them
critical" since `landing-and-screening`. That figure was never re-derived, and re-deriving it shows
it is wrong in **both** directions: it names 21 sites, its line numbers and labels no longer match
the code, and three of the ten sites probed against the current source are actually already guarded.

What survives the measurement is smaller and worse than the claim. Of ten high-severity call sites
in the two client components that drive enrollment and resume, **seven are unguarded — four of them
critical**. Every one of the seven sits on a path that writes research data or a participant's
identity, and every mutation leaves the entire 881-test unit suite green.

## What Changes

- **Close seven measured gaps** in `src/app/start/screening-form.tsx` and
  `src/components/onboarding/resume-validator.tsx`, each with a guard proved red under the exact
  mutation that closes it.
- **Correct the ledger figure.** `docs/ROADMAP.md` has carried "21 … two of them critical" through
  five merged changes. It becomes the re-derived result: 7 unguarded of 10 probed, 4 critical, with
  the reproduction command and the method that produced it.
- **Replace an inherited enumeration with a re-derivation procedure**, and record in `AGENTS.md` the
  two mistakes this investigation made in its own first hour — because both would have produced
  confident, wrong findings.
- **No product behaviour changes.** All seven sites currently behave correctly. See "Capabilities".

### The measurement, stated so it can be disputed

Method: mutate one call site, run `pnpm exec vitest run --project unit` (the **full** unit project,
32 files / 881 tests), require the suite to go red. Negative control first on the unmodified tree,
at the same scope. Every mutation anchored on text asserted to occur a known number of times, so an
ambiguous anchor is INCONCLUSIVE rather than a silent edit of whichever occurrence came first. Both
files restored byte-identical afterwards (`b3ab4956bd2d889e`, `723f6b30a2b7cf33`).

| ID | Severity | Site | Mutation | Verdict |
| --- | --- | --- | --- | --- |
| SF-1 | medium | `AnswerGroup disabled={isPending}` | → `disabled={false}` | **UNGUARDED** |
| SF-2 | **critical** | PRIMARY Continue `disabled={submitState.disabled}` (occurrence 0) | → `disabled={false}` | **UNGUARDED** |
| SF-3 | medium | SKIP button `disabled={submitState.disabled}` (occurrence 1) | → `disabled={false}` | **UNGUARDED** |
| SF-4 | **critical** | `enrollValidatorAction({ ilocanoProficiency: answer })` | → `ilocanoProficiency: null` | **UNGUARDED** |
| SF-5 | low | `router.push("/ready")` | removed | **UNGUARDED** |
| SF-6 | medium | `setSelection(toIlocanoProficiency(value))` | → `setSelection(null)` | guarded — `onboarding-routes.test.tsx:208` |
| RV-1 | **critical** | `const stored = readStoredValidatorId();` | → `const stored = null;` | **UNGUARDED** |
| RV-2 | **critical** | `router.push("/ready")` | removed | **UNGUARDED** |
| RV-3 | **critical** | `clearStoredValidatorId();` | removed | guarded — `screening-form-wiring.test.ts:404-409` |
| RV-4 | **critical** | `setMessage(decision.message);` | → `setMessage(null);` | guarded — `screening-form-wiring.test.ts:429` |

Three of the seven unguarded sites are critical **research-integrity** failures, not merely
robustness gaps:

- **SF-4** sends `null` instead of the participant's answer, recording a *decline* for every
  participant who enrolls. The file's own comment at line 202 records that this exact defect existed
  once and was fixed — so it is reintroducible, and the test that should prevent that does not.
- **RV-1** makes resume permanently dead: a returning validator is told they hold no identity and
  is sent to enroll again, which mints a second identity and orphans the first.
- **RV-2** leaves a recognised validator staring at a message claiming they hold no identity.

Corroborating scan across `tests/unit`: **`submitState` has 0 hits and `router.push` has 0 hits.**
Not one assertion anywhere in the unit project mentions either. `readStoredValidatorId()` has 17
hits, all of which test the storage module's own contract rather than resume-validator's call to
it — the function is thoroughly tested and its call site is not observed at all.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None, and this is a deliberate, stated decision rather than an omission.

**This claim was false as first written, and an independent verification pass is what caught it.** An
earlier draft of this section said `validator-onboarding` (7 requirements / 24 scenarios) "already
specifies **all seven** behaviours" and that "nothing here is unspecified". Re-deriving it by
enumerating the requirement blocks of all **nine** in-force specs — not by grepping for words, because
`design-system` contains "WHEN a control is disabled THEN it does not respond to activation", which
uses the whole vocabulary while specifying only the *semantics* of a disabled control, conditioned on
*when* it is disabled —

| Site | Behaviour | In-force requirement |
| --- | --- | --- |
| `SF-4` | an answer given before an unrecognised identifier is discovered is kept | **Yes** — "Screening precedes identity creation" |
| `RV-1` | an existing validator is restored rather than re-enrolled | **Yes** — "An existing validator is restored" |
| `SF-5`, `RV-2` | the participant is sent onward to `/ready` | **Partial** — onward movement is implied by the Req-1 sequence, but **no spec names the route**: `grep -i "/ready"` across all nine specs returns **0 hits** |
| `SF-1`, `SF-2`, `SF-3` | the options, Continue, and skip controls are disabled while a write is in flight | **No requirement, in any of the nine specs** |

The decisive measurement: **15 requirement blocks mention the pending-state vocabulary and 0 scenarios
mandate** a control be disabled while a write is in flight. So the claim held for two sites, was
overstated for a third, and was simply wrong for three — including `SF-2`, which `design.md` itself
classes as **critical**.

**The correction is to the rationale, not to `skip_specs`.** The flag is correct on OpenSpec's own
criterion, which is that no spec-level behaviour changed, and `git diff main --numstat -- src/` is
empty. What was wrong was the supporting claim used to justify it.

**No requirement is added here, and the reason matters.** The pending-state bindings already exist in
the implementation, so this is a **pre-existing gap** D existing product behaviour carrying no
requirement D not a new behaviour introduced by this change. Writing a requirement for it inside a
change that alters no product behaviour is precisely the invention `openspec instructions specs`
forbids and that the paragraph below already declines. The gap is recorded as a follow-up instead,
in `tasks.md` and in `docs/ROADMAP.md`'s Active Blockers: **the specs under-describe the screening
screen as it actually behaves**, which is a real finding for the thesis project and should be closed
before Phase 5 builds more participant-facing UI on the same components.

`openspec instructions specs` requires a change with no spec-level behaviour change to set
`skip_specs: true` and states: *"Do not invent a requirement just to satisfy validation."* A
requirement of the shape "a test must exist for X" would be precisely such an invention — it
describes no observable product behaviour and exists only to satisfy the validator. So
`.openspec.yaml` sets `skip_specs: true`.

**This is a judgment call and it is the one thing worth a second opinion.** The competing reading is
that `application-foundation` already specs verification concerns ("Verified command surface",
"Continuous verification on every change"), so "specified client-shell behaviour must be pinned by
an assertion that can fail" could legitimately be a requirement there. I have not done that,
because doing so would convert a testing practice into a product contract across the whole
repository — a much broader commitment than repairing seven call sites warrants. If the thesis
supervisors want verification itself specified rather than merely enforced, that is a better change
than this one and should be proposed separately.

## Impact

- **Code:** two client components. Behaviour-preserving; the shipped code is not modified unless a
  guard can only be written honestly by extracting a pure decision function (design decision D2).
- **Tests:** `tests/unit/screening-form-wiring.test.ts`, `tests/unit/onboarding-routes.test.tsx`,
  and new coverage for the two components' rendered output. Unit count rises from **881**.
- **Docs:** `docs/ROADMAP.md` Project Status (root-owned) and `AGENTS.md` verification notes.
- **Data:** `data/ilocano-synthetic-data.json` untouched; the immutability guard is unaffected.
- **Not affected:** database, migrations, Server Actions, the copy catalog, `interface-localization`,
  or anything requiring Supabase credentials. This change needs no database and no network.
