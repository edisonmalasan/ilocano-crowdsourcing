import Link from "next/link";

import { linkButtonClasses } from "@/components/ui/button";
import { RESEARCHER_REFUSAL_MESSAGE } from "@/lib/admin/guard";
import { RESEARCHER_SIGN_IN } from "@/lib/admin/routes";
import { Card, CardBody } from "@/components/ui/card";

/**
 * The researcher area's refusal surface, rendered in place of every protected route.
 *
 * ============================================================================
 * WHY IT TAKES NO PROPS
 * ============================================================================
 * The hardest requirement in this change is "a refusal does not disclose that the requested record
 * exists": the response for a dataset entry that does not exist must be indistinguishable from the
 * response for one that does. The way to guarantee that is to make it structurally impossible for
 * the two to differ — this component takes NO PROPS. There is no entry identifier, no path, no
 * validator identifier, no figure, no count, and no refusal reason available to it to render.
 *
 * A refusal built from the request would have to remain correct about not disclosing in every future
 * edit. This one cannot disclose it, because it has nothing to disclose it with. That is a stronger
 * property than a passing test and it is the reason the file has no parameters.
 *
 * The one action it offers points at sign-in, which cannot grant access by itself. It deliberately
 * does not offer a retry: retrying a session that failed to verify is a loop, and it does not name
 * which of the session's possible faults occurred.
 */
export default function ResearcherForbidden() {
  return (
    // `id="main"` because the ROOT layout renders the skip link as its first focusable element and
    // points it at `#main`. A page without that target is a page whose skip link does nothing —
    // and this is the one page in the area a keyboard user might most plausibly land on, having
    // followed a stale bookmark.
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
      {/*
        The `h1` sits OUTSIDE the Card rather than in a `CardTitle`, because `CardTitle` renders an
        `h3` unconditionally. A refusal page whose only heading is an `h3` has no top-level heading at
        all, which is the same accessibility defect the validator screens are written to avoid.
      */}
      <h1 className="text-title mb-6">Not available</h1>
      <Card>
        <CardBody>
          <p className="text-body text-ink">{RESEARCHER_REFUSAL_MESSAGE}</p>
          <p className="mt-5">
            <Link href={RESEARCHER_SIGN_IN} className={linkButtonClasses()}>
              Go to the researcher sign-in
            </Link>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
