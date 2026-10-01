import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/app/researcher/sign-in/sign-in-form";
import { linkButtonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { serverNowMs } from "@/lib/admin/clock";
import { readResearcherSessionCookie } from "@/lib/admin/cookie";
import { getAdminEnv } from "@/lib/admin/env";
import { resolveResearcherAccess } from "@/lib/admin/guard";
import { RESEARCHER_HOME } from "@/lib/admin/routes";

/**
 * The researcher sign-in surface.
 *
 * ============================================================================
 * IT IS OUTSIDE THE GUARDED ROUTE GROUP, AND THAT IS WHY IT EXISTS HERE
 * ============================================================================
 * `src/app/researcher/(protected)/layout.tsx` refuses every request without a verified session, and
 * this page must be reachable by exactly that request. So it sits beside the guarded group rather
 * than inside it, and the sign-in route is the one route in the area a session is not required for.
 *
 * That is the whole reason `/researcher/sign-in` is not nested under `(protected)`, and it is worth
 * stating because the alternative — guarding the sign-in page too — is the shape that produces an
 * area nobody can enter.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT DISCLOSE
 * ============================================================================
 * It does not say whether this deployment is configured. An unconfigured deployment and a
 * configured one render the same form, and submitting to either produces the same refusal. A page
 * that said "this deployment has no operator key configured" would hand an unauthenticated requester
 * a fact about the operator's setup, and the spec forbids exactly that.
 *
 * It is also deliberately NOT localized. The interface locale belongs to the public validator
 * experience, and the researcher area is a different tool for a different reader; a Filipino
 * interface here would also sit beside proficiency screening in the same browser profile, which is
 * precisely the adjacency this project refuses to create. Keeping these strings out of
 * `@/lib/i18n/copy` also keeps that catalog's research-boundary guards meaningful — it holds the
 * public experience's words and nothing else.
 */
export default async function ResearcherSignInPage() {
  // Already authorized: send them on rather than letting them sign in twice. This reads the SAME
  // guard every protected route does, so there is no second definition of "authorized" here.
  const access = resolveResearcherAccess({
    presented: await readResearcherSessionCookie(),
    adminEnv: getAdminEnv(),
    nowMs: serverNowMs(),
  });
  if (access.status === "authorized") redirect(RESEARCHER_HOME);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
      <h1 className="text-title mb-6">Researcher sign-in</h1>
      <Card>
        <CardBody>
          <p className="text-small text-ink-muted mb-6">
            This area is for members of the research team. Access is decided by an operator access
            key configured on the server; nothing about you is recorded here.
          </p>
          <SignInForm />
          <p className="text-small text-ink-faint mt-6">
            <Link href="/" className={linkButtonClasses()}>
              Back to the validation site
            </Link>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
