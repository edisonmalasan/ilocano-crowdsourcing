import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, readMigrations } from "./support/migrations";
import {
  asRole,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type QueryExecutor,
  type TestDatabase,
} from "./support/pglite";

/**
 * The operational monitoring tables, as real PostgreSQL executes them.
 *
 * Applies the production `supabase/migrations/` directory in filename order (the same helpers
 * `researcher-signin-attempts.test.ts` uses), then asserts the two tables this change adds:
 * closed column sets, deny-all RLS, the partial-unique dedupe behaviour, and the
 * once-per-window alert constraint.
 *
 * WHAT THIS FILE DOES NOT PROVE: PostgREST behaviour, the Supabase API gateway, or any
 * application recorder — the recorder is a later task. This is the schema half only.
 */

const MIGRATION = "20261009120000_operational_monitoring.sql";
const EVENTS_TABLE = "public.operational_events";
const ALERTS_TABLE = "public.operational_alerts";

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

async function columnsOf(table: string): Promise<string[]> {
  const rows = await query<{ column_name: string }>(
    db,
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by column_name`,
    [table.replace("public.", "")],
  );
  return rows.map((row) => row.column_name);
}

describe("the migration is applied from the production directory", () => {
  it("is present, lexically ordered, and timestamp-prefixed like its siblings", async () => {
    const migrations = await readMigrations();
    const filenames = migrations.map((m) => m.filename);
    expect(filenames).toContain(MIGRATION);
    expect([...filenames].sort()).toEqual(filenames);
    for (const filename of filenames) {
      expect(filename).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
    expect(filenames.length).toBeGreaterThan(0);
  });

  it("creates both tables", async () => {
    for (const table of ["operational_events", "operational_alerts"]) {
      const rows = await query<{ table_name: string }>(
        db,
        `select table_name from information_schema.tables
          where table_schema = 'public' and table_name = $1`,
        [table],
      );
      expect(rows).toHaveLength(1);
    }
  });

  it("holds EXACTLY five columns on operational_events", async () => {
    const columns = await columnsOf(EVENTS_TABLE);
    expect(columns.length).toBeGreaterThan(0);
    expect(columns).toEqual(["created_at", "dedupe_key", "id", "signal", "window_start"]);
  });

  it("holds EXACTLY six columns on operational_alerts", async () => {
    const columns = await columnsOf(ALERTS_TABLE);
    expect(columns.length).toBeGreaterThan(0);
    expect(columns).toEqual([
      "dispatched_at",
      "event_count",
      "id",
      "rule",
      "threshold",
      "window_start",
    ]);
  });

  it("references no research table from either table", async () => {
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
        where t.relname in ('operational_events', 'operational_alerts') and c.contype = 'f'`,
    );
    expect(rows[0]?.count).toBe(0);
  });
});

describe("signal and rule vocabulary", () => {
  const signals = [
    "enroll_failed",
    "resume_failed",
    "allocation_failed",
    "persistence_failed",
    "retry_exhausted",
    "already_recorded_spike",
    "reservation_abandoned",
    "researcher_signin_failed",
  ];

  it.each(signals)("accepts %s as an event signal", async (signal) => {
    await query(db, `insert into ${EVENTS_TABLE} (signal, window_start) values ($1, now())`, [
      signal,
    ]);
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${EVENTS_TABLE} where signal = $1`,
      [signal],
    );
    expect(rows[0]?.count).toBe(1);
    await truncateAll(db);
  });

  it("rejects an unapproved signal, naming the events check constraint", async () => {
    const failure = await query(
      db,
      `insert into ${EVENTS_TABLE} (signal, window_start) values ('page_view', now())`,
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain("operational_events_signal_check");
  });

  it("rejects an unapproved alert rule, naming the alerts check constraint", async () => {
    const failure = await query(
      db,
      `insert into ${ALERTS_TABLE} (rule, window_start, event_count, threshold)
       values ('page_view', now(), 99, 10)`,
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain("operational_alerts_rule_check");
  });
});

describe("partial-unique dedupe behaviour", () => {
  const window = "2026-10-09T12:00:00.000Z";

  it("counts a retried keyed submission once via ON CONFLICT DO NOTHING", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await query(
        db,
        `insert into ${EVENTS_TABLE} (signal, window_start, dedupe_key)
         values ('persistence_failed', $1, '0123456789abcdef')
         on conflict (signal, window_start, dedupe_key)
         where dedupe_key is not null do nothing`,
        [window],
      );
    }
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${EVENTS_TABLE}`,
    );
    expect(rows[0]?.count).toBe(1);
  });

  it("inserts keyless events twice: NULL never conflicts", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await query(
        db,
        `insert into ${EVENTS_TABLE} (signal, window_start) values ('enroll_failed', $1)`,
        [window],
      );
    }
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${EVENTS_TABLE}`,
    );
    expect(rows[0]?.count).toBe(2);
  });

  it("treats the same key in a different window as a distinct occurrence", async () => {
    const windows = ["2026-10-09T12:00:00.000Z", "2026-10-09T12:05:00.000Z"];
    for (const start of windows) {
      await query(
        db,
        `insert into ${EVENTS_TABLE} (signal, window_start, dedupe_key)
         values ('persistence_failed', $1, '0123456789abcdef')
         on conflict (signal, window_start, dedupe_key)
         where dedupe_key is not null do nothing`,
        [start],
      );
    }
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${EVENTS_TABLE}`,
    );
    expect(rows[0]?.count).toBe(2);
  });
});

describe("alerts once-per-window dispatch", () => {
  const window = "2026-10-09T12:00:00.000Z";

  it("records one dispatch per (rule, window)", async () => {
    await query(
      db,
      `insert into ${ALERTS_TABLE} (rule, window_start, event_count, threshold)
       values ('persistence_failed', $1, 5, 5)`,
      [window],
    );
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${ALERTS_TABLE}`,
    );
    expect(rows[0]?.count).toBe(1);
  });

  it("refuses a second dispatch for the same (rule, window)", async () => {
    await query(
      db,
      `insert into ${ALERTS_TABLE} (rule, window_start, event_count, threshold)
       values ('persistence_failed', $1, 5, 5)`,
      [window],
    );
    const failure = await query(
      db,
      `insert into ${ALERTS_TABLE} (rule, window_start, event_count, threshold)
       values ('persistence_failed', $1, 6, 5)`,
      [window],
    ).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/duplicate key|unique/i);
  });

  it("allows the same rule in a later window", async () => {
    await query(
      db,
      `insert into ${ALERTS_TABLE} (rule, window_start, event_count, threshold)
       values ('persistence_failed', '2026-10-09T12:00:00.000Z', 5, 5)`,
    );
    await query(
      db,
      `insert into ${ALERTS_TABLE} (rule, window_start, event_count, threshold)
       values ('persistence_failed', '2026-10-09T12:05:00.000Z', 7, 5)`,
    );
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from ${ALERTS_TABLE}`,
    );
    expect(rows[0]?.count).toBe(2);
  });
});

describe("Row Level Security posture matches the research tables", () => {
  it.each(["operational_events", "operational_alerts"])(
    "has RLS enabled and NO policy at all on %s",
    async (table) => {
      const enabled = await query<{ rowsecurity: boolean }>(
        db,
        "select relrowsecurity as rowsecurity from pg_class where relname = $1",
        [table],
      );
      expect(enabled[0]?.rowsecurity).toBe(true);
      const policies = await query<{ count: number }>(
        db,
        `select count(*)::int as count from pg_policies
          where schemaname = 'public' and tablename = $1`,
        [table],
      );
      expect(policies[0]?.count).toBe(0);
    },
  );

  it("returns zero rows to an anon SELECT, with NO error", async () => {
    await query(
      db,
      `insert into ${EVENTS_TABLE} (signal, window_start) values ('enroll_failed', now())`,
    );
    const seen = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      const result = await tx.query<{ signal: string }>(`select signal from ${EVENTS_TABLE}`);
      return result.rows;
    });
    expect(seen).toEqual([]);
  });

  it("refuses an anon INSERT by policy, naming RLS", async () => {
    const failure = await asRole(db, { role: "anon" }, async (tx: QueryExecutor) => {
      await tx.query(
        `insert into ${EVENTS_TABLE} (signal, window_start) values ('enroll_failed', now())`,
      );
      return null;
    }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/row-level security/i);
  });

  it("still reads as service_role, which is the privileged path the recorder depends on", async () => {
    await query(
      db,
      `insert into ${EVENTS_TABLE} (signal, window_start) values ('enroll_failed', now())`,
    );
    const seen = await asRole(db, { role: "service_role" }, async (tx: QueryExecutor) => {
      const result = await tx.query<{ signal: string }>(
        `select signal from ${EVENTS_TABLE} where signal = 'enroll_failed'`,
      );
      return result.rows;
    });
    expect(seen).toEqual([{ signal: "enroll_failed" }]);
  });
});
