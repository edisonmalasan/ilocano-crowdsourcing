import "server-only";

import { verifyResearcherSession, type ResearcherSessionVerification } from "@/lib/admin/session";
import type { ConfiguredAdminEnv } from "@/lib/admin/env";

/**
 * The researcher-area route guard.
 *
 * ============================================================================
 * WHAT THIS MODULE DELIBERATELY CANNOT DO
 * ============================================================================
 * It has no repository, no Supabase client, and no import that could construct one. That is not
 * minimalism for its own sake — it is the requirement "an unauthorized request is refused before any
 * privileged read is attempted", and the only way that can be a property of the code rather than a
 * claim about the code is for the guard to have no way to read anything.
 *
 * `tests/unit/admin-guard.test.ts` proves it two ways: it asserts the module's import graph contains
 * no persistence path, and it runs the guard with a recording repository that throws if it is called.
 * A guard that constructed a client "just in case" would fail the second without any behavioural
 * difference being observable — which is the point: the test has to be able to fail.
 *
 * ============================================================================
 * WHY THE REFUSAL CARRIES NO REASON
 * ============================================================================
 * {@link ResearcherAccess} is a two-state union with no third "refused because…" member. A reason
 * would be usable: a caller could branch on `unknown-ordinal` and treat it differently from
 * `bad_credential`, and that branch would be an oracle. The reasons exist one layer down, on
 * `verifyResearcherSession`, for logs and for tests. A caller that wants them logs them itself.
 */

export type ResearcherAccess =
  | {
      readonly status: "authorized";
      /** 1-based position of the credential that established the session. Not a secret. */
      readonly ordinal: number;
      readonly issuedAt: number;
      readonly expiresAt: number;
    }
  | { readonly status: "refused" };

/**
 * The screen a refused request gets.
 *
 * ONE string, with nothing from the request in it: no identifier, no path, no reason, no count of
 * configured credentials. That is what makes the refusal for a dataset entry that does not exist
 * byte-identical to the refusal for one that does — the two responses are produced by this same
 * constant, so they cannot differ.
 *
 * It says what is true and offers the way forward. It does not say whether the requester was close,
 * whether a limit was reached, or whether the area is configured at all.
 */
export const RESEARCHER_REFUSAL_MESSAGE =
  "This area is not available. A valid researcher session is required.";

/**
 * Decides whether a presented session may be served the researcher area.
 *
 * `adminEnv` is `null` when the deployment has no operator credential set, and that is a REFUSAL
 * rather than an exception — the shipped default in `.env.example` has both variables empty, and a
 * fresh deployment must refuse cleanly rather than fail the request with a configuration error.
 *
 * Takes the environment and the presented token as arguments and reads nothing itself, so it is
 * testable with no `process.env`, no cookie jar, and no request.
 */
export function resolveResearcherAccess(args: {
  readonly presented: unknown;
  readonly adminEnv: ConfiguredAdminEnv | null;
  readonly nowMs: number;
}): ResearcherAccess {
  if (args.adminEnv === null) return { status: "refused" };

  const verification: ResearcherSessionVerification = verifyResearcherSession(args.presented, {
    secret: args.adminEnv.sessionSecret,
    operatorSecrets: args.adminEnv.operatorSecrets,
    nowMs: args.nowMs,
  });

  if (!verification.ok) return { status: "refused" };

  return {
    status: "authorized",
    ordinal: verification.ordinal,
    issuedAt: verification.issuedAt,
    expiresAt: verification.expiresAt,
  };
}
