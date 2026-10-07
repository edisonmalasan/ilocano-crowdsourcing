"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import { batchRoutePath } from "@/lib/validation/batch-route";
import { requestStartValidationAction } from "@/lib/validation/start-validation-actions";
import { decideStartBatch } from "@/lib/validation/start-batch-flow";
import { clearStoredValidatorId, readStoredValidatorId } from "@/lib/validators/browser-identity";

/**
 * ============================================================================
 * OBTAINING A BATCH — the auto-orchestration island on `/validate`
 * ============================================================================
 * A batch id does not exist until the server has chosen one, so this route
 * cannot be a static link: there is nothing to link TO. On mount the island
 * runs the single start orchestration once — one client→server round trip that checks
 * for a resumable interrupted batch, allocates a new batch when there is none, and
 * resolves the first entry — using the anonymous identifier the onboarding flow already
 * stored, and navigates as soon as the server has answered.
 *
 * There is deliberately no manual start control on the happy path. The
 * participant already asked for sentences by completing screening; asking
 * again answers nothing. What remains manual is the retry: a failed run
 * renders its reason with a control that runs the orchestration again.
 *
 * ============================================================================
 * WHY THE IDENTITY IS READ IN THE EFFECT AND NOT DURING RENDER
 * ============================================================================
 * `readStoredValidatorId()` reads browser storage, which does not exist while
 * the server renders, so calling it in the component body would make the first
 * server-rendered markup disagree with the first client-rendered markup — a
 * hydration mismatch whose visible symptom is the whole card changing on
 * arrival. The effect runs once, after the participant's own browser has taken
 * over. The server re-checks the identifier on every action regardless, so a
 * hand-edited value produces `unknown_validator` rather than a batch attached
 * to nobody: the browser is not trusted here, it is only where the value is
 * kept.
 *
 * ============================================================================
 * WHY THE EFFECT RUNS ONCE EVEN UNDER STRICTMODE
 * ============================================================================
 * React 19 StrictMode mounts, unmounts, and remounts effects in development,
 * and an unguarded effect would issue the allocation request twice — minting
 * two batches and two sets of reservations for one participant. The `started`
 * ref closes that second run synchronously, before the first `await`, the
 * same way the validation form's single-flight latch closes a second submit.
 * The retry control re-runs deliberately and is disabled while running.
 *
 * ============================================================================
 * WHY THERE IS ONE ACTION AND NO SEPARATE RECOVERY LOOKUP
 * ============================================================================
 * The recovery check runs INSIDE the start orchestration rather than as a separate
 * client-issued round trip: an interrupted batch is resumed at its own address with no
 * write of any kind, and a lookup that fails or cannot complete falls through to
 * allocation rather than stranding the participant. The orchestration returns the batch
 * id plus the first entry only — the whole batch entry list never crosses to the client.
 */

export interface StartBatchProps {
  readonly locale: InterfaceLocale;
}

type OrchestrationPhase =
  | { readonly kind: "working" }
  | { readonly kind: "no-identity" }
  | { readonly kind: "exhausted" }
  /**
   * The attempt predates required proficiency. Restart replaces retry: the
   * refusal is deterministic, so a control that re-requested could never
   * succeed — the only honest onward action is retiring this attempt and
   * beginning a screened one.
   */
  | { readonly kind: "screening_required" }
  | { readonly kind: "error"; readonly message: string };

export function StartBatch({ locale }: StartBatchProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [phase, setPhase] = useState<OrchestrationPhase>({ kind: "working" });
  const [isPending, startTransition] = useTransition();
  const started = useRef(false);

  async function orchestrate(): Promise<void> {
    const stored = readStoredValidatorId();
    if (stored === null) {
      setPhase({ kind: "no-identity" });
      return;
    }

    // One round trip: recovery check, allocation where needed, and first-entry
    // resolution all run server-side inside the orchestration. A resumed batch is
    // navigation, not a lifecycle event — nothing is created for it — and a failed
    // internal check falls through to allocation rather than stranding the
    // participant. The orchestration's terminal outcomes are mapped onto the
    // existing allocation-shaped decision input so both screens keep one
    // vocabulary for the same research facts.
    const outcome = await requestStartValidationAction({ validatorId: stored });
    if (outcome.status === "started" || outcome.status === "resumed") {
      router.push(batchRoutePath(outcome.batchId));
      return;
    }

    const decision = decideStartBatch(
      stored,
      outcome.status === "exhausted"
        ? { status: "exhausted" }
        : { status: "failed", reason: outcome.reason },
      t,
    );
    if (decision.kind === "start") {
      router.push(batchRoutePath(decision.batchId));
      return;
    }

    if (decision.kind === "screening_required") {
      setPhase({ kind: "screening_required" });
      return;
    }

    if (decision.kind === "exhausted") {
      setPhase({ kind: "exhausted" });
      return;
    }

    if (decision.kind === "no-identity") {
      setPhase({ kind: "no-identity" });
      return;
    }

    setPhase({ kind: "error", message: decision.message });
  }

  function run(): void {
    startTransition(async () => {
      await orchestrate();
    });
  }

  useEffect(() => {
    // Runs once per mount. See the StrictMode note above: without the guard a
    // development double-mount issues two allocation requests. `orchestrate` is
    // intentionally not a dependency: re-running when the locale changes would
    // allocate a second batch for a participant who only switched languages.
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running would double-allocate; see above.
  }, []);

  return (
    <Card as="section" padding="lg" aria-busy={phase.kind === "working" || undefined}>
      {phase.kind === "working" ? (
        <p className="text-body text-ink-muted flex items-center gap-3" role="status">
          <span
            aria-hidden="true"
            className="bg-accent size-2.5 shrink-0 animate-pulse rounded-full"
          />
          {t("validateStart.working")}
        </p>
      ) : null}

      {phase.kind === "no-identity" ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-ink-muted">{t("validateStart.noIdentity")}</p>
          <p>
            <Link className="font-display font-bold underline" href="/start">
              {t("validateStart.noIdentity.cta")}
            </Link>
          </p>
        </div>
      ) : null}

      {phase.kind === "exhausted" ? (
        <p className="text-body text-ink-muted">{t("validateStart.exhausted")}</p>
      ) : null}

      {phase.kind === "screening_required" ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-muted">{t("validateStart.screeningRequired")}</p>
          <div>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                // Retires the pre-correction attempt the way Finish does: the
                // identifier is browser-held, so clearing it ends the attempt
                // with zero server writes, and screening mints the screened one.
                // Synchronous navigation, like a link: no pending state to report.
                clearStoredValidatorId();
                router.push("/start");
              }}
            >
              {t("validateStart.restart")}
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-small text-status-alert font-semibold">
            {phase.message}
          </p>
          <div>
            <Button
              type="button"
              size="lg"
              disabled={isPending}
              aria-busy={isPending || undefined}
              onClick={run}
            >
              {isPending ? t("validateStart.working") : t("validateStart.begin")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
