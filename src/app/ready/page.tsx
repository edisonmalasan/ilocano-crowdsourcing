import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";

/**
 * Enrollment confirmation — Phase 3, step 3 of the public sequence.
 *
 * This route confirms ONE thing: the anonymous validator profile was persisted.
 * It renders no identifier, no proficiency, no counters, and no timestamps, because
 * a confirmation screen that echoes a stored profile is a screen that has to be
 * kept correct as the profile changes, and none of it helps the participant.
 *
 * It deliberately does NOT link to a BATCH route, and that is still true: `/validate/<batchId>`
 * needs a batch identifier, and a batch identifier does not exist until the server has chosen one.
 * An honest dead end that says what is coming is better than a link to a 404, and better than a
 * screen implying a batch is one click away when it is not implemented.
 *
 * This paragraph previously read "Allocation is Phase 4, so there is nothing to link to yet", and that
 * was false from the moment `requestBatchAction` existed and stayed false while this page linked
 * nowhere. It has been corrected here rather than left standing, because a comment asserting that a
 * capability is absent is a claim someone will believe — and the verification pass for Phase 5 caught
 * exactly that, on a task that was ticked as having corrected this very sentence and had not.
 *
 * It DOES link back to `/start`. The original reason it linked nowhere — "so it cannot
 * link to a route that does not exist" — was satisfied trivially by having no links, and
 * it turned a dangling-link test into a guarantee of a dead end. `/start` does exist, so
 * linking to it costs nothing and gives a visitor who reached this route directly the one
 * thing they were missing: a way to answer the question that creates an identity.
 *
 * ============================================================================
 * THE PAGE IS LOCALIZED, AND EVERY SENTENCE ON IT IS STILL UNCONDITIONALLY TRUE
 * ============================================================================
 * The reasoning below about not attesting to an enrollment that may not have happened is
 * unchanged by localization, and the properties it protects are properties of the FILIPINO text
 * just as much as the English. The Filipino rendering makes the same three claims and hedges in the
 * same places: `generateMetadata` exists because the document title is interface copy, and the page
 * body reads the same cookie, so the two can never describe the page in different languages.
 *
 * One thing is deliberately NOT localized here, and it is the most important thing on the page: the
 * locale is not evidence of anything. No sentence in either language says or implies that a
 * Filipino interface means anything about a participant, and nothing on this page is derived from
 * the locale. A test asserts the page still renders no proficiency value and no identifier.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = translatorFor(await getInterfaceLocale());

  return {
    // The page title and the page's own `h1` are the same approved string, so they share one
    // catalog key rather than two that could drift apart.
    title: t("ready.title"),
    description: t("ready.meta.description"),
  };
}

/**
 * Rendered as a page with no database or network dependency.
 *
 * It is NO LONGER a static page. `interface-localization` made it read the interface-locale cookie
 * so `<html lang>` and this page's copy are correct on the first paint, and `pnpm run build` now
 * reports `ƒ /ready`. The earlier "static page" phrasing was left in place by that change and is
 * corrected here: a cookie is per-browser server-observable state, which is what made the route
 * dynamic, and no database is involved at any point.
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
export default async function ReadyPage() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  return (
    <>
      <header className="border-ink bg-paper-raised border-b-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="label-meta text-ink">
            <span className="text-accent">●</span> Sadino
            <span className="text-ink-faint"> / {t("ready.header.step")}</span>
          </p>
          <Badge tone="neutral">{t("ready.badge")}</Badge>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <section className="section-y flex flex-col gap-6">
          <div>
            <h1 className="text-title">{t("ready.title")}</h1>
            <p className="text-lead text-ink-muted mt-3 max-w-2xl">{t("ready.lead")}</p>
          </div>

          <Card tone="raised" className="flex flex-col gap-4 p-6">
            <p className="label-meta text-accent">{t("ready.starting.label")}</p>
            <ul className="text-small text-ink flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>{t("ready.starting.item1")}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>{t("ready.starting.item2")}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>{t("ready.starting.item3")}</span>
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
            no enrollment: the submit-time resume check inside it recognises a participant who
            *did* answer, so their stored identity and their original screening answer are
            restored rather than replaced.

            That last sentence was originally written as "recognised rather than asked again",
            which is FALSE and contradicts the D2 amendment this change carries: a participant
            who navigates directly to `/start` **does** see the screening question again. What
            the resume check guarantees is that their original answer survives and is not
            overwritten. A returning participant sees the question, answers it, and the stored
            answer is preserved - which is a weaker and quite different promise, and stating the
            stronger one here would have been the same mistake this route was repaired for.

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
            <p className="label-meta text-accent">{t("ready.notStarted.label")}</p>
            <p className="text-small text-ink-muted">{t("ready.notStarted.body")}</p>
            <Link
              href="/start"
              className="border-ink bg-accent text-paper border-accent-press hover:bg-accent-press rounded-pill text-label inline-flex w-fit items-center gap-2 border-2 px-5 py-3"
            >
              {t("ready.notStarted.cta")}
            </Link>
          </Card>

          <Card tone="inset" className="flex flex-col gap-3 p-6">
            <p className="label-meta text-ink-muted">{t("ready.next.label")}</p>
            <p className="text-small text-ink-muted">{t("ready.next.body1")}</p>
            <p className="text-small text-ink-muted">{t("ready.next.body2")}</p>
          </Card>

          {/*
            THE ONWARD PATH, added by the validation-experience change.

            This section previously said the next part of the study "is not switched on yet" and
            told the participant that closing the tab was a complete and legitimate way to finish.
            Both statements became FALSE the moment `requestBatchAction` existed, and the module
            header's claim that "Allocation is Phase 4, so there is nothing to link to yet" was
            already false. A confirmation page that describes a state the product is no longer in is
            worse than no page: it is a page that tells a participant who came here to work that
            there is nothing for them to do.

            The destination is `/validate` and NOT `/validate/<batchId>`, because a batch
            identifier does not exist until the server has chosen one. `/validate` asks for a batch
            and then navigates, so this link has a real target that exists in the repository, and the
            href test can assert against routes rather than against a wish.

            The link is placed after the "not started yet" card rather than replacing it, because the
            two address different visitors: `/start` is for a browser that has not answered the
            screening question, and this is for one that has. Both remain reachable, and the exact
            internal href set is asserted by `tests/unit/onboarding-routes.test.tsx`.
          */}
          <Card tone="raised" className="flex flex-col gap-4 p-6">
            <p className="label-meta text-accent">{t("ready.begin.label")}</p>
            <p className="text-small text-ink-muted">{t("ready.begin.body")}</p>
            <Link
              href="/validate"
              className="border-ink bg-accent text-paper border-accent-press hover:bg-accent-press rounded-pill text-label inline-flex w-fit items-center gap-2 border-2 px-5 py-3"
            >
              {t("ready.begin.cta")}
            </Link>
          </Card>

          <Card tone="inset" className="flex flex-col gap-3 p-6">
            <p className="label-meta text-ink-muted">{t("ready.stop.label")}</p>
            <p className="text-small text-ink-muted">{t("ready.stop.body")}</p>
          </Card>
        </section>
      </main>

      <footer className="border-ink bg-paper-raised border-t-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <p className="label-meta text-ink-faint">{t("common.footer.research")}</p>
          <p className="text-small text-ink-muted">{t("common.footer.noAccounts")}</p>
        </div>
      </footer>
    </>
  );
}
