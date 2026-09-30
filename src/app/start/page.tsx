import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

import { ScreeningForm } from "./screening-form";

/**
 * Screening route — Phase 3, step 2 of the public sequence.
 *
 * A Server Component with no database, network, or session dependency. It holds no
 * interactive state; the only client island is `ScreeningForm`. That keeps the
 * privileged repository out of the client module graph by construction, and it is
 * why `application-foundation`'s "renders without a database" property still holds
 * for this route even though submitting it does need one.
 *
 * The participation and privacy notice is rendered HERE, on the same screen as the
 * question, and ABOVE it. A notice a participant can reach without having read the
 * introduction is not a notice; a notice they can answer past without reading is not
 * one either. Position is what makes that true rather than merely intended, and the
 * order is asserted by a test comparing the byte offset of the notice against the
 * first submit control.
 */
export const metadata: Metadata = {
  title: "Screening",
  description:
    "One question about your Ilocano comfort, and nothing about you is collected. No name, " +
    "no email, no account.",
};

export default function StartPage() {
  return (
    <>
      <header className="border-ink bg-paper-raised border-b-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="label-meta text-ink">
            <span className="text-accent">●</span> Sadino
            <span className="text-ink-faint"> / step 2 of 3</span>
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <section className="section-y flex flex-col gap-6">
          <div>
            <h1 className="text-title">Before you start</h1>
            <p className="text-lead text-ink-muted mt-3 max-w-2xl">
              One question about your Ilocano. It is background information for the research record
              — it is not a score, and it does not change what you are asked to do. You can continue
              without answering it.
            </p>
          </div>

          {/*
            Rendered ABOVE the form, deliberately. An earlier version put the form first
            and a comment claimed the notice was "impossible to submit without having
            seen" - which was false, because the Continue button sat above it. A
            participant could answer and submit having read nothing at all. Moving the
            notice above the question is what makes the claim true rather than merely
            intended, and it is why the card is labelled "Before you answer".

            Every statement here is a promise the platform must keep, which is why each
            one is asserted by a test rather than left as copy that only a reviewer reads.
          */}
          <Card tone="inset" className="flex flex-col gap-4 p-6">
            <p className="label-meta text-accent">Before you answer</p>
            <ul className="text-small text-ink flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>
                  Taking part is voluntary. You can stop at any point, including on this screen, and
                  close the tab — nothing is saved unless you press Continue.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>
                  We do not ask for your name, your email, your student number, or your phone
                  number, and there is no field on any screen where you could enter one.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>
                  Your identity is a random code. A copy is kept in this browser so we can recognise
                  you when you return, and the code is stored in the study database with your
                  answers, where it cannot be traced back to you either way. Clearing your browser
                  data ends our ability to recognise you.
                </span>
              </li>
            </ul>
          </Card>

          <Card tone="raised" className="flex flex-col gap-2 p-6">
            <ScreeningForm />
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
