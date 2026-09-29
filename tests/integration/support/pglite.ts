import { PGlite } from "@electric-sql/pglite";

/**
 * Real-PostgreSQL test harness, backed by PGlite (PostgreSQL compiled to WASM).
 *
 * WHY THIS EXISTS
 * ---------------
 * There is no local container runtime and no `supabase` CLI on this machine, and no Supabase
 * project has been provisioned yet. PGlite runs genuine PostgreSQL — the same parser, planner,
 * constraint engine, and transaction machinery — with no Docker and no account, so database
 * behaviour (constraints, unique indexes, partial indexes, RLS, triggers, transactional
 * allocation) can be verified in CI today rather than deferred to a manual deploy.
 *
 * WHAT IT DOES NOT PROVE  (see `AGENTS.md` -> Verified project tools)
 * ------------------------------------------------------------------
 * PGlite is PostgreSQL, not Supabase. It does not exercise Supabase Auth, Storage, Realtime,
 * Edge Functions, the `graphql` schema, dashboard-managed extensions, or Row Level Security
 * *as enforced by the Supabase API gateway*. Those remain unverified until a real project exists.
 *
 * MIGRATION DISCIPLINE
 * --------------------
 * Because migrations are applied here, a migration file must be plain PostgreSQL. It may not
 * depend on a Supabase-managed extension being present, and it may only reference `auth.uid()`
 * from inside an RLS policy — the harness stubs that schema below.
 */

export type TestDatabase = PGlite;

/**
 * The subset of the PGlite API the harness uses.
 *
 * `db.transaction()` hands the callback a `Transaction`, which is not an instance of `PGlite`
 * (it lacks the WASM instance and lifecycle methods). Typing callbacks against this structural
 * interface lets a helper accept either one without `any` or a cast.
 */
export interface QueryExecutor {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Supabase-managed pieces the harness stubs so that real migration files run unchanged.
 *
 * On a real project, `auth.uid()` reads the verified JWT of the current request. Here it reads a
 * per-role claim set that a test controls, which lets a test assert "this user sees their own
 * rows and nobody else's" without minting a signed JWT.
 */
const SUPABASE_STUBS = `
-- Stub of the Supabase-managed \`auth\` schema. PGlite is plain PostgreSQL, so the migration
-- files that reference it can still be applied verbatim.
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'auth' and p.proname = 'uid') then
    -- Returns the subject claim of the acting role, or NULL when unauthenticated.
    -- Mirrors the shape of the real Supabase function: uuid or NULL.
    create function auth.uid() returns uuid
      language sql stable
      as $fn$
        select nullif(
          current_setting('test.jwt.sub', true),
          ''
        )::uuid
      $fn$;

    create function auth.role() returns text
      language sql stable
      as $fn$
        select nullif(current_setting('test.jwt.role', true), '')
      $fn$;
  end if;
end
$$;
`;

/**
 * Roles a real Supabase project exposes to the API. Policies are written against these, so the
 * harness creates them too.
 *
 * `test_jwt_role` impersonates a role for the duration of a transaction. `set local role` cannot
 * escalate, and `reset role` returns to the superuser that PGlite runs as, so this is safe to
 * use from tests.
 */
const SUPABASE_ROLES = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;
`;

/**
 * Privilege grants that a real Supabase project provisions for its API roles.
 *
 * Supabase grants the `anon`/`authenticated`/`service_role` roles usage on the `auth` and
 * `public` schemas and full table privileges in `public`, which is why a generated policy can
 * call `auth.uid()` and a request can read a table. Plain PostgreSQL grants none of this, so
 * without these statements every RLS test would fail with "permission denied" for reasons that
 * have nothing to do with the policy under test.
 */
const SUPABASE_GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

/**
 * Grants full table privileges in `public` to the API roles, plus default privileges so tables
 * created later (by a migration) inherit them.
 *
 * Called after migrations are applied, because the explicit `grant` needs the tables to exist;
 * the `alter default privileges` covers anything created afterwards.
 */
export async function grantPublicPrivileges(db: TestDatabase): Promise<void> {
  await applySql(db, SUPABASE_GRANTS, "supabase schema grants");

  await applySql(
    db,
    `alter default privileges in schema public
       grant all on tables to anon, authenticated, service_role;`,
    "supabase default table grants",
  );

  await applySql(
    db,
    `do $$
     declare
       stmt text;
     begin
       select string_agg(format('grant all on table public.%I to anon, authenticated, service_role', tablename), '; ')
         into stmt
         from pg_tables
        where schemaname = 'public';
       if stmt is not null then
         execute stmt;
       end if;
     end
     $$;`,
    "supabase table grants",
  );
}

/** Boots a fresh in-memory PostgreSQL with the Supabase surface stubbed. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUBS);
  await db.exec(SUPABASE_ROLES);
  return db;
}

export async function closeTestDatabase(db: TestDatabase): Promise<void> {
  await db.close();
}

export interface ActingRole {
  role: "anon" | "authenticated" | "service_role";
  /** Subject claim, i.e. the `sub` of the JWT. Maps to `auth.uid()`. */
  subject?: string;
}

/**
 * Runs `work` as one of the Supabase API roles, inside a transaction, with the stubbed
 * `auth.uid()` returning `subject`.
 *
 * Wrapped in a transaction so `set local role` and `set local` claims are rolled back
 * automatically — a test cannot leak a role change into the next assertion.
 */
export async function asRole<T>(
  db: TestDatabase,
  acting: ActingRole,
  work: (tx: QueryExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${acting.role}`);
    await tx.query("select set_config('test.jwt.role', $1, true)", [acting.role]);
    await tx.query("select set_config('test.jwt.sub', $1, true)", [acting.subject ?? ""]);
    return work(tx);
  }) as Promise<T>;
}

/** Applies raw SQL, throwing with the statement included on failure. */
export async function applySql(db: TestDatabase, sql: string, label = "statement"): Promise<void> {
  try {
    await db.exec(sql);
  } catch (cause) {
    throw new Error(`PGlite failed applying ${label}: ${(cause as Error).message}`, { cause });
  }
}

/** Runs a query and returns typed rows. */
export async function query<T>(
  db: TestDatabase,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(sql, params as never[]);
  return result.rows;
}

/** Truncates every table in the public schema, leaving the schema itself in place. */
export async function truncateAll(db: TestDatabase): Promise<void> {
  await db.exec(`
    do $$
    declare
      stmt text;
    begin
      select string_agg(format('%I.%I', schemaname, tablename), ', ')
        into stmt
        from pg_tables
       where schemaname = 'public';
      if stmt is not null then
        execute 'truncate ' || stmt || ' restart identity cascade';
      end if;
    end
    $$;
  `);
}
