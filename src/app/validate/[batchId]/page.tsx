import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { BatchProgress } from "@/components/ui/progress";
import { EntryCard } from "@/components/validation/entry-card";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { ServerEnvError } from "@/lib/env/server";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";
import type { ValidationSessionOutcome } from "@/lib/validation/session";
import { openValidationSession, sessionDependencies } from "@/lib/validation/session-service";

import { ValidationForm } from "./validation-form";

/**
 * ============================================================================
 * THE VALIDATION SESSION ROUTE — `/validate/[batchId]`
 * ============================================================================
 * A Server Component that reads one batch, resolves which single entry to present, and renders that
 * entry together with the form that collects a judgement on it.
 *
 * ============================================================================
 * WHAT IS SERVER-DERIVED HERE, AND WHY EACH THING MATTERS
 * ============================================================================
 *   WHICH entry — from `resolveSessionEntry`, over `batch_entries.position` and the completed set
 *                 from `listEntryIdsForValidator`. The URL may carry `?position=`; it is a position
 *                 INTO the order the server chose, and it is resolved against that order, so a
 *                 stale link lands on the next entry that still needs an answer rather than on
 *                 nothing.
 *   WHOSE batch — from `BatchRecord.validatorId`. The request carries no identity, because the batch
 *                 names its owner and a second client-supplied claim about identity is a second
 *                 thing to get wrong.
 *   PROGRESS — from the batch's own size and the completed count. There is no counter in this
 *                 component and none in the form, so there is nothing for a participant to have
 *                 influenced.
 *
 * ============================================================================
 * WHY EXACTLY ONE ENTRY IS IN THE MARKUP
 * ============================================================================
 * A route that rendered the whole batch would put nine un-evaluated sentences in the browser at
 * once, which is the thing `design.md` D1 exists to prevent. It is also a research problem rather
 * than only a design one: a validator holding the whole batch can see what is coming before
 * committing to a judgement, and the resulting responses are not independent of each other. The
 * count is asserted by a rendered-markup test, not by this comment.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);
  return { title: t("validate.meta.title"), description: t("validate.meta.description") };
}

interface ValidatePageProps {
  readonly params: Promise<{ readonly batchId: string }>;
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>;
}

/**
 * Reads the requested position out of the query string.
 *
 * `Number` here rather than a Zod coercion, deliberately: `Number("abc")` is `NaN` and `NaN` fails
 * `batchEntryPositionSchema`, so a mangled link produces a rendered "that link did not name a
 * sentence position" state rather than being quietly treated as position one. A validator who
 * followed a bad link deserves to be told the link is bad.
 */
function readRequestedPosition(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  return Number(raw);
}

export default async function ValidatePage({ params, searchParams }: ValidatePageProps) {
  const { batchId } = await params;
  const query = await searchParams;
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  // The environment check lives in `sessionDependencies`, and a missing deployment is a NORMAL
  // state for this route rather than a crash: the participant gets a plain explanation and nothing
  // is lost, which is the same treatment the screening form gives a missing database.
  let outcome: ValidationSessionOutcome;
  try {
    outcome = await openValidationSession(
      { batchId, position: readRequestedPosition(query["position"]) },
      sessionDependencies(),
    );
  } catch (error) {
    if (!(error instanceof ServerEnvError)) throw error;
    outcome = { status: "failed", reason: "not_configured" };
  }

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="label-meta text-ink-muted">{t("validate.header.step")}</p>
      <h1 className="text-title mt-2">{t("validate.meta.title")}</h1>
      <p className="text-lead text-ink-muted mt-3">{t("validate.meta.description")}</p>

      <div className="mt-8 flex flex-col gap-6">
        <SessionBody outcome={outcome} locale={locale} />
      </div>
    </main>
  );
}

interface SessionBodyProps {
  readonly outcome: ValidationSessionOutcome;
  readonly locale: InterfaceLocale;
}

function SessionBody({ outcome, locale }: SessionBodyProps) {
  const t = translatorFor(locale);

  if (outcome.status === "presenting") {
    const { session } = outcome;
    return (
      <>
        <BatchProgress
          index={session.position}
          total={session.total}
          completed={session.completedCount}
          labels={{
            progress: t("validate.progress.label"),
            item: `${t("validate.progress.sentence")} ${session.position} ${t("validate.progress.of")} ${session.total}`,
            saved: `${session.completedCount} ${t("validate.progress.saved")}`,
          }}
        />

        <EntryCard
          entry={session.entry}
          label={t("validate.entry.label")}
          instructionLabel={t("validate.entry.instructionLabel")}
          originLabel={t("validate.entry.originLabel")}
          destinationLabel={t("validate.entry.destinationLabel")}
          transitModeLabel={t("validate.entry.transitModeLabel")}
          transitModeAbsent={t("validate.entry.transitMode.absent")}
        />

        <Card as="section" padding="lg">
          <ValidationForm
            locale={locale}
            batchId={session.batchId}
            datasetEntryId={session.entry.id}
            position={session.position}
          />
        </Card>
      </>
    );
  }

  if (outcome.status === "finished") {
    return (
      <Card as="section" padding="lg">
        <h2 className="text-heading">{t("validate.finished.label")}</h2>
        <p className="text-body text-ink-muted mt-3">{t("validate.finished.body")}</p>
      </Card>
    );
  }

  if (outcome.status === "absent") {
    return (
      <Card as="section" padding="lg">
        <h2 className="text-heading">{t("validate.absent.label")}</h2>
        <p className="text-body text-ink-muted mt-3">{t("validate.absent.body")}</p>
        <p className="mt-5">
          <Link className="font-display font-bold underline" href="/validate">
            {t("validate.absent.cta")}
          </Link>
        </p>
      </Card>
    );
  }

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
