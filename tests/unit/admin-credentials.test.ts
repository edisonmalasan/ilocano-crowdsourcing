import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyOperatorCredential, type CredentialDigest } from "@/lib/admin/credentials";

/**
 * Exact operator-credential comparison.
 *
 * =================================================================================================
 * WHY THE WORK IS COUNTED RATHER THAN TIMED
 * =================================================================================================
 * D4 requires two things that are invisible in the return value: no early exit from the INNER
 * comparison, and no early exit from the OUTER loop over the configured set. Both are statements about
 * how much work a call performs, and a test that only checked the boolean would pass with either
 * early exit present — a return value cannot distinguish "compared everything and found nothing" from
 * "gave up at the third entry".
 *
 * Timing would be the obvious instrument and it is the wrong one. A `Date.now()`-based bound on a
 * SHA-256 loop fails or passes according to machine load, CI parallelism, and timer resolution, and a
 * test that is sometimes red for reasons unrelated to the code teaches people to ignore it. So the
 * digest is INJECTED and counted instead. The count is exact, deterministic, and it measures the thing
 * the requirement is about.
 *
 * The count also makes the outer guarantee falsifiable in a way a timing bound could not: a match at
 * the FIRST position of a ten-credential set must still cost eleven digests, and an early `return`
 * would cost two.
 */

/** The real digest, so the non-counting assertions exercise production behaviour. */
const realDigest: CredentialDigest = (value) => createHash("sha256").update(value, "utf8").digest();

/** Ten long, distinct credentials. A real set rather than `"0".."9"`, which share prefixes. */
const TEN = Array.from({ length: 10 }, (_, i) => `credential-number-${i}-8a4f2c1e`);

/**
 * A digest that returns a fixed 32-byte value, so `timingSafeEqual` cannot throw on a length
 * mismatch, and counts every call.
 *
 * The value is deliberately CONSTANT rather than a hash of its input: a counting digest that
 * returned the real digest would make every comparison a mismatch and quietly break the
 * accept-the-correct-credential tests if one of them were ever wired to it.
 */
function countingDigest(): { digest: CredentialDigest; calls: () => number } {
  let count = 0;
  const constant = Buffer.alloc(32, 7);
  return {
    digest: () => {
      count += 1;
      return constant;
    },
    calls: () => count,
  };
}

describe("verifyOperatorCredential", () => {
  it("accepts an exactly matching credential and reports its 1-based ordinal", () => {
    expect(verifyOperatorCredential(TEN[4], TEN, { digest: realDigest })).toEqual({
      matched: true,
      ordinal: 5,
    });
  });

  it("reports ordinal 1 for the first entry and the last index for the last", () => {
    expect(verifyOperatorCredential(TEN[0], TEN, { digest: realDigest })).toEqual({
      matched: true,
      ordinal: 1,
    });
    expect(verifyOperatorCredential(TEN[9], TEN, { digest: realDigest })).toEqual({
      matched: true,
      ordinal: 10,
    });
  });

  it("refuses a value matching no credential, and reports no ordinal", () => {
    expect(verifyOperatorCredential("not-a-credential", TEN, { digest: realDigest })).toEqual({
      matched: false,
      ordinal: null,
    });
  });

  // -------------------------------------------------------------------------------------------
  // The four near misses the spec names, each as its own test.
  // -------------------------------------------------------------------------------------------

  it("refuses a PREFIX of a configured credential", () => {
    const full = TEN[3];
    const result = verifyOperatorCredential(full.slice(0, full.length - 1), TEN, {
      digest: realDigest,
    });
    expect(result.matched).toBe(false);
  });

  it("refuses a configured credential that is a prefix of the presented value", () => {
    const full = TEN[3];
    const result = verifyOperatorCredential(`${full}x`, TEN, { digest: realDigest });
    expect(result.matched).toBe(false);
  });

  it("refuses a value differing only in letter case", () => {
    const result = verifyOperatorCredential(TEN[3].toUpperCase(), TEN, { digest: realDigest });
    expect(result.matched).toBe(false);
    // And the lower-cased original still works, so the refusal above is about case and not about
    // the credential having been mangled by the test.
    expect(verifyOperatorCredential(TEN[3], TEN, { digest: realDigest }).matched).toBe(true);
  });

  it("refuses a value differing only by TRAILING WHITESPACE", () => {
    // The asymmetry that matters: the ENVIRONMENT trims each configured entry, and the PRESENTED
    // value is not trimmed. A credential copied with a trailing space is a different credential,
    // and accepting it would mean a value the operator never chose works.
    expect(verifyOperatorCredential(`${TEN[3]} `, TEN, { digest: realDigest }).matched).toBe(false);
    expect(verifyOperatorCredential(` ${TEN[3]}`, TEN, { digest: realDigest }).matched).toBe(false);
    expect(verifyOperatorCredential(`${TEN[3]}\n`, TEN, { digest: realDigest }).matched).toBe(
      false,
    );
  });

  // -------------------------------------------------------------------------------------------
  // Absent and non-string input, so a missing field is indistinguishable from a wrong one.
  // -------------------------------------------------------------------------------------------

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 1234],
    ["an object", { credential: "x" }],
    ["an array", [TEN[0]]],
    ["an empty string", ""],
  ])("refuses %s exactly as it refuses a wrong value", (_label, presented) => {
    const result = verifyOperatorCredential(presented, TEN, { digest: realDigest });
    expect(result).toEqual({ matched: false, ordinal: null });
  });

  it("refuses every value when NO credentials are configured", () => {
    expect(verifyOperatorCredential("anything", [], { digest: realDigest })).toEqual({
      matched: false,
      ordinal: null,
    });
  });

  // -------------------------------------------------------------------------------------------
  // THE MEASUREMENTS. These are the assertions the whole file exists for.
  // -------------------------------------------------------------------------------------------

  it("compares against EVERY configured credential even when the FIRST one matches", () => {
    const counter = countingDigest();
    verifyOperatorCredential(TEN[0], TEN, { digest: counter.digest });
    // 1 for the presented value + 10 for the set. An early `return` inside the loop would report 2.
    expect(counter.calls()).toBe(TEN.length + 1);
  });

  it("compares against EVERY configured credential even when the LAST one matches", () => {
    const counter = countingDigest();
    verifyOperatorCredential(TEN[9], TEN, { digest: counter.digest });
    expect(counter.calls()).toBe(TEN.length + 1);
  });

  it("does the SAME work on a hit and on a miss, in the same environment", () => {
    const onHit = countingDigest();
    verifyOperatorCredential(TEN[6], TEN, { digest: onHit.digest });
    const onMiss = countingDigest();
    verifyOperatorCredential("no-such-credential", TEN, { digest: onMiss.digest });

    // This is the assertion a timing test would attempt. Making the two counts EQUAL is what says
    // "the comparison does not stop early when it finds an answer", which is precisely the
    // information a boolean return value cannot carry.
    expect(onHit.calls()).toBe(onMiss.calls());
  });

  it("does MORE work as the configured set grows, so the set size is not readable from a single call", () => {
    // The other half of D4. A one-credential and a ten-credential deployment must not be
    // distinguishable by how long one refusal takes, and they are not here: the loop consumes the
    // whole set in both cases.
    const small = countingDigest();
    verifyOperatorCredential("no-such-credential", [TEN[0]], { digest: small.digest });
    const large = countingDigest();
    verifyOperatorCredential("no-such-credential", TEN, { digest: large.digest });

    expect(small.calls()).toBe(2);
    expect(large.calls()).toBe(11);
    // The work scales with the set, and the DIFFERENCE is visible. What is not visible is WHERE in
    // the set a match occurred, which is the property the first two tests hold.
  });

  it("reports the FIRST match when a value appears twice, deterministically", () => {
    const duplicated = [TEN[0], TEN[1], TEN[0]];
    expect(verifyOperatorCredential(TEN[0], duplicated, { digest: realDigest })).toEqual({
      matched: true,
      ordinal: 1,
    });
  });

  it("uses the production digest by default, so the happy path is not only tested through injection", () => {
    // A guard against the default being wrong in a way injection hides. With the DEFAULT digest, a
    // correct credential is accepted and a near miss is not — which `timingSafeEqual` over equal-length
    // buffers cannot do unless the digest is actually a digest.
    expect(verifyOperatorCredential(TEN[7], TEN).matched).toBe(true);
    expect(verifyOperatorCredential(TEN[7].toUpperCase(), TEN).matched).toBe(false);
    expect(verifyOperatorCredential(`${TEN[7]} `, TEN).matched).toBe(false);
  });
});
