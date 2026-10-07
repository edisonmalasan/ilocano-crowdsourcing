import type { Metadata } from "next";

import { ValidationPageShell } from "@/components/validation/validation-page-shell";
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
 * (resume where an interrupted batch exists, allocate otherwise) and renders
 * the first entry in place once the server has answered. That keeps the privileged repository out of
 * the client module graph by construction.
 *
 * The page renders the Validating shell — the same header, container, and
 * layout-matched skeleton the session route shows — so screening Continue
 * lands directly in the Validating experience with no intermediate waiting
 * page. Only the participant-facing waiting page is gone; every server
 * behavior underneath (attempt validation, screening requirements, recovery,
 * allocation, reservation, authorization) runs unchanged.
 *
 * It DOES read the interface-locale cookie, so this route is dynamic for the same reason `/start` is.
 * That is per-browser presentation state, not a query.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);
  return { title: t("validate.meta.title"), description: t("validate.meta.description") };
}

export default async function ValidateIndexPage() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);

  return (
    <ValidationPageShell
      title={t("validate.meta.title")}
      description={t("validate.meta.description")}
    >
      <StartBatch locale={locale} />
    </ValidationPageShell>
  );
}
