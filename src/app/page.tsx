import { Card } from "@/components/ui/card";
import { LandingAction } from "@/components/onboarding/resume-validator";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";

/**
 * Landing / introduction.
 *
 * The start action hands off to `/start`, the screening route. It was deliberately inert in the
 * application-shell phase rather than linking to a route that did not exist; `landing-and-screening`
 * replaced that notice with the real hand-off and left the introduction copy below untouched.
 *
 * This route has no database or network dependency, which is what the `application-foundation`
 * spec requires of the shell. The route a visitor reaches by following the link is a different
 * question: that one writes.
 *
 * "No session dependency" was the phrasing here until `interface-localization`, and it is no longer
 * accurate, so it is corrected rather than quietly left. This route now READS the interface-locale
 * cookie, because `<html lang>` and this page's own copy have to be right on the first paint rather
 * than after a hydration effect. A cookie is per-browser state the server can observe, which is
 * exactly what "session dependency" meant, and it is why `pnpm run build` now reports this route as
 * `ƒ (Dynamic)` instead of static. What has NOT changed, and what the spec actually requires, is the
 * absence of a database and of any network call.
 *
 * ============================================================================
 * LOCALIZED, AND THE ONE THING ON THIS PAGE THAT IS NOT
 * ============================================================================
 * Every human-readable string below comes from the copy catalog, and nothing else does. The locale is
 * read from the cookie on the server, so the first paint is already in the right language - there is
 * no client round trip that could render English and then swap it.
 *
 * `Sadino` and `Ilocano` are deliberately NOT catalog keys. They are a project name and a language
 * name, and the first is a proper noun the study is published under. The rest of the page's copy -
 * including the badge that names the dataset - is localized, so the line reads
 * "Ilocano · datos ng nabigasyon" in Filipino rather than being left in English as though only the
 * English half of the page had been translated.
 *
 * The `●` and the `01`/`02`/`03` markers are decoration with `aria-hidden`, not copy: they are
 * identical in both languages, and a catalog key that could not differ would be a key exempt from
 * the exhaustiveness check for no benefit.
 *
 * The panels are built from the translator rather than declared as a module-level constant, because
 * they are localized copy. A module-level `const PANELS = [...]` cannot be - the strings would be
 * resolved at import time, in whichever locale happened to build the module, for every request in the
 * process. That is not a style preference: it is a module that serves every language in its first
 * language.
 */

export default async function HomePage() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  const panels = [
    {
      label: t("landing.panel.task.label"),
      title: t("landing.panel.task.title"),
      body: t("landing.panel.task.body"),
    },
    {
      label: t("landing.panel.ask.label"),
      title: t("landing.panel.ask.title"),
      body: t("landing.panel.ask.body"),
    },
    {
      label: t("landing.panel.keep.label"),
      title: t("landing.panel.keep.title"),
      body: t("landing.panel.keep.body"),
    },
  ];

  return (
    <>
      <main id="main" className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero ---------------------------------------------------------- */}
        <section className="section-y border-ink flex flex-col gap-6 border-b-2 pb-10">
          <h1 className="text-display max-w-3xl">
            {t("landing.hero.title1")}
            <br />
            {t("landing.hero.title2")}
          </h1>

          <p className="text-lead text-ink-muted max-w-2xl">{t("landing.hero.lead")}</p>

          {/*
            The single entry action. A button island rather than a link, because
            where it goes depends on what this browser holds: a recognised
            attempt continues into validation, while anything else starts at
            the screening question. The island reads storage only at press time
            (and for its label after hydration), and the server re-checks.
          */}
          <LandingAction locale={locale} />
        </section>

        {/* Panels ------------------------------------------------------- */}
        <section className="section-y" aria-labelledby="what-to-expect">
          <h2 id="what-to-expect" className="text-title">
            {t("landing.expectations.heading")}
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
            {panels.map((panel) => (
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
            {t("common.beforeYouStart")}
          </h2>

          <Card tone="accent" className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-[1fr_2fr]">
            <p className="label-meta text-accent">{t("landing.before.label")}</p>
            <ul className="text-small text-ink md:text-lead flex flex-col gap-3">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  01
                </span>
                <span>{t("landing.before.item1")}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  02
                </span>
                <span>{t("landing.before.item2")}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-accent">
                  03
                </span>
                <span>{t("landing.before.item3")}</span>
              </li>
            </ul>
          </Card>
        </section>
      </main>
    </>
  );
}
