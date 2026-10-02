/**
 * `SupabaseValidatorsRepository.listByIds` against a real PostgreSQL engine, from the production
 * migrations directory.
 *
 * WHY A TEST-LOCAL ADAPTER, and what it does and does not prove. PGlite is PostgreSQL, not
 * PostgREST: there is no query builder to drive the repository with, so this file maps the three
 * builder calls `listByIds` makes — `from`, `select`, `in` — onto parameterized SQL. That mapping
 * is the test's own code, which means a failure here names one of two things: the repository
 * asking for something the adapter does not implement (a gap in the adapter, visible as a
 * thrown "unsupported" error), or the repository's row mapping disagreeing with the migrated
 * table (the thing under test). The adapter supports NOTHING else, deliberately: every
 * unsupported call throws rather than returning an empty result, so a repository that changed
 * its query shape fails loudly instead of passing against a fixture.
 *
 * What this proves that the fake-based unit tests cannot: the column list the implementation
 * selects exists on the migrated table with compatible types, `ilocano_proficiency` values
 * round-trip through the schema validation, and a missing id is an omission rather than an
 * error — against the engine, not a recording.
 *
 * What this does NOT prove: PostgREST's interpretation of `.in()`, which remains fake-only
 * (see `factory.ts`), and anything about RLS — the adapter runs with full privileges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws when its module body is evaluated outside a server bundle, and the
// repository under test legitimately carries the marker. Stubbed here, as in every other suite
// that loads a server-only module under Vitest.
vi.mock("server-only", () => ({}));

import { SupabaseValidatorsRepository } from "@/lib/repositories/supabase/validators";
import type { SupabaseClientLike } from "@/lib/repositories/supabase/client";

import { applyMigrations } from "./support/migrations";
import {
  applySql,
  closeTestDatabase,
  createTestDatabase,
  type TestDatabase,
} from "./support/pglite";

/**
 * The three builder calls `listByIds` makes, over PGlite.
 *
 * `columns` is interpolated rather than bound because SQL has no parameter for identifiers — but
 * it arrives here from the implementation's own `VALIDATOR_COLUMNS` constant, never from a test
 * literal, so there is no injection surface for a test to get wrong. The values go through `$1`
 * as an array, which is what `.in()` means.
 */
function pgliteTableClient(executor: TestDatabase, onQuery: () => void): SupabaseClientLike {
  return {
    from(table: string) {
      if (table !== "validators") {
        throw new Error(`test adapter supports only validators, got ${table}`);
      }
      return {
        select(columns?: string) {
          if (typeof columns !== "string" || columns.length === 0) {
            throw new Error("test adapter needs an explicit column list");
          }
          return {
            in(column: string, values: readonly unknown[]) {
              if (column !== "id") {
                throw new Error(`test adapter supports only .in("id", …), got ${column}`);
              }
              return (async () => {
                onQuery();
                const result = await executor.query(
                  `select ${columns} from public.validators where id = any ($1::text[])`,
                  [values as never[]] as never[],
                );
                // PostgREST serializes `timestamptz` as an ISO-8601 string; PGlite hands back a
                // `Date`. The adapter performs the serialization the gateway would, so
                // `toIsoDateTime` sees what it would see on the wire rather than failing on a
                // type no production caller ever sends it.
                const data = (result.rows as Record<string, unknown>[]).map((row) =>
                  Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [
                      key,
                      value instanceof Date ? value.toISOString() : value,
                    ]),
                  ),
                );
                return { data, error: null, count: null };
              })();
            },
          };
        },
      };
    },
    rpc() {
      throw new Error("test adapter supports no rpc");
    },
  } as unknown as SupabaseClientLike;
}

describe("SupabaseValidatorsRepository.listByIds", () => {
  let db: TestDatabase;
  let queries: number;

  beforeEach(async () => {
    db = await createTestDatabase();
    await applyMigrations(db);
    queries = 0;
    await applySql(
      db,
      `insert into public.validators (id, ilocano_proficiency, created_at, last_active_at, total_validations) values
        ('VAL_00000001', 'fluent', now(), now(), 3),
        ('VAL_00000002', 'native', now(), now(), 1),
        ('VAL_00000003', null, now(), now(), 0)`,
      "seed three validators",
    );
  });

  afterEach(async () => {
    await closeTestDatabase(db);
  });

  const repository = () =>
    new SupabaseValidatorsRepository(pgliteTableClient(db, () => (queries += 1)));

  it("round-trips stored profiles in caller order, omitting unknown ids", async () => {
    const profiles = await repository().listByIds(["VAL_00000002", "VAL_missing", "VAL_00000001"]);

    expect(profiles.map((profile) => profile.id)).toEqual(["VAL_00000002", "VAL_00000001"]);
    expect(profiles[0]).toMatchObject({ ilocanoProficiency: "native", totalValidations: 1 });
    expect(profiles[1]).toMatchObject({ ilocanoProficiency: "fluent", totalValidations: 3 });
    expect(queries).toBe(1);
  });

  it("maps a null proficiency to null rather than rejecting the row", async () => {
    const [profile] = await repository().listByIds(["VAL_00000003"]);

    expect(profile?.ilocanoProficiency).toBeNull();
  });

  it("issues no query for an empty id list", async () => {
    expect(await repository().listByIds([])).toEqual([]);
    expect(queries).toBe(0);
  });
});
