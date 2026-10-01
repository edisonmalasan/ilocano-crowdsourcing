"use server";

import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

import {
  runSubmitValidation,
  type SubmitValidationResult,
  type ValidationActionDependencies,
} from "./validation-actions-core";

/**
 * The public Server Action for recording a completed validation response.
 *
 * ============================================================================
 * WHAT THIS FILE IS FOR: THREE THINGS, AND THE COMMENT IS THE POINT
 * ============================================================================
 * A file marked `"use server"` may only export async functions, which would make every decision in
 * `validation-actions-core.ts` unreachable without a network. So this wrapper does exactly three
 * things — read the environment, build the repositories, delegate — and every claim about the write's
 * behaviour is therefore testable in this repository with no Supabase project and no credential.
 *
 * It is also the ONLY place in the validation write path that constructs a privileged client, and it
 * does so INSIDE the request rather than at module scope. That distinction is not cosmetic: in this
 * environment all three `SUPABASE_*` variables are absent, so a module-scope client would make the
 * route unimportable rather than reportable, and the failure would arrive as an import error nobody
 * could attribute to a missing deployment variable.
 *
 * `getServerEnv()` is called BEFORE the client is built, so a missing deployment is a named
 * `ServerEnvError` and never a client-construction failure indistinguishable from a network fault.
 *
 * ============================================================================
 * `not_configured` IS PRODUCED HERE AND NOWHERE ELSE
 * ============================================================================
 * The core cannot produce it: it has no environment to fail on and no credential to lack, so adding
 * the variant there would be a union member nothing returns — which is how a result type starts
 * telling callers about states the service does not know. The wrapper is the layer that reads the
 * environment, so the wrapper is the layer that reports it.
 *
 * The service-role credential bypasses Row Level Security, so this action is reachable only from
 * server code and only through a service that has already decided what the caller may do. See
 * `@/lib/supabase/admin`.
 */

/** Builds the action dependencies, or throws `ServerEnvError` when no database is configured. */
function actionDependencies(): ValidationActionDependencies {
  getServerEnv();
  const { batches, validations } = createSupabaseRepositories();
  return {
    batches,
    validations,
    now: () => new Date(),
  };
}

/** Logs the underlying failure for the operator. Never rendered to a participant. */
function logForOperator(message: string, error: unknown): void {
  // No error-monitoring dependency exists yet. The message names no value: `ServerEnvError` is safe
  // to log by construction, and a `RepositoryError` message describes an operation, not a credential.
  console.error(`[sadino:validation] ${message}`, error);
}

export async function submitValidationAction(raw: unknown): Promise<SubmitValidationResult> {
  try {
    return await runSubmitValidation(raw, actionDependencies());
  } catch (error) {
    // A configuration failure is thrown while BUILDING dependencies, so it never reaches the core.
    if (error instanceof ServerEnvError) {
      logForOperator("validation submitted with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("validation submission failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}
