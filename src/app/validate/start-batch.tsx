"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { requestBatchAction } from "@/lib/allocation/actions";
import { translatorFor } from "@/lib/i18n/copy";
import { decideStartBatch, type StartBatchDecision } from "@/lib/validation/start-batch-flow";
import { readStoredValidatorId } from "@/lib/validators/browser-identity";

/**
 * ============================================================================
 * OBTAINING A BATCH — the client island on `/validate`
 * ============================================================================
 * A batch id does not exist until the server has chosen one, so this route cannot be a static link
 * from `/ready`: there is nothing to link TO. The request is therefore made from the participant's
 * browser, using the anonymous identifier the onboarding flow already stored there, and the
 * navigation happens only after the server has answered.
 *
 * ============================================================================
 * WHY THE IDENTITY IS READ AT PRESS TIME AND NOT DURING RENDER
 * ============================================================================
 * `readStoredValidatorId()` reads `localStorage`, which does not exist while the server renders, so
 * calling it in the component body would make the first server-rendered markup disagree with the
 * first client-rendered markup — a hydration mismatch whose visible symptom is the whole card
 * changing on arrival. The alternative of reading in an effect and rendering optimistically was
 * rejected for the reason recorded in `src/app/start/screening-form.tsx`: suppressing the question
 * lets someone act before the server has vouched for the value they are acting on.
 *
 * So the button is always offered, and pressing it resolves the identity and, if there is one, asks
 * for a batch. A browser holding no identity gets the "answer the question first" answer instead of
 * a request the server was always going to refuse. `requestBatchAction` re-checks the identifier
 * against storage regardless, so a hand-edited value produces `unknown_validator` rather than a
 * batch attached to nobody: the browser is not trusted here, it is only where the value is kept.
 */
export interface StartBatchProps {
  readonly locale: InterfaceLocale;
}

export function StartBatch({ locale }: StartBatchProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [decision, setDecision] = useState<StartBatchDecision | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card as="section" padding="lg">
      <h2 className="text-heading">{t("validateStart.title")}</h2>
      <p className="text-body text-ink-muted mt-3">{t("validateStart.lead")}</p>

      {decision?.kind === "no-identity" ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-body text-ink-muted">{t("validateStart.noIdentity")}</p>
          <p>
            <Link className="font-display font-bold underline" href="/start">
              {t("validateStart.noIdentity.cta")}
            </Link>
          </p>
        </div>
      ) : null}

      {decision?.kind === "exhausted" ? (
        <p className="text-body text-ink-muted mt-5">{t("validateStart.exhausted")}</p>
      ) : null}

      {decision?.kind === "error" ? (
        <p role="alert" className="text-small text-status-alert mt-5 font-semibold">
          {decision.message}
        </p>
      ) : null}

      <div className="mt-6">
        <Button
          type="button"
          size="lg"
          disabled={isPending}
          aria-busy={isPending || undefined}
          onClick={() => {
            setDecision(null);
            startTransition(async () => {
              const stored = readStoredValidatorId();
              const result =
                stored === null ? null : await requestBatchAction({ validatorId: stored });

              if (result !== null && result.status === "allocated") {
                router.push(`/validate/${encodeURIComponent(result.batchId)}`);
                return;
              }

              setDecision(decideStartBatch(stored, result, t));
            });
          }}
        >
          {isPending ? t("validateStart.working") : t("validateStart.begin")}
        </Button>
      </div>
    </Card>
  );
}
