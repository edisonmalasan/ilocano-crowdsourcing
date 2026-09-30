import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { linkButtonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResumeValidator } from "@/components/onboarding/resume-validator";

/**
 * Landing / introduction.
 *
 * The start action hands off to `/start`, the screening route. It was deliberately inert in the
 * application-shell phase rather than linking to a route that did not exist; `landing-and-screening`
 * replaced that notice with the real hand-off and left the introduction copy below untouched.
 *
 * This route still has no database, network, or session dependency, which is what the
 * `application-foundation` spec requires of the shell. The route a visitor reaches by following the
 * link is a different question: that one writes.
 */

const PANELS = [
  {
    label: "The task",
    title: "Ten sentences at a time",
    body: "You will see a short Ilocano navigation instruction together with the place it is meant to describe. You decide whether the sentence says what it is supposed to say, and you fix it when it does not.",
  },
  {
    label: "The ask",
    title: "One question about you",
    body: "We ask how comfortable you are with Ilocano. That is background information for the research record. It is not a score, and it does not change what you are asked to do.",
  },
  {
    label: "What we keep",
    title: "Your judgment, not your identity",
    body: "We store the entry, your evaluation, any correction you write, and an optional translation. We do not ask for your name, your email, your student number, or your phone.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <header className="border-ink bg-paper-raised border-b-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="label-meta text-ink">
            <span className="text-accent">●</span> Sadino
            <span className="text-ink-faint"> / validation study</span>
          </p>
          <Badge tone="neutral">Ilocano · navigation data</Badge>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero ---------------------------------------------------------- */}
        <section className="section-y border-ink flex flex-col gap-6 border-b-2 pb-10">
          <Badge tone="accent" className="self-start">
            Researchers wanted
          </Badge>

          <h1 className="text-display max-w-3xl">
            Check the Ilocano.
            <br />
            Fix what&rsquo;s off.
          </h1>

          <p className="text-lead text-ink-muted max-w-2xl">
            Sadino is a thesis dataset for Ilocano local navigation. It was written by a machine.
            You are the part of the process that makes it trustworthy: you read a sentence, judge
            whether it says what it should, and correct it when it does not.
          </p>

          {/*
            A real link, not a button: it navigates, so it must be an anchor. Keyboard
            and screen-reader users get link semantics and middle-click / open-in-new-tab
            for free, which a button styled as a link would silently take away.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/start" className={linkButtonClasses({ size: "lg" })}>
              Start validation
            </Link>
            <p className="text-small text-ink-faint font-semibold">
              Two steps: one question about your Ilocano, then you begin.
            </p>
          </div>

          {/*
            The client island on this route. `/` still renders with no database, network, or
            session dependency — this component only reads browser-local storage, and only
            when the participant presses it.
          */}
          <div className="max-w-md">
            <ResumeValidator />
          </div>
        </section>

        {/* Panels ------------------------------------------------------- */}
        <section className="section-y" aria-labelledby="what-to-expect">
          <h2 id="what-to-expect" className="text-title">
            What to expect
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
            {PANELS.map((panel) => (
              <Card key={panel.label} as="article" className="flex flex-col gap-3">
                <p className="label-meta text-accent">{panel.label}</p>
                <h3 className="text-heading">{panel.title}</h3>
                <p className="text-small text-ink-muted">{panel.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Notice ------------------------------------------------------- */}
        <section className="section-y pt-0" aria-labelledby="before-you-start">
          <h2 id="before-you-start" className="text-title">
            Before you start
          </h2>

          <Card tone="accent" className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-[1fr_2fr]">
            <p className="label-meta text-accent">Please read</p>
            <ul className="text-small text-ink md:text-lead flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>
                  Taking part is voluntary. You can stop after any batch, and nothing you have
                  already submitted is taken back.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>
                  You will never see the same sentence twice, and you will stop being offered
                  sentences once enough other people have checked them.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>
                  If a sentence is wrong, we would rather have your version of it than a
                  conversation about it. Write it the way you would actually say it.
                </span>
              </li>
            </ul>
          </Card>
        </section>
      </main>

      <footer className="border-ink bg-paper-raised border-t-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <p className="label-meta text-ink-faint">Sadino · Ilocano navigation research</p>
          <p className="text-small text-ink-muted">
            No accounts. No name, no email, no student number.
          </p>
        </div>
      </footer>
    </>
  );
}
