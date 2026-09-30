# Tasks

## 1. Establish the starting point by inspection, not assumption

- [x] 1.1 Confirm no in-force spec mentions interface localization: search all eight capabilities for
      `locale`, `localization`, and `lang`. Result: **no hits**, and every hit for `translation` is
      *research* translation. So this is a genuinely new capability and no existing requirement
      changes.
- [x] 1.2 Confirm the public surface is exactly four routes plus the layout — `layout.tsx`, `/`,
      `/start`, `/ready`, `not-found` — and record which of them hold user-facing copy. Result: 148,
      104, 211, and 27 lines respectively, plus two client components with real logic.
- [x] 1.3 Read `src/lib/validators/browser-identity.ts` before choosing a persistence mechanism,
      because it **already rejected a cookie** and states why. Result: the anonymity reasoning is
      specific to a sensitive value, and a locale cookie is not one — recorded as design §D1.
- [x] 1.4 Confirm the evaluation/proficiency **value is already separate from its label** in
      `src/schemas/validator.ts`, so localizing labels needs no new invention. Result:
      `{ value: "fluent", label: "Fluent" }`, with an existing comment recording why.

## 2. Write the delta

- [x] 2.1 `## ADDED Requirements` only, in a new `interface-localization` capability. A `MODIFIED`
      block against a requirement that does not mention the subject would hide the fact that
      nothing needed changing.
- [x] 2.2 State the **must-never-touch** list as a requirement with scenarios, because that is the
      part that can damage research data — the dataset instruction, corrected Ilocano, both research
      translations, place names, dataset identifiers, and machine-readable values.
- [x] 2.3 State that the locale is **never persisted to the research database**, and why: a stored
      locale sits next to research responses and invites the exact inference the roadmap forbids.
      Recorded as design §D7, not deferred to a future methodology.
- [x] 2.4 Require the resolver to **never throw** on an absent, empty, or tampered value, because a
      presentation preference with a sensible default must not be able to fail a page.
- [x] 2.5 Require both an acceptance and a rejection case wherever a value is stored, so switching
      locale cannot be a way to change what a response means.
- [x] 2.6 `openspec validate interface-localization --strict` exits 0. Result: 6 requirements,
      17 scenarios, valid.

## 3. Propose

- [x] 3.1 Create the proposal branch, push it immediately, and keep the in-force specs untouched.
- [x] 3.2 Record the two decisions a reviewer is most likely to want to overturn — the cookie (§D1)
      and the no-persistence answer (§D7) — as decisions with their reasons, not as preferences.
- [x] 3.3 Update the status ledger.
- [x] 3.4 `pnpm run format:check` exits 0; `git diff main --stat -- src/ tests/ supabase/ data/` is
      empty, because **this stage changes no code**.

## 4. Apply — the pure layer first, with no React in it

- [x] 4.1 `src/lib/domain/locale.ts`: the two approved locales, `DEFAULT_INTERFACE_LOCALE`, and
      `resolveInterfaceLocale(unknown)` that returns the default for anything else and never throws.
      `isInterfaceLocale` additionally rejects a value that merely *stringifies* to `"fil"` — an
      object with a `toString`, a `String` wrapper, a one-element array — and the `includes` lookup is
      on a literal tuple, so `"constructor"` and `"toString"` are rejected like any other value rather
      than reaching `Array` prototype members.
- [x] 4.2 Tested as a pure function at the narrowest layer, covering the absent, empty,
      unrecognised, and tampered cases the spec names, plus the prototype-lookup cases.
- [x] 4.3 `src/lib/i18n/copy.ts`: **84 keys**, the English catalog defining the key set and the
      Filipino catalog annotated `Record<CopyKey, string>`. **Re-derived by probe, not accepted on
      report**: control GREEN at exit 0, and adding one English key with no Filipino string gives
      **exit 2 with `error TS2741`** ("property is missing in type"), with the catalogue restored
      byte-identical.
- [x] 4.4 Tests that no Filipino rendering is empty, that no English string is blank, and that no
      Filipino string is byte-identical to its English counterpart — with an **allowlist whose every
      entry must state a reason**, so a new duplicate cannot be suppressed by copying a bare
      exception. Recorded as a known limit of §D3: the type cannot catch a copy-paste that leaves
      English in the Filipino catalog, only a test can.

## 5. Apply — the server boundary

- [x] 5.1 The locale is read from a cookie on the server, so the first paint is already correct and
      `<html lang>` is right without a client round trip. **No middleware.** Consequence, confirmed
      by the build output: all four routes are now `ƒ (Dynamic)` rather than static, which is
      required by this task and not a regression.
- [x] 5.2 A Server Action changes the locale, so the write is server-authoritative like every other
      write here, with `httpOnly`, `sameSite: "lax"`, and a bounded `maxAge`.
- [x] 5.3 The **core** takes injected dependencies, following `*-actions-core.ts`, and the payload
      is re-parsed through the shared `parseWriteIntent` boundary before the cookie writer is called,
      so a rejected request cannot write anything.
      **DEVIATION, recorded rather than ticked as written**: this task also asked for a
      `ServerEnvError` → `not_configured` branch, and it was **deliberately not implemented**. The
      locale path reads no environment, so that branch could never fire; and calling `getServerEnv()`
      to make it reachable would break the switcher in every deployment without database credentials —
      which is this one — for a language preference. `LocaleChangeOutcome` is therefore `changed` or
      `invalid`, with **no persistence-shaped variant at all**, because there is no research record
      to fail to write to. The reasoning is in the core's header so the next reader does not add the
      branch back for symmetry. Root reviewed and accepts this.
      A second, smaller deviation: the wrapper returns `Promise<void>` rather than a typed outcome,
      because React types `<form action>` as `(formData) => void | Promise<void>` and returning the
      outcome is a real `TS2322` at the one call site. The tests assert the effects instead.
- [x] 5.4 The locale is never written to the research database, proven **two ways**:
      **(a) structurally** — `LocaleChangeDependencies` has exactly one member and it writes a cookie,
      so "the locale is never research data" is *unrepresentable* rather than documented, pinned by a
      `KeySetIsExactly` assertion plus a `@ts-expect-error` control so any second member fails
      `pnpm run typecheck` whatever it is named; and **(b) by scan** — a comment-stripped source scan
      of `src/lib/i18n/**` for repository/Supabase/env specifiers, with two meta-guards proving the
      scan reads a real tree and extracts specifiers from imports rather than from string content.

## 6. Apply — the interface

- [x] 6.1 The `ENG | FIL` switcher, rendered by the **root layout** so presence is a structural
      property — a route that forgot it cannot exist, and it is the only way the not-found page gets
      one, since that page has no header of its own. It is a plain `<form>` submitting to the Server
      Action, with **no `"use client"` and no state**: the control that changes the language working
      without hydration is the point, for a participant on a poor signal.
- [x] 6.2 Localized `layout.tsx` — `lang`, the skip link, title and description — and all four
      routes.
- [x] 6.3 The value/label separation is kept: the screening loop selects
      `ILOCANO_PROFICIENCY_CHOICES[i].value`, never the label, and a test asserts the stored
      proficiency is `fluent` whichever locale rendered it.
- [x] 6.4 The Ilocano dataset instruction has **no catalog lookup on its path**, asserted by the
      research-boundary scan rather than by review — including a test that the scan would notice a
      module that did both, which is the control that makes the scan trustworthy.
- [x] 6.5 Soft neo-brutalism preserved and accessibility above novelty: two real `<button>`
      elements, **no accent surface** (the accent belongs to the page's primary action), a `min-h-11`
      44px touch target, and active locale shown by **two** independent signals — `aria-current` and a
      visible check mark — so state is legible in greyscale and to a colour-blind participant.
      `aria-label` carries the accessible name of the form, so a participant hears "Interface language"
      and then "English" or "Filipino" rather than two unexplained abbreviations.
- [x] 6.6 **DEFECT FOUND IN ROOT REVIEW AND FIXED.** The switcher chose its accessible-name key with
      `choice === "en" ? english : filipino`. That compiles, passed the whole suite, and would have
      announced a **third** approved locale to a screen-reader user as *Filipino* — and a comment in
      the same file claimed that adding a locale required no edit here, which was **false**. A
      comment asserting a property the code does not have is worse than no comment, because a
      reviewer reads it and relies on it.
      Fixed with `LOCALE_NAME_KEYS: Record<InterfaceLocale, LocaleNameKey>` in `copy.ts`, the same
      mechanism `PROFICIENCY_LABEL_KEYS` already used, so a third locale is a type-check failure
      rather than a silent mislabel. Four tests added, including a can-fire/can-not-fire pair — and
      the first attempt at that pair wrote `{ … } as Record<…>`, whose cast silenced the very error
      the `@ts-expect-error` stood in for, correctly caught by `TS2578`.

## 7. Verify

- [x] 7.1 **Run by the root, not inherited from the implementation agent**, each with what it does and
      does not prove:

      | Command | Result | Proves | Does **not** prove |
      | --- | --- | --- | --- |
      | `pnpm run lint` | exit 0, no errors or warnings | ESLint accepts every file including the 12 new ones, and `sadino/no-privileged-imports` accepts the switcher — which is why it takes its Server Action as a **prop** rather than importing it. | That the rule would catch a new violation. |
      | `pnpm run format:check` | exit 0 | Every formatter-owned file matches the committed Prettier config. | Anything about correctness. |
      | `pnpm run typecheck` | exit 0 | `tsc --noEmit` under `strict` over `src/` and `tests/`, which is what enforces the `@ts-expect-error` pins — including the `TS2578` that fired during this review when a cast silenced the error a pin stood in for. | Any runtime behaviour. |
      | `pnpm run test:unit` | exit 0 — **32 files / 879 tests** | The catalog pins, the resolver, the action core and wrapper, the rendered routes in both locales, the value/label separation, and the research-boundary scans. | Anything needing a database, network, or browser. `server-only` is stubbed. |
      | `pnpm run test:integration` | exit 0 — **6 files / 100 tests** | The six research tables still hold, and the 600 imported records are still byte-identical to the source. | That this is Supabase. PGlite is PostgreSQL in WebAssembly. |
      | dataset guard | exit 0 — **1 file / 7 tests** | `data/ilocano-synthetic-data.json` is unchanged on this branch. | — |
      | `pnpm run build` | exit 0, "Compiled successfully" | It compiles for production, and all four routes are `ƒ (Dynamic)` because they read the cookie — **required by task 5.1**, not a regression. | That a test passed. |
      | `git diff main -- AGENTS.md docs/ openspec/ data/ supabase/ package.json` | empty | Nothing outside the change's scope was touched. | — |

      **What no command here proves**: nothing about a real Supabase project (there are still no
      credentials, and the locale path deliberately reads no environment so the switcher keeps
      working without them), and **nothing about visual rendering** — no browser has ever rendered
      this site. The switcher's contrast, its 44px target in a real viewport, and the first-paint
      behaviour of `lang` are all asserted on markup and CSS, and a human still has to look.
- [ ] 7.2 Read the CI log back **by step name**, and compare the step list against a known-good run
      before merging. The reader must refuse rather than report a partial number — that refusal is
      the only reason the immutability-guard truncation surfaced three times.
- [ ] 7.3 Merge on a **merge commit** only, delete the branch after, and return to updated `main`.

## 8. Sync, then Archive

- [ ] 8.1 Sync the `interface-localization` capability into `openspec/specs/`. This is a wholly new
      capability with no `MODIFIED` block, so the loss guard has nothing to police — assert that
      anyway rather than assuming it.
- [ ] 8.2 `openspec validate --specs --strict` exits 0 at 9/9.
- [ ] 8.3 Archive only after verifying the sync landed, comparing each delta block against its
      in-force counterpart byte for byte.
