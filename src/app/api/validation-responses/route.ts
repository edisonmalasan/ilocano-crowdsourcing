import { resolveOriginKey } from "@/lib/admin/origin";
import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { getOpsWebhookUrl } from "@/lib/ops/dispatch";
import type { OperationalSignal } from "@/lib/ops/monitoring";
import { safeRecordOperationalSignal } from "@/lib/ops/recorder";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";
import { runSubmitResponse } from "@/lib/validation/submit-response-core";
import { sharedPublicThrottle } from "@/lib/validators/public-throttle";

/**
 * The background response write: `POST /api/validation-responses`.
 *
 * THIN ON PURPOSE. Input parsing, ownership derivation, id minting, and the single RPC
 * all live in `runSubmitResponse`, which is unit-tested with fakes; this handler supplies
 * the real environment, repositories, and clock, then translates the verdict into a
 * response. One versioned function call per request, service-role only — the browser
 * never sees a credential and never supplies validator id, response id, timestamps, or
 * batch ownership.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ status: "failed", reason: "invalid" }, 400);
  }

  let repositories: ReturnType<typeof createSupabaseRepositories>;
  try {
    getServerEnv();
    repositories = createSupabaseRepositories();
  } catch (error) {
    if (error instanceof ServerEnvError) {
      console.error("[sadino:validation] response POST with no database configured", error);
      return json({ status: "failed", reason: "not_configured" }, 503);
    }
    console.error("[sadino:validation] response POST failed before reaching the service", error);
    return json({ status: "failed", reason: "persistence" }, 503);
  }

  try {
    const startedMs = Date.now();
    const result = await runSubmitResponse(
      raw,
      {
        validations: repositories.validations,
        now: () => new Date(),
      },
      // Paced per origin plus per batch capability, after parsing and before
      // the RPC. `request.headers` is read directly — no `next/headers`
      // needed in a Route Handler — and the raw value is hashed inside the
      // throttle, never stored or logged.
      {
        throttle: sharedPublicThrottle,
        originKey: resolveOriginKey((name) => request.headers.get(name)),
        log: (line) => console.info(`[sadino:abuse] ${line}`),
      },
    );
    // Operator timing only: status and duration. Never response text, translations,
    // validator ids, or credentials.
    console.info(
      `[sadino:validation] response POST status=${result.status} durationMs=${Date.now() - startedMs}`,
    );
    // Best-effort operational counters. The dedupe material below is hashed inside the
    // recorder and never stored raw: it lets a retried submission count once per window
    // rather than inflating the signal.
    if (result.status === "already_recorded") {
      await tryRecordOperationalSignal("already_recorded_spike", dedupeMaterialFor(raw));
    } else if (result.status === "failed" && result.reason === "persistence") {
      await tryRecordOperationalSignal("persistence_failed", dedupeMaterialFor(raw));
    }
    if (result.status === "recorded" || result.status === "already_recorded") {
      return json(result, 200);
    }
    if (result.reason === "invalid") return json(result, 400);
    if (result.reason === "unknown_batch") return json(result, 404);
    if (result.reason === "not_in_batch") return json(result, 422);
    // Pacing, not a fault: 429 tells a well-behaved client to wait and retry
    // the same bytes, which WILL succeed after the window. Never 503 — nothing
    // is broken — and never collapsed into an honest error.
    if (result.reason === "throttled") return json(result, 429);
    return json(result, 503);
  } catch (error) {
    console.error("[sadino:validation] response POST failed before reaching the service", error);
    await tryRecordOperationalSignal("persistence_failed");
    return json({ status: "failed", reason: "persistence" }, 503);
  }
}

/**
 * Digest material for one submission: the batch/entry pair when both are well-shaped
 * strings, `undefined` otherwise. The recorder hashes this before storage, so the raw pair
 * never reaches a row, a payload, or a log.
 */
function dedupeMaterialFor(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.batchId !== "string" || typeof record.datasetEntryId !== "string") {
    return undefined;
  }
  return `${record.batchId}:${record.datasetEntryId}`;
}

/** Best-effort operational counter. Own dependencies, own environment check, never throws. */
async function tryRecordOperationalSignal(
  signal: OperationalSignal,
  dedupeMaterial?: string,
): Promise<void> {
  try {
    getServerEnv();
    const { operationalEvents } = createSupabaseRepositories();
    await safeRecordOperationalSignal(
      {
        events: operationalEvents,
        webhookUrl: getOpsWebhookUrl(),
        log: (message, error) => console.error(`[sadino:validation] ${message}`, error),
      },
      signal,
      dedupeMaterial,
    );
  } catch {
    // Absorbed: the recorder already logged, and the response already decided its answer.
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
