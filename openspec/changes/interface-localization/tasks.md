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

- [ ] 4.1 `src/lib/domain/locale.ts`: the two approved locales, `DEFAULT_INTERFACE_LOCALE`, and
      `resolveInterfaceLocale(unknown)` that returns the default for anything else and never throws.
- [ ] 4.2 Test it as a pure function at the narrowest layer, including the absent, empty, and
      tampered cases the spec names.
- [ ] 4.3 `src/lib/i18n/copy.ts`: the English catalog defines the key set; the Filipino catalog is
      typed `Record<keyof typeof english, string>`, so **a missing Filipino string fails
      `pnpm run typecheck`** rather than silently rendering English. This is the load-bearing
      mechanism in design §D3 and it must be a **type**, not a test — absence of a key is not
      observable at runtime.
- [ ] 4.4 A test that no Filipino rendering is empty, and that no rendering is byte-identical to its
      English counterpart where the two are genuinely different strings. The type cannot catch a
      copy-paste that leaves English in the Filipino catalog; recorded as a known limit of §D3 rather
      than presented as solved.

## 5. Apply — the server boundary

- [ ] 5.1 Read the locale from a cookie on the server so the first paint is already correct and
      `<html lang>` is right without a client round trip. No middleware.
- [ ] 5.2 A Server Action to change the locale, so the write is server-authoritative like every other
      write here, with `httpOnly`, `sameSite: "lax"`, and a bounded `maxAge`.
- [ ] 5.3 The Server Action's **core** takes injected dependencies, following the established
      `*-actions-core.ts` pattern, and the wrapper maps a `ServerEnvError` to a typed outcome as
      `allocation-actions-core.ts` does.
- [ ] 5.4 Prove the locale is never written to the research database: no repository method is
      called, and a test asserts the action touches no repository. This is a spec requirement about
      absence, so the pin belongs where absence is observable.

## 6. Apply — the interface

- [ ] 6.1 The `ENG | FIL` switcher in the header: keyboard-operable, consistently reachable on every
      public page, and visually subordinate to the validation task.
- [ ] 6.2 Localize `layout.tsx` — `lang`, the skip link, the document title and description — and
      all four routes.
- [ ] 6.3 Keep the value/label separation: the screening loop selects
      `ILOCANO_PROFICIENCY_CHOICES[i].value`, never the label, and a test asserts the stored
      proficiency is `fluent` whichever locale rendered it.
- [ ] 6.4 The Ilocano dataset instruction is rendered from storage with **no catalog lookup on its
      path**, asserted by a test rather than by review.
- [ ] 6.5 Keep the soft neo-brutalist direction and accessibility: real `<button>` elements, no
      colour-only state, visible focus, and the switcher large enough to hit on a phone.

## 7. Verify

- [ ] 7.1 `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run test:unit`, and
      `pnpm run build`, each reported with what it does and does not prove.
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
