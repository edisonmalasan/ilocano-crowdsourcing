# Design

## Context

See proposal.md - Why. `signInAction` (`src/lib/admin/actions.ts`) currently ends success with `redirect(RESEARCHER_HOME)`; `SignInForm` (`src/app/researcher/sign-in/sign-in-form.tsx`) awaits it inside a broad `catch` that renders any rejection as the refusal message. The sign-in page guard (`page.tsx`) redirects already-authorized visitors server-side and is untouched.

## Goals / Non-Goals

**Goals:**

- Success and refusal travel separate, typed paths end to end.
- No behavioral change except the fixed success path.

**Non-Goals:**

- Changing the refusal contract, rate limiting, session format, or cookie handling.

## Decisions

**D1: Action returns `{ status: "authenticated" }`; form calls `router.push(RESEARCHER_HOME)` on it.**

The success result carries nothing — no credential, no session content, no metadata — so there is nothing new for the browser to hold. `RESEARCHER_HOME` stays the single route constant. Alternative (keep `redirect()` and teach the form to rethrow redirect errors) rejected: it keeps success control flow disguised as failure and depends on Next.js redirect exceptions crossing the action boundary, which is the exact mechanism that produced this defect.

**D2: `catch` keeps the generic transport-failure treatment, unchanged.**

It now provably cannot see a success: success resolves, only true failures reject. No redirect-digest sniffing — sniffing digests reintroduces the dependence D1 removes.

**D3: Single-flight latch untouched.**

The latch guards request issuance, which is orthogonal to how the response is delivered.

## Risks / Trade-offs

- [Risk] A stale cached page posts to an old action version → Mitigation: none needed; old action redirects (old behavior), new form only adds a branch. Deploy skew resolves on navigation.
- [Risk] `router.push` fails while the session was issued → Mitigation: session cookie is set before the result returns, so a retry lands on the already-authorized redirect in `page.tsx`.
