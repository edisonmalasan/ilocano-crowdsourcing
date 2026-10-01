"use server";

import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

import { runRecoveryLookup, type RecoveryOutcome } from "./recovery-actions-core";

/**
 * The public Server Action for interrupted-batch discovery.
 *
 * THIS FILE IS THE ONLY PLACE IN THE RECOVERY PATH THAT CONSTRUCTS A PRIVILEGED CLIENT, and it does
 * so inside the request, never at module scope, so a missing credential produces a nameable
 * `ServerEnvError` rather than an import that throws the moment the module graph is evaluated. That
 * distinction is not cosmetic: all three `SUPABASE_*` variables are absent in the current environment,
 * so throwing at import would make the route unreachable rather than reportable.
 *
 * Every decision lives in `recovery-actions-core.ts`, which takes its dependencies as arguments and is
 * therefore unit-tested with no database and no credential. This function does exactly three things:
 * read the environment, build the repositories, delegate.
 *
 * The service-role credential bypasses Row Level Security, so this action is reachable only from the
 * server and only through a service that has already decided what the caller is allowed to do. See
 * `@/lib/supabase/admin`.
 *
 * ============================================================================
 * WHY A MISSING DATABASE IS `not_configured` HERE AND NOT `unavailable`
 * ============================================================================
 * The core's `ConfigurationFailure` branch is UNREACHABLE in the real deployment, because `getServerEnv()`
 * is called here while BUILDING the argument that goes into `runRecoveryLookup` — so the throw happens
 * before the core is entered. This is exactly the arrangement `actions.ts` for allocation already
 * uses, and for the same reason: a missing database is an operator problem with a different fix from
 * a read that failed, and the client should not be shown a "we could not check" message when the real
 * answer is "this deployment was never configured".
 *
 * It is named in the core anyway, because a caller that builds dependencies somewhere else still cannot
 * report a missing database as a read fault.
 *
 * ============================================================================
 * AND SO THIS FILE CATCHES THE THROW ITSELF
 * ============================================================================
 * Because `getServerEnv()` runs while BUILDING the argument, a missing credential never reaches the
 * core — so without the `try` below the action would REJECT rather than resolve to `not_configured`. The
 * first draft of this file did exactly that, and it was caught by asking a question the core's tests
 * could not answer: what does the island see when this action rejects? The answer was a rejected promise
 * with no `.catch` at the call site, which would have satisfied D4 only by ACCIDENT — `outcome` would
 * stay `null`, and `null` collapses to `none`. A requirement met by an accident is not met, because the
 * next edit to either file can remove it.
 *
 * The translation is also what makes the failure nameable to an operator, which is the whole reason the
 * two states are modelled apart.
 *
 * ============================================================================
 * IT IS A READ, AND THAT IS DELIBERATE (`design.md` D8)
 * ============================================================================
 * Nothing here writes. It uses the same repository interfaces and the same typed-error mapping as any
 * other read. Being an action rather than a route handler keeps ONE transport for client/server
 * conversation, and keeps the privileged client out of the client module graph by construction — which
 * is the reason `StartBatch` is an island at all.
 *
 * And it creates nothing on a *recovery* path, which is the D3 consequence worth stating: the most this
 * action can do is add an affordance to the screen, or fail. It can never remove one, disable one, or
 * block the participant from starting a batch.
 */
/** Logs the underlying failure for the operator. Never rendered to a participant. */
function logForOperator(message: string, error: unknown): void {
  // No error-monitoring dependency exists yet. `ServerEnvError`'s message names a MISSING VARIABLE and
  // no value; a `RepositoryError` message describes an operation, not a credential. See the identical
  // helper in `@/lib/allocation/actions`.
  console.error(`[sadino:recovery] ${message}`, error);
}

export async function requestInterruptedBatchAction(raw: unknown): Promise<RecoveryOutcome> {
  try {
    // `getServerEnv()` is called EXPLICITLY, before the repositories are constructed, so a missing
    // credential is a named configuration error rather than a client-construction failure — the two are
    // indistinguishable to a caller otherwise, and they have different fixes. The same two-line
    // arrangement `actions.ts` uses for allocation; the ORDER is asserted in
    // `recovery-actions-wrapper.test.ts`, not here, because only that file can see it.
    getServerEnv();
    const { validators, validations, batches } = createSupabaseRepositories();

    return await runRecoveryLookup(raw, {
      validators,
      validations,
      batches,
      ConfigurationFailure: ServerEnvError,
    });
  } catch (error) {
    // A configuration failure is thrown while BUILDING dependencies, so it never reaches the core.
    // Translate it here, and log the real cause.
    if (error instanceof ServerEnvError) {
      logForOperator("interrupted batch requested with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("interrupted batch lookup failed before reaching the service", error);
    return { status: "failed", reason: "unavailable" };
  }
}
