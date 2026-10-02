/**
 * The export performs no research-data write, and no request path can trigger it.
 *
 * Same technique as `dashboard-read-only.test.ts`, applied to a different surface, and for the same
 * reason: a claim that the export only reads is worth little unless something fails when it stops
 * doing so. The scan walks the command and the export module and looks for repository write calls
 * and for a `"use server"` directive.
 *
 * The can-fire controls are REAL PRODUCTION WRITERS — the same ones the dashboard scan uses — because
 * a pattern list with no real writer behind it is a list nobody has tested, which is exactly how
 * `.create(` reached the dashboard scan as an untested pattern in the first place.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const SCOPED = [
  path.join(ROOT, "scripts", "export-research.ts"),
  path.join(SRC, "lib", "export", "records.ts"),
  path.join(SRC, "lib", "export", "csv.ts"),
];

/** Real production modules that really write, one per forbidden method. */
const KNOWN_WRITERS = [
  { file: path.join(SRC, "lib", "validation", "validation-actions-core.ts"), method: "insert" },
  { file: path.join(SRC, "lib", "validators", "enrollment.ts"), method: "create" },
  { file: path.join(SRC, "lib", "allocation", "allocate-batch.ts"), method: "create" },
  { file: path.join(SRC, "lib", "admin", "signin-core.ts"), method: "recordAttempt" },
  { file: path.join(SRC, "lib", "admin", "signin-core.ts"), method: "clear" },
] as const;

const KNOWN_SERVER_ACTION = path.join(SRC, "lib", "validation", "actions.ts");

/**
 * The same shape-tolerant pattern list the dashboard scan uses, for the same reason: the tighter
 * version was measured escaping optional chaining and a line break before the argument list, and
 * `.create(` was missing entirely.
 */
const WRITE_CALLS = [
  /\.insert\s*\??\./,
  /\.insert\s*\(/,
  /\.update\s*\??\./,
  /\.update\s*\(/,
  /\.upsert\s*\??\./,
  /\.upsert\s*\(/,
  /\.delete\s*\??\./,
  /\.delete\s*\(/,
  /\.rpc\s*\??\./,
  /\.rpc\s*\(/,
  /\.create\s*\??\./,
  /\.create\s*\(/,
  /\.touchLastActive\s*\??\./,
  /\.touchLastActive\s*\(/,
  /\.clear\s*\??\./,
  /\.clear\s*\(/,
  /\.recordAttempt\s*\??\./,
  /\.recordAttempt\s*\(/,
];

const SERVER_DIRECTIVE = /^\s*(?:"use server"|'use server')/m;

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const writeCallsFound = (source: string): string[] =>
  WRITE_CALLS.filter((pattern) => pattern.test(stripComments(source))).map(String);

const relative = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");

describe("the export performs no writes", () => {
  it("PROVES THE SCAN CAN FIRE: every forbidden method is found in a real production writer", () => {
    for (const writer of KNOWN_WRITERS) {
      expect(existsSync(writer.file), `${relative(writer.file)} must exist`).toBe(true);
      expect(
        writeCallsFound(readFileSync(writer.file, "utf8")).some((pattern) =>
          pattern.includes(writer.method),
        ),
        `${relative(writer.file)} must be detected as calling .${writer.method}(`,
      ).toBe(true);
    }
    expect(SERVER_DIRECTIVE.test(readFileSync(KNOWN_SERVER_ACTION, "utf8"))).toBe(true);
  });

  it("finds no repository write call in the command or the export module", () => {
    expect(SCOPED.length).toBeGreaterThan(0);
    expect(SCOPED.every(existsSync), "every scanned file must exist").toBe(true);

    for (const file of SCOPED) {
      expect(
        writeCallsFound(readFileSync(file, "utf8")),
        `${relative(file)} must not perform a write`,
      ).toEqual([]);
    }
  });

  it("defines no Server Action, so there is no second mechanism for a write", () => {
    for (const file of SCOPED) {
      expect(SERVER_DIRECTIVE.test(readFileSync(file, "utf8")), `${relative(file)}`).toBe(false);
    }
  });

  it("is unreachable from any route, page, or Server Action in the application", () => {
    // Enumerated from the application tree rather than asserted as a list, so a new route cannot
    // quietly gain an import of the command.
    const applicationRoots = [path.join(SRC, "app"), path.join(SRC, "components")];
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSyncSafe(directory)) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    for (const root of applicationRoots) walk(root);

    expect(files.length, "the application tree must not be empty").toBeGreaterThan(10);
    expect(files.some((file) => file.includes(`${path.sep}app${path.sep}page.tsx`))).toBe(true);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${relative(file)} must not import the export`).not.toContain(
        "export-research",
      );
      expect(source, `${relative(file)} must not import the export module`).not.toContain(
        "@/lib/export/",
      );
    }
  });

  it("writes only its own output files, by name", () => {
    const command = readFileSync(path.join(ROOT, "scripts", "export-research.ts"), "utf8");
    const code = stripComments(command);
    const fsWrites = [...code.matchAll(/\b(writeFile|mkdir)\s*\(/g)].map((m) => m[1] as string);

    // Exactly three document writes and one directory creation, and nothing else that touches the
    // filesystem. A fourth would be an artifact nobody listed.
    expect(fsWrites.sort()).toEqual(["mkdir", "writeFile", "writeFile", "writeFile"]);
    for (const name of ["validations.json", "validations.csv", "summary.json"]) {
      expect(command).toContain(name);
    }
  });
});

/** `readdirSync` with `withFileTypes`, isolated so the walk above stays readable. */
function readdirSyncSafe(directory: string): { name: string; isDirectory(): boolean }[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(directory, { withFileTypes: true });
}
