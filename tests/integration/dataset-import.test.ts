/**
 * Import verification: all 4,000 real records of the revised source, through the real migrations,
 * into a real PostgreSQL engine.
 *
 * The comparison reads `data/merged-ilocano-synthetic-data.json` itself, never another derived
 * artifact, so this cannot pass by checking the import against something the import produced.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  importDatasetEntries,
  type DatasetEntryWriteOutcome,
  type DatasetImportResult,
} from "@/lib/dataset/import-dataset";
import {
  parseSyntheticDataset,
  type ImportedDatasetEntry,
} from "@/lib/dataset/synthetic-source";
import { DATASET_CATEGORY_TABLE } from "@/lib/domain/categories";
import { applyMigrations } from "./support/migrations";
import {
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type TestDatabase,
} from "./support/pglite";

const SOURCE_PATH = path.resolve(process.cwd(), "data", "merged-ilocano-synthetic-data.json");

type SourceRecord = {
  id: string;
  instruction: string;
  output: { origin: string | null; destination: string | null; transit_mode: string | null };
};

type SourceBlock = {
  category_id: number;
  category_name: string;
  entries: SourceRecord[];
};

function readDocument(): { categories: SourceBlock[] } {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as { categories: SourceBlock[] };
}

function readSource(): unknown {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as unknown;
}

/**
 * The upsert used throughout this file.
 *
 * It mirrors the deployed `dataset_entries_import_v2`: the update list carries category,
 * provenance, and the mutable projection, while `instruction`, `source_payload`, and
 * `created_at` are excluded. A re-run must not be able to rewrite what a validator was shown,
 * and the only reliable way to guarantee that is for the write itself to exclude the column
 * rather than for a caller to remember.
 */
async function upsertWithParams(
  db: TestDatabase,
  entry: ImportedDatasetEntry,
): Promise<DatasetEntryWriteOutcome> {
  const existing = await query<{ id: string }>(
    db,
    "select id from public.dataset_entries where id = $1",
    [entry.id],
  );
  await db.query(
    `insert into public.dataset_entries
       (id, category, source_entry_id, category_name, instruction, origin, destination,
        transit_mode, source_payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     on conflict (id) do update set
       category = excluded.category,
       source_entry_id = excluded.source_entry_id,
       category_name = excluded.category_name,
       origin = excluded.origin,
       destination = excluded.destination,
       transit_mode = excluded.transit_mode`,
    [
      entry.id,
      entry.category,
      entry.sourceEntryId,
      entry.categoryName,
      entry.instruction,
      entry.origin,
      entry.destination,
      entry.transitMode,
      JSON.stringify(entry.sourcePayload),
    ] as never[],
  );
  return existing.length > 0 ? "updated" : "inserted";
}

describe("importing the merged synthetic dataset", () => {
  let db: TestDatabase;
  let document: { categories: SourceBlock[] };

  beforeAll(async () => {
    db = await createTestDatabase();
    await applyMigrations(db);
    document = readDocument();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  /**
   * An empty `dataset_entries`, then the full import, as a fresh state every test can rely on.
   *
   * Each test in this file used to run against whatever the previous one left behind, which made
   * the suite order-dependent: a test asserting "600 inserted" only passed because it happened to
   * be first, and `vitest` shuffling or a single-test run would have failed it. This resets the
   * table and imports in one step, so no test inherits another's rows and the counts each one
   * asserts are its own.
   */
  async function resetToEmpty(): Promise<void> {
    // `truncateAll`, not a bare `truncate public.dataset_entries`: `batch_entries` and
    // `validations` both hold foreign keys into that table, so truncating it alone is refused.
    await truncateAll(db);
  }

  async function importAll(): Promise<DatasetImportResult> {
    const { entries, report } = parseSyntheticDataset(readSource());
    return importDatasetEntries(
      entries,
      { upsert: (entry) => upsertWithParams(db, entry) },
      report,
    );
  }

  beforeEach(async () => {
    await resetToEmpty();
  });

  it("stores all 4000 records with the exact canonical id set", async () => {
    const result = await importAll();

    expect(result.parsed).toBe(4000);
    expect(result.inserted).toBe(4000);
    expect(result.updated).toBe(0);

    const stored = await query<{ id: string }>(db, "select id from public.dataset_entries");
    expect(stored).toHaveLength(4000);

    const expected = new Set<string>();
    document.categories.forEach((block) => {
      for (const record of block.entries) expected.add(record.id);
    });
    expect(new Set(stored.map((row) => row.id))).toEqual(expected);
  });

  it("stores 800 rows per category with local ids exactly 1..800", async () => {
    await importAll();

    const stored = await query<{ category: string; source_entry_id: number }>(
      db,
      "select category, source_entry_id from public.dataset_entries",
    );
    const byCategory = new Map<string, number[]>();
    for (const row of stored) {
      const locals = byCategory.get(row.category) ?? [];
      locals.push(row.source_entry_id);
      byCategory.set(row.category, locals);
    }

    expect([...byCategory.keys()].sort()).toEqual(
      DATASET_CATEGORY_TABLE.map((row) => row.slug).sort(),
    );
    for (const locals of byCategory.values()) {
      expect(locals.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 800 }, (_, index) => index + 1),
      );
    }
  });

  it("stores the exact intended transit-mode distribution", async () => {
    // The distribution is a research property of the source revision, not an accident of
    // random assignment: null-mode categories carry no mode at all, and each mode-bearing
    // category carries 200 of each of the four modes.
    await importAll();

    const stored = await query<{ category: string; transit_mode: string | null }>(
      db,
      "select category, transit_mode from public.dataset_entries",
    );
    const counts = new Map<string, Map<string, number>>();
    for (const row of stored) {
      const modes = counts.get(row.category) ?? new Map<string, number>();
      const key = row.transit_mode ?? "null";
      modes.set(key, (modes.get(key) ?? 0) + 1);
      counts.set(row.category, modes);
    }
    const expected: Record<string, Record<string, number>> = {
      destination_only: { null: 800 },
      destination_transit_mode: { walking: 200, jeepney: 200, taxi: 200, private_vehicle: 200 },
      origin_destination: { null: 800 },
      origin_destination_transit_mode: {
        walking: 200,
        jeepney: 200,
        taxi: 200,
        private_vehicle: 200,
      },
      complex_preference_expressions: {
        walking: 200,
        jeepney: 200,
        taxi: 200,
        private_vehicle: 200,
      },
    };
    for (const [category, modes] of Object.entries(expected)) {
      expect(Object.fromEntries(counts.get(category) ?? new Map()), category).toEqual(modes);
    }
  });

  it("stores every instruction exactly as the source has it", async () => {
    await importAll();

    const stored = await query<{ id: string; instruction: string }>(
      db,
      "select id, instruction from public.dataset_entries",
    );
    const byId = new Map(stored.map((row) => [row.id, row.instruction]));

    document.categories.forEach((block) => {
      for (const record of block.entries) {
        const id = record.id;
        expect(byId.get(id), `instruction for ${id}`).toBe(record.instruction);
      }
    });
  });

  it("stores origin, destination, and transit mode from the nested source output", async () => {
    await importAll();

    const stored = await query<{
      id: string;
      origin: string | null;
      destination: string | null;
      transit_mode: string | null;
    }>(db, "select id, origin, destination, transit_mode from public.dataset_entries");
    const byId = new Map(stored.map((row) => [row.id, row]));

    document.categories.forEach((block) => {
      for (const record of block.entries) {
        const row = byId.get(record.id);
        expect(row?.origin).toBe(record.output.origin);
        expect(row?.destination).toBe(record.output.destination);
        // Taken from the file, never defaulted: the source genuinely varies this column.
        expect(row?.transit_mode).toBe(record.output.transit_mode);
      }
    });
  });

  it("keeps the typed projection and the archival copy in agreement", async () => {
    // If these two ever diverge, one of them is wrong. Comparing them is the only way to notice.
    // This test imports for itself rather than reading whatever the previous test left.
    await importAll();

    const stored = await query<{
      id: string;
      origin: string | null;
      destination: string | null;
      transit_mode: string | null;
      source_payload: {
        output?: { origin?: unknown; destination?: unknown; transit_mode?: unknown };
      };
    }>(
      db,
      "select id, origin, destination, transit_mode, source_payload from public.dataset_entries",
    );

    expect(stored).toHaveLength(4000);
    for (const row of stored) {
      expect(row.origin).toBe(row.source_payload.output?.origin);
      expect(row.destination).toBe(row.source_payload.output?.destination);
      expect(row.transit_mode).toBe(row.source_payload.output?.transit_mode);
    }
  });

  it("freezes the archival copy on a re-run, so it cannot drift from the first import", async () => {
    // Injected into a re-run to prove the write-once rule: the payload column is absent from the
    // update list, so a second write carrying an extra field must leave the stored copy
    // untouched. (The parser's report, asserted in unit tests, is where such a field surfaces
    // instead.)
    const { entries } = parseSyntheticDataset(readSource());
    const target = {
      ...entries[0]!,
      sourcePayload: { ...entries[0]!.sourcePayload, difficulty: "hard" },
    };

    // Its own first import, so the "updated" outcome below is this test's doing rather than a
    // row some earlier test happened to leave behind.
    expect(await upsertWithParams(db, entries[0]!)).toBe("inserted");
    const outcome = await upsertWithParams(db, target);
    expect(outcome).toBe("updated");

    const stored = await query<{ source_payload: Record<string, unknown> }>(
      db,
      "select source_payload from public.dataset_entries where id = $1",
      [entries[0]!.id],
    );
    expect(stored[0]?.source_payload).toEqual(entries[0]!.sourcePayload);
    expect(stored[0]?.source_payload).not.toHaveProperty("difficulty");
  });

  it("is idempotent: a second import updates rather than duplicates", async () => {
    // Both halves run here rather than relying on an earlier test having done the first import.
    const first = await importAll();
    expect(first.inserted).toBe(4000);

    const second = await importAll();

    expect(second.parsed).toBe(4000);
    expect(second.updated).toBe(4000);
    expect(second.inserted).toBe(0);

    const count = await query<{ count: number }>(
      db,
      "select count(*)::int as count from public.dataset_entries",
    );
    expect(count[0]?.count).toBe(4000);
  });

  it("cannot rewrite a stored instruction on a re-run", async () => {
    // Imports first, because the assertion is about a row that already exists. Reading a
    // `stored` value from an empty table would have thrown rather than tested anything.
    await importAll();

    const firstId = "D_1";
    const stored = await query<{ instruction: string }>(
      db,
      "select instruction from public.dataset_entries where id = $1",
      [firstId],
    );
    const original = stored[0]!.instruction;

    // Re-import the same entry with a different instruction, simulating a later edit to the
    // source file. The upsert excludes the column, so the stored value must not move. `original`
    // is also asserted to be non-empty: if the import had stored an empty instruction, comparing
    // "unchanged" against "unchanged" would pass while proving nothing.
    const mutated: ImportedDatasetEntry = {
      ...parseSyntheticDataset(readSource()).entries[0]!,
      instruction: "A completely different sentence that was never shown to a validator.",
    };
    expect(original).not.toBe("");
    expect(mutated.instruction).not.toBe(original);
    await upsertWithParams(db, mutated);

    const after = await query<{ instruction: string }>(
      db,
      "select instruction from public.dataset_entries where id = $1",
      [firstId],
    );
    expect(after[0]?.instruction).toBe(original);
  });

  it("reports unmodelled fields through to the import result", async () => {
    const wrapped = {
      categories: document.categories.map((block) => ({
        ...block,
        entries: block.entries.map((record) => ({ ...record, difficulty: "hard" })),
      })),
    };
    const { report } = parseSyntheticDataset(wrapped);

    expect(report.preservedFields).toHaveLength(1);
    expect(report.preservedFields[0]?.fieldPath).toBe("difficulty");
    expect(report.preservedFields[0]?.recordCount).toBe(4000);
  });

  it("leaves the source dataset file unchanged", async () => {
    // The guard that matters most: importing must not write to the research source. The
    // immutability test in immutable-dataset.test.ts proves the committed bytes; this proves the
    // import path does not touch the file it read.
    const before = readFileSync(SOURCE_PATH);
    await importAll();
    expect(readFileSync(SOURCE_PATH).equals(before)).toBe(true);
  });
});
