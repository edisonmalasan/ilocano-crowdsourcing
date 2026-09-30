import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * Enrollment confirmation — Phase 3, step 3 of the public sequence.
 *
 * This route confirms ONE thing: the anonymous validator profile was persisted.
 * It renders no identifier, no proficiency, no counters, and no timestamps, because
 * a confirmation screen that echoes a stored profile is a screen that has to be
 * kept correct as the profile changes, and none of it helps the participant.
 *
 * It deliberately does NOT link to a batch route. Allocation is Phase 4, so there
 * is nothing to link to yet. An honest dead end that says what is coming is better
 * than a link to a 404, and better than a screen implying a batch is one click away
 * when it is not implemented.
 *
 * It DOES link back to `/start`. The original reason it linked nowhere — "so it cannot
 * link to a route that does not exist" — was satisfied trivially by having no links, and
 * it turned a dangling-link test into a guarantee of a dead end. `/start` does exist, so
 * linking to it costs nothing and gives a visitor who reached this route directly the one
 * thing they were missing: a way to answer the question that creates an identity.
 */
export const metadata: Metadata = {
  title: "Before you begin",
  description:
    "What happens when you start validating, and what is kept. Sentences arrive in the next phase.",
};

/**
 * Rendered as a static page with no database, network, or session dependency.
 *
 * WHY THIS PAGE MAKES NO CLAIM ABOUT WHAT ALREADY HAPPENED
 * --------------------------------------------------------
 * An earlier version of this route assumed what the reviewer proved false: its header
 * said "the enrollment already happened inside the Server Action that navigated here".
 * It did not *always* have. There is no `middleware.ts` in this project and this route
 * has no session dependency, so anyone who typed `/ready`, followed a stale bookmark,
 * or arrived from a shared link got a page stating "A random code was generated for you
 * and saved to the database" and "A copy of that code was kept in this browser only".
 * None of that had happened. They left believing they were enrolled, and their
 * screening answer had never been collected.
 *
 * Two fixes were available and this is the second.
 *
 * GATING was the richer one: set an anonymous presence flag at enrollment and redirect
 * here without it. It was rejected on the merits, not on effort. The flag would have to
 * be a cookie, because `middleware` cannot read `localStorage` - which means inventing
 * the first piece of server-observable per-browser state in this project and reopening
 * D2's premise, which is that the server cannot know who a browser is at render time. It
 * also fails badly when cookies are blocked: the participant enrolls, is bounced back to
 * `/start`, is recognised by the resume round trip, returns here, and is bounced again.
 * An infinite loop, on a reachable and ordinary browser configuration.
 *
 * A client island reading the stored identifier has no cookie failure mode, but it has
 * an unavoidable one of its own: the server cannot read `localStorage`, so its first
 * render has to be the safe variant and the confirmation appears one frame later. Every
 * participant who legitimately just enrolled would see "you have not started" flash
 * first. There is no browser in this project, so that behaviour could not be verified
 * here - only asserted.
 *
 * SOFTENING THE COPY is what this route does. Every sentence below is true whether or
 * not an enrollment has happened, so the page is correct for every visitor who can reach
 * it, with no new mechanism, no new state, no hydration question, and no dependence on a
 * DOM this project does not have. The confirmation is weaker: it explains the scheme
 * rather than attesting that it ran. That is the honest trade, and it is recorded in
 * `tasks.md` as the reason, with gating named as the correct long-term answer if the
 * study later needs an attestation this page cannot make.
 *
 * The reassuring content is deliberately preserved. "Nothing identifying was collected",
 * "kept with your validator identity", and "not derived from anything about you" are the
 * ethics-relevant parts of this page, and every one of them is unconditionally true.
 */
export default function ReadyPage() {
  return (
    <>
      <header className="border-ink bg-paper-raised border-b-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="label-meta text-ink">
            <span className="text-accent">●</span> Sadino
            <span className="text-ink-faint"> / step 3 of 3</span>
          </p>
          <Badge tone="neutral">How this works</Badge>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <section className="section-y flex flex-col gap-6">
          <div>
            <h1 className="text-title">Before you begin</h1>
            <p className="text-lead text-ink-muted mt-3 max-w-2xl">
              Nothing identifying was collected, and there is no account to manage. Here is what
              happens when you start.
            </p>
          </div>

          <Card tone="raised" className="flex flex-col gap-4 p-6">
            <p className="label-meta text-accent">What happens when you start</p>
            <ul className="text-small text-ink flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>
                  A random code is generated for you and saved to the database. It is not derived
                  from anything about you.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>
                  A copy of that code is kept in this browser only, so you can be recognised when
                  you come back.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>
                  The answer you give to the Ilocano question is kept with your validator identity
                  as background information. If you chose to skip it, nothing was recorded in its
                  place. If this browser already held an identity, the answer already stored with it
                  is the one that was kept.
                </span>
              </li>
            </ul>
          </Card>

          {/*
            An honest statement about what is NOT here yet. Allocation and the
            ten-sentence batch are Phase 4; saying so is part of the deliverable
            rather than an apology for it, because a participant who expects
            sentences and gets none will assume the platform is broken.
          */}
          {/*
            A way in, for the visitor who reached this route without going through the
            screening question.

            This page used to contain no link at all, which had a stated reason: a test
            asserted "no internal href whatsoever, so it cannot link to a route that does not
            exist". That test passed trivially - a page with zero links cannot contain a
            dangling one - and in doing so it guaranteed a dead end. Someone who typed
            `/ready` was told "nothing is required of you... closing this tab is a complete
            and legitimate way to finish" and was never told they had not started.

            So softening the copy was not sufficient on its own. The claim that they may
            finish presupposes a start, and the route has to offer one. `/start` is the
            screening question, it exists, and it is the correct destination for someone with
            no enrollment: the resume check inside it means a participant who *did* answer
            and simply arrived here directly is recognised rather than asked again.

            Placed here, immediately after the three items it qualifies, rather than further
            down. The alternative reads badly for the participant who just answered the
            question: they were told they could close the tab and finish, and only afterwards
            found a card telling them how to begin. The section is deliberately conditional,
            so for them it reads as a fallback they can ignore.

            The link test now asserts the exact set of internal hrefs against routes that
            exist, which serves that test's original stated purpose directly instead of
            achieving it as a side effect of having no links at all.
          */}
          <Card tone="raised" className="flex flex-col gap-4 p-6">
            <p className="label-meta text-accent">If you have not started yet</p>
            <p className="text-small text-ink-muted">
              Reaching this page does not mean you answered the Ilocano question. That question is
              what creates your validator identity, and there is no way to create one from this
              page.
            </p>
            <Link
              href="/start"
              className="border-ink bg-accent text-paper border-accent-press hover:bg-accent-press rounded-pill text-label inline-flex w-fit items-center gap-2 border-2 px-5 py-3"
            >
              Go to the Ilocano question
            </Link>
          </Card>

          <Card tone="inset" className="flex flex-col gap-3 p-6">
            <p className="label-meta text-ink-muted">What happens next</p>
            <p className="text-small text-ink-muted">
              Receiving sentences is the next part of the study and is not switched on yet. When it
              is, this browser will be recognised as the same validator and you will be given ten
              Ilocano navigation sentences to check. Coming back to this browser will not replace
              your screening answer.
            </p>
            <p className="text-small text-ink-muted">
              Until then, nothing is required of you. If you have already answered the Ilocano
              question in this browser, closing this tab is a complete and legitimate way to finish.
            </p>
          </Card>

          <Card tone="inset" className="flex flex-col gap-3 p-6">
            <p className="label-meta text-ink-muted">If you want to stop</p>
            <p className="text-small text-ink-muted">
              Clearing this browser&apos;s site data removes the code that links you to your
              validator identity. Because the code is the only link, that is permanent: you would
              begin again as a new anonymous validator, and your earlier answers would remain in the
              research record under the old identity.
            </p>
          </Card>
        </section>
      </main>

      <footer className="border-ink bg-paper-raised border-t-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <p className="label-meta text-ink-faint">Sadino · Ilocano navigation research</p>
          <p className="text-small text-ink-muted">No accounts. Nothing identifying.</p>
        </div>
      </footer>
    </>
  );
}
