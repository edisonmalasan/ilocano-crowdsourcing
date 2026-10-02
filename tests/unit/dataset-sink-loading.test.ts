/**
 * The sink MUST be loadable by a plain-Node process, and this file proves it by loading it.
 *
 * WHY A RUNTIME LOAD AND NOT A SOURCE READ
 * ---------------------------------------
 * The `server-only` package's entry point THROWS when it is evaluated outside a React Server
 * Component render. So `import "server-only"` in `src/lib/dataset/supabase-sink.ts` would not make
 * the operator command's import graph fail to COMPILE — it would make it fail at EVALUATION, the
 * first time the module is reached. A test that read the source and asserted the marker was absent
 * would pass, and the command would still crash on its first line of real work.
 *
 * That is why task 3.3 says to verify by loading the module, and why this file spawns Node and
 * watches what happens. The floor is the whole discipline: `tests/unit/supabase-clients.test.ts`
 * proves the marker IS load-bearing by watching `import "@/lib/supabase/admin"` reject, and
 * `repositories-supabase.test.ts` names the two modules in this graph that do carry the marker and
 * assert the sink's own directory does not.
 *
 * WHAT IT DOES AND DOES NOT PROVE
 * -------------------------------
 * It proves the sink's transitive graph evaluates in a plain Node process with no bundler, having
 * been given only the `@/*` alias mapping that `tsx` also provides. It does NOT prove the command
 * runs, does not run a query, and does not touch Supabase. Those are separate measurements —
 * `tests/integration/` for the SQL and the hosted gate probe for the wire.
 *
 * THE SPAWN SHAPE IS LOAD-BEARING
 * ------------------------------
 * `process.execPath` with an argv array and NO `shell`. On Windows, `shell: true` splits
 * `C:\Program Files\nodejs\node.exe` at the space and fails in a way that produces a DEFINED exit
 * status — which reads exactly like a test result. The same applies to a quoted filter passed
 * through `cmd /d /s /c`. `err.status === undefined` is what a spawn failure looks like; a defined
 * status means the process ran, whatever it returned.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd());
const REGISTER = path.join(ROOT, "tests", "fixtures", "register-alias.mjs");
const SINK = path.join(ROOT, "src", "lib", "dataset", "supabase-sink.ts");

interface LoadResult {
  /** `undefined` means the process never started. A defined status means it ran and answered. */
  status: number | undefined;
  stdout: string;
  stderr: string;
}

function loadInPlainNode(target: string): LoadResult {
  // The script imports the module and then USES it, because a module whose top level merely
  // re-exports could in principle be evaluated lazily. Constructing the sink proves the class body
  // was executed, not merely parsed.
  //
  // `pathToFileURL`, because `await import("C:\\…")` is read by Node as a bare specifier whose
  // scheme is `c:` — `ERR_UNSUPPORTED_ESM_URL_SCHEME`. The first version of this test passed a raw
  // Windows path and every assertion failed with a loader error that named neither the module under
  // test nor the alias, which is the shape of an instrument fault and not of a code fault.
  const script = `
    const mod = await import(${JSON.stringify(pathToFileURL(target).href)});
    if (typeof mod.SupabaseDatasetEntrySink !== "function") {
      throw new Error("SupabaseDatasetEntrySink is not exported as a function");
    }
    const sink = new mod.SupabaseDatasetEntrySink({
      rpc: async () => ({ data: "inserted", error: null }),
    });
    const outcome = await sink.upsert({
      id: "OD_0001",
      category: "origin_destination",
      instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
      origin: null,
      destination: null,
      transitMode: null,
      sourcePayload: { id: "OD_0001" },
    });
    process.stdout.write("LOADED:" + outcome);
  `;

  try {
    const stdout = execFileSync(
      process.execPath,
      [
        // `--no-warnings` so `stderr` is signal rather than noise. Two warnings arrive from Node
        // itself on this path -- `module.register()` is deprecated, and a `.ts` file in a package
        // with no `"type": "module"` is reparsed -- and neither is about the module under test.
        // Recorded rather than hidden: this harness does NOT prove `module.register()` is the right
        // API, only that it resolves the project's import style.
        "--no-warnings",
        "--import",
        // A file URL, not a Windows path. `--import` treats a bare `C:\...` as a specifier whose
        // scheme is `c:` and refuses it, which is the same class of fault as the `await import` case
        // above: an instrument failure whose message names neither the module nor the alias.
        pathToFileURL(REGISTER).href,
        "--input-type=module",
        "-e",
        script,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, PROBE_ALIAS_SRC: ROOT },
        timeout: 60_000,
      },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const failure = err as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/** The exact thing the `server-only` package throws, so a marker is distinguishable from a typo. */
const SERVER_ONLY_THROWN = /cannot be imported from a Client Component module|server-only/i;

describe("the sink's module graph is loadable in plain Node", () => {
  it("evaluates, exports the class, and completes a call with no bundler present", () => {
    const result = loadInPlainNode(SINK);

    // A DEFINED status is the first thing to check, because an undefined one means the process
    // never started and every assertion below would be reading an empty string — the empty-capture
    // failure this project has hit seven times.
    expect(result.status, "the child process must have RUN; undefined means it never started").toBe(
      0,
    );
    expect(result.stderr).not.toMatch(SERVER_ONLY_THROWN);
    expect(result.stdout).toContain("LOADED:inserted");
  });

  it("is not merely parsed: the class body ran and the import graph reached a fake client", () => {
    // Named separately from the exit-status test, and the reason is that `import()` of a module with
    // only a re-export can succeed without evaluating the interesting part. `LOADED:inserted` can
    // only be printed by an instance whose method called the fake and mapped the reply.
    const result = loadInPlainNode(SINK);
    expect(result.stdout.trim()).toBe("LOADED:inserted");
  });

  it("CONTROL: the same loader really does reject a module that carries `server-only`", () => {
    // THE FLOOR. Without it, the first two tests would pass equally well if the loader silently
    // swallowed every error, if the alias mapping did nothing, or if `server-only` had stopped
    // throwing outside a React Server Component render. Each of those turns "the sink loads" into a
    // statement about the harness.
    //
    // The target is `src/lib/repositories/supabase/rows.ts`, which `repositories-supabase.test.ts`
    // names as carrying the marker. A negative control added here would prove nothing about
    // suppression, so this uses the REAL marker-bearing module.
    const marked = path.join(ROOT, "src", "lib", "repositories", "supabase", "rows.ts");
    const result = loadInPlainNode(marked);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(SERVER_ONLY_THROWN);
  });
});
