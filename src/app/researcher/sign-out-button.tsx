"use client";

import { useRef, useTransition } from "react";

import { signOutAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";

/**
 * The sign-out control.
 *
 * It calls an action that clears a cookie and issues nothing. That is the whole feature, and the
 * reason the button is a control rather than a link is D6's forward constraint: the session cookie is
 * `SameSite=Lax`, which permits a top-level GET navigation to carry it, so anything that CHANGES
 * server state must be a POST that re-checks the session server-side. A link here would be a
 * state-changing action reachable by a link.
 *
 * The ref latch has the same job as on the sign-in form and the same reason: `disabled` commits at
 * the end of the handler, so two clicks in one task both reach it. Clearing a cookie twice is
 * harmless, but a control that issues two requests because the participant double-clicked is a
 * control whose behaviour depends on timing, and `tests/dom/researcher-sign-in.test.tsx` asserts the
 * single request rather than assuming it.
 */
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        await signOutAction();
      } catch {
        // A Server Action REJECTS when the request never produced an answer. For sign-out the state
        // after such a failure is already CORRECT: the cookie was not cleared, the session is still
        // valid, and `finally` has already returned this control to idle. There is nothing to undo
        // and nothing to report as an error — the researcher's own eyes tell them the outcome,
        // because they are still on the same page.
        //
        // So this branch is deliberately EMPTY, and that is a decision rather than an omission. It
        // exists so the rejection does not escape the transition and reach React's error boundary,
        // which would replace the researcher's screen with an error page for a failed logout — a
        // worse outcome than doing nothing, and one that would make a network blip look like the
        // researcher area breaking.
        //
        // This is why there is no message here while the sign-in form has one: that form has a field
        // whose error state a person can act on, and this control has no surface at all.
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Button type="button" variant="secondary" onClick={handleClick} disabled={isPending}>
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
