"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
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
 * A load-time discovery needs a post-hydration `setState`, because browser storage
 * does not exist during server rendering, and hiding it makes the control's
 * presence a function of state the server never saw.
 *
 * An earlier version of this comment called that cascading render "the pattern React's
 * lint rules exist to reject". That was checked during independent review and half of
 * it is false: `useEffect` + `setState` does trip the rule, but
 * `useSyncExternalStore` — the supported, hydration-safe API for exactly this read —
 * lints and typechecks clean. The reason the control is not load-time is therefore not
 * lint compliance. It is that storage can tell this component an identifier is *stored*,
 * while only the server can say whether it is *recognised*, so a control that appeared
 * or vanished before the server answered would be guessing.
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
 *
 * ================================ LOCALIZATION ================================
 * `locale` is a REQUIRED prop, and it is required rather than read from a hook for a
 * reason beyond consistency with the routes: this is a client component, so anything
 * it read from a context provider would have to be serialized through the RSC payload
 * and would work only after hydration. Taking the locale as a prop keeps the value
 * identical in the server-rendered HTML and in the hydrated tree, so a participant
 * who chose Filipino never sees an English flash of these two paragraphs.
 *
 * It is presentation only. Nothing on this screen is derived from it, nothing is sent
 * with it, and the identifier this island reads is byte-for-byte the same string in
 * both languages. The catalog holds a localized LABEL for each outcome; it holds no
 * proficiency level, and it never could, because the server that recognises an
 * identifier deliberately does not return one.
 */

export interface ResumeValidatorProps {
  /** The interface language the surrounding route is rendering. Never persisted. */
  readonly locale: InterfaceLocale;
}

export function ResumeValidator({ locale }: ResumeValidatorProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setMessage(null);

    const stored = readStoredValidatorId();
    if (stored === null) {
      setMessage(t("resume.noneHeld"));
      return;
    }

    startTransition(async () => {
      // The shared decision function, so the landing page and the screening page cannot
      // disagree about what `absent` means. Here `enroll-fresh` is handled as a message
      // rather than an enrollment, because this route must not create a validator — and
      // `null` is the correct answer argument, because this route collects no screening
      // answer to carry forward. The participant is pointed at the screening page, which
      // will ask properly.
      const decision = decideResume(await resumeValidatorAction({ storedId: stored }), null, t);

      if (decision.kind === "ready") {
        router.push("/ready");
        return;
      }

      if (decision.kind === "enroll-fresh") {
        // The stored identifier names nobody. Forgetting it is the only correct outcome:
        // reusing it would hand this participant someone else's identity.
        clearStoredValidatorId();
        setMessage(t("resume.unknown"));
        return;
      }

      setMessage(decision.message);
    });
  }

  return (
    <div className="border-ink bg-paper-inset rounded-control shadow-brutal-sm flex flex-col items-start gap-3 border-2 p-5">
      <p className="label-meta text-ink-muted">{t("resume.title")}</p>
      <p className="text-small text-ink-muted">{t("resume.body")}</p>
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending || undefined}
      >
        {isPending ? t("resume.checking") : t("resume.continue")}
      </Button>
      {message ? (
        <p className="text-small text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
