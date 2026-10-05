import "server-only";

import { verifyOperatorCredential } from "@/lib/admin/credentials";
import type { ConfiguredAdminEnv } from "@/lib/admin/env";
import { RESEARCHER_SIGN_IN_REFUSAL_MESSAGE } from "@/lib/admin/refusal";
import { issueResearcherSession } from "@/lib/admin/session";
import type { SignInAttemptsRepository } from "@/lib/repositories";

/**
 * ============================================================================
 * "May this request enter the researcher area?" as a pure decision over injected dependencies
 * ============================================================================
 * Everything this module decides is reached with a repository the caller supplied, a clock the
 * caller supplied, and an environment the caller supplied. Nothing here reads `process.env`, builds
 * a Supabase client, or touches `next/headers` — which is what makes every branch below testable
 * with no database, no credential, and no request.
 *
 * The order of the four steps IS the design, and each step exists because the spec names a scenario
 * that a different order would fail:
 *
 *   1. Unconfigured environment refuses IMMEDIATELY. No counter call and no credential comparison
 *      happen, because an environment with no operator credential set must refuse under every input
 *      (spec: "Absent operator configuration refuses every admin request"). Comparing first would
 *      mean an unconfigured deployment still spent work per request on an answer it cannot use.
 *
 *   2. The counter is incremented BEFORE the credential is compared, and the returned count decides
 *      whether the comparison happens at all. That ordering is what satisfies two scenarios at once:
 *
 *        - "Attempts stop at the configured limit" requires refusal WITHOUT comparing, so the limit
 *          has to be known before step 3.
 *        - A plain "read the count, then compare, then write" would satisfy that too, but it is not
 *          atomic: two concurrent attempts could both read "under the limit" and both proceed. Using
 *          the ATOMIC increment's return value as the decision closes that gap with no second round
 *          trip and no read at all.
 *
 *   3. The credential comparison, which is exact, has no early exit, and runs at most once.
 *
 *   4. On success, the counter is cleared and a session is issued — in that order, so a session is
 *      never handed out while a failure count is still standing against that origin.
 */

/** Attempts allowed per window before the surface stops comparing at all. */
export const SIGN_IN_MAX_FAILURES = 10;

/**
 * The window, in seconds, over which consecutive failures accumulate.
 *
 * A fixed window rather than a sliding one, because the counter is one row per origin and a sliding
 * window needs a history to slide over. Fifteen minutes is long enough that a person who mistypes
 * their credential twice is not locked out, and short enough that an abandoned window does not keep
 * a party slowed for a day.
 */
export const SIGN_IN_WINDOW_SECONDS = 15 * 60;

/**
 * Why a sign-in was refused.
 *
 * DISTINGUISHABLE INTERNALLY, IDENTICAL EXTERNALLY. These four reasons drive different operator
 * responses — an unconfigured deployment, an exhausted window, a typo, and an unreachable database
 * are four different incidents — so the code below must be able to tell them apart. They must NOT
 * reach the requester apart, because `bad_credential` versus `limit_reached` is a working oracle for
 * "am I being rate limited right now", and `not_configured` is a statement about a deployment.
 * {@link researcherSignInRefusalMessage} is the single string every reason is rendered with, and
 * `tests/unit/admin-signin-core.test.ts` asserts all four produce the identical outward message.
 */
export type SignInRefusal =
  /** The deployment has no operator credential set, or the session secret is blank. */
  | "not_configured"
  /** The attempt limit for this origin is exhausted; the credential was not compared. */
  | "limit_reached"
  /** The presented value matched no configured credential. */
  | "bad_credential"
  /** The durable counter could not be read or written, so the attempt could not be accounted for. */
  | "counter_unavailable";

export type SignInOutcome =
  | {
      readonly status: "authenticated";
      /** The signed session to be set as an httpOnly cookie. Never shown to page scripts. */
      readonly session: string;
      /** 1-based position of the credential that established the session. Not a secret. */
      readonly ordinal: number;
    }
  | { readonly status: "refused"; readonly reason: SignInRefusal };

/**
 * What one sign-in outcome contributes to the server log, as data rather than text.
 *
 * The line is formatted here so the two places that emit it — the core for decided outcomes,
 * the action for refusals that never reach the core — cannot drift into two dialects. The
 * origin key is already stored in the research database by design (coarse, non-identifying);
 * the ordinal is the guard's non-secret position. No credential, no session, no digest.
 */
export type SignInDiagnosticEvent =
  | { readonly kind: "refused"; readonly reason: SignInRefusal; readonly originKey: string }
  | { readonly kind: "authenticated"; readonly ordinal: number; readonly originKey: string };

export function formatSignInDiagnostic(event: SignInDiagnosticEvent): string {
  return event.kind === "refused"
    ? `researcher sign-in refused reason=${event.reason} origin=${event.originKey}`
    : `researcher sign-in authenticated ordinal=${event.ordinal} origin=${event.originKey}`;
}

/**
 * The refusal a requester is shown. One string, for every {@link SignInRefusal}.
 *
 * A FUNCTION rather than a bare constant, deliberately. `@/lib/admin/refusal` holds the same string in
 * a module a client island may import, and re-exporting it from here as a value would create two
 * names for one sentence — which is the drift {@link RESEARCHER_SIGN_IN_REFUSAL_MESSAGE} exists to
 * prevent. Taking no argument is what keeps this from ever becoming a way to pass a reason through.
 */
export function researcherSignInRefusalMessage(): string {
  return RESEARCHER_SIGN_IN_REFUSAL_MESSAGE;
}

/**
 * Everything this decision needs from the outside world.
 *
 * `nowMs` is passed rather than read from a clock so the session's issued-at, its expiry, and any
 * test's expectations all agree on one instant. A module that called `Date.now()` itself would make
 * "the expiry is exactly the configured lifetime after the issued instant" untestable at the instant
 * rather than at the second.
 */
export interface ResearcherSignInDeps {
  readonly attempts: SignInAttemptsRepository;
  readonly nowMs: number;
  /**
   * Where one line per outcome goes. Optional so existing callers keep working; the Server
   * Action supplies a namespaced `console.info`. A sink that throws would turn a decided outcome
   * into a 500, so implementations must not throw — and the core never awaits it, so a slow
   * sink cannot stall a sign-in either.
   */
  readonly log?: (line: string) => void;
}

export interface ResearcherSignInArgs {
  /**
   * The outside world, injected rather than reached for.
   *
   * A `deps` member rather than three flattened arguments, so it is impossible to pass a clock
   * without a repository: the two travel together at every call site and the compiler enforces it.
   */
  readonly deps: ResearcherSignInDeps;
  /**
   * Whatever the client submitted, as `unknown`.
   *
   * The credential is not trimmed, folded, or normalised on the way in, because a value differing by
   * trailing whitespace is a different value and the spec names that as a refusal. Trimming it here
   * to be "helpful" would accept a credential the operator never chose.
   */
  readonly presented: unknown;
  /**
   * The coarse origin this attempt is accounted against.
   *
   * Computed by the caller from the request's own headers. It is deliberately NOT an identifier of a
   * person — no address, no account, nothing joinable to a validation response — because it is stored
   * in a research database and the anonymity guarantee covers everything in one.
   */
  readonly originKey: string;
  /** `null` when the deployment has no operator credential set. */
  readonly adminEnv: ConfiguredAdminEnv | null;
}

export async function runResearcherSignIn(args: ResearcherSignInArgs): Promise<SignInOutcome> {
  const log = args.deps.log ?? (() => {});
  const diagnosed = (reason: SignInRefusal): SignInOutcome => {
    log(formatSignInDiagnostic({ kind: "refused", reason, originKey: args.originKey }));
    return refuse(reason);
  };

  // 1. An unconfigured researcher area refuses before anything else is touched. No counter write, no
  //    comparison, no session.
  if (args.adminEnv === null) return diagnosed("not_configured");

  // 2. The atomic increment. A failure here FAILS CLOSED, and that is a deliberate trade: refusing
  //    a legitimate researcher because the counter is unreachable is an availability cost, whereas
  //    proceeding would make the attempt limit optional for exactly the party that cannot
  //    authenticate. The window is what keeps the cost bounded — it expires on its own, so a
  //    database outage delays sign-in rather than excluding anyone permanently.
  let count: number;
  try {
    count = await args.deps.attempts.recordAttempt(args.originKey, SIGN_IN_WINDOW_SECONDS);
  } catch {
    return diagnosed("counter_unavailable");
  }

  // The refusal is returned BEFORE any comparison. This is the scenario "further attempts are refused
  // without the presented value being compared against the configured credentials", and it is also
  // why the limit cannot be used as an oracle: past the limit, the submitted value is never looked at.
  if (count > SIGN_IN_MAX_FAILURES) return diagnosed("limit_reached");

  // 3. The comparison. Exact, no early exit at either loop level, and the only call to it per
  //    attempt — see `@/lib/admin/credentials` for why each of those is load-bearing.
  const verification = verifyOperatorCredential(args.presented, args.adminEnv.operatorSecrets);
  if (!verification.matched || verification.ordinal === null) return diagnosed("bad_credential");

  // 4. A verified credential. The counter is cleared FIRST so the allowance is restored before the
  //    session exists; the reverse order would hand out a session while this origin was still one
  //    failure away from the limit.
  //
  //    A failure to clear also fails closed, for the same reason the increment does. The window is
  //    what bounds it: the count expires, and the next attempt through a working counter starts from
  //    whatever the database actually holds.
  try {
    await args.deps.attempts.clear(args.originKey);
  } catch {
    return diagnosed("counter_unavailable");
  }

  log(
    formatSignInDiagnostic({
      kind: "authenticated",
      ordinal: verification.ordinal,
      originKey: args.originKey,
    }),
  );
  return {
    status: "authenticated",
    session: issueResearcherSession({
      ordinal: verification.ordinal,
      // The credential the comparison matched, handed over so the session can be BOUND to it. The
      // binding is a keyed MAC, so this value does not reach the cookie in any recoverable form —
      // but it is needed here, because a session that records only "position 3" would be
      // re-attributed to whoever holds position 3 after the previous holder is removed.
      credential: args.adminEnv.operatorSecrets[verification.ordinal - 1] ?? "",
      nowMs: args.deps.nowMs,
      secret: args.adminEnv.sessionSecret,
    }),
    ordinal: verification.ordinal,
  };
}

function refuse(reason: SignInRefusal): SignInOutcome {
  return { status: "refused", reason };
}
