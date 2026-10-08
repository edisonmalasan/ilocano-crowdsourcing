import { createHash } from "node:crypto";

/**
 * Privacy-safe public-security diagnostics — the observable half of the abuse controls.
 *
 * The same shape as the researcher `formatSignInDiagnostic` precedent: a pure
 * formatter in a dependency-free module, an injected `log` sink in the cores,
 * one namespaced `console.info` line per refusal at the shells. Outward
 * behavior is byte-identical everywhere; only the server log gains a line.
 *
 * WHAT A LINE CARRIES: the paced action, the internal reason, and truncated
 * SHA-256 digests of the origin key and — where the action has an actor
 * bucket — of the raw actor value (attempt identifier or batch capability).
 * It NEVER carries a raw header value, a raw `VAL_`/`BAT_` identifier,
 * response content, proficiency, a credential, or anything countable as a
 * distinct person. Digests are computed by the cores from values they
 * already hold, so the raw values never reach the log line.
 *
 * No `import "server-only"` here, for the same reason `public-throttle.ts`
 * carries none: the formatter and the digest helper are pure reasoning over
 * strings, directly unit-testable with no database and no credential.
 */

/** The public surface an emitted line names. Five actions, never a route. */
export type PublicSecurityAction = "enroll" | "allocate" | "submit" | "resume" | "session_open";

/**
 * Why the line was emitted. `throttled` covers all five paced refusals;
 * `owner_mismatch` is the session gate's stored-owner comparison failing;
 * `unknown_batch` is a submission naming a batch capability that names no
 * batch. Routine state outcomes (`invalid`, `screening_required`,
 * `not_in_batch`, `already_recorded`) and unknown batches on the READ path
 * (a stale link is routine navigation, not probing) stay silent.
 */
export type PublicSecurityReason = "throttled" | "owner_mismatch" | "unknown_batch";

/** What one public-security refusal contributes to the server log, as data. */
export interface PublicSecurityDiagnosticEvent {
  readonly action: PublicSecurityAction;
  readonly reason: PublicSecurityReason;
  /** Truncated SHA-256 of the origin key. Never the raw header value. */
  readonly originDigest: string;
  /** Truncated SHA-256 of the actor value, where the action has one. Never raw. */
  readonly actorDigest?: string;
}

/** The server-log namespace. One prefix, so an operator can grep one string. */
export const PUBLIC_SECURITY_LOG_PREFIX = "[sadino:abuse]";

/** Truncated SHA-256 hex of one raw component. Raw values never reach a line. */
export function digestPublicSecurityComponent(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
}

export function formatPublicSecurityDiagnostic(event: PublicSecurityDiagnosticEvent): string {
  const actor = event.actorDigest !== undefined ? ` actor=${event.actorDigest}` : "";
  return `public ${event.action} refused reason=${event.reason} origin=${event.originDigest}${actor}`;
}
