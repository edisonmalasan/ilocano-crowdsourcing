import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "./support/migrations";
import {
  applySql,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type TestDatabase,
} from "./support/pglite";

/**
 * Explicit EXECUTE revokes for privileged RPC functions, as real PostgreSQL executes them.
 *
 * =================================================================================================
 * WHAT THIS FILE PROVES, AND WHAT IT HONESTLY DOES NOT
 * =================================================================================================
 * Measured on the live project: `anon` and `authenticated` hold EXECUTE on all five functions
 * despite their migrations' revokes from PUBLIC, because Supabase default privileges grant
 * explicitly — and the PGlite harness does not reproduce those defaults. So a test asserting
 * "anon lacks the privilege" passes here for a reason that does not exist on hosted: the grant
 * was never there to make.
 *
 * What IS established here, and why it is still worth asserting:
 *
 *   1. The migration executes cleanly and revokes what it names — a wrong signature fails loudly
 *      rather than partially, because `REVOKE` on a nonexistent function is an error, not a no-op.
 *   2. The end state holds: neither role has the privilege after migrations apply.
 *   3. The privilege assertions observe reality rather than passing vacuously: the grant-detect
 *      test below grants, observes `true`, revokes, and observes `false` again — self-contained,
 *      so file order cannot matter.
 *   4. The migration and this file name the same five functions, in either direction: a function
 *      added to one and missing from the other fails.
 *
 * What is NOT established here: that the hosted project, with its default grants, ends in this
 * state. That is proven by the gateway re-check recorded in the roadmap — anon RPC refused with
 * insufficient-privilege — never by this file.
 */

const FUNCTIONS = [
  "claim_entry_reservations(text, text[], integer)",
  "release_entry_reservation(text, text)",
  "researcher_signin_attempts_record(text, integer)",
  "researcher_signin_attempts_clear(text)",
  "dataset_entries_import(text, text, text, text, text, text, jsonb, boolean)",
] as const;

const MIGRATION = "20261004140000_rpc_execute_hardening.sql";

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

async function hasExecute(role: string, signature: string): Promise<boolean> {
  const rows = await query<{ holds: boolean }>(
    db,
    `select has_function_privilege($1, $2, 'EXECUTE') as holds`,
    [role, `public.${signature}`],
  );
  return rows[0]?.holds ?? false;
}

describe("the hardening migration revokes both unprivileged roles", () => {
  it("leaves anon without EXECUTE on every covered function", async () => {
    expect(FUNCTIONS.length).toBeGreaterThan(0);
    for (const signature of FUNCTIONS) {
      expect(await hasExecute("anon", signature), `anon holds EXECUTE on ${signature}`).toBe(false);
    }
  });

  it("leaves authenticated without EXECUTE on every covered function", async () => {
    for (const signature of FUNCTIONS) {
      expect(
        await hasExecute("authenticated", signature),
        `authenticated holds EXECUTE on ${signature}`,
      ).toBe(false);
    }
  });

  it("leaves the privileged caller with EXECUTE on every covered function", async () => {
    // The revoke names only anon and authenticated. A revoke that also stripped service_role
    // would close the very path the application uses — and the failure would surface as every
    // allocation failing, not as a grant test.
    for (const signature of FUNCTIONS) {
      expect(await hasExecute("service_role", signature)).toBe(true);
    }
  });

  it("detects a grant that should not exist, then removes it again", async () => {
    // The permanent can-fire control for the two tests above. In this harness the grants never
    // existed, so those assertions could pass while observing nothing — this test grants,
    // observes `true`, revokes, and observes `false` again, proving the privilege reads see
    // reality. Self-contained: truncateAll does not reset grants, so a grant left behind would
    // poison every other test in this file.
    const target = FUNCTIONS[0] as string;
    const name = target.split("(")[0] as string;
    await applySql(db, `grant execute on function public.${target} to anon`, "grant to anon");
    expect(await hasExecute("anon", target)).toBe(true);
    await applySql(
      db,
      `revoke all on function public.${target} from anon, authenticated`,
      "revoke from anon",
    );
    expect(await hasExecute("anon", target)).toBe(false);
    expect(name.length).toBeGreaterThan(0);
  });
});

describe("the migration and the test name the same function set", () => {
  it("revokes exactly the five measured functions, no more and no fewer", async () => {
    // Read from the migration FILE, not from-Za catalogue: the catalogue cannot show a function
    // the migration forgot to revoke. A sixth privileged function added without a revoke line
    // fails here rather than drifting.
    const source = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", MIGRATION),
      "utf8",
    );
    const revoked = [...source.matchAll(/^revoke all on function public\.(\w+)\(/gim)].map(
      (match) => match[1] ?? "",
    );
    expect(revoked.sort()).toEqual(
      [
        "claim_entry_reservations",
        "release_entry_reservation",
        "researcher_signin_attempts_record",
        "researcher_signin_attempts_clear",
        "dataset_entries_import",
      ].sort(),
    );
    // And the test's signatures cover the same names the migration revokes.
    expect(FUNCTIONS.map((signature) => signature.split("(")[0]).sort()).toEqual(revoked.sort());
  });
});
