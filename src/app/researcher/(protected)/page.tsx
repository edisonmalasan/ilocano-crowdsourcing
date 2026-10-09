import { SignOutButton } from "@/app/researcher/sign-out-button";
import { OperationalPanel } from "@/app/researcher/(protected)/operational-panel";
import { OverviewView } from "@/app/researcher/(protected)/overview";
import { loadDashboardOverview } from "@/lib/admin/dashboard";
import {
  OPERATIONAL_SIGNALS,
  OPERATIONAL_THRESHOLDS,
  floorWindowStart,
} from "@/lib/ops/monitoring";
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
 * No step here writes, and the guarantee is asserted rather than asserted ABOUT — see the three
 * layers that actually hold it, and the one earlier comment that overstated them:
 *
 *   1. `loadDashboardOverview`'s parameter type is `Pick<…>` of the read methods only, so the
 *      SERVICE cannot reach a write: the narrowing is the type layer, not a convention.
 *   2. `tests/unit/dashboard-read-only.test.ts` scans every researcher route and this service for
 *      write calls and for a `"use server"` directive, with real production writers as its
 *      can-fire controls.
 *   3. No route beneath the guard defines a Server Action, so there is no second mechanism.
 *
 * WHAT DOES NOT HOLD, stated because a comment here previously claimed it did: destructuring the
 * factory result narrows which REPOSITORIES this page holds, not which METHODS. The factories
 * return concrete instances, and `SupabaseValidatorsRepository` exposes a public `create(profile)`
 * that writes — so `validators.create(…)` would typecheck here and would be a real write. The
 * page's discipline is what keeps it read-only; layers 1–3 are what make a violation of that
 * discipline fail the suite. "Even the construction cannot hand this page a write" was false.
 */
export default async function ResearcherDashboardPage() {
  const { datasetEntries, validators, validations, operationalEvents } =
    createSupabaseRepositories();
  const overview = await loadDashboardOverview({
    entries: datasetEntries,
    validations,
    validators,
  });
  const operationalStates = await loadOperationalStates(operationalEvents);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title">Researcher dashboard</h1>
        <SignOutButton />
      </div>

      <OverviewView overview={overview} />
      <OperationalPanel states={operationalStates} />
    </main>
  );
}

/**
 * The current-window operational states, as READS ONLY.
 *
 * The parameter type is `Pick` of the two read methods for the same reason
 * `loadDashboardOverview` narrows its own: the page cannot reach a write through this value,
 * so the read-only guarantee `tests/unit/dashboard-read-only.test.ts` scans for holds one
 * layer down as well. Any failure (including the ops tables being absent on a deployment
 * migrated before them) degrades to an empty panel rather than breaking the dashboard.
 */
async function loadOperationalStates(
  events: Pick<
    import("@/lib/repositories").OperationalEventsRepository,
    "countForWindow" | "hasDispatch"
  >,
): Promise<
  readonly import("@/app/researcher/(protected)/operational-panel").OperationalRuleState[]
> {
  try {
    const windowStart = floorWindowStart(new Date());
    const states = await Promise.all(
      OPERATIONAL_SIGNALS.map(async (rule) => {
        const count = await events.countForWindow(rule, windowStart);
        const threshold = OPERATIONAL_THRESHOLDS[rule];
        return {
          rule,
          windowStart: windowStart.toISOString(),
          count,
          threshold,
          breached: count >= threshold,
        };
      }),
    );
    return states;
  } catch {
    return [];
  }
}
