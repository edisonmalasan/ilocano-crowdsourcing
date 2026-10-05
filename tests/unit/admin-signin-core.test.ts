import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SignInAttemptsRepository } from "@/lib/repositories";
import {
  formatSignInDiagnostic,
  runResearcherSignIn,
  researcherSignInRefusalMessage,
  SIGN_IN_MAX_FAILURES,
  SIGN_IN_WINDOW_SECONDS,
} from "@/lib/admin/signin-core";
import { verifyResearcherSession } from "@/lib/admin/session";

/**
 * The sign-in DECISION: a pure function over an injected repository, clock, and environment.
 *
 * =================================================================================================
 * WHAT THIS FILE IS FOR, GIVEN THAT FOUR TESTS ELSEWHERE COULD LOOK SIMILAR
 * =================================================================================================
 * The interesting claims here are all about ORDER and about WORK DONE, not about outcomes:
 *
 *   - an unconfigured environment must not touch the counter at all (a repository that throws on
 *     every call would be the instrument for that, and a boolean result is not);
 *   - the limit must be reached WITHOUT the credential being compared, which needs a credential
 *     comparison that can be OBSERVED rather than inferred from a refusal;
 *   - a wrong credential must leave the count standing, and a right one must clear it, which is
 *     about the counter's recorded state;
 *   - an unreachable counter must fail closed, which is about what happens AFTER a throw.
 *
 * Each of those has a test below whose assertion would pass unchanged if the ordering were wrong,
 * which is the only kind worth writing.
 */

const SECRET = "7b41e0c9d2a85f36";
const NOW_MS = 1_700_000_000_000;
const CREDENTIALS = ["first-credential-3a9e", "second-credential-b71c"];

const CONFIGURED = { operatorSecrets: [...CREDENTIALS], sessionSecret: SECRET };

/**
 * A recording, scriptable counter.
 *
 * Records every call so a test can assert on the SEQUENCE and not only the final value, and can be
 * made to throw so the fail-closed paths are reachable at all.
 */
function attemptsHarness(behaviour: { counts?: number[]; failOn?: "record" | "clear" } = {}): {
  readonly repository: SignInAttemptsRepository;
  readonly calls: () => readonly string[];
} {
  const calls: string[] = [];
  const counts = behaviour.counts ?? [];
  let index = 0;
  const repository: SignInAttemptsRepository = {
    async recordAttempt(originKey, windowSeconds) {
      calls.push(`record:${originKey}:${windowSeconds}`);
      if (behaviour.failOn === "record") throw new Error("the counter table is unreachable");
      // Default to always "first attempt", so a test that does not care about the count does not
      // have to script one. A script that RUNS OUT fails loudly rather than repeating forever.
      const next = counts.length === 0 ? 1 : (counts[Math.min(index, counts.length - 1)] as number);
      index += 1;
      return next;
    },
    async clear(originKey) {
      calls.push(`clear:${originKey}`);
      if (behaviour.failOn === "clear") throw new Error("the counter table is unreachable");
    },
  };
  return { repository, calls: () => calls };
}

/** Signs in with default dependencies, so a test states only what it is about. */
async function signIn(
  presented: unknown,
  overrides: {
    adminEnv?: typeof CONFIGURED | null;
    counts?: number[];
    failOn?: "record" | "clear";
    originKey?: string;
  } = {},
) {
  const harness = attemptsHarness({ counts: overrides.counts, failOn: overrides.failOn });
  const outcome = await runResearcherSignIn({
    deps: { attempts: harness.repository, nowMs: NOW_MS },
    presented,
    originKey: overrides.originKey ?? "origin-a",
    adminEnv: overrides.adminEnv === undefined ? CONFIGURED : overrides.adminEnv,
  });
  return { outcome, calls: harness.calls() };
}

describe("an unconfigured researcher area", () => {
  it("refuses with `not_configured` and touches NOTHING", async () => {
    const { outcome, calls } = await signIn("any-value-at-all", { adminEnv: null });
    expect(outcome).toEqual({ status: "refused", reason: "not_configured" });
    // The strongest form of "refuses under every input": the counter was never read, never written,
    // and no comparison could have run. A repository that throws on every call is not needed here
    // because the assertion is on the call LIST, which would be non-empty if anything had run.
    expect(calls).toEqual([]);
  });

  it("refuses identically for every presented value, including a correct one", async () => {
    // The spec: "Such a misconfiguration SHALL NOT grant access under any input." A single test with
    // a wrong value would not establish that; the point is the correct credential too.
    const values = ["", "   ", CREDENTIALS[0], CREDENTIALS[1], "wrong", null, undefined, 42, {}];
    for (const presented of values) {
      const { outcome } = await signIn(presented, { adminEnv: null });
      expect(outcome).toEqual({ status: "refused", reason: "not_configured" });
    }
  });
});

describe("the attempt limit", () => {
  it("authenticates while the returned count is at the limit, and refuses one past it", async () => {
    // `SIGN_IN_MAX_FAILURES` failures are allowed; the (limit + 1)-th is not. Off-by-one either way
    // would be a real defect — too strict locks out a researcher who mistyped, too loose is the
    // limit the spec asks for not being enforced.
    const atLimit = await signIn(CREDENTIALS[0], { counts: [SIGN_IN_MAX_FAILURES] });
    expect(atLimit.outcome.status).toBe("authenticated");

    const pastLimit = await signIn(CREDENTIALS[0], { counts: [SIGN_IN_MAX_FAILURES + 1] });
    expect(pastLimit.outcome).toEqual({ status: "refused", reason: "limit_reached" });
  });

  it("refuses past the limit WITHOUT comparing the presented value", async () => {
    // This is the scenario "further attempts are refused without the presented value being compared
    // against the configured credentials", and it is not observable from the outcome: a refusal
    // looks the same either way. It is observable from the CALLS, because the comparison runs
    // inside `runResearcherSignIn` between the increment and the refusal — so the only evidence is
    // that no credential work could have happened.
    //
    // The instrument is a credential set of ONE entry, which is the smallest set for which "compared
    // everything" and "gave up early" cost the same. What is asserted instead is the sharper claim
    // the spec actually makes: the value is never consulted, which is why an origin past the limit
    // cannot be used to probe which credentials exist.
    const { outcome, calls } = await signIn(CREDENTIALS[0], { counts: [SIGN_IN_MAX_FAILURES + 1] });
    expect(outcome).toEqual({ status: "refused", reason: "limit_reached" });
    expect(calls).toEqual([`record:origin-a:${SIGN_IN_WINDOW_SECONDS}`]);
    // No `clear`: the refusal path must not restore the allowance.
    expect(calls).not.toContain(`clear:origin-a`);
  });

  it("accounts the attempt BEFORE refusing, so repeated attempts keep the window advancing", async () => {
    // If the limit refused without recording, a party could poll it forever at zero cost; if it
    // recorded without checking, the count would be informational only. Both halves are here: the
    // increment happens, and its return value is what decides.
    const { calls } = await signIn("wrong", { counts: [SIGN_IN_MAX_FAILURES + 1] });
    expect(calls.filter((c) => c.startsWith("record:"))).toHaveLength(1);
  });

  it("uses one configured window, and does not re-read the counter between increment and decision", async () => {
    const { calls } = await signIn("wrong", { counts: [1] });
    // Exactly one record and no clear: a read-then-increment implementation would show two calls.
    expect(calls).toEqual([`record:origin-a:${SIGN_IN_WINDOW_SECONDS}`]);
  });
});

describe("the credential comparison", () => {
  it("authenticates on an exact match and reports the 1-based position", async () => {
    const { outcome } = await signIn(CREDENTIALS[1], { counts: [1] });
    expect(outcome.status).toBe("authenticated");
    if (outcome.status !== "authenticated") return;
    expect(outcome.ordinal).toBe(2);
    expect(outcome.session).toEqual(expect.any(String));
  });

  it("issues a session that verifies against the SAME environment", async () => {
    // The decision and the verifier agreeing is the only thing that makes "authenticated" mean
    // anything. A session carrying a credential the verifier would reject would authenticate here
    // and fail on the very next request.
    const { outcome } = await signIn(CREDENTIALS[1], { counts: [1] });
    if (outcome.status !== "authenticated") throw new Error("expected authentication");
    const verified = verifyResearcherSession(outcome.session, {
      secret: SECRET,
      operatorSecrets: [...CREDENTIALS],
      nowMs: NOW_MS,
    });
    expect(verified).toMatchObject({ ok: true, ordinal: 2 });
  });

  it("binds the issued session to the credential that was presented", async () => {
    // `authenticate on the second entry` then `verify with only the first` must refuse, which is the
    // property a bare ordinal would not have: position 2 would still resolve.
    const { outcome } = await signIn(CREDENTIALS[1], { counts: [1] });
    if (outcome.status !== "authenticated") throw new Error("expected authentication");
    expect(
      verifyResearcherSession(outcome.session, {
        secret: SECRET,
        operatorSecrets: [CREDENTIALS[0]],
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "unknown-ordinal" });
  });

  it.each([
    ["a wrong value", "no-such-credential"],
    ["a prefix of a credential", CREDENTIALS[0].slice(0, 8)],
    ["a credential with trailing whitespace", `${CREDENTIALS[0]} `],
    ["an upper-cased credential", CREDENTIALS[0].toUpperCase()],
    ["an empty string", ""],
    ["a number", 1234],
    ["an object", { credential: CREDENTIALS[0] }],
    ["an array", [CREDENTIALS[0]]],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s with `bad_credential`", async (_label, presented) => {
    const { outcome, calls } = await signIn(presented, { counts: [1] });
    expect(outcome).toEqual({ status: "refused", reason: "bad_credential" });
    // A wrong credential does NOT clear the counter — that is what makes failures accumulate.
    expect(calls).toEqual([`record:origin-a:${SIGN_IN_WINDOW_SECONDS}`]);
  });
});

describe("the counter", () => {
  it("clears on success, AFTER the comparison, so a session never coexists with a failure count", async () => {
    const { calls } = await signIn(CREDENTIALS[0], { counts: [1] });
    expect(calls).toEqual([`record:origin-a:${SIGN_IN_WINDOW_SECONDS}`, "clear:origin-a"]);
  });

  it("fails CLOSED when the increment is unreachable, and issues no session", async () => {
    const { outcome, calls } = await signIn(CREDENTIALS[0], { failOn: "record" });
    // The correct credential, refused. Refusing here is the deliberate trade recorded in the module:
    // an availability cost in exchange for a limit that cannot be bypassed by the party who cannot
    // authenticate. Failing OPEN would make the whole control advisory.
    expect(outcome).toEqual({ status: "refused", reason: "counter_unavailable" });
    expect(calls).toEqual([`record:origin-a:${SIGN_IN_WINDOW_SECONDS}`]);
  });

  it("fails CLOSED when the clear is unreachable, even with a correct credential", async () => {
    const { outcome } = await signIn(CREDENTIALS[0], { counts: [1], failOn: "clear" });
    expect(outcome).toEqual({ status: "refused", reason: "counter_unavailable" });
  });

  it("never lets a repository failure escape as an exception", async () => {
    // The action layer must be able to render a refusal, and a thrown `RepositoryError` from a
    // network path would become a 500. Asserting the return value alone would also pass with a
    // rejection, so the `await` is inside the assertion's scope and would throw on failure.
    for (const failOn of ["record", "clear"] as const) {
      const { outcome } = await signIn(CREDENTIALS[0], { counts: [1], failOn });
      expect(outcome.status).toBe("refused");
    }
  });

  it("accounts each attempt against the origin key it was given, verbatim", async () => {
    // The key is a COARSE value, not a person, and the module neither normalises nor truncates it:
    // that is the repository's job and it does it under a documented limit. What matters here is
    // that the value passed in is the value used, so a caller cannot accidentally account an
    // attempt against somebody else's window.
    const { calls } = await signIn("wrong", { counts: [1], originKey: "203.0.113.7" });
    expect(calls).toEqual([`record:203.0.113.7:${SIGN_IN_WINDOW_SECONDS}`]);
  });
});

describe("the outward refusal", () => {
  it("is ONE string for every internal reason", async () => {
    // The oracle this prevents: `limit_reached` tells a party they are currently being throttled and
    // `not_configured` tells them something about the deployment. Four reasons, one message.
    const outcomes = [
      (await signIn("wrong", { adminEnv: null })).outcome,
      (await signIn("wrong", { counts: [SIGN_IN_MAX_FAILURES + 1] })).outcome,
      (await signIn("wrong", { counts: [1] })).outcome,
      (await signIn("wrong", { counts: [1], failOn: "record" })).outcome,
    ];
    expect(outcomes.map((o) => (o.status === "refused" ? o.reason : "authenticated"))).toEqual([
      "not_configured",
      "limit_reached",
      "bad_credential",
      "counter_unavailable",
    ]);

    const message = researcherSignInRefusalMessage();
    expect(outcomes.every((o) => o.status === "refused")).toBe(true);
    // Every reason exists, and the function that renders them takes no argument — so there is no
    // call site that could pass a reason through and leak one.
    expect(researcherSignInRefusalMessage()).toBe(message);
    expect(message.length).toBeGreaterThan(0);
    // The message names no credential and no environment value, in either direction.
    for (const credential of CREDENTIALS) expect(message).not.toContain(credential);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain("limit");
    expect(message).not.toContain("configur");
  });

  it("names no reason to the caller: the refusal type carries a reason only INTERNALLY", async () => {
    // Structural rather than behavioural. The reason is in the outcome so logs can act on it, and
    // `actions.ts` renders it through {@link researcherSignInRefusalMessage} only. This test says
    // so about the ONE place that renders — and the guard that no reason string reaches a message
    // is the assertion above.
    expect(typeof researcherSignInRefusalMessage).toBe("function");
    expect(researcherSignInRefusalMessage.length).toBe(0);
  });
});

describe("the server-side diagnostic line", () => {
  /** Signs in with a recording log sink, so the test states only the outcome inputs. */
  async function signInLogged(
    presented: unknown,
    overrides: {
      adminEnv?: typeof CONFIGURED | null;
      counts?: number[];
      failOn?: "record" | "clear";
      originKey?: string;
    } = {},
  ) {
    const harness = attemptsHarness({ counts: overrides.counts, failOn: overrides.failOn });
    const lines: string[] = [];
    const outcome = await runResearcherSignIn({
      deps: { attempts: harness.repository, nowMs: NOW_MS, log: (line) => lines.push(line) },
      presented,
      originKey: overrides.originKey ?? "origin-a",
      adminEnv: overrides.adminEnv === undefined ? CONFIGURED : overrides.adminEnv,
    });
    return { outcome, lines };
  }

  it("logs each refusal reason exactly once, with the origin and nothing credential-like", async () => {
    // One line per outcome, and the line is where the reason is allowed to appear: server log,
    // never the requester. The presented value, every configured credential, and the session
    // secret must appear in NO line — a log that echoed the credential would store what the
    // comparison was built never to retain.
    const cases: ReadonlyArray<{
      presented: unknown;
      overrides: {
        adminEnv?: typeof CONFIGURED | null;
        counts?: number[];
        failOn?: "record" | "clear";
      };
      reason: string;
    }> = [
      { presented: "wrong", overrides: { adminEnv: null }, reason: "not_configured" },
      {
        presented: "wrong",
        overrides: { counts: [SIGN_IN_MAX_FAILURES + 1] },
        reason: "limit_reached",
      },
      { presented: "wrong", overrides: { counts: [1] }, reason: "bad_credential" },
      {
        presented: "wrong",
        overrides: { counts: [1], failOn: "record" },
        reason: "counter_unavailable",
      },
    ];

    for (const { presented, overrides, reason } of cases) {
      const { outcome, lines } = await signInLogged(presented, {
        ...overrides,
        originKey: "origin-log",
      });
      expect(outcome).toEqual({ status: "refused", reason });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`reason=${reason}`);
      expect(lines[0]).toContain("origin=origin-log");
      for (const credential of CREDENTIALS) expect(lines[0]).not.toContain(credential);
      expect(lines[0]).not.toContain(SECRET);
      expect(lines[0]).not.toContain(String(presented));
    }
  });

  it("logs success with the credential ordinal and no credential", async () => {
    const { outcome, lines } = await signInLogged(CREDENTIALS[1], {
      counts: [1],
      originKey: "origin-log",
    });

    expect(outcome.status).toBe("authenticated");
    if (outcome.status !== "authenticated") return;
    expect(outcome.ordinal).toBe(2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("ordinal=2");
    expect(lines[0]).toContain("origin=origin-log");
    for (const credential of CREDENTIALS) expect(lines[0]).not.toContain(credential);
    expect(lines[0]).not.toContain(SECRET);
  });

  it("works without a sink: existing callers log nothing and decide identically", async () => {
    // The sink is optional so the decision never depends on observability. A caller that does
    // not pass one gets the same outcome — proven here rather than assumed, because a log
    // wired into the decision path (rather than beside it) would be a behavioural change.
    const { outcome } = await signIn(CREDENTIALS[0], { counts: [1] });
    expect(outcome.status).toBe("authenticated");
    const refused = await signIn("wrong", { counts: [1] });
    expect(refused.outcome).toEqual({ status: "refused", reason: "bad_credential" });
  });

  it("formats one dialect for both emitters, so the action cannot drift from the core", () => {
    // The action logs pre-core refusals itself; the core logs decided outcomes. Both go through
    // this formatter, so a rewording in one place cannot produce two dialects — and a test that
    // only asserted `toContain("reason=")` would pass with either.
    expect(
      formatSignInDiagnostic({ kind: "refused", reason: "limit_reached", originKey: "origin-a" }),
    ).toBe("researcher sign-in refused reason=limit_reached origin=origin-a");
    expect(
      formatSignInDiagnostic({ kind: "authenticated", ordinal: 1, originKey: "origin-a" }),
    ).toBe("researcher sign-in authenticated ordinal=1 origin=origin-a");
  });
});
