import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isEntryComplete, type CoverageResponseShape } from "@/lib/domain/validation-response";

import { applyMigrationByName, applyMigrations } from "./support/migrations";
import {
  applySql,
  asRole,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type TestDatabase,
} from "./support/pglite";

/**
 * The versioned allocation function, as real PostgreSQL executes it.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS, AND WHAT EACH HALF PROVES
 * =================================================================================================
 * `allocate_validation_batch_v1` moves the eligibility decision into SQL. That is a second
 * language for the methodology's most load-bearing predicate, and the repository record is
 * explicit that such a predicate drifts invisibly: allocation would quietly stop handing an
 * entry to enough validators, or start retiring one too early, and the research would record
 * the result as diligence either way.
 *
 * So this file proves, against the production migration applied from the production directory:
 *
 *   1. PARITY — the function's grants agree with the TypeScript `isEntryComplete` on every
 *      storable response combination (13 single-response cells plus pooled multi-response
 *      cases). A drift in EITHER direction fails here, because the expected answer is derived
 *      from the TypeScript definition on the test's own fixtures, never from a copy of the SQL.
 *   2. REGRESSION — the §17 behaviors (exclusions, reservations, short batches, categories,
 *      positions, atomicity) hold through the function.
 *   3. CONCURRENCY — simultaneous allocations grant disjoint sets without deadlock.
 *   4. PRIVILEGE — `anon`/`authenticated` cannot execute; `service_role` can.
 *
 * =================================================================================================
 * WHAT THIS FILE DOES NOT PROVE
 * =================================================================================================
 * PGlite runs on a single connection, so concurrent callers are serialized: the disjoint-grant
 * assertions below are worth making and are NOT an atomicity proof. Atomicity rests on the grant
 * being one statement with PK arbitration (asserted structurally against `pg_proc`) plus the
 * documented behavior of `INSERT ... ON CONFLICT` — the same two-legged argument
 * `entry-reservations.test.ts` records. PostgREST argument passing and gateway RLS are
 * unobserved here; the hosted probes cover them after migration.
 */

const MIGRATION = "20261007130000_allocate_validation_batch.sql";
const FN = "public.allocate_validation_batch_v1";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await applyMigrations(db);
}, 120_000);

afterAll(async () => {
  await closeTestDatabase(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

// ------------------------------------------------------------------------------------------------
// Seeds
// ------------------------------------------------------------------------------------------------

async function seedEntries(
  entries: ReadonlyArray<{ id: string; category?: string; transitModes?: string }>,
): Promise<void> {
  if (entries.length === 0) return;
  // One column shape always: rows without a pair carry an explicit null rather than a
  // shorter tuple, because a multi-row VALUES list has a single column list.
  const values = entries
    .map(
      (entry) =>
        `('${entry.id}', '${entry.category ?? "origin_destination"}', ` +
        `'Instruction for ${entry.id}.', '{"id":"${entry.id}"}'::jsonb, ` +
        `${entry.transitModes === undefined ? "null" : `'${entry.transitModes}'`})`,
    )
    .join(", ");
  await applySql(
    db,
    `insert into public.dataset_entries
       (id, category, instruction, source_payload, transit_modes) values ${values}`,
    "seed entries",
  );
}

async function seedValidator(id: string): Promise<void> {
  await applySql(db, `insert into public.validators (id) values ('${id}')`, `validator ${id}`);
}

async function seedBatch(batchId: string, validatorId: string): Promise<void> {
  await applySql(
    db,
    `insert into public.validation_batches (id, validator_id, created_at)
     values ('${batchId}', '${validatorId}', '2026-09-30T00:00:00.000Z')`,
    `batch ${batchId}`,
  );
}

async function assignEntry(batchId: string, entryId: string, position: number): Promise<void> {
  await applySql(
    db,
    `insert into public.batch_entries (batch_id, dataset_entry_id, position)
     values ('${batchId}', '${entryId}', ${position})`,
    `assign ${entryId}`,
  );
}

interface ResponseSeed {
  evaluation: string;
  corrected?: string | null;
  english?: string | null;
  filipino?: string | null;
}

let responseCounter = 0;

async function recordResponse(
  validatorId: string,
  entryId: string,
  seed: ResponseSeed,
  batchId?: string,
): Promise<void> {
  const batch = batchId ?? `B_${validatorId}`;
  await seedBatch(batch, validatorId).catch(() => {});
  const id = `R${(responseCounter += 1)}`;
  const literal = (value: string | null | undefined): string =>
    value === null || value === undefined ? "null" : `'${value}'`;
  await applySql(
    db,
    `insert into public.validations
       (id, validator_id, dataset_entry_id, batch_id, evaluation,
        corrected_instruction, english_translation, filipino_translation)
     values ('${id}', '${validatorId}', '${entryId}', '${batch}',
             '${seed.evaluation}', ${literal(seed.corrected)},
             ${literal(seed.english)}, ${literal(seed.filipino)})`,
    `response ${id}`,
  );
}

async function reserve(entryId: string, validatorId: string, expiresAt: string): Promise<void> {
  await applySql(
    db,
    `insert into public.entry_reservations (entry_id, validator_id, expires_at)
     values ('${entryId}', '${validatorId}', '${expiresAt}')`,
    `reserve ${entryId}`,
  );
}

interface GrantedPlacement {
  entry_id: string;
  entry_position: number;
}

async function allocate(
  validatorId: string,
  batchId: string,
  size = 10,
  ttlSeconds = 300,
): Promise<GrantedPlacement[]> {
  return query<GrantedPlacement>(
    db,
    `select * from ${FN}('${validatorId}', '${batchId}', ${size}, ${ttlSeconds}, '2026-09-30T00:00:00.000Z')`,
  );
}

async function tableCount(table: string): Promise<number> {
  const rows = await query<{ n: string }>(db, `select count(*) as n from ${table}`);
  return Number(rows[0]?.n ?? 0);
}

// ------------------------------------------------------------------------------------------------
// Parity: every storable single-response shape
// ------------------------------------------------------------------------------------------------

/**
 * The parity matrix, enumerated by hand rather than generated, so a reviewer can see that the
 * database CHECK constraints — not this file — decide which cells exist. Blanks are absent
 * from the matrix because they are unrepresentable: the not-blank CHECKs refuse them, and a
 * dedicated probe below proves it. The TypeScript side reads the same cell through
 * `isEntryComplete`, the in-force definition, never through a copy of the SQL.
 */
interface ParityCell {
  readonly evaluation: string;
  readonly corrected: string | null;
  readonly english: string | null;
  readonly filipino: string | null;
}

const PARITY_CELLS: readonly ParityCell[] = [
  // correct_natural: no correction allowed, translations optional.
  { evaluation: "correct_natural", corrected: null, english: null, filipino: null },
  { evaluation: "correct_natural", corrected: null, english: "Ride the jeep.", filipino: null },
  { evaluation: "correct_natural", corrected: null, english: null, filipino: "Sumakay ng jeep." },
  {
    evaluation: "correct_natural",
    corrected: null,
    english: "Ride the jeep.",
    filipino: "Sumakay ng jeep.",
  },
  // correct_unnatural: correction required, translations optional.
  {
    evaluation: "correct_unnatural",
    corrected: "Iti Baguio ti papanan.",
    english: null,
    filipino: null,
  },
  {
    evaluation: "correct_unnatural",
    corrected: "Iti Baguio ti papanan.",
    english: "Ride the jeep.",
    filipino: null,
  },
  {
    evaluation: "correct_unnatural",
    corrected: "Iti Baguio ti papanan.",
    english: null,
    filipino: "Sumakay ng jeep.",
  },
  {
    evaluation: "correct_unnatural",
    corrected: "Iti Baguio ti papanan.",
    english: "Ride the jeep.",
    filipino: "Sumakay ng jeep.",
  },
  // incorrect: correction required, translations optional.
  {
    evaluation: "incorrect",
    corrected: "Iti Baguio ti papanan.",
    english: null,
    filipino: null,
  },
  {
    evaluation: "incorrect",
    corrected: "Iti Baguio ti papanan.",
    english: "Ride the jeep.",
    filipino: null,
  },
  {
    evaluation: "incorrect",
    corrected: "Iti Baguio ti papanan.",
    english: null,
    filipino: "Sumakay ng jeep.",
  },
  {
    evaluation: "incorrect",
    corrected: "Iti Baguio ti papanan.",
    english: "Ride the jeep.",
    filipino: "Sumakay ng jeep.",
  },
  // cannot_evaluate: neither correction nor translations.
  { evaluation: "cannot_evaluate", corrected: null, english: null, filipino: null },
];

function shapeOf(cell: ParityCell): CoverageResponseShape {
  const shape: {
    evaluation: CoverageResponseShape["evaluation"];
    correctedInstruction?: string;
    englishTranslation?: string;
    filipinoTranslation?: string;
  } = { evaluation: cell.evaluation as CoverageResponseShape["evaluation"] };
  if (cell.corrected !== null) shape.correctedInstruction = cell.corrected;
  if (cell.english !== null) shape.englishTranslation = cell.english;
  if (cell.filipino !== null) shape.filipinoTranslation = cell.filipino;
  return shape;
}

describe("SQL↔TypeScript completion parity", () => {
  it("grants exactly the entries the TypeScript definition calls incomplete, over all 13 storable single-response shapes", async () => {
    // One entry and one validator per cell, so no cell's rows can leak into another's verdict:
    // the grant contains the cell's entry exactly when the definition calls it incomplete.
    let index = 0;
    for (const cell of PARITY_CELLS) {
      index += 1;
      const entryId = `PE_${index}`;
      const recorderId = `VAL_9000${String(index).padStart(4, "0")}`;
      const askerId = `VAL_8000${String(index).padStart(4, "0")}`;
      await seedEntries([{ id: entryId }]);
      await seedValidator(recorderId);
      await seedValidator(askerId);
      await recordResponse(recorderId, entryId, cell);

      // The asker never answered the entry, so the grant contains it exactly when the
      // definition calls it incomplete. (Allocating as the recorder would exclude every
      // cell through the answered rule and prove nothing about completion.)
      const granted = await allocate(askerId, `B_PAR_${index}`);
      const expected = !isEntryComplete([shapeOf(cell)]);

      expect(
        granted.some((row) => row.entry_id === entryId),
        `cell ${JSON.stringify(cell)}: SQL ${expected ? "should grant" : "should exclude"}`,
      ).toBe(expected);
    }
  });

  it("refuses the shapes neither classifier may ever see, naming the constraint", async () => {
    await seedEntries([{ id: "PX_1" }, { id: "PX_2" }, { id: "PX_3" }, { id: "PX_4" }]);
    await seedValidator("VAL_probe");
    await seedBatch("B_probe", "VAL_probe");

    // A correction on an evaluation that takes none.
    await expect(
      recordResponse("VAL_probe", "PX_1", {
        evaluation: "correct_natural",
        corrected: "Iti Baguio ti papanan.",
      }),
    ).rejects.toThrow(/correction_matches_evaluation/);
    // Translations on cannot_evaluate.
    await expect(
      recordResponse("VAL_probe", "PX_2", {
        evaluation: "cannot_evaluate",
        english: "Ride the jeep.",
      }),
    ).rejects.toThrow(/no_translation_when_unevaluable/);
    // A missing required correction.
    await expect(recordResponse("VAL_probe", "PX_3", { evaluation: "incorrect" })).rejects.toThrow(
      /correction_matches_evaluation/,
    );
    // An unknown evaluation value: unrepresentable, so the SQL value lists cannot silently
    // misclassify one — it never reaches either classifier.
    await expect(recordResponse("VAL_probe", "PX_4", { evaluation: "maybe" })).rejects.toThrow(
      /evaluation_known/,
    );
  });

  it("pools pillars across responses from different validators exactly as the definition does", async () => {
    // Judgment-only + English-only + Filipino-only: no single response completes, the three
    // together do — excluded.
    await seedEntries([{ id: "PM_A" }]);
    for (const [n, seed] of [
      { evaluation: "incorrect", corrected: "Iti Baguio ti papanan." },
      { evaluation: "correct_natural", english: "Ride the jeep." },
      { evaluation: "correct_natural", filipino: "Sumakay ng jeep." },
    ].entries()) {
      const validatorId = `VAL_910${n}`;
      await seedValidator(validatorId);
      await recordResponse(validatorId, "PM_A", seed);
    }
    await seedValidator("VAL_asker");
    const pooled = await allocate("VAL_asker", "B_PM_A");
    expect(pooled.some((row) => row.entry_id === "PM_A")).toBe(false);

    // Judgment + English but no Filipino anywhere: eligible.
    await seedEntries([{ id: "PM_B" }]);
    for (const [n, seed] of [
      { evaluation: "incorrect", corrected: "Iti Baguio ti papanan." },
      { evaluation: "correct_natural", english: "Ride the jeep." },
    ].entries()) {
      const validatorId = `VAL_920${n}`;
      await seedValidator(validatorId);
      await recordResponse(validatorId, "PM_B", seed);
    }
    const partial = await allocate("VAL_asker", "B_PM_B");
    expect(partial.some((row) => row.entry_id === "PM_B")).toBe(true);

    // Three cannot_evaluate rows: three rows, zero pillars — eligible.
    await seedEntries([{ id: "PM_C" }]);
    for (let n = 0; n < 3; n += 1) {
      const validatorId = `VAL_930${n}`;
      await seedValidator(validatorId);
      await recordResponse(validatorId, "PM_C", { evaluation: "cannot_evaluate" });
    }
    const abstained = await allocate("VAL_asker", "B_PM_C");
    expect(abstained.some((row) => row.entry_id === "PM_C")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Regression (§17 behaviors through the function)
// ------------------------------------------------------------------------------------------------

const SIX_CATEGORIES = [
  { id: "D_1", category: "destination_only" },
  { id: "DT_1", category: "destination_transit_mode" },
  { id: "OD_1", category: "origin_destination" },
  { id: "ODT_1", category: "origin_destination_transit_mode" },
  { id: "CPE_1", category: "complex_preference_expressions" },
  { id: "DTM_1", category: "double_transit_mode", transitModes: '{"jeepney","taxi"}' },
];

describe("allocation through the versioned function", () => {
  it("serves a fresh validator up to the requested size with contiguous 1-based positions", async () => {
    const ids = Array.from({ length: 12 }, (_, n) => `F_${n + 1}`);
    await seedEntries(ids.map((id) => ({ id })));
    await seedValidator("VAL_fresh");

    const granted = await allocate("VAL_fresh", "B_fresh", 10);

    expect(granted).toHaveLength(10);
    expect(granted.map((row) => row.entry_position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(granted.map((row) => row.entry_id)).size).toBe(10);
  });

  it("persists the batch row with the caller's identity and instant, and entries in granted order", async () => {
    await seedEntries([{ id: "G_1" }, { id: "G_2" }]);
    await seedValidator("VAL_owner");

    await allocate("VAL_owner", "B_owned", 10);

    const batches = await query<{ id: string; validator_id: string; created_at: string }>(
      db,
      `select id, validator_id, created_at from public.validation_batches`,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]?.validator_id).toBe("VAL_owner");
    const stored = await query<{ dataset_entry_id: string; position: number }>(
      db,
      `select dataset_entry_id, position from public.batch_entries where batch_id = 'B_owned' order by position`,
    );
    expect(stored.map((row) => row.position)).toEqual([1, 2]);
  });

  it("reserves the granted entries for the requesting attempt with a future expiry", async () => {
    await seedEntries([{ id: "H_1" }]);
    await seedValidator("VAL_holder");

    await allocate("VAL_holder", "B_hold", 10);

    const rows = await query<{ entry_id: string; validator_id: string; expires_at: string }>(
      db,
      `select entry_id, validator_id, expires_at from public.entry_reservations`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entry_id).toBe("H_1");
    expect(rows[0]?.validator_id).toBe("VAL_holder");
    expect(new Date(rows[0]?.expires_at ?? 0).getTime()).toBeGreaterThan(Date.now());
  });

  it("excludes an entry the validator already answered", async () => {
    await seedEntries([{ id: "A_1" }, { id: "A_2" }]);
    await seedValidator("VAL_answered");
    await recordResponse("VAL_answered", "A_1", { evaluation: "correct_natural" });

    const granted = await allocate("VAL_answered", "B_answered", 10);

    expect(granted.map((row) => row.entry_id)).toEqual(["A_2"]);
  });

  it("excludes an assigned-but-unanswered remainder of the attempt's own batch", async () => {
    await seedEntries([{ id: "R_1" }, { id: "R_2" }]);
    await seedValidator("VAL_mine");
    await seedBatch("B_old", "VAL_mine");
    await assignEntry("B_old", "R_1", 1);

    const granted = await allocate("VAL_mine", "B_new", 10);

    expect(granted.map((row) => row.entry_id)).toEqual(["R_2"]);
  });

  it("excludes nothing for another attempt's batch alone", async () => {
    await seedEntries([{ id: "O_1" }, { id: "O_2" }]);
    await seedValidator("VAL_other");
    await seedValidator("VAL_me");
    await seedBatch("B_other", "VAL_other");
    await assignEntry("B_other", "O_1", 1);

    const granted = await allocate("VAL_me", "B_me", 10);

    expect(granted.map((row) => row.entry_id).sort()).toEqual(["O_1", "O_2"]);
  });

  it("excludes an entry another attempt actively reserves, and re-admits it after expiry", async () => {
    await seedEntries([{ id: "X_1" }, { id: "X_2" }]);
    await seedValidator("VAL_rival");
    await seedValidator("VAL_waiter");
    await reserve("X_1", "VAL_rival", "2099-01-01T00:00:00.000Z");

    const blocked = await allocate("VAL_waiter", "B_blocked", 10);
    expect(blocked.map((row) => row.entry_id)).toEqual(["X_2"]);

    await applySql(
      db,
      `update public.entry_reservations set expires_at = '2000-01-01T00:00:00.000Z' where entry_id = 'X_1'`,
      "expire the lease",
    );
    const admitted = await allocate("VAL_waiter", "B_admitted", 10);
    // Only X_1 returns: X_2 was granted to this same attempt by the first call, so it is now
    // excluded as an assigned remainder — expiry and assignment compose rather than conflict.
    expect(admitted.map((row) => row.entry_id).sort()).toEqual(["X_1"]);
  });

  it("re-grants the caller's own unexpired reservation instead of treating it as contention", async () => {
    await seedEntries([{ id: "S_1" }]);
    await seedValidator("VAL_self");
    await reserve("S_1", "VAL_self", "2099-01-01T00:00:00.000Z");

    const granted = await allocate("VAL_self", "B_self", 10);

    expect(granted.map((row) => row.entry_id)).toEqual(["S_1"]);
  });

  it("serves a short batch when fewer eligible entries remain than requested", async () => {
    await seedEntries([{ id: "T_1" }, { id: "T_2" }, { id: "T_3" }]);
    await seedValidator("VAL_short");

    const granted = await allocate("VAL_short", "B_short", 10);

    expect(granted).toHaveLength(3);
    expect(granted.map((row) => row.entry_position)).toEqual([1, 2, 3]);
  });

  it("reports exhaustion with no batch row and no new reservations when nothing is eligible", async () => {
    await seedEntries([{ id: "Z_1" }]);
    await seedValidator("VAL_full");
    await recordResponse("VAL_full", "Z_1", {
      evaluation: "incorrect",
      corrected: "Iti Baguio ti papanan.",
      english: "Ride the jeep.",
      filipino: "Sumakay ng jeep.",
    });

    const granted = await allocate("VAL_full", "B_empty", 10);

    expect(granted).toEqual([]);
    // Only the seed batch the fixture's own responses were filed against exists: the
    // exhausted call persisted no batch row, no entry rows, and no reservations.
    const batches = await query<{ id: string }>(db, `select id from public.validation_batches`);
    expect(batches.map((row) => row.id)).toEqual(["B_VAL_full"]);
    expect(await tableCount("public.batch_entries")).toBe(0);
    expect(await tableCount("public.entry_reservations")).toBe(0);
  });

  it("draws from all six categories in one shared pool, including Double Transit Mode", async () => {
    await seedEntries(SIX_CATEGORIES);
    await seedValidator("VAL_pool");

    const granted = await allocate("VAL_pool", "B_pool", 10);

    expect(granted.map((row) => row.entry_id).sort()).toEqual(
      ["CPE_1", "D_1", "DTM_1", "DT_1", "ODT_1", "OD_1"].sort(),
    );
  });

  it("rolls everything back when the batch id collides, leaving the first grant intact", async () => {
    // Four eligible entries: the first call grants two, and the second call — same batch id —
    // grants the other two before the batch insert collides on the primary key. The whole
    // second call rolls back, so its reservations vanish with it.
    await seedEntries([{ id: "K_1" }, { id: "K_2" }, { id: "K_3" }, { id: "K_4" }]);
    await seedValidator("VAL_double");

    const first = await allocate("VAL_double", "B_same", 2);
    expect(first).toHaveLength(2);
    await expect(allocate("VAL_double", "B_same", 2)).rejects.toThrow();

    expect(await tableCount("public.validation_batches")).toBe(1);
    expect(await tableCount("public.batch_entries")).toBe(2);
    expect(await tableCount("public.entry_reservations")).toBe(2);
  });

  it("refuses a validator that does not exist, persisting nothing", async () => {
    await seedEntries([{ id: "N_1" }]);

    await expect(allocate("VAL_ghost", "B_ghost", 10)).rejects.toThrow();

    expect(await tableCount("public.validation_batches")).toBe(0);
    expect(await tableCount("public.entry_reservations")).toBe(0);
  });
});

describe("randomization across calls", () => {
  it("spreads grants across the pool with varying first positions", async () => {
    // Probabilistic by nature, and stated as such: with 30 eligible entries and 6 draws of
    // 10, a uniform random order covers nearly everything and rarely repeats the same
    // first entry. The bounds below (≈83% coverage, >1 distinct first) fail only on extreme
    // concentration — which is exactly the systematic-first defect this guards against
    // (always-lowest-ids would cover exactly 10 entries with one first position, every run).
    const ids = Array.from({ length: 30 }, (_, n) => `W_${n + 1}`);
    await seedEntries(ids.map((id) => ({ id })));

    const firsts: string[] = [];
    const covered = new Set<string>();
    for (let n = 0; n < 6; n += 1) {
      const validatorId = `VAL_dist${n}`;
      await seedValidator(validatorId);
      const granted = await allocate(validatorId, `B_dist${n}`, 10);
      expect(granted).toHaveLength(10);
      firsts.push(granted[0]?.entry_id ?? "");
      for (const row of granted) covered.add(row.entry_id);
      // Reservations would otherwise accumulate across iterations and starve the later ones:
      // expiry is time comparison, so backdate every lease and the next draw sees the pool
      // as unreserved again. Other validators' BATCHES exclude nothing by themselves.
      await applySql(
        db,
        `update public.entry_reservations set expires_at = now() - interval '1 second'`,
        "expire leases between draws",
      );
    }

    expect(covered.size).toBeGreaterThanOrEqual(25);
    expect(new Set(firsts).size).toBeGreaterThan(1);
  });
});

describe("simultaneous allocations", () => {
  it("grants disjoint sets with no deadlock and no shared entry", async () => {
    const ids = Array.from({ length: 10 }, (_, n) => `C_${n + 1}`);
    await seedEntries(ids.map((id) => ({ id })));
    await seedValidator("VAL_con_a");
    await seedValidator("VAL_con_b");

    const [grantedA, grantedB] = await Promise.all([
      allocate("VAL_con_a", "B_con_a", 10),
      allocate("VAL_con_b", "B_con_b", 10),
    ]);

    const idsA = grantedA.map((row) => row.entry_id);
    const idsB = grantedB.map((row) => row.entry_id);
    const overlap = idsA.filter((id) => idsB.includes(id));
    expect(overlap).toEqual([]);
    // Every eligible entry went to exactly one of the two attempts: nothing lost, nothing doubled.
    expect([...idsA, ...idsB].sort()).toEqual(ids.sort());
  });

  it("a second allocation for the same attempt excludes its own remainders", async () => {
    const ids = Array.from({ length: 12 }, (_, n) => `D_${n + 1}`);
    await seedEntries(ids.map((id) => ({ id })));
    await seedValidator("VAL_repeat");

    const first = await allocate("VAL_repeat", "B_one", 10);
    const second = await allocate("VAL_repeat", "B_two", 10);

    const firstIds = first.map((row) => row.entry_id);
    const secondIds = second.map((row) => row.entry_id);
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
    expect([...firstIds, ...secondIds].sort()).toEqual(ids.sort());
  });
});

describe("the function's privilege posture", () => {
  it("refuses EXECUTE to anon and authenticated, and serves service_role", async () => {
    await seedEntries([{ id: "P_1" }]);
    await seedValidator("VAL_priv");

    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(db, { role }, (tx) =>
          tx.query(`select * from ${FN}('VAL_priv', 'B_priv_${role}', 10, 300, now())`),
        ),
      ).rejects.toThrow(/permission denied/i);
    }

    const outcome = await asRole(db, { role: "service_role" }, (tx) =>
      tx.query<GrantedPlacement>(`select * from ${FN}('VAL_priv', 'B_priv_sr', 10, 300, now())`),
    );
    expect(outcome.rows.map((row) => row.entry_id)).toEqual(["P_1"]);
  });

  it("detects a grant that should not exist, then removes it again", async () => {
    // The permanent can-fire control: in this harness the grants never existed (no Supabase
    // defaults), so the end-state assertions above could pass while observing nothing. Grant,
    // observe true, revoke, observe false again — proving the privilege reads see reality.
    // Self-contained: grants live outside truncateAll's reach, so the cleanup is part of the
    // test rather than left to the next file.
    const target = "public.allocate_validation_batch_v1(text, text, integer, integer, timestamptz)";
    await applySql(db, `grant execute on function ${target} to anon`, "grant to anon");
    const held = await query<{ held: boolean }>(
      db,
      `select has_function_privilege('anon', '${target}', 'EXECUTE') as held`,
    );
    expect(held[0]?.held).toBe(true);
    await applySql(
      db,
      `revoke all on function ${target} from anon, authenticated`,
      "revoke from anon",
    );
    const cleared = await query<{ held: boolean }>(
      db,
      `select has_function_privilege('anon', '${target}', 'EXECUTE') as held`,
    );
    expect(cleared[0]?.held).toBe(false);
  });

  it("is SECURITY INVOKER with an empty search_path and the declared signature", async () => {
    const procs = await query<{
      secdef: boolean;
      proconfig: string[] | null;
      argnames: string[] | null;
    }>(
      db,
      `select p.prosecdef as secdef, p.proconfig as proconfig, p.proargnames as argnames
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'allocate_validation_batch_v1'`,
    );
    // `prosecdef` is true for SECURITY DEFINER; this function must NOT be one.
    expect(procs[0]?.secdef).toBe(false);
    // `SET search_path = ''` is stored verbatim as `search_path=""`: the exact element, not a
    // prefix, because a search_path of `"$user", public` would also contain the prefix.
    expect(procs[0]?.proconfig ?? []).toEqual(['search_path=""']);
    // IN and OUT names together: the OUT pair is what the repository reads, so a rename
    // on either side fails here rather than as a null column in production.
    expect(procs[0]?.argnames).toEqual([
      "p_validator_id",
      "p_batch_id",
      "p_batch_size",
      "p_ttl_seconds",
      "p_created_at",
      "entry_id",
      "entry_position",
    ]);

    // And the privilege itself, read from the catalogue rather than inferred from a call:
    // neither unprivileged role holds EXECUTE, service_role does.
    for (const role of ["anon", "authenticated"]) {
      const held = await query<{ held: boolean }>(
        db,
        `select has_function_privilege('${role}', 'public.allocate_validation_batch_v1(text, text, integer, integer, timestamptz)', 'EXECUTE') as held`,
      );
      expect(held[0]?.held, `${role} holds EXECUTE`).toBe(false);
    }
    const serviceHeld = await query<{ held: boolean }>(
      db,
      `select has_function_privilege('service_role', 'public.allocate_validation_batch_v1(text, text, integer, integer, timestamptz)', 'EXECUTE') as held`,
    );
    expect(serviceHeld[0]?.held).toBe(true);
  });
});

describe("the migration's own preconditions", () => {
  it("names the missing relations when applied to a database that cannot serve it", async () => {
    const bare = await createTestDatabase();
    try {
      await expect(applyMigrationByName(bare, MIGRATION)).rejects.toThrow(/dataset_entries/);
    } finally {
      await closeTestDatabase(bare);
    }
  });
});
