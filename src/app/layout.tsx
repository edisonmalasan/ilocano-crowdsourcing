import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Public_Sans } from "next/font/google";

import "@/styles/globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "Sadino — validate Ilocano navigation data",
    template: "%s · Sadino",
  },
  description:
    "Help check Ilocano navigation instructions for the Sadino research project. Ten short " +
    "sentences at a time. No name, no email, no account.",
  applicationName: "Sadino",
  // This is a research data-collection tool. It must not be indexed or archived by accident
  // while the protocol is still being pilot-validated.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled: disabling it would fail WCAG 1.4.4.
  maximumScale: 5,
  themeColor: "#f4efe4",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="paper-grain min-h-[100dvh] antialiased">
        {/*
          Skip link: first focusable element on every page, so a keyboard or screen-reader user
          can bypass the header straight to the main content.
        */}
        <a
          href="#main"
          className="label-meta focus:rounded-control focus:border-ink focus:bg-paper-raised focus:shadow-brutal-sm sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border-2 focus:px-4 focus:py-3"
        >
          Skip to content
        </a>
        <div className="relative z-0">{children}</div>
      </body>
    </html>
  );
}
