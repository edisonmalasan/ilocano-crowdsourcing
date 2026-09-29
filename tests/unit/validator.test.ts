import { describe, expect, it } from "vitest";

import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  anonymousValidatorIdSchema,
  ilocanoProficiencySchema,
  validatorProfileSchema,
} from "@/schemas/validator";

const VALID_PROFILE = {
  id: "VAL_a81d92c1",
  ilocanoProficiency: "fluent",
  createdAt: "2026-09-30T00:00:00.000Z",
  lastActiveAt: "2026-09-30T01:00:00.000Z",
  totalValidations: 3,
} as const;

describe("approved screening copy", () => {
  it("uses the approved screening question verbatim", () => {
    expect(ILOCANO_PROFICIENCY_QUESTION).toBe("How comfortable are you with Ilocano?");
  });

  it("uses the approved supporting copy verbatim", () => {
    expect(ILOCANO_PROFICIENCY_SUPPORTING_COPY).toBe(
      "This helps us understand the background of our validators.",
    );
  });
});

describe("ilocano proficiency", () => {
  it("accepts all five approved choices and maps them to the documented identifiers", () => {
    const expected = [
      { label: "Native / first-language speaker", value: "native" },
      { label: "Fluent", value: "fluent" },
      { label: "Conversational", value: "conversational" },
      { label: "Basic", value: "basic" },
      { label: "Not confident", value: "not_confident" },
    ];

    expect([...ILOCANO_PROFICIENCY_CHOICES]).toEqual(expected);

    for (const choice of expected) {
      expect(ilocanoProficiencySchema.parse(choice.value)).toBe(choice.value);
    }
  });

  it("presents the choices in the approved display order", () => {
    // Order is a research-facing decision, not a cosmetic one: the screening screen must present
    // the levels from strongest to weakest self-report.
    expect(ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value)).toEqual([
      "native",
      "fluent",
      "conversational",
      "basic",
      "not_confident",
    ]);
  });

  it("rejects a proficiency value outside the five approved choices", () => {
    for (const rejected of ["expert", "native_speaker", "Native", "not_confident ", "", "none"]) {
      expect(
        ilocanoProficiencySchema.safeParse(rejected).success,
        `expected ${JSON.stringify(rejected)} to be rejected`,
      ).toBe(false);
    }
  });
});

describe("anonymous validator identifier", () => {
  it("accepts the documented opaque format", () => {
    expect(anonymousValidatorIdSchema.parse("VAL_a81d92c1")).toBe("VAL_a81d92c1");
    expect(anonymousValidatorIdSchema.parse("VAL_00000000")).toBe("VAL_00000000");
    expect(anonymousValidatorIdSchema.parse("VAL_ffffffff")).toBe("VAL_ffffffff");
  });

  it("rejects a malformed identifier", () => {
    const malformed = [
      "VAL_A81D92C1", // uppercase hex
      "VAL_a81d92c", // 7 hex chars
      "VAL_a81d92c12", // 10 hex chars
      "val_a81d92c1", // wrong prefix case
      "VAL_a81d92c-", // non-hex character
      "USR_a81d92c1", // wrong prefix
      "VAL_",
      "",
    ];

    for (const candidate of malformed) {
      expect(
        anonymousValidatorIdSchema.safeParse(candidate).success,
        `expected ${JSON.stringify(candidate)} to be rejected`,
      ).toBe(false);
    }
  });
});

describe("validator profile anonymity", () => {
  it("exposes only the opaque id, self-reported proficiency, and activity fields", () => {
    const parsed = validatorProfileSchema.parse(VALID_PROFILE);

    expect(Object.keys(parsed).sort()).toEqual([
      "createdAt",
      "id",
      "ilocanoProficiency",
      "lastActiveAt",
      "totalValidations",
    ]);
  });

  it("carries no personally identifying key", () => {
    const parsed = validatorProfileSchema.parse(VALID_PROFILE);
    const forbidden = [
      "name",
      "fullName",
      "firstName",
      "lastName",
      "email",
      "studentId",
      "phone",
      "phoneNumber",
      "address",
      "facebook",
      "socialMedia",
      "username",
    ];

    for (const key of Object.keys(parsed)) {
      expect(forbidden, `unexpected identifying key ${key}`).not.toContain(key);
    }
  });

  it("rejects a payload carrying an extra key rather than stripping it", () => {
    // `strictObject` is what makes the anonymity invariant enforceable at runtime and not merely
    // a convention: an attempt to add an email is a loud failure, not a silent discard.
    const result = validatorProfileSchema.safeParse({ ...VALID_PROFILE, email: "a@b.test" });

    expect(result.success).toBe(false);
  });

  it("accepts a null proficiency, so a profile exists before screening is completed", () => {
    const parsed = validatorProfileSchema.parse({ ...VALID_PROFILE, ilocanoProficiency: null });

    expect(parsed.ilocanoProficiency).toBeNull();
  });

  it("carries no score, weight, rank, or eligibility flag derived from proficiency", () => {
    // Proficiency is self-reported research metadata. Nothing derived from it may appear on the
    // profile or anywhere in the public experience.
    const parsed = validatorProfileSchema.parse(VALID_PROFILE);
    const derived = [
      "score",
      "qualityScore",
      "weight",
      "rank",
      "eligible",
      "eligibility",
      "isEligible",
      "tier",
    ];

    for (const key of Object.keys(parsed)) {
      expect(derived, `unexpected derived key ${key}`).not.toContain(key);
    }
  });

  it("rejects a profile whose id is not in the opaque format", () => {
    const result = validatorProfileSchema.safeParse({ ...VALID_PROFILE, id: "validator-1" });

    expect(result.success).toBe(false);
  });

  it("rejects a negative totalValidations count", () => {
    const result = validatorProfileSchema.safeParse({ ...VALID_PROFILE, totalValidations: -1 });

    expect(result.success).toBe(false);
  });
});
