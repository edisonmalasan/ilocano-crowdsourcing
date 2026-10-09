import "server-only";

import type { OperationalSignal } from "@/lib/ops/monitoring";

/**
 * Aggregate-only alert dispatch for breached operational rules.
 *
 * WHAT LEAVES THIS MODULE, AND WHAT NEVER DOES
 * -------------------------------------------
 * The payload carries exactly five fields: the rule name, the window marker, the count, the
 * threshold, and the evaluation time. All five are aggregates over a window — no per-request
 * material, no response data, no network origin, no browser-held token. The shape audit in
 * `tests/unit/operational-privacy.test.ts` pins the key set and scans this file for the
 * forbidden vocabulary, so a future edit that smuggles a sixth field fails the suite.
 *
 * Delivery is a single HTTPS POST of that JSON object to an operator-configured hook. Nothing
 * here retries, nothing here pages anyone, and nothing here throws: every failure path reports
 * `{ delivered: false }` and the recorder falls back to the existing diagnostic log.
 */

/** The only payload this module ever posts: five aggregate fields, nothing else. */
export interface OperationalAlertPayload {
  readonly rule: OperationalSignal;
  readonly windowStart: string;
  readonly count: number;
  readonly threshold: number;
  readonly evaluatedAt: string;
}

/** The exact key set `buildAlertPayload` returns, pinned by the privacy suite. */
export const ALERT_PAYLOAD_KEYS = [
  "rule",
  "windowStart",
  "count",
  "threshold",
  "evaluatedAt",
] as const;

/** Builds the five-field aggregate payload. No other field can be expressed here. */
export function buildAlertPayload(
  rule: OperationalSignal,
  windowStart: Date,
  count: number,
  threshold: number,
  evaluatedAt: Date,
): OperationalAlertPayload {
  return {
    rule,
    windowStart: windowStart.toISOString(),
    count,
    threshold,
    evaluatedAt: evaluatedAt.toISOString(),
  };
}

/**
 * Reads the optional alert hook from the environment.
 *
 * Returns the trimmed value only when it parses as an `http:` or `https:` URL; anything else —
 * missing, blank, unparseable, or another scheme — is `null`, and dispatch stays off. `source`
 * defaults to `process.env` and exists so tests can pass a plain record without touching
 * process-wide state.
 */
export function getOpsWebhookUrl(source: Record<string, unknown> = process.env): string | null {
  const raw = source.OPS_ALERT_WEBHOOK_URL;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return trimmed;
}

const DISPATCH_TIMEOUT_MS = 5000;

/**
 * POSTs one aggregate payload to the configured hook.
 *
 * `delivered` is `true` only when the hook answered with an ok status. Any other outcome — a
 * non-ok status, a refused connection, a timeout, a throwing fetch — reports
 * `{ delivered: false }` and never throws, so the recorder that calls this cannot break the
 * research path it instruments. The payload is never written to any log by this module.
 */
export async function dispatchAlert(
  payload: OperationalAlertPayload,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ delivered: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { delivered: response.ok };
  } catch {
    return { delivered: false };
  } finally {
    clearTimeout(timer);
  }
}
