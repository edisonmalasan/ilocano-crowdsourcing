# Design

## Context

See proposal.md - Why. `runResearcherSignIn` already returns the discriminated `SignInOutcome` (`authenticated` with ordinal, or `refused` with one of four reasons); only the outward rendering collapses them. The decision function takes injected `deps` (`attempts`, `nowMs`), so a log sink travels the same way.

## Goals / Non-Goals

**Goals:**

- One log line per sign-in outcome, server-only, reason-qualified.
- Zero change to requester-visible behavior, rate-limit semantics, or session issuance.

**Non-Goals:**

- Log persistence or audit tables; log shipping stays the platform's existing stdout.
- Per-reason metrics or alerting.

## Decisions

**D1: Add an optional `log` sink to `ResearcherSignInDeps`, defaulting to a no-op.**

The core calls `deps.log(line)` once per outcome. Optional so existing callers (including the web-download-adjacent paths, of which there are none — sign-in is the only caller) need no change; tests inject a recording array. Alternative (logging in `actions.ts` from the outcome) rejected: the outcome's reason is the core's vocabulary, and re-deriving it outside duplicates the decision.

**D2: Log line shape: `researcher sign-in <outcome> reason=<reason|ok> origin=<originKey>[ ordinal=<n>]`.**

Origin key is already stored in the research database by design (coarse, non-identifying). Ordinal is the guard's non-secret position. No credential, no session, no digest, no timing.

**D3: `actions.ts` passes `console.info` (namespaced `[sadino:researcher-signin]`); the core never touches console directly.**

Keeps the pure core testable and puts the only I/O at the boundary that already owns I/O, matching the export download's `[sadino:research-export]` precedent.

## Risks / Trade-offs

- [Risk] Log volume under brute force → Mitigation: one short line per attempt; rate limit already bounds attempts per origin.
- [Risk] A future edit logs the credential → Mitigation: unit test asserts recorded lines never contain the presented value or any configured secret, over all four reasons plus success.
