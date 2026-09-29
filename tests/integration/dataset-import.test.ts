/**
 * Import verification: all 600 real records, through the real migrations, into a real PostgreSQL
 * engine.
 *
 * The comparison reads `data/ilocano-synthetic-data.json` itself, never another derived artifact,
 * so this cannot pass by checking the import against something the import produced.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  importDatasetEntries,
  type DatasetEntryWriteOutcome,
} from "@/lib/dataset/import-dataset";
import { parseSyntheticDataset, type ImportedDatasetEntry } from "@/lib/dataset/synthetic-source";
import { applyMigrations } from "./support/migrations";
import {
  closeTestDatabase,
  createTestDatabase,
  query,
  type TestDatabase,
} from "./support/pglite";

const SOURCE_PATH = path.resolve(process.cwd(), "data", "ilocano-synthetic-data.json");

type SourceRecord = {
  id: string;
  instruction: string;
  output: { origin: string; destination: string; transit_mode: string | null };
};

function readSource(): SourceRecord[] {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as SourceRecord[];
}

/**
 * The upsert used throughout this file.
 *
 * It deliberately omits `instruction` from the update list. That is the whole point: a re-run must
 * not be able to rewrite what a validator was shown, and the only reliable way to guarantee that
 * is for the write itself to exclude the column rather than for a caller to remember.
 */
async function upsertWithParams(
  db: TestDatabase,
  entry: ImportedDatasetEntry,
): Promise<DatasetEntryWriteOutcome> {
  const existing = await query<{ id: string }>(db, "select id from public.dataset_entries where id = $1", [
    entry.id,
  ]);
  await db.query(
    `insert into public.dataset_entries
       (id, category, instruction, origin, destination, transit_mode, source_payload)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (id) do update set
       category = excluded.category,
       origin = excluded.origin,
       destination = excluded.destination,
       transit_mode = excluded.transit_mode,
       source_payload = excluded.source_payload`,
    [
      entry.id,
      entry.category,
      entry.instruction,
      entry.origin,
      entry.destination,
      entry.transitMode,
      JSON.stringify(entry.sourcePayload),
    ] as never[],
  );
  return existing.length > 0 ? "updated" : "inserted";
}

describe("importing the synthetic dataset", () => {
  let db: TestDatabase;
  let source: SourceRecord[];

  beforeAll(async () => {
    db = await createTestDatabase();
    await applyMigrations(db);
    source = readSource();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  it("stores all 600 records with the exact source id set", async () => {
    const { entries, report } = parseSyntheticDataset(readSource());
    const result = await importDatasetEntries(entries, {
      upsert: (entry) => upsertWithParams(db, entry),
    }, report);

    expect(result.parsed).toBe(600);
    expect(result.inserted).toBe(600);
    expect(result.updated).toBe(0);

    const stored = await query<{ id: string }>(db, "select id from public.dataset_entries");
    expect(stored).toHaveLength(600);
    expect(new Set(stored.map((row) => row.id))).toEqual(new Set(source.map((record) => record.id)));
  });

  it("stores every instruction exactly as the source has it", async () => {
    const { entries } = parseSyntheticDataset(readSource());
    await importDatasetEntries(entries, { upsert: (entry) => upsertWithParams(db, entry) });

    const stored = await query<{ id: string; instruction: string }>(
      db,
      "select id, instruction from public.dataset_entries",
    );
    const byId = new Map(stored.map((row) => [row.id, row.instruction]));

    for (const record of source) {
      expect(byId.get(record.id), `instruction for ${record.id}`).toBe(record.instruction);
    }
  });

  it("stores origin and destination from the nested source output", async () => {
    const { entries } = parseSyntheticDataset(readSource());
    await importDatasetEntries(entries, { upsert: (entry) => upsertWithParams(db, entry) });

    const stored = await query<{ id: string; origin: string; destination: string; transit_mode: string | null }>(
      db,
      "select id, origin, destination, transit_mode from public.dataset_entries",
    );
    const byId = new Map(stored.map((row) => [row.id, row]));

    for (const record of source) {
      const row = byId.get(record.id);
      expect(row?.origin).toBe(record.output.origin);
      expect(row?.destination).toBe(record.output.destination);
      expect(row?.transit_mode).toBeNull();
    }
  });

  it("keeps the typed projection and the archival copy in agreement", async () => {
    // If these two ever diverge, one of them is wrong. Comparing them is the only way to notice.
    const stored = await query<{
      id: string;
      origin: string | null;
      destination: string | null;
      transit_mode: string | null;
      source_payload: { output?: { origin?: unknown; destination?: unknown; transit_mode?: unknown } };
    }>(db, "select id, origin, destination, transit_mode, source_payload from public.dataset_entries");

    expect(stored).toHaveLength(600);
    for (const row of stored) {
      expect(row.origin).toBe(row.source_payload.output?.origin);
      expect(row.destination).toBe(row.source_payload.output?.destination);
      expect(row.transit_mode).toBe(row.source_payload.output?.transit_mode);
    }
  });

  it("preserves the source record verbatim, so an unmodelled field would survive", async () => {
    // Injected into a real row to prove the round trip, because the current 600-record dataset
    // has no unmodelled field to test with.
    const withExtra = { ...source[0], difficulty: "hard" };
    const { entries, report } = parseSyntheticDataset([withExtra]);

    expect(report.preservedFields).toEqual([
      { fieldPath: "difficulty", recordCount: 1, sampleValue: "hard" },
    ]);

    const outcome = await upsertWithParams(db, entries[0]!);
    expect(outcome).toBe("updated");

    const stored = await query<{ source_payload: Record<string, unknown> }>(
      db,
      "select source_payload from public.dataset_entries where id = $1",
      [source[0]!.id],
    );
    expect(stored[0]?.source_payload).toEqual(withExtra);
  });

  it("is idempotent: a second import updates rather than duplicates", async () => {
    const { entries, report } = parseSyntheticDataset(readSource());
    const second = await importDatasetEntries(entries, { upsert: (entry) => upsertWithParams(db, entry) }, report);

    expect(second.parsed).toBe(600);
    expect(second.updated).toBe(600);
    expect(second.inserted).toBe(0);

    const count = await query<{ count: number }>(db, "select count(*)::int as count from public.dataset_entries");
    expect(count[0]?.count).toBe(600);
  });

  it("cannot rewrite a stored instruction on a re-run", async () => {
    const stored = await query<{ instruction: string }>(
      db,
      "select instruction from public.dataset_entries where id = $1",
      [source[0]!.id],
    );
    const original = stored[0]!.instruction;

    // Re-import the same entry with a different instruction, simulating a later edit to the
    // source file. The upsert excludes the column, so the stored value must not move.
    const mutated: ImportedDatasetEntry = {
      ...parseSyntheticDataset(readSource()).entries[0]!,
      instruction: "A completely different sentence that was never shown to a validator.",
    };
    await upsertWithParams(db, mutated);

    const after = await query<{ instruction: string }>(
      db,
      "select instruction from public.dataset_entries where id = $1",
      [source[0]!.id],
    );
    expect(after[0]?.instruction).toBe(original);
  });

  it("reports unmodelled fields through to the import result", async () => {
    const { entries, report } = parseSyntheticDataset([
      { ...source[0]!, difficulty: "hard" },
      { ...source[1]!, difficulty: "easy" },
    ]);
    const result = await importDatasetEntries(entries, { upsert: (entry) => upsertWithParams(db, entry) }, report);

    expect(result.report.preservedFields).toHaveLength(1);
    expect(result.report.preservedFields[0]?.fieldPath).toBe("difficulty");
    expect(result.report.preservedFields[0]?.recordCount).toBe(2);
  });

  it("leaves the source dataset file unchanged", async () => {
    // The guard that matters most: importing must not write to the research source. The
    // immutability test in immutable-dataset.test.ts proves the committed bytes; this proves the
    // import path does not touch the file it read.
    const before = readFileSync(SOURCE_PATH);
    const { entries } = parseSyntheticDataset(readSource());
    await importDatasetEntries(entries, { upsert: (entry) => upsertWithParams(db, entry) });
    expect(readFileSync(SOURCE_PATH).equals(before)).toBe(true);
  });
});
