/**
 * The export command's decisions, with no credential, no database, and a temporary directory.
 *
 * `main` is driven with an injected environment and argv, exactly as `import-dataset`'s tests drive
 * its `main` — the side effects live in a function rather than at module top level precisely so this
 * is possible. The one thing NOT injected is the repository set, because the command builds it from a
 * real credential; that seam is covered by {@link collectExportSources} and {@link runExport} instead,
 * which take their sources as an argument.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// The command reaches the repository implementations, which carry `import "server-only"`. That
// package THROWS when its module body is evaluated outside a server bundle, and Vitest is one — the
// same reason every other suite here stubs it. The command itself runs with `--conditions=react-server`,
// which resolves the marker to the package's empty build.
vi.mock("server-only", () => ({}));

import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

import {
  EXIT_MISCONFIGURED,
  EXIT_OK,
  SUMMARY_JSON,
  VALIDATED_CSV,
  VALIDATED_JSON,
  VALIDATIONS_CSV,
  VALIDATIONS_JSON,
  collectExportSources,
  main,
  readExportEnvironment,
  renderDocuments,
  runExport,
  type ExportSources,
} from "../../scripts/export-research";

const AT = "2026-09-02T12:00:00.000Z";

const entry = (id: string): DatasetEntry => ({
  id,
  category: "origin_destination",
  sourceEntryId: 1,
  categoryName: "Origin + Destination",
  instruction: `instruction for ${id}`,
  origin: null,
  destination: null,
  transitMode: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  isActive: true,
});

const response = (id: string, validatorId: string, entryId: string): ValidationResponse => ({
  id,
  validatorId: validatorId as AnonymousValidatorId,
  datasetEntryId: entryId,
  batchId: "batch_01",
  evaluation: "correct_natural",
  englishTranslation: `English from ${validatorId}.`,
  filipinoTranslation: `Filipino from ${validatorId}.`,
  createdAt: AT,
  updatedAt: AT,
});

const profile = (id: string): ValidatorProfile => ({
  id: id as AnonymousValidatorId,
  ilocanoProficiency: "fluent",
  createdAt: AT,
  lastActiveAt: AT,
  totalValidations: 1,
});

const ENTRIES = [entry("E1"), entry("E2")];
const RESPONSES = [response("r01", "VAL_00000001", "E1"), response("r02", "VAL_00000002", "E1")];

const sources = (): ExportSources => ({
  entries: { listAllActive: async () => ENTRIES },
  validations: {
    listForEntries: async (ids) => RESPONSES.filter((r) => ids.includes(r.datasetEntryId)),
  },
  validators: { listByIds: async (ids) => ids.map(profile) },
});

const temporaryDirectories: string[] = [];
const tempDir = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "sadino-export-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value-not-a-real-credential",
};

describe("readExportEnvironment", () => {
  it("accepts both variables and reports the outcome, never the values", () => {
    const outcome = readExportEnvironment(ENV);
    expect(outcome.ok).toBe(true);
  });

  it("treats a blank value as missing, because a zero-length key reads as a network fault", () => {
    const outcome = readExportEnvironment({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: "   " });
    expect(outcome).toEqual({ ok: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  });

  it("names every missing variable at once rather than one per run", () => {
    const outcome = readExportEnvironment({});
    expect(outcome).toEqual({ ok: false, missing: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] });
  });
});

describe("collectExportSources", () => {
  it("reads entries, responses and profiles, and reports each read", async () => {
    const lines: string[] = [];
    const collected = await collectExportSources(sources(), (line) => lines.push(line));

    expect(collected.entries).toHaveLength(2);
    expect(collected.sources).toHaveLength(2);
    expect(collected.sources.every((item) => item.proficiency === "fluent")).toBe(true);
    expect(lines.join("\n")).toContain("read 2 active dataset entries");
    expect(lines.join("\n")).toContain("read 2 stored validation responses");
  });

  it("reports a response whose entry is not in the active set instead of dropping it silently", async () => {
    // A corpus whose responses do not all belong to a dataset entry is something a researcher must
    // be told about before trusting the artifact. Silence would make the record count wrong and
    // unexplainable.
    const lines: string[] = [];
    const withOrphan: ExportSources = {
      ...sources(),
      validations: {
        listForEntries: async () => [...RESPONSES, response("r03", "VAL_00000003", "E_missing")],
      },
      validators: { listByIds: async (ids) => ids.map(profile) },
    };

    const collected = await collectExportSources(withOrphan, (line) => lines.push(line));

    expect(collected.sources).toHaveLength(2);
    expect(lines.join("\n")).toContain("WARNING");
    expect(lines.join("\n")).toContain("E_missing");
  });

  it("reads no responses and no profiles when the dataset is empty", async () => {
    const empty: ExportSources = {
      entries: { listAllActive: async () => [] },
      validations: { listForEntries: async () => [] },
      validators: { listByIds: async () => [] },
    };

    const collected = await collectExportSources(empty, () => {});

    expect(collected.entries).toEqual([]);
    expect(collected.sources).toEqual([]);
  });
});

describe("renderDocuments", () => {
  it("produces five documents that describe the same records", async () => {
    const { entries, sources: rows } = await collectExportSources(sources(), () => {});
    const documents = renderDocuments(rows, entries);

    const grouped = JSON.parse(documents.validationsJson) as {
      categories: { category_id: number; responses: unknown[] }[];
    };
    // All six groups travel even when only one holds records; both fixture responses
    // belong to E1, in the origin_destination group.
    expect(grouped.categories.map((group) => group.category_id)).toEqual([1, 2, 3, 4, 5, 6]);
    const answered = grouped.categories.find((group) => group.category_id === 3);
    expect(answered?.responses).toHaveLength(2);
    expect(documents.validationsCsv.trimEnd().split("\n")).toHaveLength(3);
    expect(JSON.parse(documents.summaryJson)).toMatchObject({
      totals: { stored_responses: 2, qualifying_validations: 2 },
    });
    // Both fixture responses qualify, but both belong to E1 — E2 holds nothing and is
    // omitted rather than zero-filled. The command-level witness of the omission rule.
    const validated = JSON.parse(documents.validatedJson) as {
      categories: { records: unknown[] }[];
      derivation: { omitted_incomplete_entries: number };
    };
    expect(validated.categories.map((group) => group.records).flat()).toHaveLength(1);
    expect(validated.derivation.omitted_incomplete_entries).toBe(1);
    expect(documents.validatedCsv.trimEnd().split("\n")).toHaveLength(2);
    expect(documents.result).toEqual({ entries: 2, responses: 2, qualifying: 2, validated: 1 });
  });

  it("ends the JSON documents on a newline, so a diff shows a trailing change", () => {
    // An empty corpus is a real state — the hosted project has no validations yet — so the document
    // shapes must be right for it and not only for a populated one.
    const documents = renderDocuments([], ENTRIES);

    expect(documents.validationsJson.endsWith("\n")).toBe(true);
    expect(documents.summaryJson.endsWith("\n")).toBe(true);
    const empty = JSON.parse(documents.validationsJson) as {
      categories: { category_id: number; responses: unknown[] }[];
    };
    expect(empty.categories.map((group) => group.category_id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const group of empty.categories) expect(group.responses).toEqual([]);
    expect(documents.validatedJson.endsWith("\n")).toBe(true);
    expect(JSON.parse(documents.validatedJson)).toMatchObject({
      categories: [{}, {}, {}, {}, {}, {}],
      derivation: { omitted_incomplete_entries: 2 },
    });
  });
});

describe("runExport", () => {
  it("writes exactly the five named files into the operator's directory", async () => {
    const directory = join(tempDir(), "export");
    const lines: string[] = [];

    const code = await runExport({
      sources: sources(),
      destination: directory,
      write: (line) => lines.push(line),
    });

    expect(code).toBe(EXIT_OK);
    expect(readdirSync(directory).sort()).toEqual(
      [SUMMARY_JSON, VALIDATED_CSV, VALIDATED_JSON, VALIDATIONS_CSV, VALIDATIONS_JSON].sort(),
    );
    expect(JSON.parse(readFileSync(join(directory, SUMMARY_JSON), "utf8"))).toMatchObject({
      generated_from: { entries: 2, stored_responses: 2 },
    });
    expect(lines.join("\n")).toContain(directory);
  });

  it("creates a missing destination rather than requiring it to exist", async () => {
    const directory = join(tempDir(), "a", "b", "c");
    await runExport({ sources: sources(), destination: directory, write: () => {} });
    expect(readdirSync(directory).length).toBe(5);
  });

  it("refuses with the destination named when the write cannot happen", async () => {
    // The refusal carries the destination because an export that fails quietly is the worst outcome
    // available: the operator believes they hold a dataset and do not.
    //
    // The blocking object must actually EXIST. An earlier draft of this test passed a path whose
    // parent was never created, so `mkdir` simply made it and the write succeeded — the test then
    // reported that a refusal did not happen, which is a true statement about a fixture that never
    // tried to fail. A guard whose setup cannot fail is a guard that has not been tested.
    const blocker = join(tempDir(), "not-a-directory");
    writeFileSync(blocker, "this is a file, not a directory\n", "utf8");
    const impossible = join(blocker, "export");

    await expect(
      runExport({ sources: sources(), destination: impossible, write: () => {} }),
    ).rejects.toThrow(new RegExp(impossible.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("writes a summary that carries no coverage target", async () => {
    // There is no target to configure — not on the command line, not in the options, and not in
    // the artifact. A `coverage_target` anywhere in the written summary would invite a consumer to
    // check records against a constant.
    const directory = tempDir();
    await runExport({ sources: sources(), destination: directory, write: () => {} });

    const written = readFileSync(join(directory, SUMMARY_JSON), "utf8");
    expect(written).not.toContain("coverage_target");
  });
});

describe("main", () => {
  it("refuses a missing destination, and says how to supply one", async () => {
    await expect(main([], ENV)).rejects.toThrow(/No output directory given/);
  });

  it("refuses an unknown flag rather than ignoring it", async () => {
    await expect(main(["--bogus", "./out"], ENV)).rejects.toThrow(/unknown argument/);
  });

  it("accepts the `--` separator pnpm forwards, so the documented invocation works", async () => {
    // `pnpm run <script> -- <args>` passes the separator through as a literal argument. A gate probe
    // against the real hosted project caught that refusing it broke the exact command the error
    // message tells an operator to type.
    await expect(main(["--", "./out"], {})).rejects.toThrow(/Missing environment variable/);
  });

  it("names missing environment variables, never their values", async () => {
    // `main` either resolves to an exit code or rejects with a message. Asserting on the message
    // requires the rejection, so it is awaited explicitly rather than through `.catch`, whose union
    // return type made the compiler reject `.message` on the success branch.
    const thrown = await main(["--", "./out"], {}).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain("SUPABASE_URL");
    expect(thrown?.message).not.toContain("service-role-key-value-not-a-real-credential");
  });

  it("exposes a distinct exit code for a misconfigured run", () => {
    expect(EXIT_MISCONFIGURED).not.toBe(EXIT_OK);
  });

  it("declares no exit code it never returns", () => {
    // There is no refusal code here, deliberately. `import-dataset.ts` exports three because it
    // distinguishes a REFUSAL (the dataset would have changed the research record) from a
    // MISCONFIGURED run, and this command has no first case: every failure — a missing variable, a
    // bad argument, an unwritable destination — is a misconfiguration of how the operator invoked
    // it, and all of them exit 2. An earlier draft exported `EXIT_REFUSED` for symmetry with the
    // import, and grep found its only occurrence was its own declaration — the same "export with no
    // caller" shape AGENTS.md records removing `isTranslatableContent` for.
    expect(EXIT_MISCONFIGURED).toBe(2);
    expect(EXIT_OK).toBe(0);
  });
});
