import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ValidationPageShell } from "@/components/validation/validation-page-shell";
import { resolveOriginKey } from "@/lib/admin/origin";
import { ServerEnvError } from "@/lib/env/server";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";
import { parseBatchRouteParam } from "@/lib/validation/batch-route";
import type {
  OwnedValidationSessionRequest,
  ValidationSessionOutcome,
} from "@/lib/validation/session";
import { openOwnedValidationSession, sessionDependencies } from "@/lib/validation/session-service";
import { sharedPublicThrottle } from "@/lib/validators/public-throttle";

import { OwnedSessionGate } from "./owned-session-gate";

/**
 * ============================================================================
 * THE VALIDATION SESSION ROUTE — `/validate/[batchId]`
 * ============================================================================
 * A Server Component that renders a NEUTRAL SHELL and nothing else: heading,
 * description, and the ownership gate island. No sentence is resolved here
 * and none is in the markup, because a batch address alone grants nothing —
 * the gate proves the browser's active attempt against the batch's stored
 * owner through the server action below, and content renders only on
 * equality. See `owned-session-gate.tsx` for the client half and
 * `openOwnedValidationSession` for the comparison.
 *
 * WHAT IS SERVER-DERIVED HERE: only the batch half of the ownership request
 * (the identifier recovered from the route, plus the requested position
 * within the server's order). The attempt half arrives from the gate's
 * session-scoped read and is joined to it inside the gated call — never in
 * the URL, so no `VAL_` reaches history, logs, or the address bar.
 *
 * WHY THE GATE IS AN ISLAND rather than a server-side check: the active
 * attempt lives in session-scoped browser storage, which does not exist
 * while the server renders. A Server Component cannot read it, so the proof
 * has to be a client call back to the server after mount.
 *
 * ============================================================================
 * WHICH entry, WHOSE batch, and PROGRESS
 * ============================================================================
 * Unchanged from before the gate — they just resolve one layer down now, in
 * `openOwnedValidationSession`'s shared tail rather than in this component.
 * WHICH entry comes from `resolveSessionEntry` over `batch_entries.position`
 * and the completed set; WHOSE batch comes from the batch's own stored
 * owner, read from the batch rather than asserted by the caller; PROGRESS
 * comes from the batch's size and the completed count. The reads run against
 * the STORED owner, never against the supplied attempt, even though the two
 * are equal on the only path that reaches them.
 *
 * ============================================================================
 * WHY EXACTLY ONE ENTRY IS IN THE MARKUP
 * ============================================================================
 * A route that rendered the whole batch would put every un-evaluated
 * sentence in the browser at once, which is the thing `design.md` D1 exists
 * to prevent. The gate preserves it in a stronger form: not even one
 * sentence is in the markup before ownership is proven.
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
 * `batchEntryPositionSchema`, so a mangled link produces a refused position rather than being
 * quietly treated as position one. A validator who followed a bad link deserves to be told the
 * link is bad.
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
   * A refusal takes the same road as every other denial on this route — home, with no sentence,
   * no metadata, and no existence signal. The locale survives the trip because it lives in a
   * cookie, not the address.
   */
  const parsed = parseBatchRouteParam(batchIdSegment);

  // The environment check lives in `sessionDependencies`, and a missing deployment is a NORMAL
  // state for this route rather than a crash: the participant gets a plain explanation and nothing
  // is lost, which is the same treatment the screening form gives a missing database.
  //
  // The check still runs for a refused segment — the refusal below navigates away before any
  // lookup, so no environment read and no query runs for an address that cannot name a batch.
  // `redirectHome` is the honest sentence here: it is the same outcome a well-formed address
  // naming a batch that is not in storage produces, and this platform has no way to tell the
  // two apart that a participant would care about.
  if (!parsed.ok) {
    redirect("/");
  }

  /**
   * The ownership-gated open, bound to this request.
   *
   * Runs AFTER the refusal above, so an address that cannot name a batch never reaches the
   * environment read or the lookup. The request carries both halves the gate requires — the
   * batch recovered from the route and the browser's active attempt — and the server compares
   * the supplied attempt against the batch's STORED owner, returning content only on equality.
   * Every other case produces the one generic redirect outcome, with no validator row created
   * on the way out.
   *
   * Paced like the resume path, against the same hashed origin signal: a burst of ownership
   * probes costs no database work and learns nothing faster than the allowance permits.
   */
  async function openOwnedSession(
    request: OwnedValidationSessionRequest,
  ): Promise<ValidationSessionOutcome> {
    "use server";
    const jar = await headers();
    try {
      return await openOwnedValidationSession(request, {
        ...sessionDependencies(),
        throttleContext: {
          throttle: sharedPublicThrottle,
          originKey: resolveOriginKey((name) => jar.get(name)),
          log: (line) => console.info(`[sadino:abuse] ${line}`),
        },
      });
    } catch (error) {
      if (!(error instanceof ServerEnvError)) throw error;
      return { status: "failed", reason: "not_configured" };
    }
  }

  /**
   * The batch half of the ownership request, assembled server-side from the route. The attempt
   * half arrives from the gate's session-scoped read and is joined to this inside the gated
   * call — never in the URL.
   */
  const gateRequest = {
    batchId: parsed.batchId,
    position: readRequestedPosition(query["position"]),
  };

  return (
    <ValidationPageShell
      title={t("validate.meta.title")}
      description={t("validate.meta.description")}
      /*
       * The heading stays on every state now, including the finished one the old route hid it
       * on: the server no longer knows which state the gate will prove into, so there is no
       * longer a server-known finished branch to hide it for. The finished card below says
       * where the participant is; the heading says what the place is.
       */
    >
      <OwnedSessionGate
        locale={locale}
        batchId={gateRequest.batchId}
        position={gateRequest.position}
        openSession={openOwnedSession}
      />
    </ValidationPageShell>
  );
}
