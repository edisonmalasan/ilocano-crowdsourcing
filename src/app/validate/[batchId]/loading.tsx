import { ValidationPageShell } from "@/components/validation/validation-page-shell";
import { ValidationSkeleton } from "@/components/validation/validation-skeleton";
import { translatorFor } from "@/lib/i18n/copy";
import { getInterfaceLocale } from "@/lib/i18n/interface-locale-cookie";

/**
 * Session loading boundary — `/validate/[batchId]`.
 *
 * Shown only while the Server Component above genuinely waits: a direct visit or
 * reload resolving its session, and navigations to a next batch whose session has
 * not resolved yet. It renders the shared Validating shell — heading, description,
 * and skeleton in the same geometry as the presenting route — never a skeleton
 * alone, so arrival here shifts no layout. When the session is already ready the
 * real entry renders instead — there is no minimum display time and no fake delay.
 * Failures render the route's own error states, never this.
 */
export default async function ValidateBatchLoading() {
  const locale = await getInterfaceLocale();
  const t = translatorFor(locale);
  return (
    <ValidationPageShell
      title={t("validate.meta.title")}
      description={t("validate.meta.description")}
    >
      <ValidationSkeleton />
    </ValidationPageShell>
  );
}
