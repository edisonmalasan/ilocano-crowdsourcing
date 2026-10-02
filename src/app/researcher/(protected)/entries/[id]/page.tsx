import { notFound } from "next/navigation";

import { SignOutButton } from "@/app/researcher/sign-out-button";
import { EntryReviewView } from "@/app/researcher/(protected)/entries/[id]/entry-review";
import { loadEntryReview } from "@/lib/admin/dashboard";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

/**
 * Per-entry inspection for researchers.
 *
 * Authorization comes from the guarded layout above; absence is handled HERE, with `notFound()`,
 * because only this route knows the entry does not exist. A refusal (no session) and an absence
 * (no such entry) must stay distinguishable per the access spec, and the layout already refuses
 * before this component runs — so reaching `notFound()` means "authorized but absent", never
 * "refused".
 */
export default async function EntryReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { datasetEntries, validators, validations } = createSupabaseRepositories();
  const review = await loadEntryReview({ entries: datasetEntries, validations, validators }, id);

  if (review === null) notFound();

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title">Entry review</h1>
        <SignOutButton />
      </div>

      <EntryReviewView review={review} />
    </main>
  );
}
