"use server";

import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

import {
  runEnroll,
  runResume,
  type EnrollActionResult,
  type ResumeActionResult,
} from "./onboarding-actions-core";

/**
 * The public Server Actions for onboarding.
 *
 * This file is the ONLY place in the onboarding path that constructs a privileged
 * Supabase client, and it does so inside the request, never at module scope, so
 * a missing credential produces a nameable `ServerEnvError` rather than an import
 * that throws the moment the module graph is evaluated.
 *
 * Every decision lives in `onboarding-actions-core.ts`, which takes its
 * dependencies as arguments and is therefore unit-tested with no database and no
 * credential. These two functions do exactly three things: read the environment,
 * build the repositories, delegate.
 *
 * The service-role credential bypasses Row Level Security, so these actions are
 * reachable only from the server and only through the service, which has already
 * decided what the caller is allowed to do. See `@/lib/supabase/admin`.
 *
 * Neither action returns anything derived from a stored profile beyond the
 * anonymous identifier itself.
 */

/**
 * Builds the action dependencies, or throws `ServerEnvError` when this deployment
 * has no database configured.
 *
 * `getServerEnv()` is called explicitly BEFORE constructing the client, so the
 * failure is a named configuration error the core can recognise, rather than a
 * client-construction failure that would be indistinguishable from a network fault.
 */
function actionDependencies() {
  getServerEnv();
  const { validators } = createSupabaseRepositories();
  return { validators, now: () => new Date(), ConfigurationFailure: ServerEnvError };
}

/** Logs the underlying failure for the operator. Never rendered to a participant. */
function logForOperator(message: string, error: unknown): void {
  // No error-monitoring dependency exists yet (Phase 9+). The message names no
  // value: `ServerEnvError` is safe to log by construction, and a
  // `RepositoryError` message describes an operation, not a credential.
  console.error(`[sadino:onboarding] ${message}`, error);
}

export async function enrollValidatorAction(raw: unknown): Promise<EnrollActionResult> {
  try {
    return await runEnroll(raw, actionDependencies());
  } catch (error) {
    // A configuration failure is thrown while BUILDING dependencies, so it never
    // reaches the core. Translate it here, and log the real cause.
    if (error instanceof ServerEnvError) {
      logForOperator("enrollment attempted with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("enrollment failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}

export async function resumeValidatorAction(raw: unknown): Promise<ResumeActionResult> {
  try {
    return await runResume(raw, actionDependencies());
  } catch (error) {
    if (error instanceof ServerEnvError) {
      logForOperator("resume attempted with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("resume failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}
