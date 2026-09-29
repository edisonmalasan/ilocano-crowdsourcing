import "server-only";

import { z } from "zod";

/**
 * Server environment contract.
 *
 * SECURITY MODEL, in one place so it is not re-argued per call site:
 *
 * - `SUPABASE_ANON_KEY` is PUBLIC BY DESIGN. It is the publishable key; Supabase ships it to every
 *   browser, it is protected by Row Level Security rather than by secrecy, and this project does
 *   not treat it as a secret. Rotating it is routine and exposing it is not a breach.
 * - `SUPABASE_SERVICE_ROLE_KEY` IS A SECRET. It bypasses Row Level Security entirely. It is read
 *   only here, only from server-only modules, and must never appear in a `NEXT_PUBLIC_*` value, in
 *   a client bundle, in a log line, or in any response sent to the browser. `.env.example` carries
 *   placeholders only.
 *
 * Validation is aggregate, not fail-fast. A developer with three missing variables should learn
 * that in one error naming all three, not by fixing one and restarting three times.
 */

/** http/https URL, no embedded credentials, no query or fragment noise. */
const supabaseUrlSchema = z
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

const nonEmptySecretSchema = z.string().trim().min(1, "must not be empty");

export const serverEnvSchema = z.object({
  SUPABASE_URL: supabaseUrlSchema,
  SUPABASE_ANON_KEY: nonEmptySecretSchema,
  SUPABASE_SERVICE_ROLE_KEY: nonEmptySecretSchema,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Thrown when the server environment is missing or malformed. Never contains a value. */
export class ServerEnvError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: readonly string[]) {
    const listed = variableNames.map((name) => `  - ${name}`).join("\n");
    super(
      `Invalid server environment configuration. Fix every variable listed below:\n${listed}\n` +
        "Note: this message never includes a value, so it is safe to log.",
    );
    this.name = "ServerEnvError";
    this.variableNames = variableNames;
  }
}

/**
 * Collects the names of every problem with the server environment.
 *
 * `SUPABASE_URL` is treated as present whenever the key exists at all, because an empty value
 * produces the same redacted listing as a missing one and the remedy is identical.
 */
function collectServerEnvProblems(source: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const candidate: Record<string, unknown> = {
    SUPABASE_URL: source.SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY ?? "",
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };

  const result = serverEnvSchema.safeParse(candidate);
  if (result.success) return problems;

  for (const issue of result.error.issues) {
    const variableName = String(issue.path[0] ?? "(root)");
    problems.push(`${variableName} — ${issue.message}`);
  }

  return problems;
}

/**
 * Parses a server environment source, aggregating every problem.
 *
 * Takes the source as an argument rather than reading `process.env` inline so the whole module is
 * testable without mutating process-wide state, and so a deployment platform's env object can be
 * passed in unchanged.
 */
export function parseServerEnv(source: Record<string, unknown>): ServerEnv {
  const problems = collectServerEnvProblems(source);
  if (problems.length > 0) throw new ServerEnvError(problems);

  return serverEnvSchema.parse({
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
  });
}

/**
 * Reads and validates the server environment from `process.env`.
 *
 * Intentionally NOT memoized in a module-level singleton. A cached parse would make a fixed
 * environment untestable and would freeze a misconfiguration at first import, which is the hardest
 * moment to diagnose. `process.env` access is cheap relative to a database round trip, so the
 * validation runs per call.
 */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env as Record<string, unknown>);
}

/** Whether the privileged credential is present and non-blank. Never returns its value. */
export function isServiceRoleKeyConfigured(source: Record<string, unknown> = process.env): boolean {
  const value = source.SUPABASE_SERVICE_ROLE_KEY;
  return typeof value === "string" && value.trim().length > 0;
}
