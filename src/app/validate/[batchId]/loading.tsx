import { ValidationSkeleton } from "@/components/validation/validation-skeleton";

/**
 * Session loading boundary — `/validate/[batchId]`.
 *
 * Shown only while the Server Component above genuinely waits: the initial
 * session open over the repositories, and navigations to a next batch whose
 * session has not resolved yet. When the session is already ready the real
 * entry renders instead — there is no minimum display time and no fake delay.
 * Failures render the route's own error states, never this.
 */
export default function ValidateBatchLoading() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <ValidationSkeleton />
    </main>
  );
}
