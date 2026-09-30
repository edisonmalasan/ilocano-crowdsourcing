import type { Metadata } from "next";
import Link from "next/link";

import { linkButtonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";

/**
 * The not-found page.
 *
 * ============================================================================
 * WHY IT IS LOCALIZED LIKE ANY OTHER PAGE
 * ============================================================================
 * It is one of the four public surfaces, and a participant who has chosen Filipino and then followed
 * a stale link would otherwise be told, in English, that the page is missing. That is also the one
 * place where losing the language is most confusing rather than merely inconsistent.
 *
 * It has no header of its own, which is precisely why the language switcher is rendered by the root
 * layout rather than by each page: this page is the reachable case that proves the switcher is
 * structural. Someone who lands here can still change the language and go back to the start.
 *
 * `Error 404` is left as a literal. It is a code, identical in both languages and identical to what
 * the participant typed in the address bar, so a catalog key for it could not differ and translating
 * it would make the error harder to match against what was requested.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = translatorFor(await getInterfaceLocale());

  return { title: t("notFound.meta.title") };
}

export default async function NotFound() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center gap-6 px-5 py-16 sm:px-8"
    >
      <p className="label-meta text-accent">Error 404</p>
      <h1 className="text-title">{t("notFound.title")}</h1>

      <Card>
        <p className="text-small text-ink-muted">{t("notFound.body")}</p>
        <div className="mt-5">
          {/* A real link, not a disabled button: it navigates and it takes Enter. */}
          <Link href="/" className={linkButtonClasses()}>
            {t("notFound.cta")}
          </Link>
        </div>
      </Card>
    </main>
  );
}
