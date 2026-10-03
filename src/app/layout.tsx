import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Public_Sans } from "next/font/google";

import "@/styles/globals.css";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";
import { changeInterfaceLocaleAction } from "@/lib/i18n/actions";

/**
 * Typography is loaded through `next/font` so the build self-hosts the files. Three faces, each
 * with one job, matching the design-system role assignment in `globals.css`:
 *
 * - `Archivo`          → display/headings. Heavy grotesque, tight tracking.
 * - `Public Sans`      → body. Legible at 16px on a phone, which is the only body size that ships.
 * - `JetBrains Mono`   → small-caps metadata labels only. Never prose.
 *
 * `display: "swap"` so text is readable immediately on a slow mobile connection — a validator on
 * a poor network must never stare at invisible text. Each face declares a local fallback stack
 * used before the webfont arrives, so a blocked font request degrades to a sane system face rather
 * than to a layout shift.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  fallback: ["ui-monospace", "Menlo", "monospace"],
});

/**
 * The document title and description, in the request's locale.
 *
 * A FUNCTION rather than a static `metadata` export, and that is forced by the feature rather than
 * chosen: the title is interface copy, so a static export would be English for a participant who
 * had chosen Filipino, and the tab title and the search snippet are the first thing a participant
 * reads. `getInterfaceLocale` reads the cookie on the server, so the first response already carries
 * the right title with no client round trip.
 *
 * The static `metadata` export is GONE rather than kept alongside this, because a field declared in
 * both places is ambiguous and Next.js resolves the conflict silently. `viewport` stays static below:
 * `themeColor` must be a literal string for Next.js to accept it, and `tests/unit/design-system.test.ts`
 * asserts it equals the `--color-paper` token.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = translatorFor(await getInterfaceLocale());

  return {
    title: {
      default: t("meta.siteTitle"),
      // The separator and the product name are the SAME in both languages, so they are literals
      // rather than two more catalog keys that could not differ.
      template: "%s · Sadino",
    },
    description: t("meta.siteDescription"),
    applicationName: "Sadino",
    // This is a research data-collection tool. It must not be indexed or archived by accident
    // while the protocol is still being pilot-validated.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled: disabling it would fail WCAG 1.4.4.
  maximumScale: 5,
  themeColor: "#f4efe4",
  colorScheme: "light",
};

/**
 * The root layout: resolves the interface locale ONCE and provides it to everything below.
 *
 * ============================================================================
 * WHY THIS READS A COOKIE, AND WHY THAT IS THE WHOLE POINT OF THE SWITCHER
 * ============================================================================
 * `localStorage` was the other option and it gives up exactly the thing that matters most here: the
 * server would have to render English and a client effect would swap it after hydration, so a
 * Filipino-preferring participant would watch the interface change language under them on every
 * navigation. Reading the cookie on the server means the first paint - including `<html lang>`, so
 * a screen reader pronounces Filipino with Filipino phonetics - is already correct.
 *
 * The cost is that every route becomes dynamic rather than statically prerendered, which is not a
 * cost at all for a page whose language depends on a per-browser preference: it could not have been
 * static in the first place.
 *
 * ============================================================================
 * WHY THE SWITCHER IS HERE AND NOT IN EACH PAGE
 * ============================================================================
 * The spec requires a language control on every public page. Rendering it here makes that structural
 * rather than a convention the pages have to remember - and it is the only way the not-found page
 * gets one, since that page deliberately has no header. This bar IS the pages' header chrome:
 * individual pages render no header of their own, so the brand and the switcher sit in the same
 * place on every page a participant visits.
 *
 * It is a `<div>` and not a second `<header>`, deliberately: the pages below render their own
 * headings, and nesting those inside another banner landmark would make the landmark structure
 * ambiguous for assistive technology.
 *
 * ============================================================================
 * WHY EACH PAGE READS THE COOKIE ITSELF, AND WHY THERE IS NO LOCALE CONTEXT
 * ============================================================================
 * An earlier version provided the locale through a React context and read it in each page with
 * `use`, on the theory that a synchronous page could not await `cookies()`. THE BUILD REJECTED IT:
 * `createContext` is a Client Components API, and a module in the Server Component graph that
 * imports it fails to compile with
 *
 *   You're importing a module that depends on `createContext` into a React Server Component module.
 *
 * So the pages are `async` Server Components that await `getInterfaceLocale()` themselves. Nothing is
 * lost by this and one thing is gained: the read is visibly a read. Each page names the source of
 * its language at the top of its own body, where a reviewer can see it, instead of inheriting an
 * invisible provider four levels up.
 *
 * The cost is that `renderToStaticMarkup` cannot render a page component directly, because it
 * cannot await one. The route tests therefore `await` the component and render the element it
 * returns. That is a mechanical change to the test helper and preserves every assertion.
 *
 * `cookies()` in this Next.js version is request-scoped and de-duplicated, so the layout and the
 * page each calling it is one read of the request's cookie jar, not two.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  return (
    <html
      lang={locale}
      className={`${archivo.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="paper-grain min-h-[100dvh] antialiased">
        {/*
          Skip link: first focusable element on every page, so a keyboard or screen-reader user
          can bypass the header straight to the main content. It stays ABOVE the language bar for
          exactly that reason - the bar added a second focusable control to the top of every page,
          and a skip link that is no longer first is a skip link that a keyboard user tabs past.
        */}
        <a
          href="#main"
          className="label-meta focus:rounded-control focus:border-ink focus:bg-paper-raised focus:shadow-brutal-sm sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border-2 focus:px-4 focus:py-3"
        >
          {t("skipToContent")}
        </a>

        {/*
          The single public bar: brand on the left, interface language on the
          right. It replaces the former two-piece chrome (a language bar above
          each page's own header), so every public screen carries exactly one
          bar and the switcher is structurally present on all of them —
          including the not-found page, which deliberately has no header of
          its own. It is a `<div>` and not a `<header>` landmark, because the
          pages below render their own headings and a second banner landmark
          would make the landmark structure ambiguous for assistive technology.
        */}
        <div className="border-ink bg-paper-raised border-b-2">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
            <p className="label-meta text-ink">
              <span aria-hidden="true" className="text-accent">
                ●
              </span>{" "}
              Sadino
            </p>
            <LocaleSwitcher locale={locale} action={changeInterfaceLocaleAction} />
          </div>
        </div>

        <div className="relative z-0">{children}</div>
      </body>
    </html>
  );
}
