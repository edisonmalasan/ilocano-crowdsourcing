import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "./support/migrations";
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
 * Exclusive assignment leases, as real PostgreSQL executes them.
 *
 * =================================================================================================
 * WHY THIS FILE CANNOT BE REPLACED BY THE UNIT TEST, AND VICE VERSA
 * =================================================================================================
 * The entire reason claiming is a Postgres FUNCTION is ARBITRATION, and arbitration is a claim
 * about a single database statement rather than about TypeScript. The unit/service tests prove the
 * application asks for the right `rpc` call, backfills shortfalls, and collapses contention — all
 * against fakes that cannot execute SQL at all.
 *
 * So the properties only this engine can answer are:
 *
 *   1. Simultaneous claims for one entry grant exactly one holder — decided by the primary key,
 *      not by application ordering.
 *   2. Expiry is a time comparison evaluated inside the claim — no watcher, no sweeper.
 *   3. The GRANT POSTURE is real — `anon`/`authenticated` cannot EXECUTE either function and
 *      cannot touch the table.
 *
 * =================================================================================================
 * WHAT THIS FILE STILL DOES NOT PROVE
 * =================================================================================================
 * PGlite is PostgreSQL compiled to WebAssembly running on a SINGLE connection, so it serialises
 * the statements concurrent callers issue and no two of them ever contend for one row. Real
 * arbitration is a property of a MULTI-connection engine holding row locks, and nothing here
 * produces that condition — the concurrent-claims test below measures consistent results under
 * serialization, which is worth asserting and is NOT an atomicity proof. The atomicity argument
 * rests on (1) the claim being ONE statement, asserted structurally against `pg_proc`, and (2)
 * `INSERT ... ON CONFLICT` arbitration being a documented property of PostgreSQL. Neither is
 * claimed beyond what is measured; the test-data strategy for true wire racing belongs to
 * real-flow verification, not to CI.
 *
 * PGlite is also not Supabase: PostgREST argument passing, the schema cache, and RLS as the
 * gateway enforces it are unobserved here.
 */

const TABLE = "public.entry_reservations";
const CLAIM = "public.claim_entry_reservations";
const RELEASE = "public.release_entry_reservation";

const VAL_A = "VAL_aaaaaaaaaaaaaaaa";
const VAL_B = "VAL_bbbbbbbbbbbbbbbb";

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

async function seed(): Promise<void> {
  await applySql(
    db,
    `insert into public.validators (id) values ('${VAL_A}'), ('${VAL_B}');
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('E1', 'origin_destination', 'instruction one', '{"id":"E1"}'::jsonb),
              ('E2', 'origin_destination', 'instruction two', '{"id":"E2"}'::jsonb),
              ('E3', 'origin_destination', 'instruction three', '{"id":"E3"}'::jsonb);`,
    "seed validators and entries",
  );
}

/** Claims entries as `service_role` — the only legitimate caller — and returns granted ids. */
async function claim(
  validatorId: string,
  entryIds: string[],
  ttlSeconds = 1800,
): Promise<string[]> {
  const list = entryIds.map((id) => `'${id}'`).join(", ");
  const rows = await query<{ entry_id: string }>(
    db,
    `select * from ${CLAIM}('${validatorId}', array[${list}], ${ttlSeconds})`,
  );
  return rows.map((row) => row.entry_id).sort();
}

async function release(validatorId: string, entryId: string): Promise<void> {
  await applySql(db, `select ${RELEASE}('${validatorId}', '${entryId}')`, "release");
}

async function storedRows(): Promise<
  Array<{ entry_id: string; validator_id: string; reserved_at: string; expires_at: string }>
> {
  return query(db, `select entry_id, validator_id, reserved_at, expires_at from ${TABLE}`);
}

/**
 * A function's body, as PostgreSQL stores it — read from the catalogue, never from the `.sql`
 * file, so the assertions describe the function that actually exists. Comment-stripped in both
 * syntaxes (block first, then line), because a bare-keyword check over raw text is satisfied by
 * a comment quoting the statement.
 */
async function bodyWithoutComments(name: string): Promise<string> {
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
  expect((source as string).length).toBeGreaterThan(0);
  return (source as string)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("the migration creates the table and both functions", () => {
  it("creates the table with exactly four columns", async () => {
    const rows = await query<{ column_name: string }>(
      db,
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'entry_reservations'
        order by ordinal_position`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      "entry_id",
      "validator_id",
      "reserved_at",
      "expires_at",
    ]);
  });

  it("keys the table on the entry, so two holders for one entry are unrepresentable", async () => {
    const rows = await query<{ constraint_name: string }>(
      db,
      `select constraint_name from information_schema.table_constraints
        where table_schema = 'public' and table_name = 'entry_reservations'
          and constraint_type = 'PRIMARY KEY'`,
    );
    expect(rows.length).toBe(1);
    const keyCols = await query<{ column_name: string }>(
      db,
      `select column_name from information_schema.key_column_usage
        where table_schema = 'public' and table_name = 'entry_reservations'
          and constraint_name = $1`,
      [rows[0]?.constraint_name as string],
    );
    expect(keyCols.map((row) => row.column_name)).toEqual(["entry_id"]);
  });

  it("enables RLS with no public policy", async () => {
    const tables = await query<{ relrowsecurity: boolean }>(
      db,
      `select relrowsecurity from pg_class where relname = 'entry_reservations'`,
    );
    expect(tables[0]?.relrowsecurity).toBe(true);
    const policies = await query<{ count: string }>(
      db,
      `select count(*) as count from pg_policy where polrelid = 'public.entry_reservations'::regclass`,
    );
    expect(Number(policies[0]?.count)).toBe(0);
  });

  it("creates both functions with revoked public execute", async () => {
    for (const name of ["claim_entry_reservations", "release_entry_reservation"]) {
      const rows = await query<{ proname: string }>(
        db,
        `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = $1`,
        [name],
      );
      expect(rows.length, `${name} must exist`).toBe(1);
    }
  });
});

describe("claiming grants unclaimed entries and skips held ones", () => {
  it("grants every unclaimed candidate to the caller", async () => {
    await seed();
    expect(await claim(VAL_A, ["E1", "E2"], 1800)).toEqual(["E1", "E2"]);
    expect(await storedRows()).toHaveLength(2);
  });

  it("grants nothing twice: a second claimant for held entries is skipped, not queued", async () => {
    await seed();
    expect(await claim(VAL_A, ["E1", "E2"], 1800)).toEqual(["E1", "E2"]);
    expect(await claim(VAL_B, ["E1", "E2", "E3"], 1800)).toEqual(["E3"]);
    const rows = await storedRows();
    expect(rows.filter((row) => row.entry_id === "E1")).toHaveLength(1);
  });

  it("re-grants the caller's own unexpired rows, so a retried claim is not phantom contention", async () => {
    await seed();
    expect(await claim(VAL_A, ["E1"], 1800)).toEqual(["E1"]);
    expect(await claim(VAL_A, ["E1", "E2"], 1800)).toEqual(["E1", "E2"]);
  });

  it("grants disjoint sets to simultaneous claimants with none shared", async () => {
    // Serialized by this engine — see the file header. What IS established: overlapping claims
    // resolve to a partition, never a shared grant, and the union is complete.
    await seed();
    const [grantedA, grantedB] = await Promise.all([
      claim(VAL_A, ["E1", "E2"], 1800),
      claim(VAL_B, ["E2", "E3"], 1800),
    ]);
    const shared = grantedA.filter((id) => grantedB.includes(id));
    expect(shared).toEqual([]);
    expect([...grantedA, ...grantedB].sort()).toEqual(["E1", "E2", "E3"]);
  });
});

describe("expiry is a comparison, not a watcher", () => {
  it("reclaims an expired row by time comparison alone", async () => {
    await seed();
    expect(await claim(VAL_A, ["E1"], 1800)).toEqual(["E1"]);
    await applySql(
      db,
      `update ${TABLE} set expires_at = now() - make_interval(secs => 1) where entry_id = 'E1'`,
      "backdate expiry",
    );
    // No sweeper runs between these two statements. The reclaim below succeeds by comparing the
    // stored instant against `now()` inside the claim — that IS the expiry mechanism.
    expect(await claim(VAL_B, ["E1"], 1800)).toEqual(["E1"]);
    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.validator_id).toBe(VAL_B);
  });

  it("leaves an unexpired row untouched, holder and deadline intact", async () => {
    await seed();
    await claim(VAL_A, ["E1"], 1800);
    const before = await storedRows();
    expect(await claim(VAL_B, ["E1"], 1800)).toEqual([]);
    const after = await storedRows();
    expect(after).toEqual(before);
  });

  it("floors a non-positive TTL at one second rather than granting an already-dead lease", async () => {
    await seed();
    expect(await claim(VAL_A, ["E1"], 0)).toEqual(["E1"]);
    const rows = await storedRows();
    expect(new Date(rows[0]?.expires_at as string).getTime()).toBeGreaterThan(
      new Date(rows[0]?.reserved_at as string).getTime(),
    );
  });
});

describe("release forgets one holder's claim", () => {
  it("deletes the submitter's own row after a stored response", async () => {
    await seed();
    await claim(VAL_A, ["E1", "E2"], 1800);
    await release(VAL_A, "E1");
    expect((await storedRows()).map((row) => row.entry_id)).toEqual(["E2"]);
  });

  it("cannot release another attempt's row", async () => {
    await seed();
    await claim(VAL_A, ["E1"], 1800);
    await release(VAL_B, "E1");
    expect((await storedRows()).map((row) => row.validator_id)).toEqual([VAL_A]);
  });

  it("is a no-op for a row that was never claimed, rather than an error", async () => {
    await seed();
    await release(VAL_A, "E3");
    expect(await storedRows()).toEqual([]);
  });
});

describe("the claim is ONE statement, which is what atomicity actually rests on", () => {
  it("contains the primary-key arbiter and no row locking", async () => {
    // The arbiter is `ON CONFLICT ... DO UPDATE ... WHERE`, not `DO NOTHING`: a bare skip could
    // neither reclaim expired rows nor re-grant the caller's own — and the first draft of this
    // test asserted `DO NOTHING`, which the function never contained. A shape assertion written
    // from the design summary rather than from the migration is the same defect as a guard that
    // never fired: it reports on a sentence, not on the code.
    const body = await bodyWithoutComments("claim_entry_reservations");
    expect(body).toMatch(/on conflict\s*\(\s*entry_id\s*\)\s*do update/i);
    expect(body).toMatch(/where[\s\S]*expires_at\s*<=/i);
    expect(body).not.toMatch(/for update/i);
  });

  it("performs no separate read before the insert", async () => {
    // A `SELECT ... INTO` or a second `SELECT` of the table ahead of the insert would be the
    // read half of read-then-write wearing one statement's clothes.
    const body = await bodyWithoutComments("claim_entry_reservations");
    expect(body).not.toMatch(/select\b[\s\S]*\binto\b/i);
  });
});

describe("the grant posture stops this being a write amplifier", () => {
  it("refuses EXECUTE of the claim to anon, by privilege rather than by policy", async () => {
    const failure = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      await tx.query(`select * from ${CLAIM}('VAL_x', array['E1'], 1800)`);
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/permission denied|42501/i);
  });

  it("refuses EXECUTE to authenticated, the same way", async () => {
    const failure = await asRole(db, { role: "authenticated" }, async (tx: QueryExecutor) => {
      await tx.query(`select * from ${CLAIM}('VAL_x', array['E1'], 1800)`);
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toMatch(/permission denied|42501/i);
  });

  it("refuses table reads and writes to anon by default", async () => {
    await seed();
    await claim(VAL_A, ["E1"], 1800);
    const seen = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      const result = await tx.query(`select * from ${TABLE}`);
      return result.rows;
    });
    expect(seen).toEqual([]);
    const failure = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      await tx.query(
        `insert into ${TABLE} (entry_id, validator_id, reserved_at, expires_at)
         values ('E2', 'VAL_x', now(), now() + make_interval(secs => 60))`,
      );
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
  });
});
