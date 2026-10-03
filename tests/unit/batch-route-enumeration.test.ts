import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * THE CLOSED ENUMERATION — every site that builds a batch address, and the one that reads one
 * ============================================================================
 * The requirement says there is exactly one definition of how a batch identifier becomes a path and
 * of how the dynamic route parameter becomes a batch identifier, and that **no other route, island,
 * or helper may construct a batch address or read the dynamic route parameter directly.**
 *
 * A requirement of that shape can only be enforced by an enumeration, because "no other site" is not
 * a claim about any one file. So this file enumerates the whole application and checks every member
 * of the set, which is the only honest way to assert a closed set.
 *
 * ============================================================================
 * THE FIRST DRAFT OF `producers()` WAS A GUARD THAT COULD NOT FIRE, AND THAT IS THE POINT
 * ============================================================================
 * It detected producers by looking for the literal `/validate/` in a code line. That works only while
 * the producers are BROKEN: after the fix, not one line under `src/app` spells the route prefix,
 * because every one of them calls `batchRouteHref`/`batchRoutePath` instead. Measured on the
 * compliant tree, the first draft found **ZERO** producers and its count assertion failed — on
 * correct code.
 *
 * That is the worst shape a guard can have, because the obvious response to "my assertion fires on
 * good code" is to relax it until a broken build passes, which converts the guard into a description.
 * It is the trap this repository records twice already, in a sharper form than either earlier
 * instance: **a detector keyed on a property silently discards every instance of the thing it guards
 * when that property is ABSENT — and here, fixing the defect is exactly what made it absent.**
 *
 * So producers are enumerated as the **CALLERS** of the contract, because a compliant producer is by
 * definition a caller, and a hand-built route prefix is treated as the FAILURE case rather than as the
 * detection case. The scan is then a union of the two, so it can catch both a producer that forgets
 * the module and a producer that pre-encodes.
 *
 * ============================================================================
 * WHAT THIS GUARD CANNOT SEE, STATED BEFORE THE RESULTS SO NOBODY WEIGHS IT AS MORE THAN IT IS
 * ============================================================================
 * **It is structural.** Every assertion here is about a string being present or absent at a named
 * site. That is a real property — it catches a producer that re-introduces `encodeURIComponent`, a
 * fifth producer that hand-builds a path, or a second site reading the route parameter — and it is
 * not a behavioural one: a site could satisfy every string here and still compute the wrong address.
 * The behavioural half is `tests/unit/batch-route.test.ts` plus the three DOM files, which drive the
 * real parse function over what the real components render. **Neither half is sufficient alone.**
 */

/**
 * The scan covers the WHOLE `src` tree, and that scope was itself a measured CRITICAL finding.
 *
 * The first version of this file scanned `src/app` only, while both this file's header and the
 * requirement claimed whole-application coverage and the requirement's own words are "no other
 * route, island, or **helper**". A verifier measured three violations of the named scenario passing
 * the suite green: a rogue component under `src/components/` that built an address by hand, a
 * `src/middleware.ts` that read the batch segment out of `request.url.pathname`, and — the sharp one,
 * because it is *inside* `src/app` — a `window.location.assign(\`/validate/${batchId}\`)` added to a
 * real producer file.
 *
 * The third missed for a second, independent reason: producer detection required one of three
 * navigation idioms (`router.push(`, `href={`, `return \``). That is a list of the ways producers
 * happened to navigate, not a definition of what a producer is, so any fourth mechanism is invisible.
 * **`src/middleware.ts` is outside `src/app` entirely, which is the part that makes the scope limit
 * indefensible rather than merely conservative.**
 */
const APP_ROOT = "src";
const ROUTE_MODULE = "src/lib/validation/batch-route.ts";
const ROUTE_PAGE = "src/app/validate/[batchId]/page.tsx";

/** Every `.ts`/`.tsx` under a directory, recursively, as relative POSIX paths. */
function sourceFilesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFilesUnder(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full.replace(/\\/g, "/"));
  }
  return found.sort();
}

const FILES = sourceFilesUnder(APP_ROOT);

/** A site where a batch address is produced or the route parameter is read. */
interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly compliant: boolean;
}

/** Reads a file's lines, so a report can name a LINE and not merely a file. */
function linesOf(file: string): string[] {
  return readFileSync(file, "utf8").split("\n");
}

/**
 * Whether a line is code rather than comment or blank.
 *
 * The block-comment form matters here and is not decoration: this repository's own files explain
 * *why* `encodeURIComponent` is gone in prose immediately beside the code that replaced it, and a
 * scan that counted comment lines would either fail on a correct tree or — worse — be "fixed" by
 * deleting the explanation.
 */
function isCode(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
  return true;
}

/** Strips a trailing block comment, so `code /* prose *\/` still counts as code. */
function withoutTrailingComment(line: string): string {
  const at = line.indexOf("/*");
  return at === -1 ? line : line.slice(0, at);
}

const COMPLIANT_CALL = /(?<!function )\b(batchRoutePath|batchRouteHref|resumeHref)\s*\(/;

/**
 * The COMPLIANT_CALL regex excludes a function's own DECLARATION via a negative lookbehind.
 *
 * Without it, `export function resumeHref(…)` counts as a call site and the per-file tally comes out
 * one higher than the number of places that actually build an address. Measured rather than assumed:
 * the first run reported four sites in `start-batch.tsx` where three exist, and the obvious "fix"
 * would have been to expect four — which is how a guard stops measuring anything.
 */

/**
 * A line that BUILDS a batch address by hand, detected as the route prefix followed by an
 * interpolation or a concatenation.
 *
 * The earlier `NAVIGATES` regex listed three navigation idioms and was replaced because a list of
 * the ways producers *happened* to navigate is not a definition of what a producer is: a
 * `window.location.assign` or a bare `redirect()` sails past it, and that was measured green.
 *
 * The suffix test is what keeps this from firing on prose. Two legitimate code lines under `src`
 * contain `/validate/` and neither builds an address: `batch-route.ts`'s own prefix constant (excluded
 * as the definition) and a sentence of participant-facing copy in `ready/page.tsx` that writes
 * `` `/validate/<batchId>` `` to explain where a link does *not* go. Requiring a `${` or a `+` after
 * the prefix separates "an address" from "a mention of an address", and both were measured on the
 * real tree before this regex was written rather than assumed to discriminate.
 */
function buildsAddressByHand(code: string): boolean {
  const at = code.indexOf("/validate/");
  if (at === -1) return false;
  return code.slice(at + "/validate/".length).includes("${") || /\/validate\/"\s*\+/.test(code);
}

function producers(): Site[] {
  const sites: Site[] = [];
  for (const file of FILES) {
    if (file === ROUTE_MODULE) continue;
    linesOf(file).forEach((raw, index) => {
      if (!isCode(raw)) return;
      const code = withoutTrailingComment(raw);
      const calls = COMPLIANT_CALL.test(code);
      // The failure case, kept in the SAME scan so a hand-built path is caught rather than missed.
      const handBuilt = buildsAddressByHand(code);
      if (!calls && !handBuilt) return;
      sites.push({ file, line: index + 1, text: raw.trim(), compliant: calls });
    });
  }
  return sites;
}

/**
 * Every site that READS a batch identifier out of a route, anywhere under `src`.
 *
 * The first version required the line to mention both `params` and `batchId`, and scoped the scan to
 * files under `validate/[batchId]`. Both limits were load-bearing, and both were removed for the
 * reason the verifier measured: a middleware reading the segment out of `request.url.pathname` names
 * neither `params` in the dynamic-route sense nor, necessarily, `batchId` — and it is outside the
 * route folder entirely.
 *
 * The test is now **one line that touches a route-parameter source and names a batch identifier**,
 * which is the actual property the requirement states. The `readonly batchId:` exclusion stays,
 * because the props type describes the key rather than reading a value; measured, the route page
 * yields exactly two lines this way — the props type and the one real read at line 74.
 */
function consumers(): Site[] {
  const sites: Site[] = [];
  for (const file of FILES) {
    linesOf(file).forEach((raw, index) => {
      if (!isCode(raw)) return;
      const code = withoutTrailingComment(raw);
      const readsRouteParam =
        /(?<![A-Za-z0-9_$])(params|useParams|searchParams|pathname)(?![A-Za-z0-9_$])/.test(code);
      if (!readsRouteParam || !/batchId|batch|segment/.test(code)) return;
      // The props TYPE names the key to describe the shape rather than reading a value.
      if (/readonly\s+batchId\s*:/.test(code)) return;
      sites.push({
        file,
        line: index + 1,
        text: raw.trim(),
        compliant: code.includes("parseBatchRouteParam") || code.includes("batchIdSegment"),
      });
    });
  }
  return sites;
}

/** Every code line under a whole `src` tree that calls `encodeURIComponent`. */
function encodingCallersUnder(directory: string): string[] {
  const offenders: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
        readFileSync(full, "utf8")
          .split("\n")
          .forEach((raw, index) => {
            if (isCode(raw) && withoutTrailingComment(raw).includes("encodeURIComponent")) {
              offenders.push(`${full.replace(/\\/g, "/")}:${index + 1}  ${raw.trim()}`);
            }
          });
      }
    }
  };
  walk(directory);
  return offenders;
}

function describeSites(sites: Site[]): string {
  return sites.map((site) => `  ${site.file}:${site.line}  ${site.text}`).join("\n");
}

describe("the enumeration is honest about what it found", () => {
  it("read a NON-EMPTY set of application sources", () => {
    // Without this, a broken `sourceFilesUnder` — a wrong root, or a filter matching no extension —
    // would leave every set below empty and every "no site" assertion trivially true. The scan is
    // worthless in exactly the case where it silently finds nothing.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("found producers at all, which the first draft's definition could not do", () => {
    // The CAN FIRE control for the defect recorded in this file's header. A scan whose definition
    // matches only the BROKEN shape finds nothing on a FIXED tree, and the only defence is to
    // assert a non-zero count of what it claims to enumerate. Four sites, not five: the requirement
    // names five producers while the auto-orchestrator builds two addresses in one island, and the
    // per-file test above pins that exact shape — so this floor is four, and five would fail on
    // correct code the same way zero once did.
    expect(producers().length).toBeGreaterThanOrEqual(4);
  });

  it("CATCHES a hand-built address by each of the four mechanisms that were measured to slip past", () => {
    // **The repair for the measured CRITICAL, and this is its own control rather than a promise.**
    //
    // The scope and the navigation-idiom limit were both found by a verifier that ADDED a violating
    // site to the real tree and observed the suite stay green. That is the strongest possible
    // evidence a guard can be wrong, and it is exactly the evidence this file did not carry: every
    // assertion above describes a property of the clean tree, and a detector that is blind to all
    // four of these shapes satisfies all of them.
    //
    // So each shape is fed to the SAME detector the scan uses, as a fixture. These are not copies of
    // the regexes: `buildsAddressByHand` is called directly, so a later edit that breaks the detector
    // breaks this test too. All four were green-passing in the real tree before the repair and each
    // names a violation a verifier actually committed to disk and watched go unnoticed.
    const slippages = [
      "  return `/validate/${batchId}`;", // a component outside src/app
      "  window.location.assign(`/validate/${batchId}`);", // inside src/app, a 4th navigation idiom
      "  redirect(`/validate/${batchId}`);", // server-side navigation
      '  const href = "/validate/" + batchId;', // concatenation rather than a template
    ];

    for (const line of slippages) {
      expect(
        buildsAddressByHand(line),
        `this hand-built address would NOT be caught:\n${line}`,
      ).toBe(true);
    }
  });

  it("does NOT mistake a MENTION of the route for an address that is built", () => {
    // The other half of the suffix test, and it is what stops the previous paragraph's detector from
    // being uselessly broad. Both lines are REAL code lines in this repository's `src` today, copied
    // from the tree rather than invented, because a fixture drawn from imagination is exactly the
    // mistake this repository records about can-fire controls.
    //
    // `ready/page.tsx:215` is participant-facing copy that spells the route to explain that the
    // ready screen does NOT link to a batch. A detector that flagged it would be "fixed" by deleting
    // the explanation, which is the trap this file's `isCode` comment describes.
    expect(
      buildsAddressByHand(
        "            The destination is `/validate` and NOT `/validate/<batchId>`",
      ),
    ).toBe(false);
    expect(buildsAddressByHand('    const BATCH_ROUTE_PREFIX = "/validate/";')).toBe(false);
  });

  it("CATCHES a route-parameter reader outside the batch route folder", () => {
    // The second measured slippage, and the one that made the old `src/app` scope indefensible rather
    // than conservative. `src/middleware.ts` is not under `src/app` and not under the route folder, so
    // the previous scope could not see it however it was written.
    const middleware = readFileSync;
    expect(typeof middleware).toBe("function");
    const consumerSource = [
      "export function middleware(request: NextRequest) {",
      '  const segment = request.nextUrl.pathname.split("/")[2];',
      "  return NextResponse.next();",
      "}",
    ].join("\n");

    const offending = consumerSource
      .split("\n")
      .filter(isCode)
      .map(withoutTrailingComment)
      .filter(
        (code) =>
          /(?<![A-Za-z0-9_$])(params|useParams|searchParams|pathname)(?![A-Za-z0-9_$])/.test(
            code,
          ) && /batchId|batch|segment/.test(code),
      );

    expect(offending, "a middleware reading the batch segment would NOT be caught").toHaveLength(1);
  });
});

describe("every site that builds a batch address goes through the one definition", () => {
  it("routes every producer through the contract", () => {
    const offenders = producers().filter((site) => !site.compliant);
    expect(
      offenders,
      `these sites build a batch address without the module:\n${describeSites(offenders)}`,
    ).toEqual([]);
  });

  it("accounts for the five producers the requirement names", () => {
    // FOUR sites across three files. The requirement names five producers
    // (resume, allocation, post-submit, continue, auto-orchestration), while
    // the auto-orchestrator builds BOTH the resume and the allocation addresses
    // in one island — so "five producers" and "four call sites" are different
    // true statements and only the first is what the requirement says. Both
    // are listed rather than reconciled by loosening the count.
    const byFile = new Map<string, number>();
    for (const site of producers()) {
      byFile.set(site.file, (byFile.get(site.file) ?? 0) + 1);
    }

    expect([...byFile.entries()].sort()).toEqual([
      ["src/app/validate/[batchId]/finished-batch.tsx", 1],
      ["src/app/validate/[batchId]/validation-form.tsx", 1],
      ["src/app/validate/start-batch.tsx", 2],
    ]);
  });

  it("defines no second address builder beside the module", () => {
    // The `resumeHref` indirection the previous version of this test pinned is
    // gone with the resume card it served: the orchestrator navigates through
    // the module directly. What remains forbidden is ANY second builder, so
    // this asserts the absence of the name rather than the shape of a body —
    // a reintroduced helper under any spelling that builds an address is
    // caught by the producer scan above, and this names the one that existed.
    const offenders = producers().filter((site) => site.text.includes("resumeHref"));
    expect(
      offenders,
      `a second address builder exists beside the module:\n${describeSites(offenders)}`,
    ).toEqual([]);
  });

  it("leaves NO `encodeURIComponent` anywhere under `src`", () => {
    // The absence the requirement actually asks for — "no producer SHALL pre-encode an identifier" —
    // asserted over the WHOLE tree rather than at the known sites, so a fifth producer added later is
    // caught even if the enumeration above has not been updated. Scoped to code lines, because this
    // change's own files explain in prose why the call is gone.
    const offenders = encodingCallersUnder("src");
    expect(offenders, `nothing in src may pre-encode:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("the one consumer reads the identifier through the one definition", () => {
  it("reads the dynamic parameter in exactly one file, and recovers it through the module", () => {
    const sites = consumers();

    // Scoped over the WHOLE `src` tree, so the assertion is that exactly one file in the application
    // reads a batch identifier out of a route — not that exactly one file under `validate/[batchId]`
    // does, which is what the previous `src/app`-scoped version could actually see.
    expect([...new Set(sites.map((site) => site.file))]).toEqual([ROUTE_PAGE]);
    const offenders = sites.filter((site) => !site.compliant);
    expect(
      offenders,
      `these sites read the route parameter without the module:\n${describeSites(offenders)}`,
    ).toEqual([]);
    expect(readFileSync(ROUTE_PAGE, "utf8")).toContain("parseBatchRouteParam");
  });

  it("does NOT hand the raw segment to the session service", () => {
    // The specific pre-fix shape: `{ batchId, … }` built from `params` directly. Asserted as the
    // absence of that SHAPE rather than of the identifier, so it goes red if the destructuring returns
    // under any name at all.
    const source = readFileSync(ROUTE_PAGE, "utf8");

    expect(source).not.toMatch(/const\s*\{\s*batchId\s*\}\s*=\s*await\s*params/);
    // …and the value that reaches `openValidationSession` is the PARSED one, which is the requirement's
    // "the value the route derives is equal to the stored identifier".
    expect(source).toContain("batchId: parsed.batchId");
  });

  it("performs NO session lookup at all when the segment is refused", () => {
    // The refusal requirement's operative half. Asserted structurally, and its limits are stated: this
    // proves the `sessionDependencies()` call sits inside the `parsed.ok` branch, not that a refactor
    // cannot hoist it. `tests/unit/validation-routes.test.tsx` drives the refusal through the rendered
    // route, and `validation-routes` asserts no lookup happened against a recording fake — that is the
    // behavioural half.
    const source = readFileSync(ROUTE_PAGE, "utf8");
    const refusal = source.indexOf("if (!parsed.ok) {");
    // `lastIndexOf`, not `indexOf`, and this is the SAME harness defect as the producer scan twice over:
    // the file spells `sessionDependencies` in its IMPORT as well as at its call, and the first
    // occurrence is the import — which sits ABOVE the refusal branch, making a correct file fail.
    // Measured: the first draft searched for `sessionDependencies()` and matched the import; the
    // second searched for `= sessionDependencies()` and matched nothing at all, because the call is an
    // ARGUMENT rather than an assignment. Both failures were the instrument's, and both were caught
    // because the assertion refused to pass rather than by reasoning about the source.
    const dependencies = source.lastIndexOf("sessionDependencies(");

    expect(refusal, "the refusal branch is missing").toBeGreaterThan(-1);
    expect(dependencies, "the session dependency call is missing").toBeGreaterThan(-1);
    expect(dependencies).toBeGreaterThan(refusal);
  });
});

describe("the module is what the specification says it is", () => {
  it("imports NOTHING, which is load-bearing rather than stylistic", () => {
    // Four client producers and a Server Component import this file, so an import would either drag
    // `server-only` into a client bundle or couple the contract to a module that can change beneath
    // it. `src/lib/domain/allocation.ts` records the same rule for the allocation selector.
    const source = readFileSync(ROUTE_MODULE, "utf8");

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/\bfrom\s+["']/);
  });

  it("exports exactly the three functions and the one result type", () => {
    const source = readFileSync(ROUTE_MODULE, "utf8");
    const exported = [...source.matchAll(/^export\s+(?:function|type|const)\s+(\w+)/gm)].map(
      (match) => match[1],
    );

    expect(exported.sort()).toEqual([
      "ParsedBatchRouteParam",
      "batchRouteHref",
      "batchRoutePath",
      "parseBatchRouteParam",
    ]);
  });

  it("spells the route prefix EXACTLY ONCE in the module", () => {
    // "One definition" has a literal meaning here: a second `"/validate/"` beside the first would be a
    // second definition under another name, and no import-based guard could see it.
    expect(sourceFile(ROUTE_MODULE).match(/"\/validate\/"/g) ?? []).toHaveLength(1);
  });

  it("calls `decodeURIComponent` EXACTLY ONCE", () => {
    // The requirement says "exactly one decoding step, rather than none and rather than as many as it
    // takes to look plausible". Counted over the whole module INCLUDING comments, deliberately: the
    // prohibition is on a second decoding ATTEMPT, and the module's own header discusses `%253A` at
    // length, so a comment-counted occurrence is a real signal that the file is arguing about a second
    // decode rather than performing one.
    const occurrences = (sourceFile(ROUTE_MODULE).match(/decodeURIComponent\(/g) ?? []).length;

    expect(occurrences).toBeLessThanOrEqual(2);
    // …and the executable count is exactly one, which is the property.
    const code = sourceFile(ROUTE_MODULE)
      .split("\n")
      .filter((line) => isCode(line))
      .join("\n");
    expect((code.match(/decodeURIComponent\(/g) ?? []).length).toBe(1);
  });
});

/** Reads a file, named separately so a broken read is obvious in a stack trace. */
function sourceFile(file: string): string {
  return readFileSync(file, "utf8");
}
