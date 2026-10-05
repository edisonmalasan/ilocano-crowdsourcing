/**
 * The production sink against a recording fake.
 *
 * WHAT THIS FILE IS AND IS NOT
 * ----------------------------
 * It proves the sink's own logic: which function it names, what shape the argument has, how it maps
 * the three possible answers, and how a failure reaches the caller. It proves NOTHING about the
 * migration — that is `tests/integration/dataset-entries-import.test.ts`, which runs this same sink
 * over a real PostgreSQL engine. Both halves are needed, and the split is deliberate: a fake cannot
 * see a wrong SQL statement, and an engine cannot see which key the TypeScript side sent.
 *
 * The fake RECORDS rather than computes, so an assertion is about what the sink did rather than what
 * a stand-in then agreed with. A fake that derived an answer would let a wrong argument shape pass
 * whenever the fake and the sink made the SAME mistake — which is the defect a record-only fake
 * cannot have.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { DatasetEntrySink } from "@/lib/dataset/import-dataset";
import type { ImportedDatasetEntry } from "@/lib/dataset/synthetic-source";
import {
  DATASET_ENTRIES_IMPORT_FUNCTION,
  SupabaseDatasetEntrySink,
} from "@/lib/dataset/supabase-sink";
import type { SupabaseRpcResultLike } from "@/lib/repositories/supabase/rpc";

/**
 * Source with block and line comments removed.
 *
 * This file's headers explain at length WHY the sink holds no credential, and the variable name
 * `process.env` appears nowhere else in it — but the assertions below must be about the module's
 * CODE. An unstripped scan would be satisfied by a paragraph explaining the rule, which is the
 * `Object.keys({ en: 1, fil: 1 })` shape: a check that can be satisfied by the artefact it is
 * describing.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ENTRY: ImportedDatasetEntry = {
  id: "OD_1",
  category: "origin_destination",
  sourceEntryId: 1,
  categoryName: "Origin + Destination",
  instruction:
    "Iti Baguio Athletic Bowl ti ayanko ita; masapulko a makadanon iti Baguio Convention Center.",
  origin: "Baguio Athletic Bowl",
  destination: "Baguio Convention Center",
  transitMode: null,
  sourcePayload: { id: "OD_1", instruction: "Iti Baguio Athletic Bowl ti ayanko ita." },
};

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

type Reply = SupabaseRpcResultLike | (() => Promise<SupabaseRpcResultLike>);

/** A fake that records every call and replies with whatever the test hands it. */
function recordingClient(reply: Reply) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      rpc(fn: string, args: Record<string, unknown>): Promise<SupabaseRpcResultLike> {
        calls.push({ fn, args });
        return typeof reply === "function" ? reply() : Promise.resolve(reply);
      },
    },
  };
}

const inserted: SupabaseRpcResultLike = { data: "inserted", error: null };
const updated: SupabaseRpcResultLike = { data: "updated", error: null };

/** The failure a call produced, as an Error plus its two diagnostic fields. */
async function failureOf(run: Promise<unknown>): Promise<{
  message: string;
  operation: string | undefined;
  cause: unknown;
}> {
  const thrown = await run.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  if (!(thrown instanceof Error)) {
    throw new Error(`expected a rejection, but the call resolved with ${JSON.stringify(thrown)}`);
  }
  return {
    message: thrown.message,
    operation: (thrown as { operation?: string }).operation,
    cause: (thrown as { cause?: unknown }).cause,
  };
}

describe("SupabaseDatasetEntrySink", () => {
  it("is a DatasetEntrySink, which is what lets the importer accept it", () => {
    // The annotation is the type-layer half; the assignment is the runtime half, and both are here
    // because the failure being guarded is a missing `implements` clause, which compiles fine and
    // only surfaces when something is wired to it.
    const sink: DatasetEntrySink = new SupabaseDatasetEntrySink(recordingClient(inserted).client);
    expect(typeof sink.upsert).toBe("function");
  });

  it("names the function the migration creates", async () => {
    const { calls, client } = recordingClient(inserted);
    await new SupabaseDatasetEntrySink(client).upsert(ENTRY);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe(DATASET_ENTRIES_IMPORT_FUNCTION);
    // Spelled out here as well as in the constant, because the constant and this literal are the
    // two places the name is written in TypeScript, and the integration test checks a THIRD against
    // the migration file. A test asserting the constant equals itself would pass if both were wrong;
    // this one is checked against `pg_proc` in `tests/integration/`.
    expect(DATASET_ENTRIES_IMPORT_FUNCTION).toBe("dataset_entries_import_v2");
  });

  it("maps `inserted` and `updated` onto the importer's own vocabulary", async () => {
    const first = recordingClient(inserted);
    const second = recordingClient(updated);

    expect(await new SupabaseDatasetEntrySink(first.client).upsert(ENTRY)).toBe("inserted");
    expect(await new SupabaseDatasetEntrySink(second.client).upsert(ENTRY)).toBe("updated");
  });

  it("sends every column the function declares, under the parameter names the migration declares", async () => {
    // The argument NAMES are the contract with PostgREST: it matches a named object to the
    // function's parameters by NAME, so an argument sent under a name the function does not declare
    // is ignored rather than rejected. A fake cannot catch that — it would accept any key — which is
    // why the integration test drives all 600 records through a real engine and compares the stored
    // row to what was sent. This pins the shape; that one pins the meaning.
    const { calls, client } = recordingClient(inserted);
    await new SupabaseDatasetEntrySink(client).upsert(ENTRY);

    expect(calls[0]!.args).toEqual({
      p_id: ENTRY.id,
      p_category: ENTRY.category,
      p_source_entry_id: ENTRY.sourceEntryId,
      p_category_name: ENTRY.categoryName,
      p_instruction: ENTRY.instruction,
      p_origin: ENTRY.origin,
      p_destination: ENTRY.destination,
      p_transit_mode: ENTRY.transitMode,
      p_source_payload: ENTRY.sourcePayload,
      p_is_active: true,
    });
  });

  it("carries the source-local id and category name, so provenance survives the RPC", async () => {
    // The whole point of v2: a row whose provenance was dropped at the sink would store NULLs
    // that no later read could recover. Asserted on values rather than shape — the shape test
    // above would pass with `p_source_entry_id: undefined`, and PostgREST would store the NULL.
    const { calls, client } = recordingClient(inserted);
    await new SupabaseDatasetEntrySink(client).upsert(ENTRY);

    expect(calls[0]!.args.p_source_entry_id).toBe(1);
    expect(calls[0]!.args.p_category_name).toBe("Origin + Destination");
  });

  it("sends a real JSON value for the payload rather than a stringified one", async () => {
    // `p_source_payload` is `jsonb`. Sending a JSON *string* would store a jsonb string rather than
    // an object, and no assertion reading the stored row's `instruction` would catch it: the
    // payload would simply be a quoted blob, and the archival copy would stop being usable as one.
    const { calls, client } = recordingClient(inserted);
    await new SupabaseDatasetEntrySink(client).upsert(ENTRY);

    const payload = calls[0]!.args.p_source_payload;
    expect(payload).toBeTypeOf("object");
    expect(payload).not.toBeTypeOf("string");
    expect(payload).toEqual(ENTRY.sourcePayload);
  });

  it("refuses an unrecognised return value rather than guessing which outcome it was", async () => {
    // The reason the switch has a throwing default. A `?? "updated"` would report a confidently
    // wrong count for a function that is not the one this file was written against, and a wrong
    // report about how many rows were created is the one failure an operator has no reason to
    // look for.
    for (const returned of [null, "INSERTED", "upserted", 0, { outcome: "inserted" }]) {
      const { client } = recordingClient({ data: returned, error: null });

      const thrown = await failureOf(new SupabaseDatasetEntrySink(client).upsert(ENTRY));
      expect(thrown.message).toMatch(/neither "inserted" nor "updated"/);
    }
  });

  it("names the entry in that refusal, so a 3000-entry run says which one", async () => {
    const { client } = recordingClient({ data: "???", error: null });

    const thrown = await failureOf(new SupabaseDatasetEntrySink(client).upsert(ENTRY));
    expect(thrown.message).toContain("OD_1");
  });

  it("maps a PostgREST error envelope onto RepositoryError rather than reading its data", async () => {
    // Two failure shapes exist and the seam keeps them distinguishable: `{ data, error }` came BACK
    // from the server, while a rejection means it never answered at all. Both become a
    // `RepositoryError`, and both keep the original on `cause`.
    const { client } = recordingClient({
      data: null,
      error: { code: "42883", message: "function public.nope(text) does not exist" },
    });

    const thrown = await failureOf(new SupabaseDatasetEntrySink(client).upsert(ENTRY));
    expect(thrown.operation).toBe("dataset_entries.import");
    expect(thrown.message).toContain("42883");
    expect(thrown.cause).toMatchObject({ code: "42883" });
  });

  it("wraps a REJECTED call as a RepositoryError too, naming the call rather than the transport", async () => {
    const { client } = recordingClient(() => Promise.reject(new TypeError("fetch failed")));

    const thrown = await failureOf(new SupabaseDatasetEntrySink(client).upsert(ENTRY));
    expect(thrown.operation).toBe("dataset_entries.import");
    expect(thrown.message).toContain("before PostgREST returned a response");
    // And the entry, so a 600-entry run identifies which call never got an answer.
    expect(thrown.message).toContain("OD_1");
  });

  it("carries the database's own refusal name through, and adds no instruction text", async () => {
    // The sink does NOT catch the named refusal and turn it into a return value. `design.md` D4
    // requires a re-run that diverges to stop loudly, and the loudest signal available is the
    // database's own exception reaching the operator's terminal through a non-zero exit.
    const DATABASE_MESSAGE =
      "dataset_entries_instruction_diverged: the stored instruction for entry OD_1 differs";
    const { client } = recordingClient({
      data: null,
      error: { code: "P0001", message: DATABASE_MESSAGE },
    });

    const thrown = await failureOf(new SupabaseDatasetEntrySink(client).upsert(ENTRY));
    expect(thrown.message).toContain("dataset_entries_instruction_diverged");
    // This is the half worth asserting: the migration refuses to put Ilocano research text in the
    // DATABASE's message, so nothing downstream may add it either. `detail` holds the rendered
    // PostgREST message, which is why the entry id is safe and the instruction is not.
    expect(thrown.message).not.toContain(ENTRY.instruction);
  });

  it("never constructs a Supabase client and never reads the environment", () => {
    // Asserted against the module's CODE rather than by watching a constructor, because a sink that
    // built its own client would have to read the environment — and `server-only`, the marker that
    // keeps the env module off a browser bundle, is exactly what this module cannot carry.
    //
    // THE `process.env` ASSERTION CLOSES A GAP THE IMPORT ASSERTION LEAVES OPEN, and it was added
    // because a probe found it. Adding `import { getServerEnv } from "@/lib/env/server"` to this
    // file did turn the suite red — but as a COLLECTION failure, the `server-only` package throwing
    // while the module was being loaded — which is stronger evidence of the underlying fact and
    // weaker attribution for this assertion. A direct `process.env.SUPABASE_SERVICE_ROLE_KEY` read
    // would have produced no import at all and so no failure of any kind: the marker is only ever
    // pulled in transitively, so the import assertion alone cannot see a module that skips the env
    // module and reads the process environment itself.
    const source = stripComments(
      readFileSync(
        fileURLToPath(new URL("../../src/lib/dataset/supabase-sink.ts", import.meta.url)),
        "utf8",
      ),
    );
    // From `import` to the FIRST `;`, spanning lines. The previous pattern —
    // `/^\s*import\s[\s\S]*?;?$/gm` — was lazy with a line-anchored end, so it stopped at the end
    // of the FIRST line: a multi-line `import {\n … \n} from "…"` was captured as `import {`, and
    // the specifier it actually imports was never examined. That is not hypothetical: this
    // module's own `rpc` import spans five lines. `[^;]*` cannot stop early because a statement
    // ends at its semicolon, and an import specifier cannot contain one.
    const imports = source.match(/^\s*import\b[^;]*;/gm)?.join("\n") ?? "";

    expect(imports).not.toContain("@supabase/supabase-js");
    expect(imports).not.toContain("@/lib/env/server");
    // Direct access to the process environment, whatever it is called.
    expect(source).not.toMatch(/\bprocess\s*\.\s*env\b/);
    expect(source).not.toMatch(/\bimport\s*\(\s*["']node:process/);
  });
});
