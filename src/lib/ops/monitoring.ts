/**
 * Operational monitoring domain: taxonomy, windows, thresholds, breach evaluation.
 *
 * Pure module. No I/O, no server marker import, no environment, no Supabase import, no logger. The
 * recorder (a later task) owns persistence and dispatch; this module owns the vocabulary and the
 * arithmetic so both can be asserted without a database.
 *
 * Privacy shape: every value here is a signal name, a window marker, a count, a threshold, a
 * timestamp, or a truncated digest. No correction, translation, sentence text, credential, raw
 * IP, or attempt identifier can be expressed in this module — there is no parameter for one.
 */

import { createHash } from "node:crypto";

/**
 * The eight approved operational signals. Closed on purpose: a new signal is a monitoring-scope
 * decision, not something a contributor does by appending to a list, and the migration's CHECK
 * constraint enforces the same set in the database.
 */
export const OPERATIONAL_SIGNALS = [
  "enroll_failed",
  "resume_failed",
  "allocation_failed",
  "persistence_failed",
  "retry_exhausted",
  "already_recorded_spike",
  "reservation_abandoned",
  "researcher_signin_failed",
] as const;

/** One of the eight approved operational signals. */
export type OperationalSignal = (typeof OPERATIONAL_SIGNALS)[number];

/** Fixed aggregation window: five minutes, in seconds. */
export const OPERATIONAL_WINDOW_SECONDS = 300;

/**
 * Documented per-signal breach thresholds: counts within one window at or above which the rule
 * is breached. Persistence failures trip earliest (5) because a failed research write is the
 * most severe operational event; `already_recorded` spikes and retry exhaustion trip latest
 * (20) because each occurrence is individually benign and only the volume is informative.
 */
export const OPERATIONAL_THRESHOLDS: Record<OperationalSignal, number> = {
  enroll_failed: 10,
  resume_failed: 10,
  allocation_failed: 10,
  persistence_failed: 5,
  retry_exhausted: 20,
  already_recorded_spike: 20,
  reservation_abandoned: 10,
  researcher_signin_failed: 10,
};

/**
 * Floors a timestamp to its 5-minute window start, in UTC.
 *
 * The window is what makes the counter an aggregate: every failure in the same bucket shares
 * one `window_start`, so the recorder's count is one indexed read rather than a scan.
 */
export function floorWindowStart(date: Date): Date {
  const windowMs = OPERATIONAL_WINDOW_SECONDS * 1000;
  return new Date(Math.floor(date.getTime() / windowMs) * windowMs);
}

/**
 * Narrows an arbitrary value to an approved operational signal.
 *
 * The `typeof` guard means a value that merely stringifies to a signal name is not accepted.
 * Only a real string exactly equal to one of the eight is.
 */
export function isOperationalSignal(value: unknown): value is OperationalSignal {
  if (typeof value !== "string") return false;
  return (OPERATIONAL_SIGNALS as ReadonlyArray<string>).includes(value);
}

/**
 * Evaluates whether a window count breaches a signal's documented threshold.
 *
 * Breach is `count >= threshold`: reaching the threshold is the breach, not exceeding it, so a
 * threshold of 5 fires on the fifth failure in the window.
 */
export function isBreach(signal: OperationalSignal, count: number): boolean {
  return count >= OPERATIONAL_THRESHOLDS[signal];
}

/** Length of a stored dedupe digest, in hex characters. */
export const DEDUPE_DIGEST_LENGTH = 16;

/**
 * Truncates a hex digest to the stored dedupe width.
 *
 * Sixteen hex characters carry 64 bits: far past collision concern for a per-window dedupe key,
 * and short enough that the key cannot be mistaken for content.
 */
export function truncateDigest(hex: string): string {
  return hex.slice(0, DEDUPE_DIGEST_LENGTH);
}

/**
 * Builds a digest-only dedupe key from caller-supplied nonce material.
 *
 * Pure function of two strings. The caller supplies already-safe material (a batch, entry, or
 * request nonce) — raw identifiers never reach this function, because there is no parameter
 * that accepts a request, a row, or an identity. The output is truncated SHA-256 hex.
 */
export function buildDedupeDigest(signal: string, material: string): string {
  return truncateDigest(createHash("sha256").update(`${signal}:${material}`).digest("hex"));
}
