import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, readMigrations } from "./support/migrations";
import {
  applySql,
  asRole,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type QueryExecutor,
  type TestDatabase,
} from "./support/pglite";

/**
 * The researcher sign-in attempt counter, as real PostgreSQL executes it.
 *
 * =================================================================================================
 * WHY THIS FILE CANNOT BE REPLACED BY THE UNIT TEST, AND WHY THE UNIT TEST CANNOT REPLACE THIS ONE
 * =================================================================================================
 * The entire reason this counter is a Postgres FUNCTION rather than application code is ATOMICITY, and
 * atomicity is a claim about a single database statement rather than about TypeScript. The unit test
 * (`tests/unit/repositories-sign-in-attempts.test.ts`) proves this project asks for the right
 * `rpc` call and reads the answer correctly, against a fake that cannot execute SQL at all.
 *
 * So the two properties only this engine can answer are:
 *
 *   1. The increment is ATOMIC — that two concurrent callers cannot both read the same count and both
 *      write the same increment. A lost update means the stored count under-reports and a determined
 *      party never reaches the limit, which is precisely the "a check that cannot fire" defect this
 *      project has already found twice.
 *   2. The GRANT POSTURE is real — that `anon` cannot EXECUTE either function, and that
 *      `service_role` can. `revoke ... from public` is SQL; nothing in TypeScript can assert it.
 *
 * =================================================================================================
 * WHAT THIS FILE STILL DOES NOT PROVE
 * =================================================================================================
 * PGlite is PostgreSQL compiled to WebAssembly, not Supabase. It does not exercise PostgREST, the
 * Supabase API gateway, or RLS *as the gateway enforces it*. In particular: whether PostgREST exposes
 * these functions in its schema cache at all is a property of the hosted project's cache reload, and
 * nothing here answers it. `docs/ROADMAP.md` records that as the change's entry gate.
 */

const ATTEMPTS_TABLE = "public.researcher_signin_attempts";
const RECORD = "public.researcher_signin_attempts_record";
const CLEAR = "public.researcher_signin_attempts_clear";
const MIGRATION = "20261002120000_researcher_signin_attempts.sql";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await applyMigrations(db);
}, 60_000);

afterAll(async () => {
  await closeTestDatabase(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

/** Records one attempt as `service_role` — the only legitimate caller — and returns the count. */
async function record(originKey: string, windowSeconds = 900): Promise<number> {
  const rows = await query<{ count: number }>(db, `select ${RECORD}($1, $2) as count`, [
    originKey,
    windowSeconds,
  ]);
  return rows[0]?.count as number;
}

/** Clears one origin as `service_role`. */
async function clear(originKey: string): Promise<void> {
  await applySql(db, `select ${CLEAR}('${originKey}')`, `clear ${originKey}`);
}

/** The stored row for an origin, or `undefined`. */
async function storedRow(
  originKey: string,
): Promise<{ attempt_count: number; window_started_at: string } | undefined> {
  const rows = await query<{ attempt_count: number; window_started_at: string }>(
    db,
    `select attempt_count, window_started_at from ${ATTEMPTS_TABLE} where origin_key = $1`,
    [originKey],
  );
  return rows[0];
}

/**
 * A function's body, as PostgreSQL stores it in `pg_proc.prosrc`.
 *
 * Read from the CATALOGUE rather than from the `.sql` file, which is what makes these assertions
 * about the function that actually exists: the migration's comments, its quoting, and its `$$`
 * delimiters are all absent here, so a pattern matched against this text is matched against what
 * the engine will execute.
 */
async function functionSource(name: string): Promise<string> {
  const rows = await query<{ prosrc: string }>(
    db,
    `select p.prosrc as prosrc
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  const source = rows[0]?.prosrc;
  expect(typeof source).toBe("string");
  // A guard that silently read nothing passes every one of its own checks, so the read itself is
  // asserted. An empty body would satisfy `not.toMatch` for every forbidden keyword.
  expect((source as string).length).toBeGreaterThan(0);
  return source as string;
}

/**
 * `prosrc` with `--` comments removed.
 *
 * Needed by every assertion about the SHAPE of a statement rather than its effect. PostgreSQL keeps
 * a plpgsql body's comments in `prosrc`, so a bare-substring or bare-keyword check over the raw text
 * is satisfied by a comment that happens to quote the statement — the migration's own comments quote
 * `insert into public.researcher_signin_attempts` and `ON CONFLICT`, which are two of the strings
 * the shape assertions below look for.
 *
 * This repository has already shipped a guard that reported coverage it was not providing for exactly
 * this reason, so the stripping is the point rather than a refinement.
 */
async function bodyWithoutComments(name: string): Promise<string> {
  return (await functionSource(name))
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("the migration is applied from the production directory", () => {
  it("is the last of five migrations, applied in filename order", async () => {
    // Asserted as an exact list, not a count: `readMigrations` returns an empty array for a missing
    // directory and still succeeds, so a count check would pass on a typo'd path.
    const migrations = await readMigrations();
    const filenames = migrations.map((m) => m.filename);
    expect(filenames).toHaveLength(5);
    expect(filenames[filenames.length - 1]).toBe(MIGRATION);
    // Lexical order, which is what Supabase uses and what the timestamp prefix exists to produce.
    expect([...filenames].sort()).toEqual(filenames);
  });

  it("creates the table and both functions", async () => {
    const tables = await query<{ table_name: string }>(
      db,
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = 'researcher_signin_attempts'`,
    );
    expect(tables).toHaveLength(1);
    for (const fn of [RECORD, CLEAR]) {
      const rows = await query<{ count: number }>(
        db,
        "select count(*)::int as count from pg_proc where pronamespace = 'public'::regnamespace and proname = $1",
        [fn.split(".")[1]],
      );
      expect(rows[0]?.count).toBe(1);
    }
  });

  it("is NOT a research table: it references none of the six", async () => {
    // The migration claims this in prose, and the claim is checkable: a foreign key out of this table
    // would make it hold research data by reference, which is the boundary the comment asserts.
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
        where t.relname = 'researcher_signin_attempts' and c.contype = 'f'`,
    );
    expect(rows[0]?.count).toBe(0);
  });
});

describe("the counter increments", () => {
  it("starts at one and rises by one per attempt", async () => {
    expect(await record("203.0.113.7")).toBe(1);
    expect(await record("203.0.113.7")).toBe(2);
    expect(await record("203.0.113.7")).toBe(3);
    // The stored value is the RETURNED value, not just an internal counter — a function that
    // returned a local variable while storing something else would pass a return-value-only test.
    expect((await storedRow("203.0.113.7"))?.attempt_count).toBe(3);
  });

  it("keeps one row per origin, so two origins never share a count", async () => {
    await record("203.0.113.7");
    await record("203.0.113.7");
    expect(await record("198.51.100.4")).toBe(1);
    expect((await storedRow("203.0.113.7"))?.attempt_count).toBe(2);
    expect((await storedRow("198.51.100.4"))?.attempt_count).toBe(1);
    const total = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${ATTEMPTS_TABLE}`,
    );
    expect(total[0]?.count).toBe(2);
  });

  it("reaches and passes the configured limit, which is what makes the limit enforceable", async () => {
    // The application refuses at `count > 10`, so the values either side of that boundary must be
    // producible. A counter that saturated at some smaller number would lock a researcher out; one
    // that failed to advance would never limit anyone.
    let last = 0;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      last = await record("203.0.113.7");
      expect(last).toBe(attempt);
    }
    expect(last).toBe(12);
  });
});

describe("concurrent callers each see a distinct count, and the row agrees", () => {
  // =============================================================================================
  // WHAT THIS BLOCK DOES NOT PROVE, MEASURED RATHER THAN ASSUMED
  // =============================================================================================
  // This block USED TO BE titled "the increment is ATOMIC, which is the reason this is a function",
  // and it USED TO claim that it established the shipped statement loses no update under
  // concurrency. **That claim was false on this engine, and it was measured rather than argued.**
  //
  // A probe replaced the atomic `INSERT ... ON CONFLICT DO UPDATE` with a genuinely non-atomic
  // read-then-decide-then-upsert — preserving the window comparison character for character, so the
  // only difference was where the read happened — and **every test in this block passed against it**.
  // At the time this block was the only coverage of atomicity, so the file as a whole was GREEN at
  // 35 passed (35) with a non-atomic implementation in place.
  //
  // The cause is the engine, not the test. PGlite is PostgreSQL compiled to WebAssembly running on a
  // SINGLE connection, so it serialises the statements these callers issue and no two of them ever
  // observe the same count. Real atomicity is a property of a MULTI-connection engine holding row
  // locks, and there is nothing in this repository that can produce that condition today. So the
  // behaviour measured here is "the function returns and stores consistent counts", which is worth
  // asserting, and is **not** "the increment is atomic", which is not.
  //
  // The atomicity argument therefore rests on two things, only one of which this suite establishes:
  //   1. the increment is ONE statement. This IS asserted here — structurally, in the next block —
  //      and a probe measured that assertion going red, alone and precisely named, under the
  //      read-then-write rewrite: `1 failed | 36 passed (37)`, and the only red test was
  //      `reads no existing count in a separate statement`. Every behavioural test in this file
  //      stayed green under that same mutation.
  //   2. `INSERT ... ON CONFLICT DO UPDATE` being atomic is a DOCUMENTED property of PostgreSQL. No
  //      test in this repository demonstrates it, and none should claim to.
  //
  // The first probe of that rewrite went red on 16 tests and was ALSO untrustworthy, for a reason
  // worth recording: its `select attempts.attempt_count ... from public.researcher_signin_attempts`
  // never bound the alias `attempts`, so every call raised `missing FROM-clause entry for table
  // "attempts"` and the redness was a broken function cascading through every test that calls it —
  // including `clear` and the anon SELECT, which the change cannot legitimately affect. It read as
  // the engine distinguishing atomic from non-atomic. It was distinguishing nothing.
  it("returns a distinct, ordered count to every concurrent caller, and stores their number", async () => {
    const CONCURRENT = 25;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, () => record("198.51.100.4")),
    );

    // Every caller got a distinct, ordered value. Worth asserting, and NOT the same as atomicity:
    // a serialising engine produces this for any implementation that counts correctly.
    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: CONCURRENT }, (_, i) => i + 1));

    // And the STORED count equals the number of callers, so the returned values cannot be right
    // while the row under-reports.
    expect((await storedRow("198.51.100.4"))?.attempt_count).toBe(CONCURRENT);
  });

  it("keeps distinct origins independent under concurrency", async () => {
    // This one IS load-bearing, and it is a claim about KEYING rather than about atomicity — which
    // is why it survived the non-atomic probe green. The failure it rules out is two origins'
    // increments interleaving into one count, which would let one party's attempts exhaust another's
    // allowance. A single shared row would fail this regardless of how the increment is written.
    const origins = ["203.0.113.1", "203.0.113.2", "203.0.113.3"];
    await Promise.all(origins.flatMap((origin) => Array.from({ length: 8 }, () => record(origin))));
    for (const origin of origins) {
      expect((await storedRow(origin))?.attempt_count).toBe(8);
    }
  });
});

describe("the increment is ONE STATEMENT, which is what atomicity actually rests on", () => {
  // =============================================================================================
  // WHY THE ASSERTION IS STRUCTURAL RATHER THAN BEHAVIOURAL
  // =============================================================================================
  // The block above measures what this engine can measure, and it measured that the engine cannot
  // tell an atomic implementation from a non-atomic one. So the load-bearing half of the atomicity
  // argument is asserted here, against the function's own source as PostgreSQL stores it.
  //
  // This is not a weaker test standing in for a stronger one. It is the assertion the behavioural
  // test CANNOT be, and it has been measured firing: the probe that rewrote the upsert as
  // read-then-decide-then-upsert turns `reads no existing count in a separate statement` red.
  // What it costs is that a rewrite which preserved the single-statement property would pass, which
  // is correct — such a rewrite would still be atomic.

  it("reads no existing count in a separate statement", async () => {
    // The whole distinction. The atomic body contains no `SELECT` at all: it reads nothing and
    // writes through one upsert, taking the new count from `RETURNING`. A read-then-write rewrite
    // necessarily introduces one.
    //
    // Comments are stripped first, because a bare-keyword check is satisfied by a comment that
    // happens to contain the keyword — and this repository has already found a guard that reported
    // coverage it was not providing for exactly that reason.
    const body = await bodyWithoutComments("researcher_signin_attempts_record");
    expect(body).not.toMatch(/\bselect\b/i);
    // The positive form of the same claim, so the assertion above cannot pass against a body that
    // simply lost the write.
    expect(body).toMatch(/\breturning\s+attempt_count\s+into\b/i);
  });

  it("performs exactly one upsert, keyed on the primary key", async () => {
    const body = await bodyWithoutComments("researcher_signin_attempts_record");
    expect(body.match(/\binsert\s+into\b/gi)).toHaveLength(1);
    // The conflict target must be the column the primary key is on, or `ON CONFLICT` has nothing
    // to conflict against and the whole upsert argument collapses.
    expect(body).toMatch(/on\s+conflict\s*\(\s*origin_key\s*\)\s*do\s+update/i);
    // And no second statement that could have written the row.
    //
    // Anchored at the START OF A LINE, not on the bare keyword. The first version of this assertion
    // was `not.toMatch(/\bupdate\b/i)` and it fired on the shipped function, because
    // `on conflict (origin_key) do update` legitimately contains the word — a false positive from my
    // own detector, which is the shape of check that teaches its reader to ignore it. A statement in
    // this body begins its own line, so the line anchor separates the two without weakening the
    // claim: a `UPDATE public.researcher_signin_attempts ...` on its own line is still caught.
    expect(body).not.toMatch(/^\s*update\s/m);
    expect(body).not.toMatch(/^\s*delete\s/m);
  });
});

describe("the window resets, so a party is not locked out forever", () => {
  it("restarts at 1 once the stored window is older than the configured window", async () => {
    // A one-second window makes the boundary reachable without sleeping for fifteen minutes, and the
    // comparison the function performs is the same one a 900-second window performs.
    expect(await record("203.0.113.7", 1)).toBe(1);
    expect(await record("203.0.113.7", 1)).toBe(2);
    const before = await storedRow("203.0.113.7");
    expect(before?.attempt_count).toBe(2);

    // Past the window. The migration compares `v_now - window_started_at > make_interval(...)`, so
    // strictly greater than one second is enough.
    await applySql(
      db,
      `update ${ATTEMPTS_TABLE}
          set window_started_at = window_started_at - interval '5 seconds'
        where origin_key = '203.0.113.7'`,
      "age the window",
    );

    expect(await record("203.0.113.7", 1)).toBe(1);
    const after = await storedRow("203.0.113.7");
    expect(after?.attempt_count).toBe(1);
    // And the window start MOVED, which is what makes the reset stick rather than resetting on every
    // subsequent call forever.
    expect(new Date(after?.window_started_at as string).getTime()).toBeGreaterThan(
      new Date(before?.window_started_at as string).getTime(),
    );
  });

  it("keeps counting while the window is CURRENT", async () => {
    // The other side of the boundary, at the same age the previous test aged past. A window check
    // that always fired would make this fail — and a counter that resets on every call is a rate
    // limit that never limits, which is the defect the `greatest(p_window_seconds, 1)` floor exists
    // to prevent.
    await record("203.0.113.7", 900);
    await record("203.0.113.7", 900);
    await applySql(
      db,
      `update ${ATTEMPTS_TABLE}
          set window_started_at = window_started_at - interval '5 seconds'
        where origin_key = '203.0.113.7'`,
      "age the window slightly",
    );
    expect(await record("203.0.113.7", 900)).toBe(3);
  });

  it.each([0, -1, -900])(
    "floors a window of %s seconds to one, rather than resetting on every call",
    async (window) => {
      // =============================================================================================
      // WHY THIS IS ASSERTED, AND IT IS NOT A DEFENSIVE-MECHANISM TEST
      // =============================================================================================
      // A zero or negative window makes `v_now - window_started_at > make_interval(secs => 0)` true
      // on EVERY call, because any elapsed time is greater than zero. The counter would then reset to
      // 1 every time and no limit would ever be reached — a rate limit that does not limit, written
      // in SQL that looks correct.
      //
      // The floor is `greatest(p_window_seconds, 1)`. Asserting the OUTCOME rather than the
      // expression is deliberate: the outcome is what the application depends on, and an
      // expression-shaped assertion would break on a rewrite that preserves the behaviour.
      await record("203.0.113.7", window);
      const second = await record("203.0.113.7", window);
      // One second has not elapsed between two calls in a test, so with a floored 1-second window the
      // second call must still COUNT rather than reset.
      expect(second).toBe(2);
    },
  );
});

describe("clear forgets an origin", () => {
  it("removes the row entirely rather than zeroing it", async () => {
    await record("203.0.113.7");
    await record("203.0.113.7");
    expect(await storedRow("203.0.113.7")).toBeDefined();

    await clear("203.0.113.7");

    // "No row" and "a window with no failures in it" stay the same state. A stored zero would be a
    // third state nothing can produce, and every reader would have to special-case it.
    expect(await storedRow("203.0.113.7")).toBeUndefined();
    const total = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${ATTEMPTS_TABLE}`,
    );
    expect(total[0]?.count).toBe(0);
  });

  it("leaves the next attempt counting from one", async () => {
    await record("203.0.113.7");
    await record("203.0.113.7");
    await clear("203.0.113.7");
    // A researcher who mistyped twice must not be left with a shortened allowance for the rest of the
    // window, which is the whole reason `clear` exists.
    expect(await record("203.0.113.7")).toBe(1);
  });

  it("is a no-op for an origin with no row, rather than an error", async () => {
    // `signOutAction` does not call this, but the action's `clear` runs after a successful sign-in
    // that may never have failed, so the no-row case is the COMMON one and must not throw.
    await expect(clear("203.0.113.99")).resolves.toBeUndefined();
  });

  it("touches no other origin's row", async () => {
    await record("198.51.100.4");
    await record("203.0.113.7");
    await record("203.0.113.7");
    await clear("203.0.113.7");
    // Keyed by origin, so clearing one must not hand a fresh allowance to a party sharing that key —
    // which is why `signOutAction` deliberately does not call this at all.
    expect((await storedRow("198.51.100.4"))?.attempt_count).toBe(1);
  });
});

describe("the table's own constraints", () => {
  it("refuses an origin key longer than 200 characters, naming the constraint", async () => {
    // Matched against the CONSTRAINT NAME rather than a generic phrase. A generic `check constraint`
    // pattern passes when the wrong constraint fires, and this table declares two.
    const failure = await applySql(
      db,
      `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
       values ('${"x".repeat(201)}', now(), 1, now())`,
      "over-long origin key",
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain("researcher_signin_attempts_origin_key_length");
  });

  it("refuses an EMPTY origin key, naming the constraint", async () => {
    const failure = await applySql(
      db,
      `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
       values ('', now(), 1, now())`,
      "empty origin key",
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toContain("researcher_signin_attempts_origin_key_length");
  });

  it("refuses a negative count, naming the constraint", async () => {
    // Not reachable through the function, which only ever writes a positive count. Asserted anyway
    // because the column is `not null` and checked, and a constraint nothing can violate is a
    // constraint that is not known to work.
    const failure = await applySql(
      db,
      `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
       values ('203.0.113.7', now(), -1, now())`,
      "negative count",
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toContain("researcher_signin_attempts_count_not_negative");
  });

  it("refuses a NULL window start, which is what makes the window column load-bearing", async () => {
    const failure = await applySql(
      db,
      `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
       values ('203.0.113.7', null, 1, now())`,
      "null window start",
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toMatch(/window_started_at/);
  });

  it("refuses a DUPLICATE origin, which is what makes the increment a single upsert", async () => {
    await record("203.0.113.7");
    // Without the primary key, `ON CONFLICT (origin_key)` would have nothing to conflict on and the
    // whole atomicity argument would collapse into duplicate rows.
    const failure = await applySql(
      db,
      `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
       values ('203.0.113.7', now(), 99, now())`,
      "duplicate origin",
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toMatch(/duplicate key|unique/i);
    // And the original row is untouched — the constraint fired rather than overwriting.
    expect((await storedRow("203.0.113.7"))?.attempt_count).toBe(1);
  });

  it("accepts an origin key of exactly 200 characters", async () => {
    // The boundary the constraint states. Asserting only the over-long case would leave the
    // application truncating to a width the database rejects.
    const key = "y".repeat(200);
    await applySql(
      db,
      `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
       values ('${key}', now(), 1, now())`,
      "maximal origin key",
    );
    expect((await storedRow(key))?.attempt_count).toBe(1);
  });
});

describe("the GRANT posture, which is what stops this being a write amplifier", () => {
  // =================================================================================================
  // THE ORDER OF DEFENCE, AND WHY BOTH HALVES ARE TESTED
  // =================================================================================================
  // `revoke execute ... from public` is the BARRIER. With only the Row Level Security policy — which
  // grants nothing — an `anon` call would be refused by policy, but the privilege would still be
  // open, and a migration's slip away from the policy would turn a rate limiter into an
  // unauthenticated write amplifier.
  //
  // Both halves are asserted because either alone is insufficient, and a test of only one would pass
  // while the other was open.

  it("refuses EXECUTE to anon, by privilege rather than by policy", async () => {
    const failure = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      await tx.query(`select ${RECORD}('203.0.113.7', 900)`);
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    // `42501` is `insufficient_privilege`. A row-level refusal would be `42501` too, so the
    // privilege is asserted DIRECTLY from the catalogue as well, below — this is the behavioural half
    // and the catalogue check is the structural one.
    expect(failure?.message).toMatch(/permission denied|42501/i);
  });

  it("refuses EXECUTE to authenticated, the same way", async () => {
    // `authenticated` is not less privileged than `anon` for this table. There is no
    // researcher-authenticated role in this design, so the grant must not exist for either.
    const failure = await asRole(db, { role: "authenticated" }, async (tx: QueryExecutor) => {
      await tx.query(`select ${RECORD}('203.0.113.7', 900)`);
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toMatch(/permission denied|42501/i);
  });

  it("refuses `clear` to anon as well, so the counter cannot be reset by an unauthenticated party", async () => {
    // The mirror of the increment, and the more dangerous of the two: a party able to CLEAR could
    // reset its own allowance at will, which would make the limit advisory.
    const failure = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      await tx.query(`select ${CLEAR}('203.0.113.7')`);
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toMatch(/permission denied|42501/i);
  });

  it("grants EXECUTE to service_role, the only legitimate caller", async () => {
    const rows = await query<{ has_function_privilege: boolean }>(
      db,
      `select has_function_privilege('service_role', '${RECORD}(text, integer)', 'EXECUTE') as has_function_privilege`,
    );
    expect(rows[0]?.has_function_privilege).toBe(true);
    const clearRows = await query<{ has_function_privilege: boolean }>(
      db,
      `select has_function_privilege('service_role', '${CLEAR}(text)', 'EXECUTE') as has_function_privilege`,
    );
    expect(clearRows[0]?.has_function_privilege).toBe(true);
  });

  it("grants EXECUTE to NOBODY else, checked in the catalogue", async () => {
    // The structural half, and the one that cannot be satisfied by a coincidental failure. A role
    // list that included `PUBLIC`, `anon`, or `authenticated` would mean the revocation is not in
    // force, whatever the behavioural test above happened to observe.
    //
    // `PUBLIC` is reported by `has_function_privilege` for any role, so it is checked by name in
    // `pg_proc.proacl` — the grant list itself, which is where the revocation is recorded.
    const acl = await query<{ proacl: string[] }>(
      db,
      `select coalesce(p.proacl::text[], array['<NULL: no explicit grants>']) as proacl
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('researcher_signin_attempts_record', 'researcher_signin_attempts_clear')`,
    );
    expect(acl).toHaveLength(2);
    for (const entry of acl) {
      // No `{=...}` entry means EXECUTE was granted to PUBLIC, which is Postgres's default for a new
      // function. Its absence is the revocation.
      expect(entry.proacl.join(" ")).not.toMatch(/\{=/);
      // And no grant to anon or authenticated by name.
      expect(entry.proacl.join(" ")).not.toMatch(/anon|authenticated/);
      // The service_role grant IS present, so the ACL is not simply empty.
      expect(entry.proacl.join(" ")).toContain("service_role");
    }
  });

  it("uses INVOKER semantics, not definer", async () => {
    // `security definer` would run as the owner (`postgres` on a hosted project), which holds
    // `bypassrls`. An `anon` call would then WRITE a row it is supposed to be refused on, and the
    // deny-all policy would be bypassed rather than enforced. This is the load-bearing property of
    // the whole migration, so it is read from the catalogue rather than inferred from a failure.
    const rows = await query<{ prosecdef: boolean }>(
      db,
      `select p.prosecdef as prosecdef
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('researcher_signin_attempts_record', 'researcher_signin_attempts_clear')`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // `false` is invoker. This is the assertion a `security definer` edit turns red.
      expect(row.prosecdef).toBe(false);
    }
  });
});

describe("the table's Row Level Security posture matches the six research tables", () => {
  it("has RLS enabled and NO policy at all", async () => {
    const enabled = await query<{ rowsecurity: boolean }>(
      db,
      "select relrowsecurity as rowsecurity from pg_class where relname = 'researcher_signin_attempts'",
    );
    expect(enabled[0]?.rowsecurity).toBe(true);

    const policies = await query<{ count: number }>(
      db,
      `select count(*)::int as count from pg_policies
        where schemaname = 'public' and tablename = 'researcher_signin_attempts'`,
    );
    // Zero, not "no policy granting to anon". A policy granting something to `service_role` would be
    // redundant with its `bypassrls` and would be a hole if the role ever lost it.
    expect(policies[0]?.count).toBe(0);
  });

  it("returns zero rows to an anon SELECT, with NO error", async () => {
    // Measured on this engine: a deny-all RLS policy is not uniform across statement kinds. `select`,
    // `update`, and `delete` all complete against zero rows silently, and only `insert` raises
    // `new row violates row-level security policy`. Asserting an ERROR here would be asserting a
    // behaviour this engine does not have.
    await record("203.0.113.7");
    const seen = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      const result = await tx.query<{ origin_key: string }>(
        `select origin_key from ${ATTEMPTS_TABLE}`,
      );
      return result.rows;
    });
    expect(seen).toEqual([]);
  });

  it("refuses an anon INSERT by policy, naming RLS", async () => {
    const failure = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      await tx.query(
        `insert into ${ATTEMPTS_TABLE} (origin_key, window_started_at, attempt_count, updated_at)
         values ('203.0.113.7', now(), 1, now())`,
      );
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/row-level security/i);
  });

  it("still reads as service_role, which is the privileged path this feature depends on", async () => {
    // The counterpart to every anon refusal above. Without it, the whole table could be unreachable
    // and every test above would still pass — which is the shape of a suite that proves a door is
    // closed without proving there is a room behind it.
    await record("203.0.113.7");
    const seen = await asRole(db, { role: "service_role" }, async (tx: QueryExecutor) => {
      const result = await tx.query<{ attempt_count: number }>(
        `select attempt_count from ${ATTEMPTS_TABLE} where origin_key = '203.0.113.7'`,
      );
      return result.rows;
    });
    expect(seen).toEqual([{ attempt_count: 1 }]);
  });
});

describe("the function resolves nothing through a writable search path", () => {
  it("sets an empty search_path on both", async () => {
    // `set search_path = ''` means every name in the body must be qualified or in `pg_catalog`.
    // Without it, a party able to create a schema earlier in the path could shadow `now()` or
    // `greatest` and have this function call their version instead.
    const rows = await query<{ prosrc: string; proconfig: string[] }>(
      db,
      `select p.proconfig::text[] as proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('researcher_signin_attempts_record', 'researcher_signin_attempts_clear')`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.proconfig.join(" ")).toMatch(/search_path=/);
    }
  });

  it("qualifies the table it writes, so no alias could redirect it", async () => {
    // Assertions about SQL SHAPE need the comments stripped too: a migration comment that quotes
    // `insert into public.researcher_signin_attempts` would satisfy the positive assertion on a
    // body that did not contain the statement at all. This is the same trap the keyword check
    // above guards against, in the other direction.
    const body = await bodyWithoutComments("researcher_signin_attempts_record");
    expect(body).toContain("insert into public.researcher_signin_attempts");
    // The unqualified form would resolve through `search_path`, which is exactly what
    // `set search_path = ''` exists to prevent.
    expect(body).not.toMatch(/insert into researcher_signin_attempts/);
  });
});
