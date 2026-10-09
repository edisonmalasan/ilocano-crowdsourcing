"use server";

import { headers } from "next/headers";

import { resolveOriginKey } from "@/lib/admin/origin";
import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { getOpsWebhookUrl } from "@/lib/ops/dispatch";
import { safeRecordOperationalSignal } from "@/lib/ops/recorder";
import type { OperationalSignal } from "@/lib/ops/monitoring";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

import {
  runEnroll,
  runResume,
  type EnrollActionResult,
  type EnrollThrottleContext,
  type ResumeActionResult,
  type ResumeThrottleContext,
} from "./onboarding-actions-core";
import { sharedPublicThrottle } from "./public-throttle";

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
 * credential. These two functions build the request's dependencies —
 * environment, repositories, pacing context — and delegate.
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

/**
 * Best-effort operational counter for a failed onboarding request.
 *
 * Builds its own dependencies (and therefore its own `getServerEnv` check) so a deployment
 * with no database degrades to the existing log rather than a second failure. Never throws:
 * `safeRecordOperationalSignal` cannot, and the construction above it is guarded. Awaited by
 * the caller — floating it would let the serverless instance freeze before the write lands.
 */
async function tryRecordOperationalSignal(signal: OperationalSignal): Promise<void> {
  try {
    getServerEnv();
    const { operationalEvents } = createSupabaseRepositories();
    await safeRecordOperationalSignal(
      {
        events: operationalEvents,
        webhookUrl: getOpsWebhookUrl(),
        log: logForOperator,
      },
      signal,
    );
  } catch {
    // Absorbed: the recorder already logged, and onboarding already decided its answer.
  }
}

export async function enrollValidatorAction(raw: unknown): Promise<EnrollActionResult> {
  try {
    // The environment check runs FIRST, before the request headers are read,
    // for the same reason as on the resume path: a deployment with no
    // database reports `not_configured` regardless of what the request
    // carried, and no header value is observed on that path.
    const deps = actionDependencies();
    const result = await runEnroll(raw, deps, await enrollThrottleContext());
    if (result.status === "failed" && result.reason !== "invalid") {
      await tryRecordOperationalSignal("enroll_failed");
    }
    return result;
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
    // The environment check runs FIRST, before the request headers are read:
    // a deployment with no database reports `not_configured` regardless of
    // what the request carried, and no header value is observed on that path.
    const deps = actionDependencies();
    const result = await runResume(raw, deps, await resumeThrottleContext());
    if (result.status === "failed" && result.reason !== "invalid") {
      await tryRecordOperationalSignal("resume_failed");
    }
    return result;
  } catch (error) {
    if (error instanceof ServerEnvError) {
      logForOperator("resume attempted with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("resume failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}

/**
 * The pacing context for one enrollment request: origin only, since no
 * identity exists yet to scope an actor bucket to.
 */
async function enrollThrottleContext(): Promise<EnrollThrottleContext> {
  const jar = await headers();
  return {
    throttle: sharedPublicThrottle,
    originKey: resolveOriginKey((name) => jar.get(name)),
    log: (line) => console.info(`[sadino:abuse] ${line}`),
  };
}

/**
 * The pacing context for one resume request.
 *
 * Reads the request headers the same way the researcher sign-in does
 * (`resolveOriginKey` over `next/headers`), against the shared process
 * throttle. The raw header value is hashed inside the throttle and never
 * reaches storage; when no header is present every such request shares the
 * one fallback bucket, which is the documented limitation, not a secret.
 */
async function resumeThrottleContext(): Promise<ResumeThrottleContext> {
  const jar = await headers();
  return {
    throttle: sharedPublicThrottle,
    originKey: resolveOriginKey((name) => jar.get(name)),
    log: (line) => console.info(`[sadino:abuse] ${line}`),
  };
}
