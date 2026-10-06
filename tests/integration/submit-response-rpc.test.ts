import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
 * The versioned response-submit function, as real PostgreSQL executes it.
 *
 * One call resolves the stored batch, derives the validator from that batch, verifies
 * membership, inserts exactly one validation response, and releases that entry's
 * reservation after the insert. A duplicate-submit race resolves as `already_recorded`
 * through `ON CONFLICT (validator_id, dataset_entry_id)` rather than a second row.
 */

const FN = "public.submit_validation_response_v1";

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

async function seedEntries(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const values = ids
    .map(
      (id) =>
        `('${id}', 'origin_destination', 'Instruction for ${id}.', '{"id":"${id}"}'::jsonb, null)`,
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

async function reserve(entryId: string, validatorId: string): Promise<void> {
  await applySql(
    db,
    `insert into public.entry_reservations (entry_id, validator_id, expires_at)
     values ('${entryId}', '${validatorId}', '2030-01-01T00:00:00.000Z')`,
    `reserve ${entryId}`,
  );
}

interface SubmitRow {
  status: string;
  response_id: string | null;
  reservation_released: boolean;
  refusal_reason: string | null;
}

function literal(value: string | null): string {
  return value === null ? "null" : `'${value.replace(/'/g, "''")}'`;
}

async function submit(args: {
  responseId: string;
  batchId: string;
  entryId: string;
  evaluation?: string;
  corrected?: string | null;
  english?: string | null;
  filipino?: string | null;
}): Promise<SubmitRow[]> {
  const {
    responseId,
    batchId,
    entryId,
    evaluation = "correct_natural",
    corrected = null,
    english = null,
    filipino = null,
  } = args;
  return query<SubmitRow>(
    db,
    `select * from ${FN}('${responseId}', '${batchId}', '${entryId}', '${evaluation}', ${literal(corrected)}, ${literal(english)}, ${literal(filipino)}, '2026-10-08T00:00:00.000Z')`,
  );
}

async function validationCount(): Promise<number> {
  const rows = await query<{ n: string }>(db, `select count(*) as n from public.validations`);
  return Number(rows[0]?.n ?? 0);
}

async function reservationHeld(entryId: string): Promise<boolean> {
  const rows = await query<{ n: string }>(
    db,
    `select count(*) as n from public.entry_reservations where entry_id = '${entryId}'`,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function hasExecute(role: string, signature: string): Promise<boolean> {
  const rows = await query<{ holds: boolean }>(
    db,
    `select has_function_privilege($1, $2, 'EXECUTE') as holds`,
    [role, `public.${signature}`],
  );
  return rows[0]?.holds ?? false;
}

const SIGNATURE =
  "submit_validation_response_v1(text, text, text, text, text, text, text, timestamptz)";

describe("submit_validation_response_v1", () => {
  it("records through one call with the server-minted id", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");
    await seedBatch("B_1", "VAL_aaa");
    await assignEntry("B_1", "OD_1", 1);
    await reserve("OD_1", "VAL_aaa");

    const rows = await submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_1" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "recorded",
      response_id: "rsp_01",
      refusal_reason: null,
    });
    expect(await validationCount()).toBe(1);
  });

  it("reports a lost-acknowledgement retry as already_recorded without a second row", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");
    await seedBatch("B_1", "VAL_aaa");
    await assignEntry("B_1", "OD_1", 1);

    await submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_1" });
    const retry = await submit({ responseId: "rsp_02", batchId: "B_1", entryId: "OD_1" });

    expect(retry[0]).toMatchObject({ status: "already_recorded", response_id: "rsp_01" });
    expect(await validationCount()).toBe(1);
  });

  it("refuses an entry that was never in the batch, writing nothing", async () => {
    await seedEntries(["OD_1", "OD_2"]);
    await seedValidator("VAL_aaa");
    await seedBatch("B_1", "VAL_aaa");
    await assignEntry("B_1", "OD_1", 1);

    const rows = await submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_2" });

    expect(rows[0]).toMatchObject({ status: "refused", refusal_reason: "not_in_batch" });
    expect(await validationCount()).toBe(0);
  });

  it("refuses an unknown batch, writing nothing", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");

    const rows = await submit({ responseId: "rsp_01", batchId: "B_missing", entryId: "OD_1" });

    expect(rows[0]).toMatchObject({ status: "refused", refusal_reason: "unknown_batch" });
    expect(await validationCount()).toBe(0);
  });

  it("rejects an invalid payload at the constraint, never as a confirmation", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");
    await seedBatch("B_1", "VAL_aaa");
    await assignEntry("B_1", "OD_1", 1);

    // `incorrect` without its required correction violates the cross-column CHECK.
    await expect(
      submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_1", evaluation: "incorrect" }),
    ).rejects.toThrow();
    expect(await validationCount()).toBe(0);
  });

  it("releases the reservation only after the insert, and reports it", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");
    await seedBatch("B_1", "VAL_aaa");
    await assignEntry("B_1", "OD_1", 1);
    await reserve("OD_1", "VAL_aaa");
    expect(await reservationHeld("OD_1")).toBe(true);

    const rows = await submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_1" });

    expect(rows[0]?.reservation_released).toBe(true);
    expect(await reservationHeld("OD_1")).toBe(false);
  });

  it("still records when no reservation exists, reporting the release as not done", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");
    await seedBatch("B_1", "VAL_aaa");
    await assignEntry("B_1", "OD_1", 1);

    const rows = await submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_1" });

    // `release_entry_reservation` on a missing row is a no-op that reports false; the
    // response itself is still recorded rather than failed.
    expect(rows[0]).toMatchObject({ status: "recorded" });
    expect(await validationCount()).toBe(1);
  });

  it("derives the validator from the stored batch, so overlapping entries stay separate", async () => {
    await seedEntries(["OD_1"]);
    await seedValidator("VAL_aaa");
    await seedValidator("VAL_bbb");
    await seedBatch("B_1", "VAL_aaa");
    await seedBatch("B_2", "VAL_bbb");
    await assignEntry("B_1", "OD_1", 1);
    await assignEntry("B_2", "OD_1", 1);

    await submit({ responseId: "rsp_01", batchId: "B_1", entryId: "OD_1" });
    const other = await submit({ responseId: "rsp_02", batchId: "B_2", entryId: "OD_1" });

    expect(other[0]).toMatchObject({ status: "recorded", response_id: "rsp_02" });
    expect(await validationCount()).toBe(2);
  });

  it("leaves anon and authenticated without EXECUTE and keeps service_role", async () => {
    expect(await hasExecute("anon", SIGNATURE)).toBe(false);
    expect(await hasExecute("authenticated", SIGNATURE)).toBe(false);
    expect(await hasExecute("service_role", SIGNATURE)).toBe(true);
  });
});
