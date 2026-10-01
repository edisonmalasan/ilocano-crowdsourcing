import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Exact operator-credential comparison.
 *
 * ============================================================================
 * WHY DIGESTS RATHER THAN THE VALUES
 * ============================================================================
 * `timingSafeEqual` requires two buffers of equal length, so the obvious implementation would have
 * to compare lengths first — and a length check is a branch that discloses how long a credential
 * is. Folding both sides to a fixed-length SHA-256 digest removes the question entirely: every
 * comparison is between two 32-byte buffers, and a presented value of any length is compared
 * against every configured credential without ever revealing its own length.
 *
 * ============================================================================
 * WHY NO EARLY EXIT, AT EITHER LEVEL (D4)
 * ============================================================================
 * Two separate leaks, and this module is the fix for both.
 *
 * INNER: returning as soon as `timingSafeEqual` reports equality discloses how many *bytes* of a
 * credential were right.
 *
 * OUTER: returning from inside the loop over the configured set discloses *which* credential was
 * presented, because the iteration that matches takes longer than the ones before it. One-token and
 * ten-token environments would also do measurably different amounts of work. The loop therefore runs
 * to completion on every call and consults a single accumulated flag at the end, so a hit and a
 * miss in the same environment cost the same.
 *
 * `tests/unit/admin-credentials.test.ts` measures this with an injected digest rather than by
 * timing, because a timing assertion on a shared CI machine fails for reasons that have nothing to
 * do with the code under test.
 */

/** The digest function, injectable so the work done can be COUNTED rather than timed. */
export type CredentialDigest = (value: string) => Buffer;

/** The production digest. UTF-8, because an operator credential is configured as text. */
const sha256: CredentialDigest = (value) => createHash("sha256").update(value, "utf8").digest();

/**
 * The dependencies {@link verifyOperatorCredential} needs.
 *
 * Optional at the call site because every production caller wants the default; required here so a
 * test can observe the number of comparisons without patching `node:crypto`.
 */
export interface CredentialVerificationDeps {
  readonly digest: CredentialDigest;
}

const DEFAULT_DEPS: CredentialVerificationDeps = { digest: sha256 };

/**
 * The outcome of a comparison.
 *
 * `ordinal` is the 1-based POSITION of the matched credential in configuration order — never
 * anything derived from the credential itself, because this value is written into a cookie the
 * browser holds (D3). Publishing a hash of a credential would publish a verification oracle.
 */
export interface CredentialVerification {
  readonly matched: boolean;
  /** 1-based position of the matched credential, or `null` when nothing matched. */
  readonly ordinal: number | null;
}

/**
 * Compares `presented` against every configured operator credential, exactly.
 *
 * EXACT means exact. No trimming, no case folding, no prefix or suffix tolerance: a value differing
 * by trailing whitespace is a different value, and accepting it would mean a credential copied with
 * a stray space works in a way the operator did not choose. The spec names all four near misses —
 * prefix, suffix, case, trailing whitespace — and this is where they are refused.
 *
 * A `null` or `undefined` `presented` is treated as the empty string rather than throwing, so a
 * missing field on a sign-in form reaches the same refusal as a wrong one and reveals nothing about
 * which credentials exist.
 */
export function verifyOperatorCredential(
  presented: unknown,
  operatorSecrets: readonly string[],
  deps: CredentialVerificationDeps = DEFAULT_DEPS,
): CredentialVerification {
  const presentedDigest = deps.digest(typeof presented === "string" ? presented : "");

  let matched = false;
  let ordinal: number | null = null;

  for (let index = 0; index < operatorSecrets.length; index += 1) {
    const candidateDigest = deps.digest(operatorSecrets[index] ?? "");

    // `timingSafeEqual` is safe here and only here because both operands are SHA-256 output, so
    // their lengths are equal by construction rather than by a check that could leak.
    const equal = timingSafeEqual(presentedDigest, candidateDigest);

    // Accumulate. Do NOT return: the loop must consume the whole configured set whether or not a
    // match has already been found. `!matched` only keeps the reported ordinal deterministic (the
    // first match wins), and it deliberately does not skip the digest above.
    if (equal && !matched) {
      matched = true;
      ordinal = index + 1;
    }
  }

  return { matched, ordinal };
}
