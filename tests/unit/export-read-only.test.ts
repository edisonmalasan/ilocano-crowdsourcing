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
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * The sixteen filesystem-mutating APIs, the same list `import-dataset-command.test.ts` uses.
 *
 * Duplicated rather than imported on purpose: that file's list is scoped to prove the IMPORT writes
 * nothing, and this command is deliberately EXEMPT from it, because writing its artifacts is the
 * export's approved job. So the list is restated here and turned into an ALLOW-LIST — this command
 * may name `writeFile` and `mkdir` and nothing else. A count of two call sites is not a guard; a
 * closed set of API names is.
 */
const FILESYSTEM_APIS = [
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "createWriteStream",
  "open",
  "truncate",
  "truncateSync",
  "unlink",
  "unlinkSync",
  "rm",
  "rmSync",
  "rename",
  "renameSync",
  "cp",
  "copyFile",
  "copyFileSync",
  "chmod",
  "chown",
  "rmdir",
  "mkdir",
  "mkdirSync",
  "link",
  "symlink",
] as const;

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

  it("is unreachable from ANY module in the application, including every Server Action", () => {
    // SCOPE, and this is the correction an independent verification pass forced. The first version
    // walked `src/app` and `src/components` — 30 of this repository's 110 modules — and so covered
    // NONE of the six modules carrying `"use server"`. The requirement this discharges names Server
    // Actions explicitly, and a Server Action is a request path: `import { runExport } from
    // "@/lib/export/…"` dropped into `src/lib/validation/actions.ts` would have failed no test here.
    //
    // The walk is over ALL of `src/`, and the two counts below are the empty-capture guards that
    // make the scope visible: the module total, and the number of Server Actions the walk actually
    // reached. Without the second, a walk that somehow stopped descending would still pass.
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSyncSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(SRC);

    expect(files.length, "the scan must reach the whole application tree").toBeGreaterThan(50);
    expect(files.some((file) => file.endsWith(path.join("app", "page.tsx")))).toBe(true);

    const serverModules = files.filter((file) => SERVER_DIRECTIVE.test(readFileSync(file, "utf8")));
    // The assertion that would have caught the original scope bug: the walk must actually REACH the
    // Server Actions, or "no Server Action imports the export" is a claim about nothing.
    expect(
      serverModules.length,
      "the scan must reach the Server Actions it claims to exclude",
    ).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${relative(file)} must not import the export command`).not.toContain(
        "export-research",
      );
      expect(source, `${relative(file)} must not import the export module`).not.toContain(
        "@/lib/export/",
      );
    }
  });

  it("uses ONLY the two filesystem APIs it needs, checked by NAME not by call count", () => {
    // A COUNT is not a guard. The first version of this test counted `writeFile`/`mkdir` calls and
    // asserted the total, and a can-fire probe measured that nine realistic mutations of the command
    // left it GREEN: `appendFile`, `rm`, `unlink`, `rename`, `copyFile`, `createWriteStream`,
    // `truncate`, `open(…, "w")` and `writeFileSync`. A count of the two names it watches cannot see
    // any of them — and the sibling scan in `import-dataset-command.test.ts`, which lists all sixteen
    // of those APIs, EXEMPTS this command because writing files is the export's approved job. So for
    // this one file the two-name count was the only guard there was, and it was nine holes wide.
    //
    // What replaces it is an ALLOW-LIST over the same sixteen patterns: the set of filesystem APIs
    // the command names must be exactly {writeFile, mkdir}. `appendFile` would add a third name and
    // fail; `writeFileSync` would rename one and fail; a sixth `writeFile` for a fourth artifact
    // would still name an allowed API but is caught by the per-call name assertion below.
    const command = stripComments(
      readFileSync(path.join(ROOT, "scripts", "export-research.ts"), "utf8"),
    );

    // The Sync variants are listed SEPARATELY and matched EXACTLY, and that detail is the repair's
    // own lesson: the first version of this allow-list used a trailing `\w*`, and a `writeFileSync`
    // mutant came back GREEN — `writeFile\w*` matched `writeFileSync` as though it were `writeFile`,
    // so the renamed API was reported under its old name and the set never changed.
    const apisPresent = [
      ...new Set(FILESYSTEM_APIS.filter((api) => new RegExp(`\\b${api}\\s*\\(`).test(command))),
    ];
    expect(apisPresent.sort()).toEqual(["mkdir", "writeFile"]);
  });

  it("writes only the three declared artifact names, and nothing else", () => {
    // The per-call half. Every `writeFile` must name one of the three artifacts, so a fourth write
    // of a file nobody listed cannot hide behind an allowed API name.
    const command = stripComments(
      readFileSync(path.join(ROOT, "scripts", "export-research.ts"), "utf8"),
    );
    const writeCalls = [...command.matchAll(/\bwriteFile\w*\s*\(([\s\S]{0,200}?)\)/g)].map(
      (match) => match[1] ?? "",
    );

    expect(writeCalls.length).toBeGreaterThan(0);
    for (const call of writeCalls) {
      expect(call, `a writeFile call must name a declared artifact: ${call.slice(0, 80)}`).toMatch(
        /VALIDATIONS_JSON|VALIDATIONS_CSV|SUMMARY_JSON/,
      );
    }
    // The three names are read from the command's own constants rather than restated, so this
    // assertion cannot pass while the command's file names drift away from what ships.
    for (const name of ["validations.json", "validations.csv", "summary.json"]) {
      expect(command).toContain(name);
    }
  });
});

/** `readdirSync` with `withFileTypes`, isolated so the walks above stay readable. */
function readdirSyncSync(directory: string, options: { withFileTypes: true }): Dirent[] {
  return readdirSync(directory, options) as unknown as Dirent[];
}

/** The subset of `Dirent` this file uses. */
interface Dirent {
  name: string;
  isDirectory(): boolean;
}
