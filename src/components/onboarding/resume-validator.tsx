"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import { clearStoredValidatorId, readStoredValidatorId } from "@/lib/validators/browser-identity";
import { resumeValidatorAction } from "@/lib/validators/actions";
import { decideResume } from "@/lib/validators/onboarding-flow";

/**
 * The landing action: one button that starts or continues participation.
 *
 * ============================ WHY ONE BUTTON ==============================
 * The previous design paired a "Start validation" link with a separate
 * "Already started?" card. Two paths to the same study read as a choice the
 * participant must get right, when there is nothing to get right: the
 * platform resolves which case applies at press time and routes accordingly.
 *
 * The label reflects what this browser holds, read in an effect so the
 * server-rendered HTML and the hydrated tree agree on first paint. The label
 * is a hint, never a decision: the server re-check decides. A label that says
 * "Continue validation" for an identifier the server no longer recognises
 * still lands the participant correctly, because the press resolves rather
 * than assumes.
 *
 * ============================ ANONYMITY INVARIANT ==============================
 * This is the only surface besides screening that sends a client-supplied
 * identifier to the server, and it exists because a returning participant has
 * no other way to be recognised. It returns no profile fields, renders no
 * identifier, and never displays what proficiency the stored validator
 * reported. Copy names the session, never the person or the past.
 *
 * ================================ LOCALIZATION ================================
 * `locale` is a REQUIRED prop, and it is required rather than read from a hook for a
 * reason beyond consistency with the routes: this is a client component, so anything
 * it read from a context provider would have to be serialized through the RSC payload
 * and would work only after hydration. Taking the locale as a prop keeps the value
 * identical in the server-rendered HTML and in the hydrated tree, so a participant
 * who chose Filipino never sees an English flash.
 *
 * It is presentation only. Nothing on this screen is derived from it, nothing is sent
 * with it, and the identifier this island reads is byte-for-byte the same string in
 * both languages.
 */

export interface LandingActionProps {
  /** The interface language the surrounding route is rendering. Never persisted. */
  readonly locale: InterfaceLocale;
}

export function LandingAction({ locale }: LandingActionProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Whether this browser holds an attempt in the current session. Read through
  // the hydration-safe external-store API rather than in an effect: an effect
  // `setState` trips the cascading-render rule, while this lints and
  // typechecks clean. Used for the LABEL only — the press re-reads and the
  // server re-checks — and compared as a boolean, so the snapshot is stable
  // across renders. The server snapshot is "holds nothing", matching first
  // paint; any state change that re-renders (a message, a press) re-reads.
  const holdsAttempt = useSyncExternalStore(
    () => () => {},
    () => readStoredValidatorId() !== null,
    () => false,
  );

  function handleClick(): void {
    setMessage(null);

    const stored = readStoredValidatorId();
    if (stored === null) {
      router.push("/start");
      return;
    }

    startTransition(async () => {
      // The shared decision function, so the landing action and the screening
      // form cannot disagree about what `absent` means. This route collects no
      // screening answer, so it passes none: `absent` arrives as a notice naming
      // the unknown identity, and anything else is shown as reported. This route
      // must not create a validator either way.
      const decision = decideResume(await resumeValidatorAction({ storedId: stored }), null, t);

      if (decision.kind === "ready") {
        // Recognised: the auto-orchestration screen resumes the interrupted
        // batch where one exists and otherwise allocates a new one.
        router.push("/validate");
        return;
      }

      if (decision.kind === "notice") {
        // The stored identifier names nobody. Forgetting it is the only correct outcome:
        // reusing it would hand this participant someone else's identity. The message
        // re-render re-reads the store above, so the label falls back to starting.
        clearStoredValidatorId();
        setMessage(decision.message);
        return;
      }

      if (decision.kind === "error") {
        setMessage(decision.message);
        return;
      }

      // `enroll-fresh` is unreachable here: it carries an answer this route
      // never collects, so `absent` arrives as `notice` above. If a future
      // change to `decideResume` ever returns it for a null answer, add a
      // branch here rather than letting it fall through silently.
    });
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending || undefined}
      >
        {isPending
          ? t("resume.checking")
          : holdsAttempt
            ? t("landing.cta.continue")
            : t("landing.cta.start")}
      </Button>
      {message ? (
        <p className="text-small text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
