"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { clearStoredValidatorId, readStoredValidatorId } from "@/lib/validators/browser-identity";
import { resumeValidatorAction } from "@/lib/validators/actions";
import { decideResume } from "@/lib/validators/onboarding-flow";

/**
 * Returning-validator resume.
 *
 * ============================== WHY IT IS A BUTTON ==============================
 * The obvious design is to hide this control until the client discovers a stored
 * identifier, so first-time visitors never see it. That design is rejected here,
 * and the reason is worth stating because it looks like a worse design:
 *
 * A load-time discovery needs a post-hydration `setState`, because `localStorage`
 * does not exist during server rendering. That is a cascading render, it is the
 * pattern React's lint rules exist to reject, and hiding it makes the control's
 * presence a function of state the server never saw.
 *
 * The control is therefore always rendered, and reveals what it found only after
 * the participant asks. The cost is that a first-time visitor can press a button
 * that turns out to have nothing to resume. The benefit is that the affordance is
 * present for the person who needs it, with no effect, no hydration mismatch, and
 * no hidden control whose existence depends on which machine the code ran on.
 *
 * ============================ ANONYMITY INVARIANT ==============================
 * This is the only surface that sends a client-supplied identifier to the server,
 * and it exists because a returning participant has no other way to be recognised.
 * It returns no profile fields, renders no identifier, and never displays what
 * proficiency the stored validator reported.
 */

/** Plain-language copy. Names no technical detail and no stored value. */
const MESSAGES = {
  noneHeld:
    "This browser does not hold a saved identity. Choose Start validation to begin — it takes one question.",
  unknown:
    "That saved identity is no longer recognised, so it has been cleared. Choose Start validation to begin again as a new anonymous validator.",
} as const;

export function ResumeValidator() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setMessage(null);

    const stored = readStoredValidatorId();
    if (stored === null) {
      setMessage(MESSAGES.noneHeld);
      return;
    }

    startTransition(async () => {
      // The shared decision function, so the landing page and the screening page cannot
      // disagree about what `absent` means. Here `enroll-fresh` is handled as a message
      // rather than an enrollment, because this route must not create a validator — and
      // `null` is the correct answer argument, because this route collects no screening
      // answer to carry forward. The participant is pointed at the screening page, which
      // will ask properly.
      const decision = decideResume(await resumeValidatorAction({ storedId: stored }), null);

      if (decision.kind === "ready") {
        router.push("/ready");
        return;
      }

      if (decision.kind === "enroll-fresh") {
        // The stored identifier names nobody. Forgetting it is the only correct outcome:
        // reusing it would hand this participant someone else's identity.
        clearStoredValidatorId();
        setMessage(MESSAGES.unknown);
        return;
      }

      setMessage(decision.message);
    });
  }

  return (
    <div className="border-ink bg-paper-inset rounded-control shadow-brutal-sm flex flex-col items-start gap-3 border-2 p-5">
      <p className="label-meta text-ink-muted">Already started?</p>
      <p className="text-small text-ink-muted">
        If you have taken part on this browser before, you can carry on as the same anonymous
        validator.
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending || undefined}
      >
        {isPending ? "Checking…" : "Continue as that validator"}
      </Button>
      {message ? (
        <p className="text-small text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
