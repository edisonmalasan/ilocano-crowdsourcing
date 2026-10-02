# Design

## Context

See `proposal.md` — Why for the motivation. What constrains the approach here:

- The identity module (`src/lib/validators/browser-identity.ts`) is the **only** thing in `src/` that
  touches browser storage, and it is a `"use client"` module with no server dependency. Several
  components read the identifier at **press** time rather than during render, because storage does not
  exist while the server renders; that reasoning is unchanged by this change and the comments naming
  `localStorage` must be corrected so they do not state a false reason.
- `validations` already carries `UNIQUE (validator_id, dataset_entry_id)`. Under an attempt-scoped
  identity that constraint is *exactly* the approved within-attempt rule and needs no change.
- `validator-onboarding`'s "Amended during Apply" note records a real correction: the server cannot
  know who a visitor is at render time, so the screening question cannot be suppressed for a returning
  participant. That correction survives this change intact — session scoping does not give the server
  any earlier knowledge than `localStorage` did.
- `openspec validate` **refuses a MODIFIED block that renames or drops an existing scenario**, which is
  why one scenario name in `validator-onboarding` keeps the words "Local storage" while its body no
  longer says that. That is recorded in the delta itself rather than papered over.
- The immediately preceding change (`batch-route-round-trip`) ended with an independent verification
  finding that was a **claim of enforcement which did not hold**: a closed-enumeration guard was scoped
  to `src/app` plus three navigation idioms instead of to the application, and three violating sites
  passed it green. The guard lesson from that is load-bearing for D4 below.

## Goals / Non-Goals

**Goals:**

- One participation attempt == one server-minted anonymous identity == one session-scoped client token.
- The token survives reload and in-study navigation, and is retired only by an explicit finish or by
  the browser session ending.
- Finishing still writes nothing to the server.
- Every guard this change adds can be shown to fire, measured on the real tree, with a green control.

**Non-Goals:**

- What completes a dataset entry, how allocation chooses entries, the dashboard figures, and both
  exports. All four are named follow-up changes and all four read this one.
- Any server-side attempt lifecycle, any migration, and any change to `validators` or `validations`.
- Deleting the pre-existing `localStorage` value left by earlier platform versions (see D5).

## Decisions

### D1 — `sessionStorage`, not a cookie and not a self-expiring `localStorage` value

The token moves to `sessionStorage`. Its lifetime is then the browser session's, which is exactly the
unit the corrected methodology defines, and it is enforced by the platform rather than by a rule the
client could decline to apply.

**Alternatives considered:**

- **An `httpOnly` cookie plus a server-side attempt record.** This is the only option that would let
  the server recognise a returning participant at render time and suppress the screening question. It
  is rejected for two reasons that both come from this project's existing rules rather than from
  preference: it transmits the identifier to the server on *every* request to this origin, which
  `validator-onboarding` already rejects as "a worse fit for a project whose headline property is
  anonymity"; and it requires a server-side participation-end or attempt-expiry fact, which is the
  exact invention `batch-completion`'s finishing requirement forbids.
- **`localStorage` plus an expiry timestamp written by the client.** Rejected: the expiry is a
  participation-end rule that no approved requirement states, and a client-held clock is not an
  authority — a participant could extend any attempt indefinitely, which reintroduces the
  never-ending-validator model this change exists to remove.
- **Keeping `localStorage` and clearing it on unload.** Rejected: unload handlers are unreliable, are
  skipped on some navigations, and would retire an attempt the participant did not choose to finish.

**Consequence to state plainly:** the server still cannot know who the visitor is at render time, so
`/start` still asks the screening question. That is not a regression against the requirement being
modified — it is the property the requirement's retained amendment note already established.

### D2 — An attempt is a `validators` row; there is no `attempts` table and no migration

`validators` already carries exactly an attempt's metadata: the self-reported proficiency, a creation
timestamp, an activity timestamp, and a validation counter. A new table would duplicate all four and
create a second authority that could disagree with the profile.

**Alternative considered:** add an `attempt_id` to `validations` and keep one `validators` row per
*person*. Rejected on two independent grounds. It requires a person key, which the anonymity rules
forbid and which nothing in the stored data could honestly derive. And it makes "the same person" a
stored fact — which is precisely the claim `participation-attempt` forbids.

**Consequence:** `UNIQUE (validator_id, dataset_entry_id)` is now, without modification, the statement
that *one attempt never answers the same entry twice*. The constraint that already exists for a
different reason becomes the right rule for the approved reason, and this change adds no SQL.

### D3 — Finish becomes a control that clears the token and then leaves the flow; the destination is unchanged

`FinishedBatch`'s FINISH is a `<Link href="/">` with no handler today, and that shape is what
`tests/dom/finished-batch.test.tsx` asserts today ("a link with no handler, so no write is issued").
It becomes a `<button>` that discards the attempt token and then navigates to the same internal `/`.
The `FINISH_HREF` constant stays, because a test asserting the destination is still worth having — it
just stops being the whole control.

The clear happens **before** the navigation. With `router.push` the clear is synchronous, so the order
is not load-bearing today; it is specified anyway because the alternative ordering is the kind of thing
that silently becomes load-bearing.

**Alternative considered:** keep the link and clear the token in a cleanup effect on unmount.
Rejected, and this is the important rejection: an effect that clears on unmount also fires when the
component unmounts for any other reason — a re-render that changes its key, a navigation past it, a
parent conditional. It would retire attempts the participant never chose to finish, which is exactly
the "declining to continue records nothing" property this control exists to protect.

### D4 — The "no storage that outlives the session" guard scans all of `src`, and its detectors are measured before they are trusted

The obvious guard is `expect(source).not.toMatch(/localStorage/)` over one component, which is what
`tests/unit/screening-form-wiring.test.ts` does today. That guard has two defects this repository has
already paid for:

1. **It is a list, not a definition.** It forbids three literal storage names, so `indexedDB`,
   `document.cookie`, or a `Storage` reached through any other spelling passes. `tests/unit/guard-weakness.ts`
   already records this as the audited weakness of that exact test.
2. **Its scope is one component.** The batch-route verification pass measured that a closed enumeration
   scoped to `src/app` plus three idioms passed three violating sites green. A "nothing else does X"
   guard is only as closed as its scan's root.

So the guard here enumerates **every** file under `src/`, and treats a *read or write of storage that
outlives the session* as the thing to detect rather than any particular spelling of it. Two obligations
come with that, both from the same verification finding:

- **Measure each detector on the real tree before relying on it.** A detector that has never been run
  against the tree it guards is an assumption. The detectors must be run against `src/` as it is, and
  their true-positive and false-positive counts recorded in `tasks.md`.
- **Prove it can fire.** A violation must be added to the real `src/` tree and the guard observed
  RED against a GREEN control, then restored byte-identical. A guard that has only ever been seen
  green has not been shown to guard anything.

### D5 — The pre-existing `localStorage` value is left alone, unread

A participant who used the platform before this change has an identifier in `localStorage`. This change
does not delete it.

**Alternative considered:** a one-time read-and-delete of the legacy key on load. Rejected: it requires
code that touches `localStorage`, which is precisely what the requirement forbids, and it turns every
page load into a write. Leaving the value is residue, and it is stated as residue rather than hidden: an
orphaned opaque identifier that nothing reads is privacy-neutral-to-positive, and no approved
requirement asks for its deletion. The guard must therefore assert the module never *reads* a legacy
key, not that the key is gone.

### D6 — The copy that states the old model is part of this change, in both languages

Two catalog strings are now false rather than merely imprecise:

- `resume.body` says "If you have taken part **on this browser before**, you can carry on as the same
  anonymous validator." Under session scoping there is nothing to carry on from across a session, and
  the copy is the only place a first-time visitor learns what the control is for.
- `validate.finished.finishNote` says "you can still come back another time", which under the new model
  means *starting a new participation*, not resuming. `participation-attempt` requires that screen to
  say what returning actually means.

Both exist in English and Filipino, and `interface-localization` requires the two to carry the same
meaning, so both languages change together. No new key is introduced for either string: the keys'
subjects did not change, only their claims.

### D7 — What each layer's tests can and cannot prove, recorded before they are written

- **Unit, against a fake `Storage`:** the module reads and writes `sessionStorage`, never
  `localStorage`, touches no other key, discards a malformed value, and reports absent when access
  throws. This is the layer that can see the storage choice at all.
- **DOM, with the identity module stubbed:** that Finish clears the token and navigates, and that
  Continue does neither. `happy-dom` in this project exposes **no** real `window.localStorage`, measured
  rather than assumed — the first draft of `tests/dom/finished-batch.test.tsx` failed for that reason —
  so it exposes no real `sessionStorage` either, and the DOM layer cannot and does not prove anything
  about storage itself. It proves wiring.
- **Structural, over the real tree:** the D4 guard.

The test that used to assert Finish issues no write is **replaced, not deleted**, and the replacement
asserts the property that survives: no Server Action is invoked, and the token *is* discarded. That is
a behaviour change with an approved requirement behind it (`batch-completion`'s amended finishing
requirement), which is the only condition under which changing an existing assertion is legitimate.

## Risks / Trade-offs

- **[A participant who opens the study in a second tab starts a new attempt, silently.]** `sessionStorage`
  is per-tab, so a second tab is a second browser session. No mitigation is available without giving up
  session scoping, which is the requirement. Accepted and stated in the participant-facing copy rather
  than discovered by a participant.
- **[A participant who closes the tab without finishing cannot resume.]** Accepted: nothing they
  submitted is lost, and returning is a new screened attempt. The finished screen's note says so.
- **[The orphaned `localStorage` identifier.]** See D5. Residue, unread, recorded.
- **[A textual guard over `src/` proves a string is present or absent, not that behaviour is right.]**
  Accepted, and it is why D4 pairs the guard with a measured can-fire proof and why the behavioural
  half lives in the unit tests rather than in the guard.
- **[An independent verification pass may find that the resume-copy change is narrower than the
  requirement.]** The copy requirement is stated for both languages and both outcomes; if the pass finds
  an outcome string still implying recognition, that is a real finding and is repaired rather than
  reworded away.

## Migration Plan

None. No schema change, no data backfill, no deployment ordering. The change is entirely client-side
plus documentation, and it is reversible by reverting the commit: the identifiers it stops writing
server-side are new enrollment rows that a reverted build simply stops creating.

## Open Questions

None. Two questions were considered and closed rather than deferred:

- *Should a new attempt be a new `validators` row or the same row with an attempt column?* Closed at
  D2 — an attempt column requires a person key, which is forbidden.
- *Should the legacy `localStorage` value be migrated or deleted?* Closed at D5 — deleting it requires
  the write the requirement forbids.
