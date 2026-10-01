import { SignOutButton } from "@/app/researcher/sign-out-button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * The researcher area's landing page.
 *
 * ============================================================================
 * IT RENDERS NO RESEARCH CONTENT, AND THAT IS THE POINT
 * ============================================================================
 * Reaching this component at all IS the assertion: the guarded layout above it refused every request
 * that did not carry a verified session, so rendering is proof of authorization and no further check
 * belongs here. Adding a second check on this page would be redundant in the ordinary case and
 * actively misleading — it would suggest the layout's refusal is not the boundary.
 *
 * There are no figures, no coverage counts, and no per-entry views, because dashboard views are an
 * explicit Non-Goal of the `researcher-admin-access` change. A page that showed placeholder zeroes
 * would be worse than one that says the views are not built: zeroes read as measurements, and a
 * researcher has no way to tell a placeholder from a real count.
 *
 * ============================================================================
 * WHY IT SAYS WHY, IN ONE SENTENCE
 * ============================================================================
 * This is the second time in this project a route has been justified by a comment claiming a
 * capability is absent — and the first time the ROADMAP listed the capability as upcoming while the
 * page linked nowhere without explanation. `src/app/ready/page.tsx` records that the earlier
 * sentence was false the moment `requestBatchAction` existed, and that a verification pass caught a
 * task ticked as having corrected it when it had not. So this page states the absence rather than
 * relying on a reader to infer it from an empty screen.
 */
export default function ResearcherHomePage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title">Researcher area</h1>
        <SignOutButton />
      </div>

      <Card>
        <CardBody>
          <p className="text-body text-ink">
            This request carried a session that verified, so it reached this page. No research
            content is served here yet.
          </p>
          <p className="text-small text-ink-muted mt-4">
            Coverage figures, per-entry review, and research exports are built in the changes that
            follow this one. This page exists to establish and to exercise the access boundary, and
            it deliberately shows no placeholder numbers: a zero on a research dashboard reads as a
            measurement.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
