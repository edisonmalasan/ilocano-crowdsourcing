import { z } from "zod";

/**
 * Public (browser-visible) environment contract.
 *
 * Everything reachable from this module is inlined into the client bundle by Next.js, so anything
 * named here is PUBLIC. That is by design for the anon key: it is the publishable key, it ships to
 * every browser, and it is constrained by Row Level Security rather than by secrecy. It is NOT by
 * design for the service-role key, which bypasses RLS and must never reach this module or any
 * value it returns — see `@/lib/env/server`, which is the only place that credential is read.
 *
 * This module is dependency-free and free of `server-only`, so importing it from a client
 * component is safe by construction. It also deliberately does NOT import the server env module to
 * compare keys: that import would pull `server-only` into the client graph and defeat the boundary
 * it exists to protect. Detection is therefore shape-based, not value-based — see
 * `findServiceRoleShapedPublicValues`.
 */

const publicUrlSchema = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "must be a valid http/https URL (for example https://your-project-ref.supabase.co)");

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: publicUrlSchema,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1, "must not be empty"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Thrown when the public environment is missing, malformed, or has leaked a privileged value. */
export class ClientEnvError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: readonly string[], summary: string) {
    const listed = variableNames.map((name) => `  - ${name}`).join("\n");
    super(`${summary}\n${listed}\nNo value is included in this message, so it is safe to log.`);
    this.name = "ClientEnvError";
    this.variableNames = variableNames;
  }
}

/** The `role` claim Supabase puts in its service-role JWT. */
const SERVICE_ROLE_CLAIM = "service_role";

/**
 * Decodes a JWT payload without verifying it.
 *
 * This is not an authentication check and is not used as one: it only answers "does this string
 * claim to be a service-role key", which is exactly the question that must be asked before a value
 * is about to be inlined into a public bundle. Returns `null` for anything that is not a
 * three-segment JWT with a JSON object payload.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const decode: ((value: string) => string) | undefined = globalThis.atob;
  if (typeof decode !== "function") return null;

  const payloadSegment = segments[1];
  // JWT uses base64url; `atob` expects base64.
  const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  try {
    const parsed: unknown = JSON.parse(decode(padded));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Finds `NEXT_PUBLIC_*` values that are shaped like a Supabase service-role key.
 *
 * Shape-based rather than value-based for two reasons: the true service-role key is not readable
 * from a client-reachable module, and a *rotated* leaked key would defeat a value comparison
 * anyway. Any `NEXT_PUBLIC_*` value whose JWT payload carries `role: "service_role"` is reported.
 * Modern publishable keys (`sb_publishable_…`) are opaque rather than JWTs and so decode to
 * `null`; they are correctly not reported.
 */
export function findServiceRoleShapedPublicValues(source: Record<string, unknown>): string[] {
  const offenders: string[] = [];

  for (const [name, value] of Object.entries(source)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (typeof value !== "string" || value.trim().length === 0) continue;

    const payload = decodeJwtPayload(value.trim());
    if (payload?.role === SERVICE_ROLE_CLAIM) offenders.push(name);
  }

  return offenders;
}

/**
 * Parses a public environment source.
 *
 * The privilege check runs FIRST and unconditionally, so a leak is reported as a leak rather than
 * being masked by an unrelated missing variable. All problems are then aggregated into one error.
 */
export function parseClientEnv(source: Record<string, unknown>): ClientEnv {
  const leaked = findServiceRoleShapedPublicValues(source);
  if (leaked.length > 0) {
    throw new ClientEnvError(
      leaked,
      "Refusing to use a service-role-shaped value in a public (NEXT_PUBLIC_*) variable. The " +
        "service-role key bypasses Row Level Security and is a server-only secret; anything named " +
        "NEXT_PUBLIC_* is inlined into the browser bundle.",
    );
  }

  const candidate = {
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };

  const result = clientEnvSchema.safeParse(candidate);
  if (result.success) return result.data;

  throw new ClientEnvError(
    result.error.issues.map((issue) => String(issue.path.join(".") || "(root)")),
    "Invalid public environment configuration. Fix every variable listed below:",
  );
}

/**
 * Reads and validates the public environment from `process.env`.
 *
 * Not memoized, for the same reason as `getServerEnv`: a cached parse would freeze a
 * misconfiguration at first import and make the failure the hardest one to diagnose.
 */
export function getClientEnv(): ClientEnv {
  return parseClientEnv(process.env as Record<string, unknown>);
}
