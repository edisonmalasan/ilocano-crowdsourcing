"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { ValidationSkeleton } from "@/components/validation/validation-skeleton";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import type {
  OwnedValidationSessionRequest,
  ValidationSessionOutcome,
} from "@/lib/validation/session";
import { readStoredValidatorId } from "@/lib/validators/browser-identity";

import { FinishedBatch } from "./finished-batch";
import { ValidationSessionRunner } from "./validation-session";

export interface OwnedSessionGateProps {
  readonly locale: InterfaceLocale;
  /** The batch half of the ownership request, recovered server-side from the route. */
  readonly batchId: string;
  /** The requested position within the server's order, if the address named one. */
  readonly position: number | undefined;
  /**
   * The ownership-gated open, bound server-side. The gate supplies the attempt
   * half from the browser's active attempt; the server compares it against the
   * stored owner and answers with content or with the generic redirect outcome.
   */
  readonly openSession: (
    request: OwnedValidationSessionRequest,
  ) => Promise<ValidationSessionOutcome>;
}

/**
 * Type-level pin on the gate's prop key set.
 *
 * The attempt half of the ownership request must NEVER travel as a prop:
 * server-rendered props are markup, and markup carrying the identity would
 * put it in the document before any proof. A behavioural test cannot pin the
 * absence of a prop, because a mutation may name it anything — so the pin
 * lives here, beside the request key sets: `Exclude<…, …>` resolves to
 * `never` while the gate takes exactly `locale`, `batchId`, `position`, and
 * the bound action, and to `never` the moment a fifth prop appears, whatever
 * it is called.
 */
export type OwnedSessionGatePropsAreExactlyTheseFour =
  Exclude<
    keyof OwnedSessionGateProps,
    "locale" | "batchId" | "position" | "openSession"
  > extends never
    ? true
    : never;

/**
 * ============================================================================
 * THE OWNERSHIP GATE — the client half of the gated session open
 * ============================================================================
 * A batch address alone grants nothing. The server renders only this neutral
 * shell — heading, description, and skeleton in the presenting geometry, never
 * a sentence — and this island proves the session after mount: it reads the
 * browser's active attempt and hands both halves to the gated open.
 *
 * The attempt is read at PROOF time and not during render, for the reason the
 * identity module records: storage does not exist while the server renders,
 * so a read during render would make the first client render disagree with
 * the first server one.
 *
 * Every denial takes the same road home. A missing attempt, a foreign
 * attempt, an unknown batch, and a throttled check all arrive as the one
 * generic outcome and all navigate to `/` — so the cases are
 * indistinguishable from outside, and no validator row is created on the way
 * out. The locale survives the trip because it lives in a cookie, not the
 * address. The attempt identity itself never enters the URL on any path, so
 * no `VAL_` reaches history, logs, or the address bar.
 */
export function OwnedSessionGate({
  locale,
  batchId,
  position,
  openSession,
}: OwnedSessionGateProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [outcome, setOutcome] = useState<ValidationSessionOutcome | null>(null);
  // Closed synchronously inside the effect, before the first await: under
  // StrictMode's double-effect in development the proof still runs once, so
  // one mount spends one ownership check rather than two.
  const proofStarted = useRef(false);

  useEffect(() => {
    if (proofStarted.current) return;
    proofStarted.current = true;

    let settled = true;

    async function prove(): Promise<void> {
      const stored = readStoredValidatorId();
      if (stored === null) {
        router.replace("/");
        return;
      }
      const resolved = await openSession({ batchId, position, activeAttemptId: stored });
      if (!settled) return;
      if (resolved.status === "redirectHome" || resolved.status === "absent") {
        router.replace("/");
        return;
      }
      setOutcome(resolved);
    }

    void prove();

    return () => {
      settled = false;
    };
  }, [batchId, position, openSession, router]);

  // Still proving, or already on the way home: the skeleton is the whole
  // screen, so no sentence is ever in the document before ownership is shown.
  if (outcome === null) return <ValidationSkeleton />;

  if (outcome.status === "presenting") {
    const { session } = outcome;
    return (
      <ValidationSessionRunner
        locale={locale}
        initial={{
          batchId: session.batchId,
          entry: session.entry,
          position: session.position,
          total: session.total,
          completedCount: session.completedCount,
        }}
      />
    );
  }

  if (outcome.status === "finished") {
    return (
      <Card as="section" padding="lg">
        <h2 className="text-heading">{t("validate.finished.label")}</h2>
        <p className="text-body text-ink-muted mt-3">{t("validate.finished.body")}</p>
        <FinishedBatch locale={locale} />
      </Card>
    );
  }

  // A denial that somehow reaches render (the effect already navigates home
  // on both) renders nothing further: no sentence, no metadata, no signal.
  if (outcome.status === "redirectHome" || outcome.status === "absent") return null;

  if (outcome.status === "failed") {
    return (
      <Card as="section" padding="lg">
        <h2 className="text-heading">{t("validate.failed.label")}</h2>
        <p className="text-body text-ink-muted mt-3">{t("validate.failed.body")}</p>
        <p className="text-small text-ink-faint mt-3">
          {outcome.reason === "invalid"
            ? t("validate.failed.invalid")
            : t("validate.failed.persistence")}
        </p>
      </Card>
    );
  }

  // Unreachable: every outcome member is handled above. Kept as a render
  // rather than a throw so a future outcome member fails visibly, not blankly.
  return (
    <Card as="section" padding="lg">
      <h2 className="text-heading">{t("validate.failed.label")}</h2>
      <p className="text-body text-ink-muted mt-3">{t("validate.failed.body")}</p>
    </Card>
  );
}
