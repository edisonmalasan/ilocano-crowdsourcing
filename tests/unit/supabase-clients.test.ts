import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

/**
 * Source with block and line comments removed.
 *
 * The guards below assert on what a module *does*. A doc comment explaining why a module does not
 * import something is not the module doing it, and reading raw source would both miss a real
 * violation hidden past a comment and fail on a comment that merely names a forbidden symbol.
 * Stripping comments first keeps the check honest in both directions.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Only the import/export statements of a module, as a single string. */
const importsOf = (source: string): string =>
  source.match(/^\s*import\s[\s\S]*?;?$/gm)?.join("\n") ?? "";

/**
 * Source-level boundary guards.
 *
 * There is no Supabase project and no database in this environment, so the honest way to prove a
 * module-graph property is to read the module's source and assert what it does and does not
 * mention. This is not a substitute for the runtime `server-only` boundary — it is an additional
 * guard that fails with the offending file named, which is what makes a regression reviewable.
 * The dynamic `import()` assertions at the end of this file are the runtime half.
 */

const BROWSER_SOURCE = read("../../src/lib/supabase/browser.ts");
const ADMIN_SOURCE = read("../../src/lib/supabase/admin.ts");
const SERVER_SOURCE = read("../../src/lib/supabase/server.ts");

/** Comment-free code, so a doc comment cannot make a guard pass or fail. */
const BROWSER_CODE = stripComments(BROWSER_SOURCE);
const ADMIN_CODE = stripComments(ADMIN_SOURCE);
const SERVER_CODE = stripComments(SERVER_SOURCE);

describe("browser access path", () => {
  it("never references the service-role environment variable", () => {
    expect(BROWSER_CODE).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("never references the server env module, which is where the privileged credential is read", () => {
    expect(BROWSER_CODE).not.toContain("@/lib/env/server");
  });

  it("never imports a server-only module, so it stays reachable from a client component", () => {
    const imports = importsOf(BROWSER_CODE);

    expect(imports).not.toContain("server-only");
    expect(imports).not.toContain("next/headers");
  });

  it("never imports or re-exports the server or privileged constructors", () => {
    const imports = importsOf(BROWSER_CODE);

    expect(imports).not.toContain("@/lib/supabase/server");
    expect(imports).not.toContain("@/lib/supabase/admin");
    expect(BROWSER_CODE).not.toMatch(/export\s+\{[^}]*create(Admin|Server)SupabaseClient/);
    expect(BROWSER_CODE).not.toMatch(/export\s+\*\s+from/);
  });

  it("builds its client from the public-safe env accessor alone", () => {
    expect(importsOf(BROWSER_CODE)).toContain("@/lib/env/client");
    expect(BROWSER_CODE).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(BROWSER_CODE).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(BROWSER_CODE).toContain("createBrowserClient");
  });
});

describe("privileged access path", () => {
  it('declares `import "server-only"` as its very first import', () => {
    const firstImport = /^\s*import\s+["'][^"']+["'];?/m.exec(ADMIN_CODE)?.[0];

    // First, not merely present: an import placed after a runtime import would not reliably
    // trigger the client-bundle failure.
    expect(firstImport).toBe('import "server-only";');
  });

  it("reads the service-role credential", () => {
    expect(ADMIN_CODE).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("does not persist or refresh a session, because it acts as the service role itself", () => {
    expect(ADMIN_CODE).toContain("persistSession: false");
    expect(ADMIN_CODE).toContain("autoRefreshToken: false");
  });
});

describe("authenticated server access path", () => {
  it("carries the public-safe key and never the privileged one", () => {
    expect(SERVER_CODE).toContain("SUPABASE_ANON_KEY");
    expect(SERVER_CODE).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("is itself marked server-only and is backed by cookies", () => {
    const imports = importsOf(SERVER_CODE);

    expect(imports).toContain('"server-only"');
    expect(imports).toContain("next/headers");
    expect(SERVER_CODE).toContain("createServerClient");
  });
});

describe("boundary enforcement at runtime", () => {
  it("fails to import the privileged module from a non-server context, proving the boundary is real", async () => {
    // This is the data-access-boundary spec's "privileged access is server-only" scenario. It
    // passes here exactly because `server-only` is NOT stubbed in this file: the import is
    // expected to throw, which is the enforcement mechanism rather than a convention.
    await expect(import("@/lib/supabase/admin")).rejects.toThrow(/cannot be imported/i);
  });
});
