import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `.env.example`: the shipped configuration contract.
 *
 * =================================================================================================
 * WHY THIS FILE IS TEXTUAL, AND WHY THAT IS STILL THE RIGHT LAYER
 * =================================================================================================
 * There is no runtime object to assert against. `.env.example` is not loaded by anything in this
 * repository — it is copied by a person, by hand, into `.env.local`. A test that imported it would be
 * testing a loader this project does not have, and the mistakes it catches are all in the FILE: a
 * variable that is missing, a value that was filled in with sample text, a comment that no longer
 * describes the code.
 *
 * So this is a textual scan, and that is a real limitation rather than a hidden one: it proves a
 * string is or is not present in a file it read. It cannot prove that a value works, and a cosmetic
 * reformat could fail it. What it does establish is the thing that actually goes wrong here — a
 * published sample credential, which is the one failure mode that turns a template into a breach.
 */

const TEMPLATE_PATH = join(process.cwd(), ".env.example");
const template = readFileSync(TEMPLATE_PATH, "utf8");

/** Every assignment in the template: `NAME="value"`, in file order. */
function assignments(contents: string): { name: string; value: string }[] {
  return [...contents.matchAll(/^([A-Z_][A-Z0-9_]*)="([^"]*)"$/gm)].map((match) => ({
    name: match[1] as string,
    value: match[2] as string,
  }));
}

const assigned = assignments(template);

/**
 * The template's prose, with comment markers and line wrapping removed.
 *
 * Every explanatory line in `.env.example` is prefixed `# ` and wrapped at roughly 95 columns, so a
 * sentence routinely spans three physical lines with a `#` at the start of each. A pattern written
 * across that wrap needs `\s*` at the break — and it silently stops matching the moment anybody
 * re-wraps the comment, which is the kind of failure that gets "fixed" by deleting the assertion.
 *
 * So prose claims are matched against THIS instead: one line per sentence, no markers. The claim
 * becomes about what the file SAYS rather than about how it happens to be typeset, which is the only
 * version of the claim worth making.
 */
function unwrap(contents: string): string {
  return contents
    .split("\n")
    .map((line) => line.replace(/^\s*#\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
}

describe("the template declares every variable the server reads", () => {
  it("names the five Supabase variables and the two researcher ones, and nothing else", () => {
    // An exact set, not a "contains" check. A template that grew a variable nobody reads is a
    // variable an operator will fill in believing it does something; one that lost a variable produces
    // a `ClientEnvError` naming a name this file never mentions, which is the failure mode the
    // template's own header paragraph exists to prevent.
    expect(assigned.map((entry) => entry.name).sort()).toEqual([
      "ADMIN_OPERATOR_SECRETS",
      "ADMIN_SESSION_SECRET",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ]);
    // Non-empty, so a resolver that matched nothing would not report every check below as passing.
    expect(assigned).toHaveLength(7);
  });

  it("declares the researcher variables in the SERVER group, never with a NEXT_PUBLIC_ name", () => {
    // The single most consequential line in this file. A `NEXT_PUBLIC_ADMIN_*` variable is inlined
    // into the client bundle at build time, which would publish an operator credential to every
    // visitor who loads a page.
    const admin = assigned.filter((entry) => entry.name.startsWith("ADMIN_"));
    expect(admin).toHaveLength(2);
    for (const entry of admin) {
      expect(entry.name.startsWith("NEXT_PUBLIC_")).toBe(false);
    }
    expect(template).not.toMatch(/NEXT_PUBLIC_ADMIN/);
    expect(template).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
  });
});

describe("the two researcher variables are EMPTY, which is the whole point", () => {
  it("ships no value at all for either", () => {
    // =============================================================================================
    // WHY THIS IS ASSERTED AND NOT ASSUMED
    // =============================================================================================
    // The Supabase keys above carry fake values, and that is fine: a fake project reference cannot
    // connect to anything, so shipping one costs nothing. An operator credential has no such
    // property. `ADMIN_OPERATOR_SECRETS="placeholder-operator-token"` in a deployed environment
    // authorizes anyone who has read this template, which is checked into a repository.
    //
    // So "a sample value" is not an inert placeholder here, it is a working credential, and the
    // difference between the two groups is the reason this test exists at all.
    const admin = assigned.filter((entry) => entry.name.startsWith("ADMIN_"));
    expect(admin.map((entry) => [entry.name, entry.value])).toEqual([
      ["ADMIN_OPERATOR_SECRETS", ""],
      ["ADMIN_SESSION_SECRET", ""],
    ]);
  });

  it("carries no example credential ANYWHERE in the file, not even in a comment", () => {
    // The stricter form, and the one that catches the realistic mistake: someone adding a helpful
    // example beside the empty assignment. A commented example is one copy-paste away from a live
    // value, and it is the shape a future editor would produce while trying to be helpful.
    const adminSection = template.slice(template.indexOf("# --- Researcher access"));
    expect(adminSection).not.toMatch(/ADMIN_OPERATOR_SECRETS="[^"]+"/);
    expect(adminSection).not.toMatch(/ADMIN_SESSION_SECRET="[^"]+"/);
    // No base64url-looking token of the length the template's own generator produces (32 bytes).
    const generator = "randomBytes(32).toString('base64url')";
    expect(template).toContain(generator);
    // 43 base64url characters is what 32 bytes encodes to; a real credential is exactly that long.
    expect(adminSection).not.toMatch(/\b[A-Za-z0-9_-]{43}\b/);
  });

  it("explains WHY they are empty, so the emptiness is not 'fixed' later", () => {
    // A template whose empty values look like an oversight gets filled in. The explanation is the
    // thing that survives, so it is asserted to exist and to carry the reasoning.
    const adminSection = template.slice(template.indexOf("# --- Researcher access"));
    expect(adminSection).toMatch(/DELIBERATELY EMPTY/);
    expect(adminSection).toMatch(/valid credential/i);
    // And it says the consequence, which is the operational half: the area refuses everything.
    expect(adminSection).toMatch(/refuses every request/i);
  });

  it("tells the operator how to generate both, and warns that they must differ", () => {
    expect(template).toMatch(/randomBytes\(32\)/);
    // `ADMIN_SESSION_SECRET` is the key that FORGES sessions. An operator credential doubling as
    // that key would turn any captured cookie into a working credential, which is a strictly larger
    // exposure than either variable has alone.
    const adminSection = template.slice(template.indexOf("# --- Researcher access"));
    expect(unwrap(adminSection)).toMatch(/MUST NOT be the same value/i);
  });
});

describe("the operator list's one surprising consequence is documented", () => {
  it("states that editing the list invalidates open sessions", () => {
    // Without this, the format is a trap. The implementation binds a session to BOTH the position
    // and a keyed fingerprint of the credential, so any edit invalidates open sessions — and the
    // failure is a researcher being signed out, which looks like a bug rather than a consequence.
    const adminSection = template.slice(template.indexOf("# --- Researcher access"));
    expect(adminSection).toMatch(/ADDING, REMOVING, REORDERING, or REPLACING/);
    expect(adminSection).toMatch(/invalidates every open session/i);
    // And it names the case that motivated the binding: removing from the MIDDLE, which a
    // position-only design would silently resolve to the next operator.
    expect(adminSection).toMatch(/from the middle of the list cannot hand its authority/);
  });

  it("keeps the per-entry purpose visible, which is why the list exists at all", () => {
    const adminSection = template.slice(template.indexOf("# --- Researcher access"));
    expect(adminSection).toMatch(/One entry per person/i);
    expect(unwrap(adminSection)).toMatch(
      /revoking one person's access does not sign everyone out/i,
    );
  });

  it("documents the blank-entry rule that the schema enforces", () => {
    const adminSection = template.slice(template.indexOf("# --- Researcher access"));
    // `resolveAdminEnv` rejects a blank entry BY POSITION and treats a wholly blank value as not
    // configured, so the template must say both — an operator who leaves a trailing comma would
    // otherwise find the whole area refusing with no hint why.
    expect(adminSection).toMatch(/Each entry must be non-empty/i);
    expect(adminSection).toMatch(/blank entry is rejected/i);
    expect(adminSection).toMatch(/only whitespace is treated as NOT configured/i);
  });
});

describe("the researcher variables are a SEPARATE concern from Supabase", () => {
  it("says why they are validated separately", () => {
    // D1. Adding them to `serverEnvSchema` would fail every PUBLIC request in any environment
    // without a researcher credential — failing closed in the wrong direction, on the validator flow
    // that has nothing to do with research access.
    const header = template.slice(0, template.indexOf("# --- Browser-safe"));
    expect(unwrap(header)).toMatch(/validated separately/);
    expect(unwrap(header)).toMatch(/public validator routes never read them/i);
    expect(unwrap(header)).toMatch(/leaving them unset does not break the public site/i);
  });

  it("keeps the header's variable COUNT accurate, which an earlier draft got wrong", () => {
    // The header says "SEVEN variables, in three groups, not three". Adding the two researcher
    // variables made seven; before that it said five. A stale count in a configuration template is a
    // small lie that a reader trusts, and it is exactly the kind of claim this project requires to
    // be re-derived rather than inherited.
    const header = template.slice(0, template.indexOf("# --- Browser-safe"));
    expect(header).toMatch(/There are SEVEN variables, in three groups/);
    // And the number of groups matches the section markers actually in the file.
    const groups = [...template.matchAll(/^# --- (.+?) -+$/gm)].map((match) => match[1] as string);
    expect(groups).toHaveLength(3);
  });

  it("does not claim the researcher variables are among the Supabase group", () => {
    // The header's "All five of those carry the SAME values in a real project" must not be read as
    // covering the researcher pair. Asserted by checking the sentence sits inside the Supabase part
    // of the header and names five, not seven.
    const header = template.slice(0, template.indexOf("# --- Browser-safe"));
    expect(header).toMatch(/All five of those carry the SAME values/);
  });
});

describe("the template is tracked, and nothing else environment-shaped is", () => {
  it("is the only environment file git tracks", () => {
    // `.env`/`.env.local` must never be committed.
    //
    // The rule is expressed as a GLOB plus one negation — `.env*` then `!.env.example` — rather than
    // as two literal lines. That is strictly stronger than naming `.env` and `.env.local`, because it
    // also covers `.env.production`, `.env.staging`, and anything else a tool might create, and a
    // first draft of this test asserted the two literal names and therefore passed against a
    // `.gitignore` that would have committed `.env.production` happily.
    const ignored = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    const envRules = ignored
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith(".env") || line.startsWith("!.env"));
    expect(envRules).toEqual([".env*", "!.env.example"]);
    // And the two names the obvious deployment would create are covered by that glob, which is
    // asserted rather than assumed so the glob cannot later be narrowed to `.env.local`.
    expect(ignored).not.toMatch(/^\.env\.local$/m);
    expect(ignored).not.toMatch(/^\.env$/m);
  });

  it("warns against committing a populated file in its own header", () => {
    expect(template).toMatch(/Never commit a populated/i);
    expect(template).toMatch(/Only this template is tracked/i);
  });

  it("has no CRLF, no BOM, and no stray non-ASCII beyond what its comments use", () => {
    // `.gitattributes` sets `* text=auto eol=lf`, so a CRLF working copy is possible on an autocrlf
    // machine. A CRLF line here would be invisible in review and would change nothing functionally,
    // but this repository has a documented history of an encoding artefact being mistaken for a
    // content problem, so the file is measured rather than assumed clean.
    const bytes = readFileSync(TEMPLATE_PATH);
    expect(bytes[0]).not.toBe(0xef);
    expect(template).not.toMatch(/\r/);
    // No replacement glyphs — the shape a PowerShell write leaves behind.
    expect(template).not.toContain("\uFFFD");
  });
});
