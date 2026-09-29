import { describe, expect, it, vi } from "vitest";

import {
  ClientEnvError,
  findServiceRoleShapedPublicValues,
  parseClientEnv,
} from "@/lib/env/client";
import { ServerEnvError, isServiceRoleKeyConfigured, parseServerEnv } from "@/lib/env/server";

// `server-only` throws on import unless the bundler resolves its `react-server` condition, which
// Vitest does not. Stubbing the marker lets these tests exercise the real validation logic; the
// marker itself is asserted at the source level in `supabase-clients.test.ts`.
vi.mock("server-only", () => ({}));

const COMPLETE_SERVER_ENV = {
  SUPABASE_URL: "https://abc123.supabase.co",
  SUPABASE_ANON_KEY: "anon-public-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
} as const;

const COMPLETE_PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public-key-value",
} as const;

/** Builds a JWT-shaped string whose payload carries the given `role` claim. */
function jwtWithRole(role: string): string {
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");

  return `${encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${encode(
    JSON.stringify({ iss: "supabase", role }),
  )}.signature-not-verified-here`;
}

describe("server environment validation", () => {
  it("parses a complete configuration", () => {
    expect(parseServerEnv(COMPLETE_SERVER_ENV)).toEqual(COMPLETE_SERVER_ENV);
  });

  it("names every missing variable in one error rather than failing on the first", () => {
    // Aggregate reporting: a developer with three unset variables learns that once, not by
    // restarting three times.
    const error = (() => {
      try {
        parseServerEnv({});
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ServerEnvError);
    const message = (error as ServerEnvError).message;

    expect(message).toContain("SUPABASE_URL");
    expect(message).toContain("SUPABASE_ANON_KEY");
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("names a variable that is present but blank, alongside the ones that are absent", () => {
    const error = (() => {
      try {
        parseServerEnv({ ...COMPLETE_SERVER_ENV, SUPABASE_ANON_KEY: "   " });
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ServerEnvError);
    expect((error as ServerEnvError).variableNames.join("\n")).toContain("SUPABASE_ANON_KEY");
  });

  it("rejects a malformed URL and names SUPABASE_URL", () => {
    for (const badUrl of ["not-a-url", "ftp://abc.supabase.co", "abc123.supabase.co", ""]) {
      const error = (() => {
        try {
          parseServerEnv({ ...COMPLETE_SERVER_ENV, SUPABASE_URL: badUrl });
          return null;
        } catch (caught) {
          return caught;
        }
      })();

      expect(error, `expected ${JSON.stringify(badUrl)} to be rejected`).toBeInstanceOf(
        ServerEnvError,
      );
      expect((error as ServerEnvError).message).toContain("SUPABASE_URL");
    }
  });

  it("accepts a plain http URL, because a local Supabase stack may serve one", () => {
    expect(
      parseServerEnv({ ...COMPLETE_SERVER_ENV, SUPABASE_URL: "http://127.0.0.1:54321" })
        .SUPABASE_URL,
    ).toBe("http://127.0.0.1:54321");
  });

  it("never includes a value in the error message, so it is safe to log", () => {
    const error = (() => {
      try {
        parseServerEnv({ ...COMPLETE_SERVER_ENV, SUPABASE_URL: "not-a-url" });
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect((error as ServerEnvError).message).not.toContain("service-role-secret-value");
  });

  it("treats the anon key as a normal required value, not as a secret that needs hiding", () => {
    // The anon key is public by design: it ships to the browser and is bounded by Row Level
    // Security. Nothing here treats its presence as a problem.
    const parsed = parseServerEnv(COMPLETE_SERVER_ENV);

    expect(parsed.SUPABASE_ANON_KEY).toBe("anon-public-key-value");
  });

  it("reports whether the privileged credential is configured, without revealing it", () => {
    expect(isServiceRoleKeyConfigured(COMPLETE_SERVER_ENV)).toBe(true);
    expect(
      isServiceRoleKeyConfigured({ ...COMPLETE_SERVER_ENV, SUPABASE_SERVICE_ROLE_KEY: "" }),
    ).toBe(false);
    expect(isServiceRoleKeyConfigured({})).toBe(false);
  });
});

describe("public environment validation", () => {
  it("parses a complete public configuration", () => {
    expect(parseClientEnv(COMPLETE_PUBLIC_ENV)).toEqual(COMPLETE_PUBLIC_ENV);
  });

  it("does not throw merely because the anon key is present", () => {
    // Presence of the publishable key is the expected state, not a warning.
    expect(() => parseClientEnv(COMPLETE_PUBLIC_ENV)).not.toThrow();
  });

  it("rejects a NEXT_PUBLIC_ value that carries the service-role JWT claim", () => {
    const leaked = {
      ...COMPLETE_PUBLIC_ENV,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwtWithRole("service_role"),
    };

    expect(findServiceRoleShapedPublicValues(leaked)).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    expect(() => parseClientEnv(leaked)).toThrow(ClientEnvError);
  });

  it("reports the leak as a leak even when another public variable is also invalid", () => {
    // The privilege check runs first, so the more serious problem is the one reported.
    const leaked = {
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwtWithRole("service_role"),
    };

    const error = (() => {
      try {
        parseClientEnv(leaked);
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ClientEnvError);
    expect((error as ClientEnvError).message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect((error as ClientEnvError).message).toContain("service-role");
  });

  it("accepts a NEXT_PUBLIC_ value whose JWT claims a non-privileged role", () => {
    const anonJwt = { ...COMPLETE_PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwtWithRole("anon") };

    expect(findServiceRoleShapedPublicValues(anonJwt)).toEqual([]);
    expect(() => parseClientEnv(anonJwt)).not.toThrow();
  });

  it("accepts a modern opaque publishable key, which is not a JWT at all", () => {
    const publishable = {
      ...COMPLETE_PUBLIC_ENV,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abcdefghijklmnop",
    };

    expect(findServiceRoleShapedPublicValues(publishable)).toEqual([]);
    expect(() => parseClientEnv(publishable)).not.toThrow();
  });

  it("ignores a non-public variable that is service-role shaped, since it is not inlined", () => {
    const serverShaped = {
      ...COMPLETE_PUBLIC_ENV,
      SUPABASE_SERVICE_ROLE_KEY: jwtWithRole("service_role"),
    };

    expect(findServiceRoleShapedPublicValues(serverShaped)).toEqual([]);
    expect(() => parseClientEnv(serverShaped)).not.toThrow();
  });

  it("names every missing public variable in one error", () => {
    const error = (() => {
      try {
        parseClientEnv({});
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ClientEnvError);
    const names = (error as ClientEnvError).variableNames.join("\n");
    expect(names).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(names).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("rejects a malformed public URL and names it", () => {
    const error = (() => {
      try {
        parseClientEnv({ ...COMPLETE_PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_URL: "supabase.co" });
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect((error as ClientEnvError).variableNames).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});
