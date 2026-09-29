import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asRole,
  closeTestDatabase,
  createTestDatabase,
  query,
  type TestDatabase,
} from "./support/pglite";
import { applyMigrations, readMigrations } from "./support/migrations";

/**
 * Proves the integration harness can run the project's real migration files.
 *
 * This is the gate that makes the absence of a Supabase project a deploy-time problem instead of
 * a roadmap-wide blocker: if this test passes, the next change can write real migrations for the
 * six research tables and assert their constraints here.
 */

const FIXTURE_DIR = path.resolve(process.cwd(), "tests", "integration", "fixtures");

describe("PGlite harness", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it("boots a real PostgreSQL instance", async () => {
    const rows = await query<{ version: string }>(db, "select version() as version");
    expect(rows[0]?.version).toMatch(/PostgreSQL/i);
  });

  it("provides the stubbed auth schema migrations depend on", async () => {
    const rows = await query<{ uid: string | null }>(db, "select auth.uid() as uid");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uid).toBeNull();
  });

  it("provides the anon, authenticated, and service_role roles", async () => {
    const rows = await query<{ rolname: string }>(
      db,
      "select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role') order by rolname",
    );
    expect(rows.map((row) => row.rolname)).toEqual(["anon", "authenticated", "service_role"]);
  });

  it("applies a migration containing a table, a unique constraint, and an RLS policy", async () => {
    const { applied } = await applyMigrations(db, FIXTURE_DIR);
    expect(applied).toEqual(["0001_harness_probe.sql"]);

    const tables = await query<{ table_name: string }>(
      db,
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.map((row) => row.table_name)).toEqual(["fixture_notes", "fixture_owners"]);
  });

  it("enforces a uniqueness constraint declared in a migration", async () => {
    await db.exec("insert into public.fixture_owners (label) values ('a'), ('b')");
    const owners = await query<{ id: string; label: string }>(
      db,
      "select id, label from public.fixture_owners order by label",
    );
    const [first, second] = owners;
    expect(first && second).toBeTruthy();

    await db.exec(
      `insert into public.fixture_notes (owner_id, body) values ('${first!.id}', 'hello')`,
    );

    // The duplicate must be rejected by the database, not by application code.
    await expect(
      db.exec(`insert into public.fixture_notes (owner_id, body) values ('${first!.id}', 'hello')`),
    ).rejects.toThrow(/fixture_notes_owner_body_unique|duplicate key/i);

    // A different owner with the same body is still allowed.
    await expect(
      db.exec(
        `insert into public.fixture_notes (owner_id, body) values ('${second!.id}', 'hello')`,
      ),
    ).resolves.toBeTruthy();
  });

  it("enforces a foreign key declared in a migration", async () => {
    await expect(
      db.exec(
        "insert into public.fixture_notes (owner_id, body) values ('00000000-0000-0000-0000-000000000000', 'x')",
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("lets auth.uid() resolve to the acting subject", async () => {
    const subject = "11111111-1111-4111-8111-111111111111";
    const resolved = await asRole(db, { role: "authenticated", subject }, async (tx) => {
      const rows = await tx.query<{ uid: string }>("select auth.uid() as uid");
      return rows.rows[0]?.uid;
    });
    expect(resolved).toBe(subject);
  });

  it("enforces an RLS policy that references auth.uid()", async () => {
    const alice = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";

    // The policy is `owner_id = auth.uid()`, so the owner's primary key IS the authenticated
    // subject — the same relationship a real `auth.users.id` has to a `validators.id`.
    await db.exec(`
      insert into public.fixture_owners (id, label) values
        ('${alice}', 'alice'),
        ('${bob}',   'bob');
    `);

    // Each actor writes their own row.
    await asRole(db, { role: "authenticated", subject: alice }, async (tx) => {
      await tx.exec(
        `insert into public.fixture_notes (owner_id, body) values ('${alice}', 'alice note')`,
      );
    });
    await asRole(db, { role: "authenticated", subject: bob }, async (tx) => {
      await tx.exec(
        `insert into public.fixture_notes (owner_id, body) values ('${bob}', 'bob note')`,
      );
    });

    // Alice reads only her own row.
    const aliceSees = await asRole(db, { role: "authenticated", subject: alice }, async (tx) => {
      const result = await tx.query<{ body: string }>("select body from public.fixture_notes");
      return result.rows.map((row) => row.body);
    });
    expect(aliceSees).toEqual(["alice note"]);

    // Bob reads only his own row.
    const bobSees = await asRole(db, { role: "authenticated", subject: bob }, async (tx) => {
      const result = await tx.query<{ body: string }>("select body from public.fixture_notes");
      return result.rows.map((row) => row.body);
    });
    expect(bobSees).toEqual(["bob note"]);

    // Alice cannot write a row attributed to Bob.
    await expect(
      asRole(db, { role: "authenticated", subject: alice }, async (tx) => {
        await tx.exec(
          `insert into public.fixture_notes (owner_id, body) values ('${bob}', 'forged')`,
        );
      }),
    ).rejects.toThrow(/row-level security|violates/i);

    // The forged row was not persisted: Bob still has exactly his own note.
    const bobNotes = await query<{ body: string }>(
      db,
      "select body from public.fixture_notes where owner_id = $1",
      [bob],
    );
    expect(bobNotes.map((row) => row.body)).toEqual(["bob note"]);

    // And no row anywhere carries the forged body.
    const forged = await query<{ count: number }>(
      db,
      "select count(*)::int as count from public.fixture_notes where body = 'forged'",
    );
    expect(forged[0]?.count).toBe(0);
  });

  it("leaves the connection usable after a role-scoped transaction", async () => {
    // A leaked role or claim would make every later assertion meaningless.
    const rows = await query<{ uid: string | null }>(db, "select auth.uid() as uid");
    expect(rows[0]?.uid).toBeNull();
  });
});

describe("migration discovery", () => {
  it("returns an empty list when the migrations directory does not exist yet", async () => {
    const missing = path.resolve(process.cwd(), "supabase", "does-not-exist");
    expect(await readMigrations(missing)).toEqual([]);
  });

  it("orders migrations lexically by filename", async () => {
    const migrations = await readMigrations(FIXTURE_DIR);
    const names = migrations.map((migration) => migration.filename);
    expect(names).toEqual([...names].sort());
  });
});
