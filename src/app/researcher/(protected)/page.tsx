import { SignOutButton } from "@/app/researcher/sign-out-button";
import { OverviewView } from "@/app/researcher/(protected)/overview";
import { loadDashboardOverview } from "@/lib/admin/dashboard";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

/**
 * The researcher dashboard overview.
 *
 * Reaching this component at all IS the authorization assertion — see the guarded layout above
 * it and the header on the page this replaced. What this page adds is READS, through the
 * privileged client the layout's authorization unlocks:
 *
 *   1. construct the repositories (service-role client, server-only, never leaves the server);
 *   2. assemble the overview with the dashboard service;
 *   3. render the pure view.
 *
 * No step here writes. The repositories are destructured to the three reads the service needs,
 * so even the construction cannot hand this page a write it has no business holding — the same
 * return-shape separation `factory.ts` documents for public validator requests.
 */
export default async function ResearcherDashboardPage() {
  const { datasetEntries, validators, validations } = createSupabaseRepositories();
  const overview = await loadDashboardOverview({
    entries: datasetEntries,
    validations,
    validators,
  });

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title">Researcher dashboard</h1>
        <SignOutButton />
      </div>

      <OverviewView overview={overview} />
    </main>
  );
}
