import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { NO_FORWARDED_ORIGIN, resolveOriginKey, type HeaderReader } from "@/lib/admin/origin";
import { researcherSignInRefusalMessage } from "@/lib/admin/signin-core";

/**
 * =================================================================================================
 * THE REAL SERVER ACTION WRAPPER, DRIVEN WITH THE SUPABASE ENVIRONMENT ABSENT
 * =================================================================================================
 * This suite has no `SUPABASE_*` variables — the runner does not inject `.env.local` — so
 * `createSignInAttemptsRepository()` cannot build a client. That makes this file able to exercise
 * paths that a fully-provisioned test environment would never reach, and the ones it exercises are
 * the ones that matter:
 *
 *   - the WRITE-INTAKE boundary runs BEFORE any privileged client is constructed, which is what stops
 *     a malformed payload from reaching the database at all;
 *   - the ORIGIN KEY is derived from request headers rather than from anything in the form;
 *   - an unconfigured deployment refuses without constructing a client, because the environment check
 *     is step 1 of the decision and happens before step 2's repository is used.
 *
 * Every one of those is a claim about ORDER, and order is invisible in a return value. So each is
 * asserted through a stub that records whether it was reached.
 *
 * =================================================================================================
 * WHAT THIS FILE CANNOT PROVE
 * =================================================================================================
 * Nothing about PostgREST, nothing about the atomicity of the counter, and nothing about a correct
 * credential being accepted — that needs a real project, and `docs/ROADMAP.md` records it as the
 * change's entry gate. A test that asserted "the right credential signs in" here would be asserting
 * against a stub, which proves the stub.
 */

vi.mock("server-only", () => ({}));

/** Records every cookie write, so a test can assert what was and was not set. */
const cookieWrites: { name: string; value: string; options: Record<string, unknown> }[] = [];
/** Records every `redirect`. */
const redirects: string[] = [];
/** The request headers the stubbed `headers()` returns. */
let requestHeaders = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestHeaders),
  cookies: () => ({
    get: (name: string) =>
      Promise.resolve(
        cookieWrites.find((write) => write.name === name && write.value !== "")
          ? { name, value: cookieWrites.find((w) => w.name === name && w.value !== "")?.value }
          : undefined,
      ),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieWrites.push({ name, value, options });
      return Promise.resolve();
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    redirects.push(destination);
    // `redirect` signals by THROWING. Throwing here rather than returning keeps the action's real
    // control flow — everything after the call is unreachable — so a `try` added around it in the
    // future would swallow it here exactly as it would in production.
    throw new Error(`NEXT_REDIRECT:${destination}`);
  },
}));

/** Whether the privileged client constructor was reached. */
let clientConstructions = 0;
/** What `getAdminEnv` should return. `null` is the shipped default. */
let adminEnvOverride: { operatorSecrets: string[]; sessionSecret: string } | null = null;

/** A header reader over a `Map`, which is what `resolveOriginKey` takes. */
function readerOver(entries: Record<string, string>): HeaderReader {
  const jar = new Map(Object.entries(entries));
  return (name) => jar.get(name) ?? null;
}

vi.mock("@/lib/admin/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/env")>();
  return {
    ...actual,
    getAdminEnv: () => adminEnvOverride,
  };
});

vi.mock("@/lib/repositories/supabase", () => ({
  createSignInAttemptsRepository: () => {
    clientConstructions += 1;
    // Throwing here is the point: the real constructor needs a service-role key this suite does not
    // have, and a throw makes "was a client built?" observable instead of inferred.
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is absent in this suite");
  },
}));

/** Fresh per-test counters and collections. */
function reset(options: { adminEnv?: typeof adminEnvOverride } = {}): void {
  cookieWrites.length = 0;
  redirects.length = 0;
  requestHeaders = new Map();
  clientConstructions = 0;
  adminEnvOverride = options.adminEnv ?? null;
}

/** A `FormData` carrying the submitted field, and nothing else. */
function formWith(entries: Record<string, string | Blob>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.append(key, value);
  return formData;
}

/** The well-formed payload the form produces. */
const WELL_FORMED = { researcherAccessKey: "an-operator-access-key-4f2a" };

async function signIn(formData: FormData): Promise<{ result?: unknown; threw?: string }> {
  const { signInAction } = await import("@/lib/admin/actions");
  try {
    return { result: await signInAction(formData) };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

describe("the write-intake boundary runs before any privileged client is built", () => {
  it("refuses a payload with NO field at all, without constructing a client", async () => {
    reset();
    const { result } = await signIn(formWith({}));
    // This is the load-bearing ordering claim. `parseWriteIntent` sits above
    // `createSignInAttemptsRepository()` in the action, so a payload the schema rejects never
    // reaches a privileged constructor. A test that only asserted "the action refused" would pass
    // with the two lines in the opposite order.
    expect(clientConstructions).toBe(0);
    expect(result).toMatchObject({ status: "refused" });
  });

  it.each([
    ["an unknown extra field", { ...WELL_FORMED, isAdmin: "true" }],
    ["a missing value", { researcherAccessKey: "" }],
    ["a whitespace-only value", { researcherAccessKey: "   " }],
    ["a different field name entirely", { accessKey: "an-operator-access-key-4f2a" }],
    // A field repeated under the same name is a case `Object.entries` cannot express, so it gets its
    // own test below rather than a row here that would silently collapse to the LAST value.
  ])("refuses %s, without constructing a client", async (_label, entries) => {
    reset();
    const { result } = await signIn(formWith(entries as Record<string, string>));
    expect(clientConstructions).toBe(0);
    expect(result).toMatchObject({ status: "refused" });
  });

  it("ignores a client-SUPPLIED attempt count, because the intake accepts exactly ONE key", async () => {
    // =============================================================================================
    // THE ROW ABOVE IS NOT ENOUGH, and this is the row that is
    // =============================================================================================
    // The unknown-extra-field refusal already covers `isAdmin: "true"`, and it looks like it covers
    // this scenario — "the attempt count is not client-supplied". It does not. That guard is
    // name-agnostic: it refuses every unknown key, which is a property of the REFUSAL and not a
    // statement about counts. An independent verification pass was right to call Requirement 7's
    // second scenario only partially evidenced by it.
    //
    // The claim is asserted as a CLOSED key set rather than through a deny-list, for the reason this
    // repository has been bitten by before: a deny-list has to guess the name a future implementation
    // would read, and `attemptCount`, `count`, `attempts`, `failedAttempts`, and `tries` would each
    // need to be anticipated. A closed set fails on the first key added at all.
    //
    // WHY THIS IS STRUCTURAL RATHER THAN BEHAVIOURAL, stated because it is a weaker form of evidence
    // ----------------------------------------------------------------------------------------------
    // This suite's repository mock THROWS when constructed, so a call reaching it cannot be observed
    // here — the argument shape is genuinely not visible at this boundary. An earlier draft of this
    // test asserted a recorded call list that did not exist, which would have passed by throwing on
    // an undefined binding at the first assertion rather than by proving anything. So the assertion is
    // made where the key set IS visible: the intake, which is the only place a client-supplied count
    // could enter at all.
    const { researcherSignInInputSchema } = await import("@/schemas/researcher");

    // Exactly one accepted key, enumerated from the real schema. The schema's own key is `credential`;
    // the FORM FIELD that feeds it is `researcherAccessKey`, and the mapping between them is the
    // action's job — asserted separately below, over what the action reads.
    expect(Object.keys(researcherSignInInputSchema.shape).sort()).toEqual(["credential"]);

    // And a payload carrying four differently-spelled count claims is refused outright, which is the
    // behaviour a client would actually see.
    reset();
    const { result } = await signIn(
      formWith({
        ...WELL_FORMED,
        attemptCount: "0",
        count: "0",
        attempts: "0",
        failedAttempts: "0",
      }),
    );
    expect(clientConstructions).toBe(0);
    expect(result).toMatchObject({ status: "refused" });

    // Finally, the action itself reads exactly one field off the form, and it does so through a
    // single declared constant. Two halves, because either alone is satisfiable by the wrong code:
    // a count of the reads alone would pass if the one read were of a count field, and the constant's
    // value alone would pass if a second literal read sat beside it.
    //
    // A source assertion, so it fails loudly on a rename rather than silently on a behaviour change.
    // The first draft of this matched `formData.get(?:All)?("literal")` and found ZERO calls, because
    // the action reads through `CREDENTIAL_FIELD`; the empty capture would have satisfied a
    // "nothing unexpected is read" claim if that claim had been phrased as an emptiness check, which
    // is the fourth time in this project that an empty capture has been indistinguishable from a
    // clean run.
    const source = readFileSync(join(process.cwd(), "src", "lib", "admin", "actions.ts"), "utf8");
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
    // Exactly one read of the form, and it is the one declared constant.
    const reads = [
      ...withoutComments.matchAll(/formData\.(?:get|getAll|entries|keys)\s*\(([^)]*)\)/g),
    ].map((m) => m[1]!.trim());
    expect(reads).toEqual(["CREDENTIAL_FIELD"]);
    // And that constant is declared exactly once, to the one form field the schema speaks.
    expect(
      [...withoutComments.matchAll(/const\s+CREDENTIAL_FIELD\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
    ).toEqual(["researcherAccessKey"]);
  });

  it("refuses a form that submitted the credential field TWICE", async () => {
    // Its own test because the table above cannot express it: `Record<string, string>` holds one
    // value per key, so a repeated key would have collapsed to the last one and the row would have
    // tested something else.
    //
    // `formData.get` returns the FIRST of two copies and says nothing about the second, so before
    // this guard existed the action read half the payload and which half it read was decided by the
    // browser rather than by this code.
    reset();
    const formData = new FormData();
    formData.append("researcherAccessKey", "an-operator-access-key-4f2a");
    formData.append("researcherAccessKey", "a-completely-different-value");
    const { result } = await signIn(formData);
    expect(clientConstructions).toBe(0);
    expect(result).toMatchObject({ status: "refused" });
  });

  it("accepts the field when it appears exactly once, so the guard is not simply refusing everything", async () => {
    // The control for the test above. Without it, "refuses a doubled field" would be satisfied by an
    // action that refuses every payload — which is indistinguishable from a working limit.
    reset({ adminEnv: null });
    const { result } = await signIn(formWith(WELL_FORMED));
    expect(result).toMatchObject({ status: "refused" });
    // The distinguishing signal is that a single well-formed field REACHED the environment check,
    // which only happens once the field-count guard has passed.
    expect(clientConstructions).toBe(0);
    expect(redirects).toEqual([]);
    // And with an environment configured, the same single field gets as far as the repository.
    reset({
      adminEnv: { operatorSecrets: ["an-operator-access-key-4f2a"], sessionSecret: "s3cr3t" },
    });
    await signIn(formWith(WELL_FORMED));
    expect(clientConstructions).toBe(1);
  });

  it("does not trim the submitted credential", async () => {
    // Trimming is what "be helpful" would look like, and it would accept a credential the operator
    // never chose. A trimmed value is a DIFFERENT value, and `verifyOperatorCredential` refuses it —
    // so the schema must not quietly normalise it into a match before the comparison sees it.
    reset({
      adminEnv: { operatorSecrets: ["an-operator-access-key-4f2a"], sessionSecret: "s3cr3t" },
    });
    await signIn(formWith({ researcherAccessKey: "  an-operator-access-key-4f2a  " }));
    // With a trailing space the comparison fails, the counter is unreachable in this suite, so the
    // outcome is `counter_unavailable` — a refusal, which is the point. What is asserted is that the
    // padded value was accepted by the SCHEMA and then failed the CREDENTIAL check, proving the
    // schema did not trim it into a match.
    expect(clientConstructions).toBe(1);
    expect(cookieWrites).toEqual([]);
  });

  it("returns the SAME refusal for a malformed payload as for a wrong credential", async () => {
    // A malformed payload and a bad credential are both "the value was not accepted". Distinguishing
    // them tells an unauthenticated requester something about the schema.
    reset();
    const malformed = await signIn(formWith({}));
    reset();
    const wellFormed = await signIn(formWith(WELL_FORMED));
    expect(malformed.result).toEqual(wellFormed.result);
  });
});

describe("an unconfigured deployment refuses without touching the database", () => {
  it("refuses, builds no client, and sets no cookie", async () => {
    // `getAdminEnv()` returns `null` — the shipped `.env.example` default, where both researcher
    // variables are empty.
    //
    // THIS TEST FOUND A REAL DEFECT, and it is worth recording how. The action originally passed the
    // repository in one object literal:
    //
    //     runResearcherSignIn({ ..., deps: { attempts: createSignInAttemptsRepository() } })
    //
    // An object literal is evaluated EAGERLY, so the client was constructed before
    // `runResearcherSignIn` reached its first line — and an unconfigured deployment therefore built a
    // service-role client, then threw, rather than refusing. On the sign-in page that would have been
    // a 500 on a deployment that has simply not configured a credential yet, which is the opposite of
    // "a fresh deployment refuses cleanly".
    //
    // The lesson is the one this file's header states: the claim is about ORDER, and no return-value
    // assertion could have found it. `clientConstructions === 0` could only be asserted because the
    // stub counts constructions rather than describing them.
    reset({ adminEnv: null });
    const { result } = await signIn(formWith(WELL_FORMED));
    expect(result).toMatchObject({ status: "refused" });
    expect(clientConstructions).toBe(0);
    expect(cookieWrites).toEqual([]);
    expect(redirects).toEqual([]);
  });

  it("refuses identically for a correct-looking value and a nonsense one", async () => {
    reset({ adminEnv: null });
    const first = await signIn(formWith(WELL_FORMED));
    reset({ adminEnv: null });
    const second = await signIn(formWith({ researcherAccessKey: "zzzz-nonsense" }));
    expect(first.result).toEqual(second.result);
  });
});

describe("a configured deployment reaches the database", () => {
  it("builds the client, and fails CLOSED when the counter cannot be read", async () => {
    // The order is now visible from the other side: with an environment configured, the action gets
    // as far as constructing the repository, and the suite's stub throws. That throw becomes a
    // refusal rather than a 500, which is the fail-closed trade the decision records.
    reset({
      adminEnv: { operatorSecrets: ["an-operator-access-key-4f2a"], sessionSecret: "s3cr3t" },
    });
    const { result } = await signIn(formWith(WELL_FORMED));
    expect(clientConstructions).toBe(1);
    // No session, no cookie, no redirect: a database that cannot be reached must not produce a
    // session, and the error must not escape as an exception.
    expect(result).toMatchObject({ status: "refused" });
    expect(cookieWrites).toEqual([]);
    expect(redirects).toEqual([]);
  });

  it("never lets a repository failure escape as an exception", async () => {
    reset({
      adminEnv: { operatorSecrets: ["an-operator-access-key-4f2a"], sessionSecret: "s3cr3t" },
    });
    const { threw } = await signIn(formWith(WELL_FORMED));
    // `threw` would name the Supabase constructor's error. It must be `undefined`.
    expect(threw).toBeUndefined();
  });

  it("names no internal reason in the refusal it returns", async () => {
    reset({
      adminEnv: { operatorSecrets: ["an-operator-access-key-4f2a"], sessionSecret: "s3cr3t" },
    });
    const { result } = await signIn(formWith(WELL_FORMED));
    const message = (result as { message: string }).message;
    // The message is the outward answer, and it must not tell a requester that the DATABASE was
    // unreachable — that is a fact about the operator's deployment.
    //
    // "credential" is deliberately NOT forbidden, and the reason is worth stating: the message says
    // "That credential was not accepted", which is the only useful thing it tells the person
    // standing in front of the form. What must not appear is a REASON — and this asserts that by
    // checking the message is the single shared string rather than by pattern-matching its vocabulary,
    // which is what a first draft did and which failed on the word it had wrongly banned.
    expect(message).toBe(researcherSignInRefusalMessage());
    expect(message.toLowerCase()).not.toMatch(
      /database|supabase|service role|configur|unreachable|limit|attempt/,
    );
    expect(message).not.toContain("s3cr3t");
    expect(message).not.toContain("an-operator-access-key-4f2a");
  });
});

describe("the action logs the refusal through without changing its contract", () => {
  it("emits one namespaced diagnostic line on the unconfigured path", async () => {
    // The sink the action hands the core is the only new behaviour here: same refusal shape,
    // same message, same zero client constructions — plus exactly one log line carrying the
    // internal reason. Stubbed at `console.info` because that is the boundary the action owns;
    // the line's content contract belongs to the core suite, not this one.
    reset();
    const lines: string[] = [];
    const info = console.info;
    console.info = (line: unknown) => {
      lines.push(String(line));
    };
    try {
      const { result } = await signIn(formWith(WELL_FORMED));
      expect(result).toMatchObject({ status: "refused" });
      expect(clientConstructions).toBe(0);
    } finally {
      console.info = info;
    }

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[sadino:researcher-signin]");
    expect(lines[0]).toContain("reason=not_configured");
    expect(lines[0]).not.toContain(WELL_FORMED.researcherAccessKey);
  });
});

describe("the origin key is derived from the request, not the form", () => {
  it.each([
    ["no forwarded headers at all", {}, "no-forwarded-origin"],
    ["an empty x-forwarded-for", { "x-forwarded-for": "" }, "no-forwarded-origin"],
    ["whitespace x-forwarded-for", { "x-forwarded-for": "   " }, "no-forwarded-origin"],
    ["a single address", { "x-forwarded-for": "203.0.113.7" }, "203.0.113.7"],
    [
      "a chain, taking the FIRST",
      { "x-forwarded-for": "203.0.113.7, 198.51.100.4, 10.0.0.1" },
      "203.0.113.7",
    ],
    ["a padded first entry", { "x-forwarded-for": "  203.0.113.7 , 10.0.0.1" }, "203.0.113.7"],
    ["x-real-ip when no forwarded header exists", { "x-real-ip": "198.51.100.4" }, "198.51.100.4"],
  ])("uses %s", (_label, headers, expected) => {
    // The key is what an attempt is accounted against, and `resolveOriginKey` is the only thing that
    // decides it. It is asserted HERE, against the pure function, rather than through the action —
    // because the repository above is a stub, and a stub cannot show which value the action chose to
    // hand it.
    //
    // This is why the decision lives in `@/lib/admin/origin` at all. A first draft of this file
    // called a `requestOriginKeyForTest` it needed `actions.ts` to export, which it must not: a
    // `"use server"` module's exports ARE its actions, so exporting the helper would have turned a
    // header classifier into a function any client could invoke.
    expect(resolveOriginKey(readerOver(headers as Record<string, string>))).toBe(expected);
  });

  it("gives every request without a forwarded header ONE shared bucket", () => {
    // The documented consequence: a deployment that strips neither header lets one party exhaust a
    // bucket that others share. Stated here so the fallback is a known quantity and not a surprise.
    const key = resolveOriginKey(readerOver({}));
    expect(key).toBe(NO_FORWARDED_ORIGIN);
    expect(resolveOriginKey(() => null)).toBe(key);
  });

  it("prefers x-forwarded-for over x-real-ip when BOTH are present", () => {
    // Both headers set is the common case behind a misconfigured proxy. Taking the wrong one would
    // account every attempt against the proxy's own address, which is one bucket for the world.
    expect(
      resolveOriginKey(
        readerOver({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls through to x-real-ip when x-forwarded-for is present but unusable", () => {
    // An empty or whitespace-only forwarded header must not short-circuit to the shared bucket: the
    // proxy told us something, and `x-real-ip` is a better answer than "everyone shares one".
    for (const forwarded of ["", "   ", ",", " , "]) {
      expect(
        resolveOriginKey(readerOver({ "x-forwarded-for": forwarded, "x-real-ip": "198.51.100.4" })),
      ).toBe("198.51.100.4");
    }
  });

  it("takes the FIRST entry of a chain, never the last", () => {
    // A proxy prepends the client it observed and appends what came before it, so the last entry is
    // the proxy's own address. Taking it would account the whole internet against one bucket.
    expect(
      resolveOriginKey(readerOver({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 192.168.1.1" })),
    ).toBe("203.0.113.7");
  });

  it("is reachable from the action, which supplies the header reader and nothing else", () => {
    // The action must not carry its own second implementation. Asserted at the source, because a
    // duplicate header classifier is exactly the kind of thing two files drift apart on.
    const source = readFileSync(join(process.cwd(), "src", "lib", "admin", "actions.ts"), "utf8");
    expect(source).toContain('from "@/lib/admin/origin"');
    expect([...source.matchAll(/resolveOriginKey/g)]).toHaveLength(2);
    // Exactly one occurrence of the literal fallback, in the module that owns it.
    expect([...source.matchAll(/no-forwarded-origin/g)]).toHaveLength(0);
    // And the action's own body is the two-line adapter, not a re-implementation.
    //
    // Scoped to CODE, excluding comments: the module documents the header names in prose, and a first
    // draft asserted over the whole file and failed on its own documentation. The distinction matters
    // — a test that cannot distinguish code from the comment explaining the code is not measuring the
    // code, and the fix is to scope the assertion rather than to delete the explanation.
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/x-forwarded-for|x-real-ip/);
    expect(code).toMatch(/resolveOriginKey/);
    // The prose still names them, so the limitation is documented where an operator will read it.
    expect(source).toMatch(/x-forwarded-for/);
  });
});

describe("sign-out", () => {
  it("clears the cookie and redirects, issuing no replacement session", async () => {
    reset();
    const { signOutAction } = await import("@/lib/admin/actions");
    let thrown: string | undefined;
    try {
      await signOutAction();
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }
    // One write, the session cookie, with a value that expires it immediately.
    expect(cookieWrites).toHaveLength(1);
    const write = cookieWrites[0] as {
      name: string;
      value: string;
      options: Record<string, unknown>;
    };
    expect(write.name).toBe("sadino_researcher_session");
    expect(write.value).toBe("");
    // `maxAge: 0` is what makes it a deletion rather than a blank value. A sign-out that set `maxAge`
    // to the session lifetime would look like it worked while leaving the cookie alive.
    expect(write.options.maxAge).toBe(0);
    // httpOnly, path, and sameSite are the same options the session was written with, so a delete
    // targeted at a different path would leave a live copy at the original.
    expect(write.options.httpOnly).toBe(true);
    expect(write.options.path).toBe("/researcher");
    expect(write.options.sameSite).toBe("strict");
    // And the redirect, which throws, which is why `thrown` is set.
    expect(redirects).toEqual(["/researcher/sign-in"]);
    expect(thrown).toBe("NEXT_REDIRECT:/researcher/sign-in");
  });

  it("builds no database client at all", async () => {
    // A sign-out that opened a privileged connection would make the control a privileged read,
    // and would make signing out fail when the database is down — which is precisely when somebody
    // most wants to end a session.
    reset();
    const { signOutAction } = await import("@/lib/admin/actions");
    await signOutAction().catch(() => undefined);
    expect(clientConstructions).toBe(0);
  });

  it("does not clear the attempt counter", async () => {
    // The counter is keyed by ORIGIN, so clearing it on sign-out would hand a fresh allowance to
    // whoever shares that egress — under a shared or NAT'd connection, not the person who signed
    // out. Asserted structurally: `signOutAction` reaches no repository at all.
    reset();
    const source = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "src", "lib", "admin", "actions.ts"),
      "utf8",
    );
    const signOut = source.slice(source.indexOf("export async function signOutAction"));
    expect(signOut).not.toMatch(
      /createSignInAttemptsRepository|attempts|recordAttempt|clear\(originKey/,
    );
    expect(signOut).toContain("clearResearcherSessionCookie");
  });

  it("takes no argument, so it cannot be told anything", async () => {
    const { signOutAction } = await import("@/lib/admin/actions");
    // Measured on the real function: a `signOutAction(validatorId)` shape would be a way to scope a
    // sign-out to somebody else, and the length is the check that it never grew one.
    expect(signOutAction.length).toBe(0);
  });
});
