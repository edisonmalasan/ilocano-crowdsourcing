# Proposal

## Why

On the deployed app, signing in with the correct researcher credential shows the refusal message ("That credential was not accepted…") while nevertheless signing in and redirecting to the dashboard. The cause is structural: `signInAction` ends success with `redirect()`, which is thrown control flow, and `SignInForm` wraps the call in a broad `catch` that renders any rejection — including the redirect — as the refusal message. Success and refusal share one code path, so the UI cannot tell them apart.

## What Changes

- `signInAction` returns an explicit success result instead of throwing `redirect()`; the refusal contract is unchanged.
- `SignInForm` navigates to `/researcher` on success via the router and renders the refusal only on a returned refusal; transport/server failures keep the existing generic failure treatment.
- Session cookie remains server-issued httpOnly; no secret reaches the browser; single-flight protection remains.
- Already-authorized visits to `/researcher/sign-in` keep redirecting via the page guard (untouched).
- Regression test for the exact case: correct credential → session issued → navigation to `/researcher` → no refusal message ever appears.

## Capabilities

### New Capabilities

(none — this corrects the sign-in flow to its specified behavior)

### Modified Capabilities

- `researcher-admin-access`: successful sign-in completes by returned result plus client navigation rather than by a redirect exception crossing the Server Action boundary.

## Impact

- `src/lib/admin/actions.ts` (return type gains a success variant), `src/app/researcher/sign-in/sign-in-form.tsx` (navigate on success).
- Tests: wrapper success-shape test, DOM navigation/no-refusal regression test.
- No migration, no schema change, no copy change, no new dependency.
