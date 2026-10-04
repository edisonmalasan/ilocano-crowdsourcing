import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { researcherSessionCookieOptions } from "@/lib/admin/cookie";
import {
  RESEARCHER_REFUSAL_MESSAGE,
  resolveResearcherAccess,
  type ResearcherAccess,
} from "@/lib/admin/guard";
import {
  issueResearcherSession,
  RESEARCHER_SESSION_MAX_LIFETIME_SECONDS,
} from "@/lib/admin/session";

/**
 * The researcher-area route guard.
 *
 * =================================================================================================
 * WHAT THIS FILE PROVES, AND THE TWO WAYS IT COULD BE PROVED CHEAPLY
 * =================================================================================================
 * The requirement is "an unauthorized request is refused BEFORE any privileged read is attempted".
 * The tempting proof is behavioural: hand the guard a request with no session and observe that no
 * query ran. That is not available here, because the guard takes no repository to observe — which is
 * itself the design (D6), and a fact a test cannot establish on its own.
 *
 * So there are two independent halves, and the second is the load-bearing one:
 *
 *   1. BEHAVIOURAL — the guard refuses for every kind of bad session, and the refusal is
 *      byte-identical across all of them. A refusal that varied with the reason would disclose
 *      whether a signature was close.
 *
 *   2. STRUCTURAL — the guard's own source, and every module it transitively imports, is scanned for
 *      any persistence path. This is what makes "no privileged read is attempted" a property of the
 *      code rather than a claim about the code: a guard that constructed a client "just in case"
 *      would pass every behavioural assertion in half 1 and fail half 2.
 *
 * The structural half is a TEXTUAL scan, and that is a real limitation stated rather than hidden: it
 * proves a string is absent from files it read, not that the code behaves as the absence suggests,
 * and it would fail on a cosmetic rename. What it does prove is the property that actually matters
 * here — that the import path from the guard to a Supabase client does not exist in the source tree.
 */

const SECRET = "7b41e0c9d2a85f36";
const NOW_MS = 1_700_000_000_000;
const CREDENTIALS = ["first-credential-3a9e", "second-credential-b71c"];
const CONFIGURED = { operatorSecrets: [...CREDENTIALS], sessionSecret: SECRET };

/** A valid session for position 1. */
function validSession(overrides: { nowMs?: number; credentials?: string[] } = {}): string {
  return issueResearcherSession({
    ordinal: 1,
    credential: (overrides.credentials ?? CREDENTIALS)[0] ?? "",
    nowMs: overrides.nowMs ?? NOW_MS,
    secret: SECRET,
  });
}

/** Runs the guard and returns the refusal, asserting the shape. */
function refused(access: ResearcherAccess): ResearcherAccess {
  expect(access).toEqual({ status: "refused" });
  return access;
}

describe("resolveResearcherAccess", () => {
  it("authorizes a valid session and reports its position and instants", () => {
    const token = validSession();
    expect(
      resolveResearcherAccess({ presented: token, adminEnv: CONFIGURED, nowMs: NOW_MS }),
    ).toEqual({
      status: "authorized",
      ordinal: 1,
      issuedAt: Math.floor(NOW_MS / 1000),
      expiresAt: Math.floor(NOW_MS / 1000) + 8 * 60 * 60,
    });
  });

  it("refuses when the deployment has no operator credential configured", () => {
    // `adminEnv: null` is what `getAdminEnv()` returns in an environment with no credential. The
    // refusal is a VALUE and not a thrown configuration error, so the route renders a refusal page
    // rather than a 500 — which is the difference between "the area is closed" and "the site is
    // broken".
    refused(resolveResearcherAccess({ presented: validSession(), adminEnv: null, nowMs: NOW_MS }));
  });

  it("refuses when the deployment has no credential AND the request has no session", () => {
    // Order matters here and the test is shaped to fail if it ever changes: a guard that verified a
    // token before checking the environment would report a session problem in a deployment that has
    // no credentials at all, which is a statement about the deployment the requester can act on.
    refused(resolveResearcherAccess({ presented: undefined, adminEnv: null, nowMs: NOW_MS }));
  });

  it("authorizes a valid session for the SECOND position, and reports 2", () => {
    const token = issueResearcherSession({
      ordinal: 2,
      credential: CREDENTIALS[1],
      nowMs: NOW_MS,
      secret: SECRET,
    });
    expect(
      resolveResearcherAccess({ presented: token, adminEnv: CONFIGURED, nowMs: NOW_MS }),
    ).toMatchObject({
      status: "authorized",
      ordinal: 2,
    });
  });

  // Each row carries its OWN instant alongside its token. A first draft of this table branched on the
  // LABEL to decide whether to re-issue the token and at what time, and the "expired" row issued its
  // token nine hours in the FUTURE — so it was verified while unexpired and passed for a reason that
  // had nothing to do with expiry. Pairing the value with the instant it is presented at removes the
  // possibility of that mistake.
  const EXPIRY_MS = 8 * 60 * 60 * 1000;
  const foreignSecret = issueResearcherSession({
    ordinal: 1,
    credential: CREDENTIALS[0],
    nowMs: NOW_MS,
    secret: "0d9a4c7b1e3f8256",
  });

  it.each<[string, unknown, number]>([
    ["no session at all", undefined, NOW_MS],
    ["null", null, NOW_MS],
    ["an empty string", "", NOW_MS],
    ["a bare word", "session", NOW_MS],
    ["a number", 42, NOW_MS],
    ["an object", { session: "x" }, NOW_MS],
    ["an array", ["a.b"], NOW_MS],
    ["a payload with no signature", "eyJ2IjoxfQ", NOW_MS],
    ["a payload with a truncated signature", `${validSession().split(".")[0]}.AAAA`, NOW_MS],
    ["a token with no separator", validSession().replace(".", ""), NOW_MS],
    ["a token with two separators", `${validSession()}.extra`, NOW_MS],
    [
      "a token outside the base64url alphabet",
      `${validSession().replace(/^[^.]+/, "a+b")}`,
      NOW_MS,
    ],
    ["a token signed with another secret", foreignSecret, NOW_MS],
    ["a session one second past expiry", validSession(), NOW_MS + EXPIRY_MS + 1000],
    ["a session nine hours past expiry", validSession(), NOW_MS + 9 * 60 * 60 * 1000],
  ])("refuses %s", (_label, presented, nowMs) => {
    refused(resolveResearcherAccess({ presented, adminEnv: CONFIGURED, nowMs }));
  });

  it("refuses a session whose position holds a different credential than it was issued for", () => {
    // The binding, seen through the guard. A credential rotated in place keeps its POSITION, so the
    // ordinal alone would still resolve and the guard would authorize a session belonging to a
    // credential the deployment no longer has.
    const token = validSession();
    const rotated = {
      operatorSecrets: ["different-credential-77ff", CREDENTIALS[1]],
      sessionSecret: SECRET,
    };
    refused(resolveResearcherAccess({ presented: token, adminEnv: rotated, nowMs: NOW_MS }));
  });

  it("refuses a session verified against a DIFFERENT session secret", () => {
    const token = validSession();
    const otherSecret = { operatorSecrets: [...CREDENTIALS], sessionSecret: "0d9a4c7b1e3f8256" };
    refused(resolveResearcherAccess({ presented: token, adminEnv: otherSecret, nowMs: NOW_MS }));
  });

  it("refuses an expired session and continues to authorize a live one at the same instant", () => {
    // Both at one instant, because "expires at 15:00" is a claim about a boundary and a test that
    // checks each side at a different time checks nothing.
    const token = validSession();
    const expiresAtMs = (Math.floor(NOW_MS / 1000) + 8 * 60 * 60) * 1000;
    expect(
      resolveResearcherAccess({ presented: token, adminEnv: CONFIGURED, nowMs: expiresAtMs - 1000 })
        .status,
    ).toBe("authorized");
    refused(
      resolveResearcherAccess({ presented: token, adminEnv: CONFIGURED, nowMs: expiresAtMs }),
    );
  });

  // -------------------------------------------------------------------------------------------
  // The refusal is the SAME, which is the property a two-state union exists to provide.
  // -------------------------------------------------------------------------------------------

  it("carries NO reason on a refusal, so the type cannot be branched on", () => {
    const access = resolveResearcherAccess({
      presented: "garbage",
      adminEnv: CONFIGURED,
      nowMs: NOW_MS,
    });
    // Not a deep-equality tautology: `toEqual({ status: "refused" })` with no `reason` key would
    // fail if a reason were added, because `toEqual` treats a missing key and an undefined-valued
    // key as different. The explicit key check makes the claim read as the claim.
    expect(Object.keys(access).sort()).toEqual(["status"]);
  });

  it("names nothing from the request in the refusal message", () => {
    // The message is what a refused requester actually sees, so it is what the disclosure rule is
    // about: no reason, no path, no identifier, no count of configured credentials.
    //
    // The forbidden words are the ones a reason would be made of. "session" is deliberately NOT
    // among them — the message legitimately says one is required, and a guard against the word
    // would be a guard against the only useful thing the message tells the reader.
    const disclosing =
      /credential|secret|limit|attempt|exceed|too many|configur|not configured|wrong|invalid|expired|revoked/i;
    expect(disclosing.test(RESEARCHER_REFUSAL_MESSAGE)).toBe(false);

    expect(RESEARCHER_REFUSAL_MESSAGE.toLowerCase()).toContain("not available");
    expect(RESEARCHER_REFUSAL_MESSAGE).not.toContain(CREDENTIALS[0]);
    expect(RESEARCHER_REFUSAL_MESSAGE).not.toContain(SECRET);
    // No number appears in it, so it cannot be a count of configured credentials or a limit.
    expect(RESEARCHER_REFUSAL_MESSAGE).not.toMatch(/\d/);
  });

  it("refuses every refusal the same way, whatever the request was", () => {
    // =============================================================================================
    // RETITLED, and the old title was false
    // =============================================================================================
    // This test was called "serves one message regardless of whether the requested thing would have
    // existed" and it compared a LITERAL `{ status: "refused" }` against the guard's own output. Both
    // sides of that comparison were values the test itself supplied, so it could not fail for any
    // reason related to record existence — an independent verification pass called it tautological
    // and was right.
    //
    // What it ACTUALLY establishes, and the title now says so: the guard takes no input describing
    // what was requested, so it has nothing to vary a refusal by. It is a property of the guard's
    // SIGNATURE plus the fact that every branch returns the identical refusal — which is worth
    // asserting, because a future branch that returns a second refusal shape is exactly the change
    // this would catch.
    //
    // The requirement's stronger form — "indistinguishable from the response for an entry that does
    // exist" — is STRUCTURALLY satisfied rather than evidenced here, and the real evidence is the
    // write-intake ordering test in `admin-actions-wrapper.test.ts`, which proves no privileged read
    // happens at all before the refusal is decided. That is asserted there, and pointed at here.
    const argumentsUnderTest = resolveResearcherAccess.length;
    expect(argumentsUnderTest).toBe(1);

    // One argument, so nothing about a requested record can reach it. Enumerated from the real
    // function rather than restated, so adding a parameter is what fails here.
    expect(
      resolveResearcherAccess
        .toString()
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, ""),
    ).not.toMatch(/\bentry\b|\bexists\b|\bfound\b/i);

    // And every refusal the guard can produce is the same refusal, over a set of inputs chosen to hit
    // every branch: no session, a bad session, an unconfigured deployment, and a configured one.
    const inputs = [
      { presented: undefined, adminEnv: CONFIGURED },
      { presented: "not-a-session", adminEnv: CONFIGURED },
      { presented: undefined, adminEnv: null },
      { presented: "not-a-session", adminEnv: null },
    ];
    const shapes = inputs.map((input) =>
      resolveResearcherAccess({
        presented: input.presented,
        adminEnv: input.adminEnv,
        nowMs: NOW_MS,
      }),
    );
    // Exactly one distinct shape across every branch — not "all of them are refused", which a partial
    // implementation would also satisfy, but "they are indistinguishable from each other".
    expect(new Set(shapes.map((shape) => JSON.stringify(shape))).size).toBe(1);
    expect(shapes.every((shape) => shape.status === "refused")).toBe(true);
  });
});

describe("the session cookie carries the flags the requirement's words describe", () => {
  // =============================================================================================
  // WHY THESE ASSERTIONS EXIST AT ALL
  // =============================================================================================
  // Requirement 3 says the session "SHALL be marked so that page scripts cannot read it, it SHALL be
  // restricted from being sent on cross-site requests". Those are three claims about three flags, and
  // each flag is a value that can be changed to a *nearly* right one without anything else noticing.
  //
  // `sameSite: "lax"` shipped as the first version of this change. `lax` blocks the cross-site POST
  // but still carries the cookie on a cross-site top-level GET navigation, so the requirement was not
  // met — and the deviation was discharged by a comment in `cookie.ts` rather than by the spec. An
  // independent verification pass caught it. These tests exist so the next person cannot repeat it,
  // and the `sameSite` case is the load-bearing one: `strict` is the only value that means what the
  // requirement says, and nothing in this feature needs the laxity.
  const options = researcherSessionCookieOptions();

  it("is unreadable by page scripts", () => {
    expect(options.httpOnly).toBe(true);
  });

  it("is restricted from being sent on cross-site requests, which is what `strict` means", () => {
    // Asserted as a CLOSED set, so `lax`, `none`, and an unset attribute all fail here rather than
    // passing a `toBeTruthy`-shaped check.
    expect(options.sameSite).toBe("strict");
    // The negative form, stated so the reason is not lost: `lax` is the value that looks reasonable
    // and is wrong here, and a future editor should meet the word `lax` in the guard's own source.
    expect(["lax", "none", undefined, false]).not.toContain(options.sameSite);
  });

  it("is scoped to the researcher area, so public validator requests do not carry it", () => {
    expect(options.path).toBe("/researcher");
  });

  it("carries the configured lifetime, matching the expiry inside the signed payload", () => {
    // Both ends of the session's validity must agree, or the cookie outlives the signature or the
    // signature outlives the cookie. One assertion over both, because the disagreement is the defect.
    expect(options.maxAge).toBe(RESEARCHER_SESSION_MAX_LIFETIME_SECONDS);
  });
});

// -------------------------------------------------------------------------------------------
// THE STRUCTURAL HALF
// -------------------------------------------------------------------------------------------

const PROJECT_ROOT = join(__dirname, "..", "..");
const SRC = join(PROJECT_ROOT, "src");

/** Every `.ts`/`.tsx` under `src/`, as absolute paths. */
function sourceFiles(dir: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Every `@/…` specifier a file imports, plus its bare module specifiers. */
function importsOf(contents: string): string[] {
  const specifiers: string[] = [];
  for (const match of contents.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
    specifiers.push(match[1] as string);
  }
  return specifiers;
}

/** Resolves a `@/…` specifier to a file on disk, trying the extensions Next.js resolves. */
function resolveAliased(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith("@/")) return null;
  const base = join(SRC, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // Not a readable file; try the next shape.
    }
  }
  void fromFile;
  return null;
}

/** The transitive set of project modules reachable from `entry`. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(readFileSync(file, "utf8"))) {
      const resolved = resolveAliased(specifier, file);
      if (resolved !== null && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
}

describe("the guard cannot reach a privileged read", () => {
  it("reads its way to no persistence module at all", () => {
    // The load-bearing assertion of this file. `src/lib/admin/guard.ts` is walked transitively
    // through `@/…` imports, and every file it reaches is checked for a persistence path.
    const entry = join(SRC, "lib", "admin", "guard.ts");
    const reachable = reachableFrom(entry);
    // A non-zero reach, so a broken resolver cannot make this vacuously true. Without this, an
    // alias that resolved to nothing would leave the set empty and every check below would pass.
    expect(reachable.length).toBeGreaterThan(1);

    const forbidden =
      /@\/lib\/(supabase|repositories)|@supabase\/|createClient|createAdminClient|from\("|ServiceRole/i;
    const offenders = reachable.filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("reaches only the two modules it is documented to reach", () => {
    // Narrows the structural claim to an EXACT set, read off the walk itself rather than asserted as
    // a literal list of "modules that are fine". A fourth import added to the guard — for any
    // reason — fails here and has to be a deliberate edit.
    const reachable = reachableFrom(join(SRC, "lib", "admin", "guard.ts"))
      .map((file) => file.slice(SRC.length + 1).replaceAll("\\", "/"))
      .sort();
    expect(reachable).toEqual(["lib/admin/env.ts", "lib/admin/guard.ts", "lib/admin/session.ts"]);
  });

  it("takes no repository, no clock, and no database as an argument", () => {
    // The second half of the structural claim, at the interface rather than the file. A guard whose
    // signature grew a `repository` member would still import nothing privileged — it would receive
    // a privileged thing from a caller — so the signature is checked directly.
    const contents = readFileSync(join(SRC, "lib", "admin", "guard.ts"), "utf8");
    const signature = contents.slice(contents.indexOf("export function resolveResearcherAccess"));
    for (const forbidden of ["repository", "Repository", "client", "Client", "attempts"]) {
      expect(signature).not.toContain(forbidden);
    }
  });

  it("is not reachable from any client component", () => {
    // The other direction. The ESLint rule is the primary guard and CI asserts it, but a rule that
    // is inert for a reason already recorded in this repository (a component omitting its own
    // `"use client"` on Windows) needs a source-level backstop that does not depend on module kind.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      if (!/^\s*(['"])use client\1/.test(contents)) continue;
      for (const specifier of importsOf(contents)) {
        if (/^@\/lib\/admin\/(env|credentials|session|guard|cookie|signin-core)$/.test(specifier)) {
          offenders.push(`${file.slice(PROJECT_ROOT.length + 1)} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is reachable from the protected route group and from the sign-in action", () => {
    // The converse of the test above, so the scan is not satisfied by simply not being imported
    // anywhere. A file that stopped importing the guard would still pass every refusal test while
    // the area stopped being protected.
    const callers = ["app/researcher/(protected)/layout.tsx", "lib/admin/actions.ts"].map(
      (relative) => join(SRC, relative),
    );
    for (const caller of callers) {
      expect(readFileSync(caller, "utf8")).toMatch(/@\/lib\/admin\//);
    }
  });
});

describe("the route structure makes coverage structural", () => {
  /**
   * Every directory beneath `src/app/researcher/`, relative to it, with `/` separators.
   *
   * Read from the filesystem rather than asserted as a list, so the next route added to the area is
   * either inside the guarded group or it is not, and this file says which.
   */
  function researcherDirectories(dir: string = join(SRC, "app", "researcher")): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relative = entry.name;
      found.push(relative);
      for (const nested of researcherDirectories(join(dir, entry.name))) {
        found.push(`${relative}/${nested}`);
      }
    }
    return found.sort();
  }

  it("places EVERY researcher route either inside the guarded group or at the one unguarded route", () => {
    // This is the assertion `(protected)/layout.tsx` points at. It is the property that makes the
    // layout a boundary rather than a convention:
    //
    //   - a route ADDED OUTSIDE `(protected)` and outside `sign-in` would be served with no session
    //     check at all, and nothing in the build would say so; and
    //   - a route MOVED INTO `(protected)` that must be reachable unauthenticated — which is to say,
    //     the sign-in page — would make the area impossible to enter.
    //
    // Both are one directory away from happening, and neither is visible in a per-page review.
    const directories = researcherDirectories();
    // Non-empty, or an alias/renamed directory would make every check below vacuous.
    expect(directories.length).toBeGreaterThan(0);
    const guardedPrefix = "(protected)";
    const unguarded = directories.filter(
      (d) => d !== guardedPrefix && !d.startsWith(`${guardedPrefix}/`),
    );
    expect(unguarded).toEqual(["sign-in"]);
  });

  it("guards the group from a layout at the TOP of that group, not from inside it", () => {
    // A layout nested below the group's own root would cover only its own subtree, and every route
    // added beside it in the group would be unprotected. This asserts the guard sits at the root.
    const groupRoot = join(SRC, "app", "researcher", "(protected)");
    const layouts = readdirSync(groupRoot, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name === "layout.tsx")
      .map(() => "layout.tsx");
    expect(layouts).toEqual(["layout.tsx"]);
    expect(readFileSync(join(groupRoot, "layout.tsx"), "utf8")).toContain(
      "resolveResearcherAccess",
    );
  });

  it("leaves the segment root unguarded, so the sign-in page is reachable without a session", () => {
    // The converse, and the reason `src/app/researcher/layout.tsx` exists at all: it carries the
    // `noindex` declaration and no guard. A guard there would refuse the only page through which a
    // session can be obtained.
    const segmentRoot = readFileSync(join(SRC, "app", "researcher", "layout.tsx"), "utf8");
    expect(segmentRoot).not.toContain("resolveResearcherAccess");
    expect(segmentRoot).not.toContain("forbidden(");
    // It must still declare noindex for the segment, since that applies regardless of session.
    expect(segmentRoot).toContain("index: false");
  });

  it("keeps every researcher route inside a directory whose layout is either the guard or the segment shell", () => {
    // The general form of the two tests above, stated over the REAL directory list. It fails when a
    // route is added to a new top-level directory under `/researcher`, which is exactly the case a
    // reviewer would have no reason to look at.
    const directories = researcherDirectories();
    for (const directory of directories) {
      const hasOwnLayout = (() => {
        try {
          readFileSync(join(SRC, "app", "researcher", directory, "layout.tsx"), "utf8");
          return true;
        } catch {
          return false;
        }
      })();
      // Every directory must either BE the guarded group root, or sit beneath it, or be the single
      // unguarded route, or carry its own layout (a nested group).
      const beneathGuard = directory === "(protected)" || directory.startsWith("(protected)/");
      expect(beneathGuard || directory === "sign-in" || hasOwnLayout).toBe(true);
    }
  });
});

describe("the admin environment is read only from the researcher area", () => {
  // =============================================================================================
  // WHY THIS IS AN ENUMERATION AND NOT A HAND-CHECK
  // =============================================================================================
  // Task 3.7 asked for the readers of the admin env module to be enumerated "at whole-project scope
  // rather than scoped to one file". An independent verification pass performed that enumeration by
  // hand, found three readers, and reported that **nothing in the suite would fail if a fourth reader
  // appeared under a public route** — which is the point of the exercise and the reason a by-hand
  // count is not evidence.
  //
  // The consequence of a leak is concrete rather than theoretical. `getAdminEnv()` reads the operator
  // credential and the session-protection secret, so a public validator route that called it would
  // make an admin refusal — the thing D1 deliberately isolates — reachable from a public request. D1
  // is the design decision that a deployment with no researcher credential still serves the public
  // site, and this test is what keeps that decision load-bearing.
  const ADMIN_ENV_READERS = sourceFiles().filter((file) =>
    /\bgetAdminEnv\b/.test(readFileSync(file, "utf8")),
  );

  it("reads the admin environment from exactly four files, all inside the researcher area", () => {
    const readers = ADMIN_ENV_READERS.map((file) =>
      file.slice(SRC.length + 1).replaceAll("\\", "/"),
    );

    // Assert the enumeration is non-empty first. A resolver that silently matched nothing would make
    // every assertion below pass for the wrong reason.
    expect(readers.length).toBeGreaterThan(0);

    // The CLOSED set. A fourth reader fails here by name rather than being absorbed.
    //
    // `lib/admin/env.ts` is in the list because it DEFINES the function, and an enumeration that
    // omitted it would be filtering on something other than "reads the environment" — a reader list
    // that excludes the definition is a list of an idea, not of the code. The first draft of this
    // assertion expected three readers, was measured against four, and the fourth was this one; the
    // count was wrong, not the code.
    expect(readers.sort()).toEqual([
      "app/researcher/(protected)/export/route.ts",
      "app/researcher/(protected)/layout.tsx",
      "app/researcher/sign-in/page.tsx",
      "lib/admin/actions.ts",
      "lib/admin/env.ts",
    ]);

    // The claim that matters, stated separately so it survives a reorganisation: NO public validator
    // route may read it. Checked as a predicate over the reader list rather than by re-reading the
    // three names, so this fails for a new reader anywhere rather than only for a renamed one.
    const PUBLIC_ROUTE_PREFIXES = ["app/ready", "app/start", "app/validate", "app/page.tsx"];
    for (const reader of readers) {
      expect(PUBLIC_ROUTE_PREFIXES.some((prefix) => reader.startsWith(prefix))).toBe(false);
    }
  });

  it("keeps the admin schema out of the shared server environment", async () => {
    // The other half of D1, and the one with a failure mode in the wrong direction. If the admin
    // variables became required members of `serverEnvSchema`, then every public route would FAIL in
    // any environment without a researcher credential configured — which is the deployed default.
    // "Fails closed" is right for the admin area and catastrophic for the public site.
    const { serverEnvSchema } = await import("@/lib/env/server");
    const shape = serverEnvSchema.shape as Record<string, unknown>;
    expect(Object.keys(shape).sort()).not.toContain("ADMIN_OPERATOR_SECRETS");
    expect(Object.keys(shape).sort()).not.toContain("ADMIN_SESSION_SECRET");
    // And the public schema still parses an environment carrying NEITHER, which is the condition the
    // separation exists for. Read from the real schema rather than a fixture of it.
    const parsed = serverEnvSchema.safeParse({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("the guard scans the right files", () => {
  it("finds a persistence import when one is added, which is the can-fire control", () => {
    // A guard that cannot fail is the failure mode this project has now found several times. The
    // positive control: the SAME predicate, applied to a file that DOES contain a forbidden import.
    // Without it, a broken resolver or a typo'd pattern would report an empty `offenders` list and
    // this file's load-bearing test would be reporting nothing.
    const offenders = sourceFiles().filter((file) =>
      /@\/lib\/supabase\/admin/.test(readFileSync(file, "utf8")),
    );
    // Several files legitimately import it — `@/lib/supabase/admin.ts` itself, `factory.ts`, and so
    // on. The control needs only to be NON-EMPTY, and to name a file outside the guard's reachable
    // set so it cannot be an accident of the walk.
    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders.every((file) => !file.endsWith(join("lib", "admin", "guard.ts")))).toBe(true);
  });

  it("would catch a guard that imported a Supabase client, demonstrated on a temporary file", () => {
    // The pattern check, applied to a string containing a forbidden import. Not a real file and not
    // a real mutation: it proves the REGULAR EXPRESSION discriminates, which is the only part of the
    // structural half that could be silently broken by a rewrite of the module.
    const forbidden =
      /@\/lib\/(supabase|repositories)|@supabase\/|createClient|createAdminClient|from\("|ServiceRole/i;
    const violating = [
      `import { createAdminClient } from "@/lib/supabase/admin";`,
      `import { createSupabaseRepositories } from "@/lib/repositories/supabase";`,
      `import { createClient } from "@supabase/supabase-js";`,
      `const q = client.from("dataset_entries");`,
      `createClient(SUPABASE_URL, process.env.SERVICE_ROLE_KEY as string);`,
    ];
    for (const line of violating) expect(forbidden.test(line)).toBe(true);

    // And the shapes that must NOT trip it, so the pattern is not simply "reject anything with an
    // import in it" — which would make every test in this file pass for the wrong reason.
    const safe = [
      `import { resolveResearcherAccess } from "@/lib/admin/guard";`,
      `import { verifyResearcherSession } from "@/lib/admin/session";`,
      `import type { ConfiguredAdminEnv } from "@/lib/admin/env";`,
    ];
    for (const line of safe) expect(forbidden.test(line)).toBe(false);
  });
});
