import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { ServerEnvError } from "@/lib/env/server";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";
import { parseBatchRouteParam } from "@/lib/validation/batch-route";
import type { ValidationSessionOutcome } from "@/lib/validation/session";
import { openValidationSession, sessionDependencies } from "@/lib/validation/session-service";

import { FinishedBatch } from "./finished-batch";
import { ValidationSessionRunner } from "./validation-session";

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
  const { batchId: batchIdSegment } = await params;
  const query = await searchParams;
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  /**
   * THE SEGMENT IS NOT THE IDENTIFIER, AND RECOVERING IT IS NOT A STRING OPERATION.
   *
   * Next.js percent-encodes the dynamic route parameter before this component sees it — measured on
   * this repository's own route, even when the request path spelled the colons literally — so the
   * segment arrives in the once-encoded form regardless of how the address was written. Applying
   * `decodeURIComponent` exactly once therefore recovers the stored identifier for a raw address
   * AND for an already-encoded one, with no case in which this has to guess which it is looking at.
   *
   * `parseBatchRouteParam` is the only place that decoding happens, and it does NOT retry: a
   * twice-encoded segment or one that is not valid percent-encoding is REFUSED rather than repaired.
   *
   * A refusal reports the route's existing `absent` state and performs **no lookup at all** — not
   * `sessionDependencies()` either, so no environment check and no query runs for an address that
   * cannot name a batch. `absent` is the honest sentence here: it is the same state a well-formed
   * address naming a batch that is not in storage produces, and this platform has no way to tell the
   * two apart that a participant would care about.
   */
  const parsed = parseBatchRouteParam(batchIdSegment);

  // The environment check lives in `sessionDependencies`, and a missing deployment is a NORMAL
  // state for this route rather than a crash: the participant gets a plain explanation and nothing
  // is lost, which is the same treatment the screening form gives a missing database.
  let outcome: ValidationSessionOutcome;
  if (!parsed.ok) {
    outcome = { status: "absent" };
  } else {
    try {
      outcome = await openValidationSession(
        { batchId: parsed.batchId, position: readRequestedPosition(query["position"]) },
        sessionDependencies(),
      );
    } catch (error) {
      if (!(error instanceof ServerEnvError)) throw error;
      outcome = { status: "failed", reason: "not_configured" };
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-title">{t("validate.meta.title")}</h1>
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

interface CompletedFigureProps {
  /** The localized label saying WHICH figure this is. Never omitted, never shared between figures. */
  readonly label: string;
  /** The server's own count. Rendered as given, with no formatting, rounding, or derivation. */
  readonly value: number;
}

/**
 * One labelled count on the finished screen.
 *
 * A `<dt>`/`<dd>` pair, so the association is in the markup rather than in the visual order. The value
 * is a bare number: no percentage, no fraction of a target, no "of N" — a figure shown against
 * something it is being measured against is the mechanic `design.md` D7 exists to keep off this
 * screen, and there is deliberately no second number here for it to be compared with.
 */
function CompletedFigure({ label, value }: CompletedFigureProps) {
  return (
    <div className="min-w-0">
      <dt className="label-meta text-ink-muted">{label}</dt>
      <dd className="font-display text-ink mt-1 text-base font-bold break-words tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function SessionBody({ outcome, locale }: SessionBodyProps) {
  const t = translatorFor(locale);

  if (outcome.status === "presenting") {
    const { session } = outcome;
    // One server render opens the session; every later transition happens inside the runner,
    // in place, against the prefetched next entry and the background save queue. The route
    // still owns the finished/absent/failed branches below, and the runner navigates back
    // here — rather than rendering those itself — whenever only the server can decide.
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
      <>
        <Card as="section" padding="lg">
          <h2 className="text-heading">{t("validate.finished.label")}</h2>
          <p className="text-body text-ink-muted mt-3">{t("validate.finished.body")}</p>
          {/*
            THE TWO FIGURES, each with its own label (`design.md` D5).

            A `<dl>` rather than two bare numbers, so the label and the value are programmatically
            associated: a screen reader can answer "how many did I do in this batch?" without the
            participant inferring it from which number sits where.

            The batch figure is `completedCount` and the lifetime figure is `lifetimeAnsweredCount`,
            and the difference between them is the whole point of labelling them: a validator who has
            worked through four batches sees `10` and `38`, and an unlabelled pair would ask them to
            guess which is which. NEITHER figure is read from `validators.total_validations`, and
            neither is derived from anything the client sent.

            Nothing here is comparative, targeted, or encouraging. The lifetime figure is a static
            record of work already done (`design.md` D7), so it carries no "keep going", no next
            milestone, and no rank — the values are rendered as plain numbers with a `label-meta`
            caption.
          */}
          <dl className="border-ink mt-6 grid grid-cols-1 gap-4 border-t-2 pt-5 sm:grid-cols-2">
            <CompletedFigure
              label={t("validate.finished.batchFigureLabel")}
              value={outcome.completedCount}
            />
            <CompletedFigure
              label={t("validate.finished.lifetimeFigureLabel")}
              value={outcome.lifetimeAnsweredCount}
            />
          </dl>

          {/*
            THE TWO CONTROLS, and the reason they live in their own client island rather than here.

            A Server Component cannot ask the server for a batch on a participant's behalf, so the
            continue control has to be an island — and once one of them is, putting the other beside it
            costs nothing and buys two things worth having. The requirement is that continuing and
            finishing are DISTINCT controls and that choosing one does not trigger the other, and that
            is a claim about two controls answering to the same component, which is only observable
            if they are in one place: a handler-level test can drive either one from a single mount.
            A finish control in a Server Component would be inertly correct and untestable, and
            "untestable" is how the two would have quietly grown the same handler.

            `FINISH_HREF` is `"/"`, the only route that is not part of the validation sequence, and
            neither the two figures above nor anything else on this card is derived from the
            destination. See the component's header for both decisions in full.
          */}
          <FinishedBatch locale={locale} />
        </Card>
      </>
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
