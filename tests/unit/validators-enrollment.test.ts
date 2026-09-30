import { describe, expect, it, vi } from "vitest";

import { RepositoryError, type ValidatorsRepository } from "@/lib/repositories";
import {
  enrollValidator,
  parseScreeningAnswer,
  resumeValidator,
  type EnrollmentOutcome,
  type EnrollmentRequest,
  type ResumeOutcome,
} from "@/lib/validators/enrollment";
import { ANONYMOUS_VALIDATOR_ID_PATTERN } from "@/schemas/validator";

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed
 * here. The boundary it protects is asserted separately by
 * `tests/unit/supabase-clients.test.ts`, which deliberately does NOT stub it and
 * instead asserts that importing a server-only module rejects.
 */
vi.mock("server-only", () => ({}));

/** Records every call so a test can assert what the service did and did not do. */
function createRecordingValidators() {
  const calls: Array<{ method: string; argument: unknown }> = [];
  let created: unknown = null;
  let findResult: unknown = null;
  let createError: unknown = null;
  let findError: unknown = null;

  const validators: ValidatorsRepository = {
    create: vi.fn(async (profile) => {
      calls.push({ method: "create", argument: profile });
      if (createError) throw createError;
      created = profile;
      return profile;
    }),
    findById: vi.fn(async (id) => {
      calls.push({ method: "findById", argument: id });
      if (findError) throw findError;
      return findResult as Awaited<ReturnType<ValidatorsRepository["findById"]>>;
    }),
    touchLastActive: vi.fn(async (id) => {
      calls.push({ method: "touchLastActive", argument: id });
    }),
  };

  return {
    validators,
    calls,
    get created() {
      return created;
    },
    set findResult(value: unknown) {
      findResult = value;
    },
    set createError(value: unknown) {
      createError = value;
    },
    set findError(value: unknown) {
      findError = value;
    },
    countOf(method: string): number {
      return calls.filter((call) => call.method === method).length;
    },
  };
}

const FIXED_NOW = new Date("2026-09-30T12:00:00.000Z");
const FIXED_ISO = FIXED_NOW.toISOString();

function deps(now: () => Date = () => FIXED_NOW) {
  const repo = createRecordingValidators();
  return { repo, dependencies: { validators: repo.validators, now } };
}

function request(proficiency: EnrollmentRequest["ilocanoProficiency"]): EnrollmentRequest {
  return { ilocanoProficiency: proficiency };
}

describe("enrollValidator", () => {
  it("mints the identifier server-side and returns it in the approved format", async () => {
    const { repo, dependencies } = deps();

    const outcome = await enrollValidator(request("fluent"), dependencies);

    expect(outcome).toMatchObject({ status: "enrolled" });
    if (outcome.status !== "enrolled") throw new Error("expected an enrolled outcome");
    expect(outcome.validatorId).toMatch(ANONYMOUS_VALIDATOR_ID_PATTERN);
  });

  it("persists exactly one profile per enrollment", async () => {
    const { repo, dependencies } = deps();

    await enrollValidator(request("native"), dependencies);

    expect(repo.countOf("create")).toBe(1);
    expect(repo.countOf("findById")).toBe(0);
    expect(repo.countOf("touchLastActive")).toBe(0);
  });

  it("derives both timestamps from the injected clock and starts the counter at zero", async () => {
    const { repo, dependencies } = deps();

    await enrollValidator(request("basic"), dependencies);

    expect(repo.created).toMatchObject({
      createdAt: FIXED_ISO,
      lastActiveAt: FIXED_ISO,
      totalValidations: 0,
    });
  });

  it("stores the screening answer verbatim with nothing derived from it", async () => {
    const { repo, dependencies } = deps();

    await enrollValidator(request("conversational"), dependencies);

    const stored = repo.created as Record<string, unknown>;
    expect(stored.ilocanoProficiency).toBe("conversational");
    // No score, weight, rank, or eligibility flag may be derived from the answer.
    expect(Object.keys(stored).sort()).toEqual([
      "createdAt",
      "id",
      "ilocanoProficiency",
      "lastActiveAt",
      "totalValidations",
    ]);
  });

  it("records a declined screening answer as absence rather than a substituted value", async () => {
    const { repo, dependencies } = deps();

    await enrollValidator(request(null), dependencies);

    expect(repo.created).toMatchObject({ ilocanoProficiency: null });
  });

  it("refuses to store an unapproved proficiency, even when called directly", async () => {
    const { repo, dependencies } = deps();

    // The service applies its own guard rather than trusting its input type, so a
    // caller that bypasses the action boundary still cannot record an answer that
    // is not one of the five approved choices.
    await expect(
      enrollValidator(
        { ilocanoProficiency: "expert" } as unknown as EnrollmentRequest,
        dependencies,
      ),
    ).rejects.toThrow();

    expect(repo.countOf("create")).toBe(0);
  });

  it("refuses to store a non-string proficiency rather than coercing it", async () => {
    const { repo, dependencies } = deps();

    await expect(
      enrollValidator({ ilocanoProficiency: 1 } as unknown as EnrollmentRequest, dependencies),
    ).rejects.toThrow();

    expect(repo.countOf("create")).toBe(0);
  });

  it("mints a distinct identifier per enrollment", async () => {
    const first = deps();
    const second = deps();

    const a = await enrollValidator(request("fluent"), first.dependencies);
    const b = await enrollValidator(request("fluent"), second.dependencies);

    expect(a).not.toEqual(b);
  });

  it("ignores authoritative-shaped keys supplied alongside the screening answer", async () => {
    const { repo, dependencies } = deps();

    // A caller trying to dictate the identity, the clock, or the counter.
    await enrollValidator(
      {
        ilocanoProficiency: "fluent",
        id: "VAL_deadbeef",
        createdAt: "1999-01-01T00:00:00.000Z",
        lastActiveAt: "1999-01-01T00:00:00.000Z",
        totalValidations: 9999,
      } as unknown as EnrollmentRequest,
      dependencies,
    );

    const stored = repo.created as Record<string, unknown>;
    expect(stored.id).not.toBe("VAL_deadbeef");
    expect(stored.id).toMatch(ANONYMOUS_VALIDATOR_ID_PATTERN);
    expect(stored.createdAt).toBe(FIXED_ISO);
    expect(stored.lastActiveAt).toBe(FIXED_ISO);
    expect(stored.totalValidations).toBe(0);
  });

  it("reports a repository failure as an outcome instead of throwing", async () => {
    const { repo, dependencies } = deps();
    repo.createError = new RepositoryError("validators.insert", "insert rejected", {
      detail: "duplicate key",
    });

    const outcome = await enrollValidator(request("fluent"), dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence_error" });
  });

  it("never reports an identifier on a failed outcome", async () => {
    const { repo, dependencies } = deps();
    repo.createError = new RepositoryError("validators.insert", "insert rejected");

    const outcome: EnrollmentOutcome = await enrollValidator(request("fluent"), dependencies);

    expect(outcome).not.toHaveProperty("validatorId");
  });

  it("re-raises a non-repository error rather than reporting it as a persistence failure", async () => {
    const { repo, dependencies } = deps();
    repo.createError = new TypeError("a programming error, not a query failure");

    await expect(enrollValidator(request("fluent"), dependencies)).rejects.toThrow(TypeError);
  });

  it("returns the identifier the repository stored, not the one it was handed", async () => {
    const { repo, dependencies } = deps();
    // A repository that normalises the identifier on the way in.
    const original = repo.validators.create;
    repo.validators.create = vi.fn(async (profile) =>
      original({ ...profile, id: "VAL_0000abcd" as typeof profile.id }),
    );

    const outcome = await enrollValidator(request("fluent"), dependencies);

    if (outcome.status !== "enrolled") throw new Error("expected an enrolled outcome");
    expect(outcome.validatorId).toBe("VAL_0000abcd");
  });
});

describe("parseScreeningAnswer", () => {
  it("accepts each of the five approved choices", () => {
    for (const value of ["native", "fluent", "conversational", "basic", "not_confident"]) {
      expect(parseScreeningAnswer(value)).toBe(value);
    }
  });

  it("treats an absent answer as a declined answer", () => {
    expect(parseScreeningAnswer(null)).toBeNull();
    expect(parseScreeningAnswer(undefined)).toBeNull();
  });

  it("refuses a proficiency value outside the five approved choices", () => {
    expect(() => parseScreeningAnswer("expert")).toThrow();
    expect(() => parseScreeningAnswer("")).toThrow();
  });

  it("refuses to convert an invalid answer into a declined one", () => {
    // The dangerous behavior would be returning null here, which would silently
    // record "declined" for a value the participant did pick.
    expect(() => parseScreeningAnswer(42)).toThrow();
    expect(() => parseScreeningAnswer({ value: "fluent" })).toThrow();
  });
});

describe("resumeValidator", () => {
  it("restores a validator the server recognises", async () => {
    const { repo, dependencies } = deps();
    repo.findResult = {
      id: "VAL_0000abcd",
      ilocanoProficiency: "fluent",
      createdAt: FIXED_ISO,
      lastActiveAt: FIXED_ISO,
      totalValidations: 0,
    };

    const outcome = await resumeValidator("VAL_0000abcd", dependencies);

    expect(outcome).toEqual({ status: "restored", validatorId: "VAL_0000abcd" });
  });

  it("reports an unrecognised identifier as absent rather than as an error", async () => {
    const { dependencies } = deps();

    const outcome = await resumeValidator("VAL_0000abcd", dependencies);

    expect(outcome).toEqual({ status: "absent" });
  });

  it("never queries the repository for a malformed stored value", async () => {
    const { repo, dependencies } = deps();

    for (const malformed of ["", "not-an-id", "VAL_zzzzzzzz", "VAL_short", " val_0000abcd"]) {
      const outcome: ResumeOutcome = await resumeValidator(malformed, dependencies);
      expect(outcome).toEqual({ status: "absent" });
    }

    expect(repo.countOf("findById")).toBe(0);
  });

  it("returns no stored profile fields to the caller", async () => {
    const { repo, dependencies } = deps();
    repo.findResult = {
      id: "VAL_0000abcd",
      ilocanoProficiency: "fluent",
      createdAt: FIXED_ISO,
      lastActiveAt: FIXED_ISO,
      totalValidations: 7,
    };

    const outcome = await resumeValidator("VAL_0000abcd", dependencies);

    expect(Object.keys(outcome).sort()).toEqual(["status", "validatorId"]);
  });

  it("propagates a repository failure rather than reporting absence", async () => {
    const { repo, dependencies } = deps();
    repo.findError = new RepositoryError("validators.findById", "select failed");

    // "Absent" and "the query failed" must stay distinguishable.
    await expect(resumeValidator("VAL_0000abcd", dependencies)).rejects.toThrow(RepositoryError);
  });
});
