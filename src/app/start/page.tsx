import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";

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
 *
 * ============================================================================
 * LOCALIZED, AND THE ORDERING THE NOTICE DEPENDS ON IS UNCHANGED
 * ============================================================================
 * The notice above the question is what makes the privacy promise enforceable rather than
 * intended, and localization does not touch that ordering. It is asserted by BYTE OFFSET, so a
 * reflow that put the Filipino notice below the question would go red - which is the point: the
 * promises in that card are ethics-relevant, and ethics-relevant content must not be the thing a
 * translation change quietly moved.
 *
 * The document title and description are produced by a function, because they are interface copy
 * and a static export would be English for a participant who had chosen Filipino. The page body
 * reads the same cookie the metadata does, so the title and the question can never disagree about
 * the language.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = translatorFor(await getInterfaceLocale());

  return {
    title: t("start.meta.title"),
    description: t("start.meta.description"),
  };
}

export default async function StartPage() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  return (
    <>
      <header className="border-ink bg-paper-raised border-b-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="label-meta text-ink">
            <span className="text-accent">●</span> Sadino
            <span className="text-ink-faint"> / {t("start.header.step")}</span>
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <section className="section-y flex flex-col gap-6">
          <div>
            <h1 className="text-title">{t("common.beforeYouStart")}</h1>
            <p className="text-lead text-ink-muted mt-3 max-w-2xl">{t("start.lead")}</p>
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
            <p className="label-meta text-accent">{t("start.beforeAnswer.label")}</p>
            <ul className="text-small text-ink flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>{t("start.beforeAnswer.item1")}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>{t("start.beforeAnswer.item2")}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>{t("start.beforeAnswer.item3")}</span>
              </li>
            </ul>
          </Card>

          <Card tone="raised" className="flex flex-col gap-2 p-6">
            <ScreeningForm locale={locale} />
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
