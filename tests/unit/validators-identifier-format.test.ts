import { describe, expect, it } from "vitest";

import { isAnonymousValidatorIdFormat } from "@/lib/domain/anonymous-validator-id";
import { ANONYMOUS_VALIDATOR_ID_PATTERN, anonymousValidatorIdSchema } from "@/schemas/validator";

/**
 * The two checks on the anonymous identifier format must never disagree.
 *
 * `anonymousValidatorIdSchema` (used by the Server Actions to narrow an untrusted
 * payload) and `isAnonymousValidatorIdFormat` (used by the enrollment service to guard
 * a direct caller) are two different code paths that must reach the same verdict. Today
 * they agree because both read the single `ANONYMOUS_VALIDATOR_ID_PATTERN`, which makes
 * the service's check redundant with the action's — a redundancy documented in
 * `onboarding-actions-core.ts` rather than left looking accidental.
 *
 * This test exists because that agreement is a PROPERTY, not a coincidence. If someone
 * later adds a second pattern definition, or relaxes one side only, the redundancy
 * silently stops being redundancy and becomes a path where a malformed identifier is
 * accepted on one route and rejected on the other. That divergence would be very hard to
 * find from a failure message.
 *
 * The table deliberately includes near-misses: values that differ from a valid
 * identifier in exactly one character or one character class. A regex bug almost always
 * lives at a boundary, and an all-valid table would not notice one.
 */
const VALID = ["VAL_00000000", "VAL_deadbeef", "VAL_01234567", "VAL_abcdef00"];

const INVALID = [
  ["empty string", ""],
  ["missing prefix", "0000abcd"],
  ["lowercase prefix", "val_0000abcd"],
  ["mixed-case prefix", "Val_0000abcd"],
  ["uppercase hex digits", "VAL_0000ABCD"],
  ["mixed-case hex digits", "VAL_00aBcDeF"],
  ["seven hex digits", "VAL_0000abc"],
  ["nine hex digits", "VAL_0000abcde"],
  ["non-hex letters", "VAL_zzzzzzzz"],
  ["leading space", " VAL_0000abcd"],
  ["trailing space", "VAL_0000abcd "],
  ["trailing newline", "VAL_0000abcd\n"],
  ["underscore separator", "VAL_0000abc_"],
  ["embedded space", "VAL_0000 abc"],
  ["unicode digits", "VAL_００００abcd"],
  ["prefix only", "VAL_"],
  ["empty with prefix", "VAL"],
] as const;

describe("the anonymous validator identifier format", () => {
  it.each(VALID)("accepts %s", (id) => {
    expect(isAnonymousValidatorIdFormat(id)).toBe(true);
    expect(anonymousValidatorIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(INVALID)("rejects a value with %s", (_label, id) => {
    expect(isAnonymousValidatorIdFormat(id)).toBe(false);
    expect(anonymousValidatorIdSchema.safeParse(id).success).toBe(false);
  });

  it("gives the same verdict from both checks for every table entry", () => {
    // The property itself, asserted as a property rather than implied by the two blocks
    // above passing independently.
    const cases = [...VALID, ...INVALID.map(([, id]) => id)];
    for (const id of cases) {
      expect(anonymousValidatorIdSchema.safeParse(id).success).toBe(
        isAnonymousValidatorIdFormat(id),
      );
    }
  });

  it("is anchored, so a longer string cannot match by prefix", () => {
    // `^...$` with a RegExp (not a global one) is what makes this hold. A missing `^`
    // would accept `VAL_0000abcd-extra`, which is a real identifier prefix plus
    // attacker-chosen trailing content.
    expect(ANONYMOUS_VALIDATOR_ID_PATTERN.source).toMatch(/^\^/);
    expect(ANONYMOUS_VALIDATOR_ID_PATTERN.source).toMatch(/\$$/);
    expect(isAnonymousValidatorIdFormat("VAL_0000abcd-extra")).toBe(false);
  });

  it("names the expected format when the schema rejects a value", () => {
    const parsed = anonymousValidatorIdSchema.safeParse("nope");

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(
      "id must look like VAL_ followed by 32 lowercase hex characters (a legacy VAL_ with 8 is still accepted)",
    );
  });
});
