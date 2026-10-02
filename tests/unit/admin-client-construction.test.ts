/**
 * Exactly ONE place in `src/` builds a Supabase client from a caller-supplied key.
 *
 * WHY THIS IS A WHOLE-PROJECT ENUMERATION RATHER THAN A CHECK ON ONE FILE
 * -----------------------------------------------------------------------
 * `tests/unit/supabase-clients.test.ts` proves that `@/lib/supabase/admin.ts` carries
 * `import "server-only"` and reads `SUPABASE_SERVICE_ROLE_KEY`. That is a claim about a file the
 * test names. This one is a claim about the whole tree, and it is the claim that matters: a
 * service-role client is a credential, and the property worth having is that there is exactly one
 * construction of one — not that a particular file is careful.
 *
 * The enumeration is re-derived from the directory on every run. That is deliberate, and it is the
 * opposite of the failure this project has already found twice: an assertion written against a
 * hard-coded list of call sites passes when a new one is added, because the list does not grow.
 *
 * ── THIS FILE WAS WRITTEN ONCE WITH THE WRONG PREMISE, AND THE REASON IS RECORDED ────────────────
 * The first draft classified a call site as privileged by looking for the string
 * `SUPABASE_SERVICE_ROLE_KEY` in its argument list, and separately asserted that exactly one module
 * under `src/` mentions that variable. BOTH expectations were false, and they were false because of
 * the design rather than because of a bug: `admin-client.ts` deliberately takes the key as an
 * ARGUMENT, so the variable does not appear at the construction site. Re-derived by enumeration
 * rather than by assumption, the real state is:
 *
 *   - exactly ONE `createClient(` call site in all of `src/`, in `lib/supabase/admin-client.ts`,
 *     with arguments `(url, key, { auth })`;
 *   - exactly TWO modules read `SUPABASE_SERVICE_ROLE_KEY` in CODE — `lib/env/server.ts`, which
 *     validates it, and `lib/supabase/admin.ts`, which passes it on. It appears in the *comments*
 *     of two further modules, which is why every scan here strips comments first: an unstripped
 *     count of "who mentions the credential" reads four and would blame a paragraph explaining why
 *     the credential is never held by the constructor.
 *
 * That is the same defect the archived ledger row records — `its labels no longer matched its own
 * text` — in a new place. A guard written from a premise the code does not hold does not merely fail
 * to guard: it reports the opposite of the truth while looking as though it is checking something.
 *
 * NO LINE NUMBER IS PINNED, DELIBERATELY
 * --------------------------------------
 * The obvious way to make the first test more specific is to assert `admin-client.ts:7`, and that
 * assertion is a liability rather than a strength: it is a claim about a line number, so it breaks
 * on every unrelated edit anywhere above it, and the breakage teaches its reader to update a guard
 * without reading it. The file name plus the argument text identifies the call site by hand.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * It proves properties of the SOURCE TEXT. It does not prove any call succeeds, that a credential
 * is valid, or that no code obtains the same power another way. `tests/unit/supabase-clients.test.ts`
 * proves the runtime `server-only` half, and the hosted gate probe measures the wire.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

/**
 * Source with block and line comments removed.
 *
 * Stripping is what makes the credential-reader count in this file mean anything. The variable's
 * name appears in four modules under `src/` and two of those mentions are PROSE — including this
 * file's own subject, `admin-client.ts`, whose header explains at length why it never receives a
 * credential by reading one. An unstripped enumeration would therefore report four readers and
 * would name two modules whose only offence is explaining the rule.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every `.ts`/`.tsx` file under `src/`, recursively, in a stable order. */
function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      found.push(full);
    }
  }
  return found;
}

interface CallSite {
  /** Repository-relative, so a failure names a path a reader can open. */
  file: string;
  line: number;
  /** The call's full argument list, so a failure can be read rather than guessed at. */
  args: string;
}

/**
 * Every call to `name(...)` in the source, with its line and its complete argument list.
 *
 * The argument list is walked to the MATCHING close paren, not the first one. A scan that stopped at
 * the first `)` would see only the url argument, and `SUPABASE_ANON_KEY` in the third position of
 * `createServerClient` would be invisible — so every claim below about which key a client is given
 * would be satisfied by the empty string.
 *
 * The lookbehind is what stops `createClient(` from matching inside `createBrowserClient(`.
 */
function findCalls(source: string, name: string): CallSite[] {
  const calls: CallSite[] = [];
  const pattern = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "g");

  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === "(") depth += 1;
      else if (source[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push({
      file: "",
      line: source.slice(0, match.index).split("\n").length,
      args: source.slice(open, end + 1),
    });
  }

  return calls;
}

const files = walk(SRC);
const code = new Map(files.map((file) => [file, stripComments(readFileSync(file, "utf8"))]));
const relative = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

const collect = (name: string): CallSite[] =>
  files.flatMap((file) =>
    findCalls(code.get(file)!, name).map((call) => ({ ...call, file: relative(file) })),
  );

const createClientCalls = collect("createClient");
const siblingClientCalls = [...collect("createBrowserClient"), ...collect("createServerClient")];

/** Modules whose CODE — comments removed — reads the service-role variable. */
const serviceRoleReaders = files
  .filter((file) => code.get(file)!.includes("SUPABASE_SERVICE_ROLE_KEY"))
  .map(relative)
  .sort();

describe("the service-role credential has exactly one construction site", () => {
  it("finds the call sites at all, so an enumeration that matched nothing cannot pass", () => {
    // THE EMPTY-CAPTURE GUARD. Every other assertion here is about a set the walk produced; a walk
    // that resolved no files, or a regex that matched nothing, would leave the length assertions
    // satisfied by the empty set — and a reader would see a green suite describing a boundary that
    // does not exist. This is the assertion that makes the others mean something.
    expect(files.length).toBeGreaterThan(0);
    expect(createClientCalls.length).toBeGreaterThan(0);
    expect(createClientCalls.map((call) => call.file)).toContain("lib/supabase/admin-client.ts");
  });

  it("builds exactly one client from a caller-supplied key, and names the file it is in", () => {
    // `createClient` is the function this project calls with an explicit credential; the browser and
    // server clients are DIFFERENT functions with different names, and they are the `anon` path.
    // One `createClient` call site in the whole tree is therefore the statement that there is one
    // place a privileged client can come into existence.
    expect(
      createClientCalls.map((call) => call.file),
      "a second createClient call site means a second path to the credential",
    ).toEqual(["lib/supabase/admin-client.ts"]);
  });

  it("takes that key as a PARAMETER rather than reading it, which is what keeps the module loadable", () => {
    // `@/lib/env/server` carries `import "server-only"`, whose package entry point THROWS outside a
    // React Server Component render. An argument-taking constructor is the only shape the plain-Node
    // operator command can reach, so "the credential arrives by argument" is a FUNCTIONAL property
    // here rather than a stylistic one.
    //
    // TWO ASSERTIONS, NOT ONE, AND THE REASON THE SECOND EXISTS IS A MEASURED PROBE DEFECT.
    // The first checks the `createClient(` call's argument list. The second checks the EXPORTED
    // SIGNATURE, because those are different claims: renaming the parameter while rebinding a local
    // named `key` leaves the call's arguments byte-identical while changing the signature. A probe
    // tried exactly that and the first assertion passed — the mutation had preserved the thing it
    // claimed to change. So the signature is asserted directly rather than inferred from the call.
    const site = createClientCalls[0]!;
    expect(site.args).toContain("url");
    expect(site.args).toContain("key");
    expect(site.args).not.toContain("SUPABASE_ANON_KEY");
    expect(site.args).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    // `code`, not raw source: the signature is code, and the comment-stripped map is the one this
    // file reads everywhere else, so a comment quoting the signature cannot satisfy it.
    const source = code.get(path.join(SRC, "lib/supabase/admin-client.ts"))!;
    expect(source).toContain("export function createSupabaseAdminClient(url: string, key: string)");
    // Two parameters and no more, so a third — an options object carrying the credential — is a
    // change rather than an addition nobody notices.
    const signature = /export function createSupabaseAdminClient\(([^)]*)\)/.exec(source)![1]!;
    expect(signature.split(",").map((part) => part.trim())).toEqual(["url: string", "key: string"]);
  });

  it("closes the path from the variable to the client: two modules read it, and neither constructs anything", () => {
    // `lib/env/server.ts` VALIDATES the credential and `lib/supabase/admin.ts` passes it on. The
    // third module in the chain — the one that builds the client — must not appear here, because it
    // is handed a value rather than obtaining one.
    //
    // This is the assertion that catches the split being undone FROM EITHER DIRECTION. If
    // `admin-client.ts` started importing `@/lib/env/server` to read the key itself, the count would
    // rise to three and this test would name it; and if a fourth module gained the reading without
    // being wired up, this test would fail before the wiring could be.
    expect(serviceRoleReaders).toEqual(["lib/env/server.ts", "lib/supabase/admin.ts"]);

    // And neither reader constructs a client, or the count above would not be the whole story.
    for (const reader of serviceRoleReaders) {
      expect(
        createClientCalls.map((call) => call.file),
        `${reader} must not also construct a client`,
      ).not.toContain(reader);
    }
  });

  it("keeps the browser and server clients on the ANON key, and never on the service role", () => {
    // Asserted in BOTH directions, and with the floor that makes the first direction mean something:
    // `anon` is not a service role, so a client built from `SUPABASE_ANON_KEY` must not be confused
    // with one built from `SUPABASE_SERVICE_ROLE_KEY`, and a handoff of the latter to either module
    // has to fail here rather than pass unnoticed.
    expect(
      siblingClientCalls.filter((call) => call.args.includes("SUPABASE_SERVICE_ROLE_KEY")),
      "a browser or server client must never be handed the service-role key",
    ).toEqual([]);

    expect(siblingClientCalls.length).toBeGreaterThan(0);
    expect(siblingClientCalls.map((call) => call.file).sort()).toEqual([
      "lib/supabase/browser.ts",
      "lib/supabase/server.ts",
    ]);

    // Each really does receive the anon key, so the assertion above is about arguments that carry a
    // key rather than about arguments that merely fail to mention one. `ANON_KEY` is the substring
    // both spellings share: `SUPABASE_ANON_KEY` server-side, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the
    // browser bundle.
    for (const call of siblingClientCalls) {
      expect(call.args, `${call.file} should be given the anon key`).toContain("ANON_KEY");
    }
  });
});
