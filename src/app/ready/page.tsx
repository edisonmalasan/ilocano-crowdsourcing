import type { Metadata } from "next";

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
 */
export const metadata: Metadata = {
  title: "You are set",
  description: "Your anonymous validator identity is ready. Sentences arrive in the next phase.",
};

/**
 * Rendered as a static page with no database, network, or session dependency.
 *
 * The enrollment already happened inside the Server Action that navigated here, so
 * re-reading the profile would add a database round trip and a second source of
 * truth for the same fact. The redirect is the confirmation.
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
          <Badge tone="ok">Validator ready</Badge>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <section className="section-y flex flex-col gap-6">
          <div>
            <h1 className="text-title">You are set</h1>
            <p className="text-lead text-ink-muted mt-3 max-w-2xl">
              Your anonymous validator identity is saved. Nothing identifying was collected, and
              there is no account to manage.
            </p>
          </div>

          <Card tone="raised" className="flex flex-col gap-4 p-6">
            <p className="label-meta text-accent">What just happened</p>
            <ul className="text-small text-ink flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>
                  A random code was generated for you and saved to the database. It is not derived
                  from anything about you.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>
                  A copy of that code was kept in this browser only, so you can be recognised when
                  you come back.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>
                  Your answer to the Ilocano question was stored as background information, as you
                  gave it. If you continued from a browser that already held an identity, the answer
                  you had given earlier was kept instead.
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
          <Card tone="inset" className="flex flex-col gap-3 p-6">
            <p className="label-meta text-ink-muted">What happens next</p>
            <p className="text-small text-ink-muted">
              Receiving sentences is the next part of the study and is not switched on yet. When it
              is, this browser will be recognised and you will be given ten Ilocano navigation
              sentences to check. You will not be asked to screen again.
            </p>
            <p className="text-small text-ink-muted">
              Until then, nothing is required of you. Closing this tab is a complete and legitimate
              way to finish.
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
