import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { serverNowMs } from "@/lib/admin/clock";
import { readResearcherSessionCookie } from "@/lib/admin/cookie";
import { getAdminEnv } from "@/lib/admin/env";
import { resolveResearcherAccess } from "@/lib/admin/guard";

/**
 * The authorization boundary for the researcher area.
 *
 * ============================================================================
 * WHY A LAYOUT, AND WHY A ROUTE GROUP
 * ============================================================================
 * Every route beneath this layout is covered by the guard whether or not its author remembered to
 * call it. A per-page check is the opposite: it is one line per page, so a new page is unprotected
 * until someone remembers, and nothing in the type system or the build says so. That failure mode —
 * protected by omission rather than by remembering — is the one D6 chose this layout to prevent.
 *
 * The group is `(protected)` because the sign-in page must sit OUTSIDE it. It has to be reachable by
 * a request carrying no session, which means a guard at the `/researcher` segment root would refuse
 * the one page through which a session is obtained. So the protected surface is its own group, and
 * `tests/unit/admin-guard.test.ts` enumerates the group's files and asserts every one of them sits
 * beneath this layout.
 *
 * ============================================================================
 * WHY THE CHECK RUNS HERE AND NOT IN MIDDLEWARE
 * ============================================================================
 * D6 records the reasoning; the short form is that a middleware guard cannot `import "server-only"`,
 * so the boundary that makes the rest of this architecture enforceable would become the one part of
 * it enforced by convention. This module CAN import it, and does — `getAdminEnv` and
 * `readResearcherSessionCookie` both carry the marker.
 *
 * It also happens to be the right place for the STATUS CODE. `forbidden()` returns a real 403
 * because the check runs during the render that precedes the page's own streaming, and the docs note
 * that a check deferred into a `<Suspense>` boundary cannot change a status that has already begun
 * streaming. There is no Suspense boundary here, deliberately.
 */
export const metadata: Metadata = {
  // Restated even though `src/app/researcher/layout.tsx` already declares it for the segment. The
  // duplication is the point: if the segment layout is ever split or the route group is moved, this
  // route keeps its own noindex rather than inheriting one that may no longer cover it.
  robots: { index: false, follow: false, nocache: true },
};

export default async function ProtectedResearcherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = resolveResearcherAccess({
    presented: await readResearcherSessionCookie(),
    // `null` when the deployment has no operator credential set — which is the shipped default in
    // `.env.example`, where both admin variables are deliberately empty. That is a refusal, not an
    // error: a fresh deployment must refuse cleanly rather than fail the request.
    adminEnv: getAdminEnv(),
    nowMs: serverNowMs(),
  });

  // Throws. The return type of `forbidden()` is `never`, so there is no path past this line for a
  // refused request — and no `catch` anywhere in this module could suppress it, which is why none
  // exists.
  if (access.status === "refused") forbidden();

  return children;
}
