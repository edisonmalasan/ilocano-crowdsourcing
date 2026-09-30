"use client";

import { anonymousValidatorIdSchema, type AnonymousValidatorId } from "@/schemas/validator";

/**
 * Browser-local anonymous identity.
 *
 * ============================================================================
 * WHAT THIS IS AND IS NOT
 * ============================================================================
 * This is a CONVENIENCE TOKEN, not authority. It lets a returning visitor be
 * recognized without a database round trip on every page load. It decides
 * nothing: the server re-verifies that the identifier names a real validator
 * before restoring anyone, and a value that fails validation is discarded rather
 * than sent.
 *
 * It holds the identifier and nothing else — no screening answer, no batch, no
 * research response, no timestamp, no counter. That is asserted by test rather
 * than by convention, because a "just this one extra field" edit here would put
 * research data on the client where the anonymity guarantee no longer covers it.
 *
 * ============================================================================
 * WHY localStorage AND NOT A COOKIE
 * ============================================================================
 * An httpOnly cookie would let a Server Component read the identifier and render
 * "welcome back" with no client round trip. It would also transmit the identifier
 * to the server on *every* request to this origin, which is a worse fit for a
 * project whose headline property is anonymity than a value that leaves the
 * browser only when the participant asks to resume. The cost is paid deliberately:
 * the server cannot read this, so resume is an explicit client action rather than a
 * server-side render. See design.md D2.
 *
 * The upside of that cost: a shared device never hands one person another's
 * session without a visible action.
 */

/** The one key this module owns. Prefixed so it is unambiguous in a storage inspector. */
const IDENTITY_KEY = "sadino.anonymous-validator-id";

/**
 * `localStorage` access is the ONLY deliberately-caught failure in this module.
 *
 * Private browsing, disabled site data, and a sandboxed iframe all make
 * `localStorage` throw on ACCESS. Losing the resume convenience must never look
 * like a failed enrollment, so access is guarded and reported as "absent".
 *
 * The guard is deliberately narrow: it wraps the accessors and nothing else, so a
 * storage error can never be mistaken for a validation error or an enrollment
 * failure, and nothing else in the codebase can catch its way out of a real bug
 * through this module.
 *
 * The availability check reads `length` — a property access that still exercises
 * the path that throws, but touches NO key and performs NO write. An earlier
 * version of this function proved availability by writing and deleting a probe
 * entry, which meant every read wrote to the participant's storage and briefly
 * occupied a key that was not this module's. The test that asserts this module
 * touches only its own key is what caught it.
 */
function safeStorage(): Storage | null {
  try {
    const candidate = globalThis.localStorage;
    if (!candidate) return null;
    if (typeof candidate.length !== "number") return null;
    return candidate;
  } catch {
    return null;
  }
}

/**
 * The stored identifier, or `null` when there is none or it cannot be trusted.
 *
 * A malformed value is REMOVED as a side effect. Leaving it in place would mean
 * re-reading and re-rejecting the same bad value on every visit, and it would keep
 * an untrusted string sitting in the participant's browser indefinitely.
 */
export function readStoredValidatorId(): AnonymousValidatorId | null {
  const storage = safeStorage();
  if (storage === null) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  const parsed = anonymousValidatorIdSchema.safeParse(raw);
  if (!parsed.success) {
    clearStoredValidatorId();
    return null;
  }

  return parsed.data;
}

/** Stores the identifier. A failure is silent: enrollment has already succeeded. */
export function writeStoredValidatorId(id: AnonymousValidatorId): void {
  const storage = safeStorage();
  if (storage === null) return;
  try {
    storage.setItem(IDENTITY_KEY, id);
  } catch {
    // A full or unavailable quota costs the resume convenience and nothing else.
  }
}

/** Forgets the identifier. Used when the server does not recognise it. */
export function clearStoredValidatorId(): void {
  const storage = safeStorage();
  if (storage === null) return;
  try {
    storage.removeItem(IDENTITY_KEY);
  } catch {
    // Already unavailable; there is nothing further to clear.
  }
}

/**
 * The storage key, for tests only.
 *
 * Exported so a test can assert the module touches no OTHER key. Exporting the
 * constant is safe: it names a key, it does not grant access to it.
 */
export const ANONYMOUS_IDENTITY_STORAGE_KEY = IDENTITY_KEY;
