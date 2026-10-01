import { describe, expect, it, vi } from "vitest";

// `@/lib/admin/env` carries `import "server-only"`, whose real module throws outside a React Server
// Component graph. Stubbing the marker is what the other server-only suites in this project do, and
// it changes nothing about what is under test: the contract is pure validation, and the marker is a
// bundler boundary assertion rather than a runtime behaviour.
vi.mock("server-only", () => ({}));

import {
  ADMIN_ENV_VARIABLE_NAMES,
  ADMIN_OPERATOR_SECRETS,
  ADMIN_SESSION_SECRET,
  describeAdminEnvProblems,
  getAdminEnv,
  resolveAdminEnv,
} from "@/lib/admin/env";

/**
 * The researcher-area environment contract.
 *
 * =================================================================================================
 * WHY THESE TESTS ARE ABOUT WORDINGS AND NOT JUST ACCEPTANCE
 * =================================================================================================
 * Two of the eight requirements in this change are about what a misconfiguration MAY SAY, and a test
 * that only asserted `status === "unconfigured"` would pass while a message echoed the secret it was
 * complaining about. The spec is explicit that a configuration error "names every missing or invalid
 * variable at once and contains no value and no fragment of a value", so `containsNoValueOf` below
 * is the test that makes that checkable — and it is deliberately the strictest assertion in the
 * file, checking not just for the whole value but for every 4-character window of it.
 *
 * A four-character window is the shortest string that would narrow a long secret by anything
 * meaningful, so "the message contains no 4-character run of the supplied value" is a stronger claim
 * than "the message does not contain the value", and it is the one worth making.
 */

/** Both variables populated with values no message may echo. */
function populated(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [ADMIN_OPERATOR_SECRETS]: "alpha-credential-9f2c8b1a",
    [ADMIN_SESSION_SECRET]: "beta-secret-4d7e0a93",
    ...overrides,
  };
}

/**
 * Removes a key from the environment object entirely.
 *
 * Needed because an ABSENT variable and a BLANK one must produce byte-identical refusals, and a
 * helper built by spreading overrides cannot express absence: `populated({ X: "" })` overrides the
 * value, and `populated({})` leaves the populated default in place. A first draft of this file used
 * `{}` for the "missing entirely" case and reported four green-looking failures that were all this
 * mistake — the implementation was right and the instrument was wrong, which is the direction that
 * matters least to notice and matters most to correct.
 */
function without(key: string): Record<string, unknown> {
  const env = populated();
  delete env[key];
  return env;
}

/**
 * Asserts a message carries no part of any supplied value.
 *
 * Checked over every 4-character window, not just the whole string, because a message that echoed
 * four characters of a 20-character secret has still narrowed it. Every supplied value is checked,
 * including the ones that are not the subject of the particular problem, so a message that leaks a
 * DIFFERENT variable's value is also caught.
 */
function containsNoValueOf(message: string, values: readonly string[]): void {
  for (const value of values) {
    if (value.length < 4) continue;
    expect(message).not.toContain(value);
    for (let start = 0; start + 4 <= value.length; start += 1) {
      const window = value.slice(start, start + 4);
      // A 4-character window of a value that also appears in ordinary prose is not a leak; skip the
      // ones that are pure whitespace, which cannot be a fragment worth hiding.
      if (window.trim() === "") continue;
      expect(message).not.toContain(window);
    }
  }
}

describe("resolveAdminEnv", () => {
  it("accepts a fully populated environment", () => {
    const resolution = resolveAdminEnv(populated());
    expect(resolution).toEqual({
      status: "configured",
      env: {
        operatorSecrets: ["alpha-credential-9f2c8b1a"],
        sessionSecret: "beta-secret-4d7e0a93",
      },
    });
  });

  it("reads a comma-separated set in order, so an ordinal is a POSITION", () => {
    const resolution = resolveAdminEnv(
      populated({
        [ADMIN_OPERATOR_SECRETS]: "  first-credential  ,second-credential ,  third-credential",
      }),
    );
    expect(resolution.status).toBe("configured");
    if (resolution.status !== "configured") return;
    // Trimming each entry is the whole reason a position survives a hand-edited file. The ORDER is
    // asserted explicitly because the session's ordinal is an index into exactly this array, and a
    // set operation that sorted or deduplicated would silently revoke somebody's session.
    expect(resolution.env.operatorSecrets).toEqual([
      "first-credential",
      "second-credential",
      "third-credential",
    ]);
  });

  // -------------------------------------------------------------------------------------------
  // Blank counts as absent, and must be indistinguishable from absent.
  // -------------------------------------------------------------------------------------------

  it.each([
    ["missing entirely", without(ADMIN_OPERATOR_SECRETS)],
    ["empty", populated({ [ADMIN_OPERATOR_SECRETS]: "" })],
    ["a single space", populated({ [ADMIN_OPERATOR_SECRETS]: " " })],
    ["only whitespace", populated({ [ADMIN_OPERATOR_SECRETS]: "\t\n  " })],
  ])(
    "refuses when the credential set is %s, with the SAME problem as an absent variable",
    (_label, source) => {
      const resolution = resolveAdminEnv(source);
      expect(resolution.status).toBe("unconfigured");
      if (resolution.status !== "unconfigured") return;
      expect(resolution.problems).toEqual([
        `${ADMIN_OPERATOR_SECRETS} — is absent, empty, or only whitespace. A blank value counts as absent.`,
      ]);
    },
  );

  it("produces byte-identical problems for an absent and for a blank credential set", () => {
    const absent = resolveAdminEnv({ [ADMIN_SESSION_SECRET]: "beta-secret-4d7e0a93" });
    const blank = resolveAdminEnv({
      [ADMIN_OPERATOR_SECRETS]: "   ",
      [ADMIN_SESSION_SECRET]: "beta-secret-4d7e0a93",
    });
    expect(JSON.stringify(absent)).toBe(JSON.stringify(blank));
  });

  it("refuses when the session secret is absent, blank, or whitespace", () => {
    const sources: Record<string, unknown>[] = [
      without(ADMIN_SESSION_SECRET),
      populated({ [ADMIN_SESSION_SECRET]: "" }),
      populated({ [ADMIN_SESSION_SECRET]: "  " }),
      populated({ [ADMIN_SESSION_SECRET]: "\t" }),
    ];
    for (const source of sources) {
      const resolution = resolveAdminEnv(source);
      expect(resolution.status).toBe("unconfigured");
      if (resolution.status !== "unconfigured") continue;
      expect(resolution.problems).toEqual([
        `${ADMIN_SESSION_SECRET} — is absent, empty, or only whitespace. A blank value counts as absent.`,
      ]);
    }
  });

  // -------------------------------------------------------------------------------------------
  // Every problem at once, by name, with no value.
  // -------------------------------------------------------------------------------------------

  it("names every missing variable at once rather than failing on the first", () => {
    const resolution = resolveAdminEnv({});
    expect(resolution.status).toBe("unconfigured");
    if (resolution.status !== "unconfigured") return;
    // BOTH variables, in one result. A fail-fast contract would have told a developer to fix one and
    // restart, and the point of the aggregate is that they do not.
    expect(resolution.problems).toHaveLength(2);
    for (const name of ADMIN_ENV_VARIABLE_NAMES) {
      expect(resolution.problems.some((p) => p.startsWith(name))).toBe(true);
    }
  });

  it("contains no value and no fragment of a value in any problem", () => {
    const secretValue = "a7f3d9e2b1c04856";
    const credentialValue = "c4e8a1d5f0937b2e";
    const resolution = resolveAdminEnv(
      // A blank ENTRY is what makes this unconfigured while both values are long and distinctive,
      // so the messages have every opportunity to echo one of them. A first draft of this test used a
      // duplicated credential with a trailing space, which trims to a perfectly VALID two-entry set —
      // so it asserted against a `configured` result and told the reader nothing.
      populated({
        [ADMIN_OPERATOR_SECRETS]: `${credentialValue},${credentialValue},`,
        [ADMIN_SESSION_SECRET]: secretValue,
      }),
    );
    expect(resolution.status).toBe("unconfigured");
    if (resolution.status !== "unconfigured") return;
    const rendered = resolution.problems.join("\n");
    containsNoValueOf(rendered, [secretValue, credentialValue]);
  });

  it("describes a misconfiguration without echoing anything it was given", () => {
    const secretValue = "9b1d4f7a2c603e85";
    const resolution = resolveAdminEnv(
      populated({ [ADMIN_OPERATOR_SECRETS]: "s1,s2,", [ADMIN_SESSION_SECRET]: secretValue }),
    );
    const description = describeAdminEnvProblems(resolution);
    containsNoValueOf(description, [secretValue, "s1", "s2"]);
    expect(description).toContain("The researcher area is not configured");
  });

  it("describes nothing at all for a configured environment", () => {
    expect(describeAdminEnvProblems(resolveAdminEnv(populated()))).toBe("");
  });

  // -------------------------------------------------------------------------------------------
  // A blank ENTRY is a different problem from an absent variable, and is reported by position.
  // -------------------------------------------------------------------------------------------

  it("rejects a blank entry in the credential set, naming its POSITION and not its value", () => {
    const resolution = resolveAdminEnv(
      populated({ [ADMIN_OPERATOR_SECRETS]: "first-credential,,third-credential" }),
    );
    expect(resolution.status).toBe("unconfigured");
    if (resolution.status !== "unconfigured") return;
    expect(resolution.problems).toHaveLength(1);
    // Entry 2 of 3. The position is what tells an operator WHICH comma to delete; there is no value
    // at that position to name.
    expect(resolution.problems[0]).toBe(
      `${ADMIN_OPERATOR_SECRETS} — entry 2 is blank. Every entry must be a non-blank credential.`,
    );
  });

  it("names EVERY blank entry rather than stopping at the first", () => {
    // `"a, ,c, ,d"` — a trailing comma is NOT used here on purpose. A first draft used `"a, ,c, ,"`
    // and expected two problems; the implementation reported three, and it was RIGHT: a trailing
    // comma produces a fifth, empty entry. The expectation was wrong, not the count.
    const resolution = resolveAdminEnv(populated({ [ADMIN_OPERATOR_SECRETS]: "a, ,c, ,d" }));
    expect(resolution.status).toBe("unconfigured");
    if (resolution.status !== "unconfigured") return;
    expect(resolution.problems).toEqual([
      `${ADMIN_OPERATOR_SECRETS} — entry 2 is blank. Every entry must be a non-blank credential.`,
      `${ADMIN_OPERATOR_SECRETS} — entry 4 is blank. Every entry must be a non-blank credential.`,
    ]);
  });

  it("treats a trailing comma as a blank fifth entry, not as a harmless separator", () => {
    const resolution = resolveAdminEnv(populated({ [ADMIN_OPERATOR_SECRETS]: "a,b,c,d," }));
    if (resolution.status !== "unconfigured") throw new Error("expected unconfigured");
    expect(resolution.problems).toEqual([
      `${ADMIN_OPERATOR_SECRETS} — entry 5 is blank. Every entry must be a non-blank credential.`,
    ]);
  });

  it("does NOT report a blank entry for an absent set, so a blank value stays indistinguishable from absent", () => {
    // The regression this pins: a naive implementation reports "entry 1 is blank" for `""`, so an
    // operator could tell a deployment with `ADMIN_OPERATOR_SECRETS=` from one with no variable at
    // all. The two must be the same refusal.
    const resolution = resolveAdminEnv({ [ADMIN_SESSION_SECRET]: "beta-secret-4d7e0a93" });
    if (resolution.status !== "unconfigured") throw new Error("expected unconfigured");
    expect(resolution.problems.join(" ")).not.toContain("entry");
  });

  // -------------------------------------------------------------------------------------------
  // The session secret must not be a credential.
  // -------------------------------------------------------------------------------------------

  it("refuses when the session secret equals an operator credential", () => {
    const shared = "e5b2d0a84c71f396";
    const resolution = resolveAdminEnv(
      populated({
        [ADMIN_OPERATOR_SECRETS]: `first-credential,${shared}`,
        [ADMIN_SESSION_SECRET]: shared,
      }),
    );
    expect(resolution.status).toBe("unconfigured");
    if (resolution.status !== "unconfigured") return;
    expect(resolution.problems).toEqual([
      `${ADMIN_SESSION_SECRET} — must differ from every entry in ${ADMIN_OPERATOR_SECRETS}.`,
    ]);
  });

  it("refuses when the session secret is the ONLY operator credential", () => {
    const shared = "e5b2d0a84c71f396";
    const resolution = resolveAdminEnv(
      populated({ [ADMIN_OPERATOR_SECRETS]: shared, [ADMIN_SESSION_SECRET]: shared }),
    );
    expect(resolution.status).toBe("unconfigured");
  });

  // -------------------------------------------------------------------------------------------
  // Non-string values are the absent case, not a new message per type.
  // -------------------------------------------------------------------------------------------

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { a: 1 }],
    ["an array", ["x"]],
    ["a boolean", true],
  ])(
    "treats a %s credential as absent rather than inventing a type-specific message",
    (_l, value) => {
      const resolution = resolveAdminEnv(
        populated({ [ADMIN_OPERATOR_SECRETS]: value, [ADMIN_SESSION_SECRET]: "beta-secret" }),
      );
      if (resolution.status !== "unconfigured") throw new Error("expected unconfigured");
      expect(resolution.problems).toEqual([
        `${ADMIN_OPERATOR_SECRETS} — is absent, empty, or only whitespace. A blank value counts as absent.`,
      ]);
    },
  );

  // -------------------------------------------------------------------------------------------
  // getAdminEnv reads process.env, and the ambient environment must not decide a test.
  // -------------------------------------------------------------------------------------------

  it("getAdminEnv returns null when the ambient environment has no researcher credential", () => {
    // The shipped `.env.example` has both variables EMPTY, and this suite runs with no `.env.local`
    // injected by the runner. Asserting the real reading here is what makes the rest of the file's
    // argument meaningful: the reason the public site is unaffected is that an unset credential
    // produces this value, not a thrown error.
    //
    // It is tolerant of a developer who HAS configured one locally, because a test that failed on
    // someone's own machine would train people to unset their configuration to run the suite.
    const value = getAdminEnv();
    if (value === null) {
      expect(value).toBeNull();
      return;
    }
    expect(value.operatorSecrets.length).toBeGreaterThan(0);
    expect(value.sessionSecret).not.toBe("");
  });
});
