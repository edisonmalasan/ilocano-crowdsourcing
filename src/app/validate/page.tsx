import type { Metadata } from "next";

import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";

import { StartBatch } from "./start-batch";

/**
 * Batch orchestration — the entry point into validation.
 *
 * Reached after screening enrolls or resumes an attempt. A Server Component
 * with no database dependency of its own. The batch is REQUESTED rather than
 * linked to, because its identifier does not exist until the server has chosen
 * one; the only client island is `StartBatch`, which runs the orchestration
 * (resume where an interrupted batch exists, allocate otherwise) and navigates
 * once the server has answered. That keeps the privileged repository out of
 * the client module graph by construction.
 *
 * It DOES read the interface-locale cookie, so this route is dynamic for the same reason `/start` is.
 * That is per-browser presentation state, not a query.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);
  return { title: t("validateStart.meta.title"), description: t("validateStart.lead") };
}

export default async function ValidateIndexPage() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-title">{t("validateStart.meta.title")}</h1>

      <div className="mt-8">
        <StartBatch locale={locale} />
      </div>
    </main>
  );
}
