import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError } from "@/lib/repositories";
import {
  CLEAR_ATTEMPTS_FUNCTION,
  RECORD_ATTEMPT_FUNCTION,
  SupabaseSignInAttemptsRepository,
} from "@/lib/repositories/supabase/sign-in-attempts";
import type {
  PostgrestErrorLike,
  SupabaseClientLike,
  SupabaseRpcResultLike,
} from "@/lib/repositories/supabase/client";
import { SIGN_IN_ATTEMPTS_OPERATIONS } from "@/lib/repositories/supabase/operations";

/**
 * The Supabase sign-in-attempts repository, against a FUNCTION-shaped fake.
 *
 * =================================================================================================
 * WHY THIS FILE HAS ITS OWN FAKE RATHER THAN REUSING THE ONE IN repositories-supabase.test.ts
 * =================================================================================================
 * That file's fake scripts table operations, so its `data` is always a ROW ARRAY. A Postgres
 * function returning `integer` gives PostgREST a SCALAR. Reusing the table-shaped fake would let
 * this repository's own shape checks — which exist precisely because `0` silently disables the
 * attempt limit — pass against an envelope the wire never produces, and it would pass without the
 * check ever being exercised.
 *
 * So this file's fake refuses `rpc` outright where the other one scripts it, and scripts it here.
 * Neither fake can substitute for the other, which is the reason both exist.
 *
 * =================================================================================================
 * WHAT THIS FILE DOES NOT PROVE
 * =================================================================================================
 * Nothing about PostgREST, and nothing about atomicity. The entire reason this counter is a function
 * is that the increment must be ATOMIC, and "atomic" is a claim about a single Postgres statement.
 * A fake can prove this code asks for that statement and reads the answer correctly; it cannot prove
 * the statement is atomic under concurrency. `tests/integration/researcher-signin-attempts.test.ts`
 * runs the real SQL on a real engine, and that file states which half it covers.
 */

/** One recorded `rpc` call. */
interface RecordedRpc {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

/**
 * A fake whose `rpc` is scripted as a FUNCTION result: `data` is a scalar, never a row array.
 *
 * Outcomes are queued in order. `reject` models the case where the call never got an answer, which
 * is a REJECTION rather than an `{ error }` body, and the two leave through different doors.
 */
function rpcHarness(outcomes: readonly (SupabaseRpcResultLike | { reject: Error })[] = []): {
  readonly client: SupabaseClientLike;
  readonly calls: () => readonly RecordedRpc[];
  readonly repository: SupabaseSignInAttemptsRepository;
} {
  const calls: RecordedRpc[] = [];
  const queue = [...outcomes];
  const client: SupabaseClientLike = {
    // Present to satisfy the interface, never used: this repository touches no table, and a fake
    // that implemented `from` could only hide a regression where a table operation crept in. The
    // `TableHandleLike` return type is `never` because nothing can be returned — calling it throws.
    from(): never {
      throw new Error("this repository must not perform a table operation");
    },
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<SupabaseRpcResultLike> {
      calls.push({ fn, args });
      const next = queue.shift();
      if (next === undefined) {
        return Promise.reject(
          new Error(`unexpected rpc call to ${fn}: the fake had no scripted outcome left`),
        );
      }
      if ("reject" in next) return Promise.reject(next.reject);
      return Promise.resolve(next);
    },
  };
  return {
    client,
    calls: () => calls,
    repository: new SupabaseSignInAttemptsRepository(client),
  };
}

/** The success envelope for a function returning a positive count. */
const countIs = (data: unknown): SupabaseRpcResultLike => ({ data, error: null });

/** The PostgREST error this harness produces. */
const pgError = (code: string, message: string): PostgrestErrorLike => ({ code, message });

describe("recordAttempt", () => {
  it("calls the recording function with the argument names the migration declares", async () => {
    const harness = rpcHarness([countIs(1)]);
    await harness.repository.recordAttempt("203.0.113.7", 900);
    // PostgREST matches function arguments BY NAME, so a renamed parameter would send a null and the
    // function would fail at runtime rather than at compile time. Asserting the exact keys — not just
    // that it called something — is what catches a rename here instead of in production.
    expect(harness.calls()).toEqual([
      {
        fn: RECORD_ATTEMPT_FUNCTION,
        args: { p_origin_key: "203.0.113.7", p_window_seconds: 900 },
      },
    ]);
  });

  it("names the window in SECONDS, which is what the function's parameter type is", async () => {
    // The caller passes milliseconds-worth of intent — "a fifteen minute window" — as 900, not as
    // 900000. A repository that forwarded the number it was given without thinking about the unit
    // would still be type-correct here and would create a 10-day window in production.
    const harness = rpcHarness([countIs(1)]);
    await harness.repository.recordAttempt("origin", 15 * 60);
    expect(harness.calls()[0]?.args.p_window_seconds).toBe(900);
  });

  it("returns the count the database reported", async () => {
    for (const count of [1, 5, 11, 999]) {
      const harness = rpcHarness([countIs(count)]);
      expect(await harness.repository.recordAttempt("origin", 900)).toBe(count);
    }
  });

  it("truncates an over-long origin key rather than refusing it", async () => {
    const harness = rpcHarness([countIs(1)]);
    await harness.repository.recordAttempt("x".repeat(500), 900);
    const key = harness.calls()[0]?.args.p_origin_key as string;
    // Truncated to the table's declared width. The reasoning is in the source: the key comes from
    // request headers this project does not control, so a long one is a hostile input and refusing
    // it would let a party turn "your header is long" into "your attempt was not counted".
    expect(key).toHaveLength(200);
    expect(key).toBe("x".repeat(200));
  });

  it("truncates to the FIRST 200 characters, so two long keys sharing a prefix share a counter", async () => {
    // The measured consequence of truncation, stated rather than left for a reader to work out: two
    // distinct origins that agree on their first 200 characters are accounted against one window.
    // That is a deliberate trade, and it is only safe because the key is a coarse IP-shaped value
    // that is never this long in practice.
    const harness = rpcHarness([countIs(1), countIs(2)]);
    await harness.repository.recordAttempt(`${"a".repeat(200)}FIRST`, 900);
    await harness.repository.recordAttempt(`${"a".repeat(200)}SECOND`, 900);
    expect(harness.calls()[0]?.args.p_origin_key).toBe(harness.calls()[1]?.args.p_origin_key);
  });

  it("does not trim the origin key, so distinct keys stay distinct", async () => {
    const harness = rpcHarness([countIs(1), countIs(1)]);
    await harness.repository.recordAttempt(" origin", 900);
    await harness.repository.recordAttempt("origin", 900);
    expect(harness.calls()[0]?.args.p_origin_key).not.toBe(harness.calls()[1]?.args.p_origin_key);
  });

  // -------------------------------------------------------------------------------------------
  // The shape check, which is the load-bearing part of this file.
  // -------------------------------------------------------------------------------------------

  it("refuses a count of ZERO, because zero silently disables the attempt limit", async () => {
    // The single value that must never be reported as a count. `runResearcherSignIn` compares
    // `count > SIGN_IN_MAX_FAILURES`, so a reported 0 means "under the limit, carry on" — forever,
    // for an origin whose counter is broken.
    const harness = rpcHarness([countIs(0)]);
    await expect(harness.repository.recordAttempt("origin", 900)).rejects.toThrow(RepositoryError);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "3"],
    ["a row array", [3]],
    ["an object", { count: 3 }],
    ["a negative integer", -1],
    ["a fraction", 2.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["true", true],
  ])("refuses %s as a count, naming the shape rather than the value", async (_label, data) => {
    const harness = rpcHarness([countIs(data)]);
    const failure = await harness.repository
      .recordAttempt("origin", 900)
      .then(() => null)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RepositoryError);
    // The message names the SHAPE, never the value: an unexpected body could carry anything, and an
    // error message is written to logs an operator will read.
    const message = (failure as RepositoryError).message;
    expect(message).toMatch(/did not return a positive integer attempt count/);
    expect(message).toContain("Reporting 0 here would read as");
  });

  it("refuses a count with NO error and no data, which is a response this code does not understand", async () => {
    // `data: null` with `error: null` is not an empty answer — it is a body that contradicts the
    // function's declared return type. The repository must not read it as "no attempts".
    const harness = rpcHarness([{ data: null, error: null }]);
    await expect(harness.repository.recordAttempt("origin", 900)).rejects.toThrow(
      /did not return a positive integer attempt count/,
    );
  });
});

describe("clear", () => {
  it("calls the clearing function with only the origin key", async () => {
    const harness = rpcHarness([countIs(null)]);
    await harness.repository.clear("203.0.113.7");
    // No window argument: clearing a row is not a windowed operation, and passing one would mean the
    // deployed function has a second parameter this repository does not know about.
    expect(harness.calls()).toEqual([
      { fn: CLEAR_ATTEMPTS_FUNCTION, args: { p_origin_key: "203.0.113.7" } },
    ]);
  });

  it("accepts both null and undefined as the void result", async () => {
    // PostgREST delivers a `void` function's result as `null`; some shapes deliver `undefined`.
    // Both mean the same thing and neither is a failure.
    for (const data of [null, undefined]) {
      const harness = rpcHarness([countIs(data)]);
      await expect(harness.repository.clear("origin")).resolves.toBeUndefined();
    }
  });

  it.each([
    ["a row array", []],
    ["a number", 0],
    ["the string 'ok'", "ok"],
    ["an object", { deleted: 1 }],
  ])(
    "refuses %s as a void result, because it means the deployed function is a different one",
    async (_label, data) => {
      // The dangerous case this guards: if the wrong function were deployed under this name, a silent
      // success would mean the counter this code believes it is clearing is not being cleared, and
      // every later attempt would start from a stale count.
      const harness = rpcHarness([countIs(data)]);
      await expect(harness.repository.clear("origin")).rejects.toThrow(/declares `returns void`/);
    },
  );

  it("truncates the origin key identically to recordAttempt", async () => {
    // Two truncations at two call sites would drift, and the drift would be invisible: a key
    // recorded at 200 characters and cleared at a different width means a counter that is never
    // cleared. The two harnesses make the shared width measurable.
    const recorded = rpcHarness([countIs(1)]);
    await recorded.repository.recordAttempt("y".repeat(500), 900);
    const cleared = rpcHarness([countIs(null)]);
    await cleared.repository.clear("y".repeat(500));
    expect(recorded.calls()[0]?.args.p_origin_key).toBe(cleared.calls()[0]?.args.p_origin_key);
  });
});

describe("failures leave through one typed door", () => {
  it("wraps a PostgREST error, naming the operation and the function", async () => {
    const harness = rpcHarness([
      { data: null, error: pgError("42883", "function does not exist") },
    ]);
    const failure = await harness.repository
      .recordAttempt("origin", 900)
      .then(() => null)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RepositoryError);
    expect((failure as RepositoryError).operation).toBe(SIGN_IN_ATTEMPTS_OPERATIONS.recordAttempt);
    expect((failure as RepositoryError).message).toContain("Postgres rejected");
    expect((failure as RepositoryError).message).toContain(RECORD_ATTEMPT_FUNCTION);
  });

  it("keeps the original error reachable on `cause`, as the error contract requires", async () => {
    const original = pgError("42501", "permission denied for function");
    const harness = rpcHarness([{ data: null, error: original }]);
    const failure = (await harness.repository
      .clear("origin")
      .catch((error: unknown) => error)) as RepositoryError;
    expect(failure.cause).toBe(original);
    expect(failure.detail).toContain("42501");
  });

  it("wraps a REJECTION, which is a different shape from an error body", async () => {
    // A call that never got an answer rejects; a call Postgres refused returns `{ error }`. Both must
    // arrive as a `RepositoryError` naming the operation, or a caller cannot tell which call failed.
    const harness = rpcHarness([{ reject: new TypeError("fetch failed") }]);
    const failure = await harness.repository
      .recordAttempt("origin", 900)
      .then(() => null)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RepositoryError);
    expect((failure as RepositoryError).operation).toBe(SIGN_IN_ATTEMPTS_OPERATIONS.recordAttempt);
    expect((failure as RepositoryError).message).toMatch(/failed before PostgREST returned/);
  });

  it("uses the CLEAR operation name for a clear failure, so logs distinguish the two", async () => {
    // Two operations that share a caller and a failure mode; if they shared an operation name, a log
    // line could not say which half of the sign-in failed.
    const harness = rpcHarness([{ data: null, error: pgError("42501", "denied") }]);
    const failure = (await harness.repository
      .clear("origin")
      .catch((error: unknown) => error)) as RepositoryError;
    expect(failure.operation).toBe(SIGN_IN_ATTEMPTS_OPERATIONS.clear);
  });

  it("does not describe the origin key in any error message", async () => {
    // This is the one write an UNAUTHENTICATED party can trigger, so its error text most deserves
    // not to describe internals. The key is derived from request headers and is stored in a research
    // database; it should not be in a message.
    const originKey = "198.51.100.42";
    const harness = rpcHarness([{ data: null, error: pgError("42501", "denied") }]);
    const failure = (await harness.repository
      .recordAttempt(originKey, 900)
      .catch((error: unknown) => error)) as RepositoryError;
    expect(failure.message).not.toContain(originKey);
    expect(failure.detail ?? "").not.toContain(originKey);
  });
});

describe("what this repository is not allowed to do", () => {
  it("never performs a table operation", async () => {
    // The `from` stub throws. Any attempt to reach a table directly — including a read-then-write,
    // which is the exact implementation the interface's design was chosen to prevent — surfaces as a
    // thrown error rather than as a silent behavioural difference.
    const harness = rpcHarness([countIs(1)]);
    expect(() => harness.client.from("researcher_signin_attempts")).toThrow(
      /must not perform a table operation/,
    );
  });

  it("calls only the two named functions, both declared beside the call sites", async () => {
    const harness = rpcHarness([countIs(1), countIs(null)]);
    await harness.repository.recordAttempt("origin", 900);
    await harness.repository.clear("origin");
    // The function names are not parameterised by any caller, so no code outside this file can reach
    // a different function through this repository.
    expect(harness.calls().map((call) => call.fn)).toEqual([
      RECORD_ATTEMPT_FUNCTION,
      CLEAR_ATTEMPTS_FUNCTION,
    ]);
  });
});
