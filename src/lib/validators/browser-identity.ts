"use client";

import { anonymousValidatorIdSchema, type AnonymousValidatorId } from "@/schemas/validator";

/**
 * Browser-local PARTICIPATION ATTEMPT identity.
 *
 * ============================================================================
 * WHAT THIS IS AND IS NOT
 * ============================================================================
 * This is a CONVENIENCE TOKEN, not authority. It lets a participant be recognised
 * within the attempt they are already in, without a database round trip on every page
 * load. It decides nothing: the server re-verifies that the identifier names a real
 * validator before restoring anyone, and a value that fails validation is discarded
 * rather than sent.
 *
 * It holds the identifier and nothing else — no screening answer, no batch, no
 * research response, no timestamp, no counter. That is asserted by test rather
 * than by convention, because a "just this one extra field" edit here would put
 * research data on the client where the anonymity guarantee no longer covers it.
 *
 * ============================================================================
 * WHY sessionStorage AND NOT localStorage — THE ONE LINE THAT CHANGED
 * ============================================================================
 * This module used to write to `localStorage`, and it used to be right for the
 * model that was in force then: one browser profile was one long-lived
 * "validator", and a return visit resumed that person. The approved thesis
 * methodology was corrected, and the unit of participation is now an ATTEMPT —
 * a fresh anonymous identity created at screening, retired when the participant
 * finishes or when the browser session ends, and re-screened next time.
 *
 * `localStorage` therefore became the WRONG LIFETIME rather than a weaker
 * implementation of the right one. An identifier in `localStorage` outlives every
 * session, which silently reinstates the never-ending validator: one browser
 * profile would answer entries for the life of the study under a single identity,
 * and a person could never take part afresh. The defect is not that `localStorage`
 * is less private. It is that its lifetime is the lifetime of the DEVICE.
 *
 * The three properties this module's storage must have, and why each is
 * `sessionStorage`:
 *
 *   1. IT ENDS WITH THE ATTEMPT. Supplied by the platform, not by a rule the
 *      client could decline to apply — see design.md D1 for the two alternatives
 *      that were rejected (a cookie, which needs a server-side participation-end
 *      fact the approved method forbids inventing; and `localStorage` plus an
 *      expiry timestamp, which is a participation-end rule no requirement states
 *      and which a client-held clock cannot enforce).
 *   2. IT SURVIVES RELOAD AND NAVIGATION. `sessionStorage` does, within the tab.
 *      This is why every caller reads the identifier at PRESS time and not during
 *      render: storage does not exist while the server renders, and a read during
 *      render would make the first client render disagree with the first server
 *      one.
 *   3. IT IS NEVER SENT ANYWHERE BY ITSELF. It leaves the browser only when the
 *      participant asks to resume.
 *
 * ============================================================================
 * THE COST, STATED RATHER THAN DISMISSED
 * ============================================================================
 * `sessionStorage` is scoped to a TAB. A participant who opens this study in a
 * second tab is in a second browser session, and therefore in a second attempt.
 * That is a real consequence and there is no mitigation that keeps property 1; it
 * is recorded at design.md's Risks rather than discovered by a participant.
 *
 * The upside of that cost: a shared device never hands one person another's
 * attempt without a visible action, and nothing survives the tab.
 *
 * ============================================================================
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * ============================================================================
 * It does not read, migrate, or delete a `localStorage` value left by an earlier
 * version of the platform. See design.md D5: removing it would require code that
 * touches `localStorage`, which is exactly what the requirement forbids, and it
 * would turn every page load into a write. The value is residue, it is unread,
 * and it is asserted unread by test so it cannot quietly start being read.
 */

/** The one key this module owns. Prefixed so it is unambiguous in a storage inspector. */
const IDENTITY_KEY = "sadino.anonymous-validator-id";

/**
 * `sessionStorage` access is the ONLY deliberately-caught failure in this module.
 *
 * Private browsing, disabled site data, and a sandboxed iframe all make
 * `sessionStorage` throw on ACCESS. Losing the resume convenience must never look
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
    const candidate = globalThis.sessionStorage;
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

/**
 * Forgets the identifier.
 *
 * Used when the server does not recognise it, and when a participant chooses to
 * finish — which is what RETIRES an attempt. Retiring one writes nothing to the
 * server: see `batch-completion`'s finishing requirement, and design.md D3 for why
 * this is a control rather than a link with a cleanup effect.
 */
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
