import "server-only";

import { z } from "zod";

/**
 * The researcher-area environment contract.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE SCHEMA AND NOT PART OF `serverEnvSchema`
 * ============================================================================
 * `src/lib/env/server.ts` requires all three of its variables, and `getServerEnv()` is called by
 * allocation, validation submission, and batch recovery — every one of them a PUBLIC validator path.
 * Adding the two admin variables there as required members would fail every public request in any
 * environment without a researcher credential, which today means every environment, including the
 * one a pilot would be run from. A security feature that takes the public site down when it is not
 * configured has failed closed in the wrong direction: the requirement here is that a missing admin
 * credential degrades the ADMIN area and nothing else.
 *
 * So this contract is separate and it does not THROW. It resolves to a refusal, because "not
 * configured" is not an exceptional condition for a deployment that has no researcher area yet — it
 * is the shipped default (see `.env.example`, where both variables are deliberately empty).
 *
 * ============================================================================
 * WHAT A CONFIGURATION PROBLEM MAY SAY
 * ============================================================================
 * Never a value, and never a fragment of one. These messages reach an operator's console and, in a
 * hosted deployment, a log aggregator, so they are safe to log only if they cannot carry the secret
 * they are complaining about. `tests/unit/admin-env.test.ts` asserts that a supplied value appears
 * nowhere in the message — including no fragment long enough to BE one, because a message that
 * echoed four characters of a 43-character secret would still have narrowed it.
 */

/** The variable holding the comma-separated operator credential set. */
export const ADMIN_OPERATOR_SECRETS = "ADMIN_OPERATOR_SECRETS";

/** The variable holding the session-integrity secret. Never an operator credential (D2). */
export const ADMIN_SESSION_SECRET = "ADMIN_SESSION_SECRET";

/** Both variables, in the order they are reported. Closed, so a caller cannot miss one. */
export const ADMIN_ENV_VARIABLE_NAMES = [ADMIN_OPERATOR_SECRETS, ADMIN_SESSION_SECRET] as const;

/**
 * The wording for a present-but-blank variable.
 *
 * It is deliberately the SAME string whether the key is missing or holds whitespace, because the
 * spec requires a blank value to be refused "exactly as if the variable were absent". Two different
 * messages would let a deployment with `ADMIN_OPERATOR_SECRETS=` be told apart from one with no such
 * variable at all, which is a distinction about a secret's configuration that no operator error
 * needs to carry.
 */
const ABSENT = "is absent, empty, or only whitespace. A blank value counts as absent.";

/**
 * The two raw strings, validated as one object.
 *
 * All the rules live in a single `superRefine` rather than a chain of `.min()`/`.refine()` calls. A
 * chain runs every refinement and collects every failure, so an absent credential set would report
 * both "is absent" and "entry 1 is blank" — two problems for one variable, one of them misleading,
 * and neither matching the requirement that a blank value be refused exactly as an absent one.
 */
export const adminEnvSchema = z
  .object({
    [ADMIN_OPERATOR_SECRETS]: z.string(),
    [ADMIN_SESSION_SECRET]: z.string(),
  })
  .superRefine((candidate, ctx) => {
    const set = candidate[ADMIN_OPERATOR_SECRETS].trim();
    const secret = candidate[ADMIN_SESSION_SECRET].trim();

    if (set === "") {
      ctx.addIssue({ code: "custom", path: [ADMIN_OPERATOR_SECRETS], message: ABSENT });
    } else {
      const entries = splitCredentialSet(set);
      entries.forEach((entry, index) => {
        if (entry === "") {
          // The POSITION is named, never the value: there is no value to name, and the position is
          // what tells an operator which comma to delete.
          ctx.addIssue({
            code: "custom",
            path: [ADMIN_OPERATOR_SECRETS, index],
            message: `entry ${index + 1} is blank. Every entry must be a non-blank credential.`,
          });
        }
      });
      if (secret !== "" && entries.includes(secret)) {
        // Required by the spec's own scenario "The session-protection secret is not an operator
        // credential", and enforced rather than documented: a shared value would make a captured
        // session forgeable by anyone who also holds an operator credential.
        ctx.addIssue({
          code: "custom",
          path: [ADMIN_SESSION_SECRET],
          message: `must differ from every entry in ${ADMIN_OPERATOR_SECRETS}.`,
        });
      }
    }

    if (secret === "") {
      ctx.addIssue({ code: "custom", path: [ADMIN_SESSION_SECRET], message: ABSENT });
    }
  });

/** Splits the credential set on commas and trims each entry. Ordinals are positions (D3). */
function splitCredentialSet(set: string): string[] {
  return set.split(",").map((entry) => entry.trim());
}

/** A researcher area that can actually be entered: at least one credential and a secret. */
export interface ConfiguredAdminEnv {
  /**
   * The operator credentials, in configuration order. The array is 0-based; the SESSION's key
   * identifier is 1-based (`ordinal`), so `operatorSecrets[ordinal - 1]`. Keeping the two bases
   * apart is deliberate and pinned by `tests/unit/admin-session.test.ts`, because collapsing them
   * would make the first credential's sessions resolve to the wrong operator after a removal.
   */
  readonly operatorSecrets: readonly string[];
  /** Protects session integrity. Never one of `operatorSecrets`. */
  readonly sessionSecret: string;
}

export type AdminEnvResolution =
  | { readonly status: "configured"; readonly env: ConfiguredAdminEnv }
  | { readonly status: "unconfigured"; readonly problems: readonly string[] };

/**
 * Resolves the researcher-area environment, aggregating every problem.
 *
 * Takes the source as an argument rather than reading `process.env`, so the whole contract is
 * testable without mutating the environment — which is what `resolveAdminEnv` being called from
 * `process.env` in production would otherwise force.
 *
 * NEVER THROWS. An unconfigured researcher area is a refusal, not an error, because the callers
 * are page guards whose correct response to "no credential configured" is to refuse the request
 * rather than to fail the whole application.
 */
export function resolveAdminEnv(source: Record<string, unknown>): AdminEnvResolution {
  const candidate = {
    [ADMIN_OPERATOR_SECRETS]: asString(source[ADMIN_OPERATOR_SECRETS]),
    [ADMIN_SESSION_SECRET]: asString(source[ADMIN_SESSION_SECRET]),
  };

  const parsed = adminEnvSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      status: "unconfigured",
      problems: parsed.error.issues.map((issue) => `${variableOf(issue.path)} — ${issue.message}`),
    };
  }

  const set = candidate[ADMIN_OPERATOR_SECRETS].trim();
  return {
    status: "configured",
    env: {
      operatorSecrets: splitCredentialSet(set),
      sessionSecret: candidate[ADMIN_SESSION_SECRET].trim(),
    },
  };
}

/** Renders an issue path as the variable it belongs to, or `(root)` for the object itself. */
function variableOf(path: readonly PropertyKey[]): string {
  const [head] = path;
  return typeof head === "string" && (ADMIN_ENV_VARIABLE_NAMES as readonly string[]).includes(head)
    ? head
    : "(root)";
}

/**
 * Coerces a candidate to a string.
 *
 * A non-string — `undefined`, a number written into an env file, a `null` — is reported as the empty
 * string, which the schema refuses with the absent wording. That is the right outcome and it keeps
 * the refusal identical to the absent case rather than inventing a message per type.
 */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The researcher-area environment as this process sees it, or `null` when it is not configured.
 *
 * The single place production code reads the two admin variables. Everything else takes a
 * `ConfiguredAdminEnv` as an argument, which is what lets the sign-in decision, the session
 * verifier, and the route guard be unit-tested with no environment at all.
 */
export function getAdminEnv(): ConfiguredAdminEnv | null {
  const resolution = resolveAdminEnv({
    [ADMIN_OPERATOR_SECRETS]: process.env[ADMIN_OPERATOR_SECRETS],
    [ADMIN_SESSION_SECRET]: process.env[ADMIN_SESSION_SECRET],
  });
  return resolution.status === "configured" ? resolution.env : null;
}

/**
 * The operator-facing description of a misconfiguration, for logs and for the refusal screen.
 *
 * Built from the resolution rather than from `process.env`, so it can never be constructed from a
 * value. It names variables only, which is what makes it safe to log.
 */
export function describeAdminEnvProblems(resolution: AdminEnvResolution): string {
  if (resolution.status === "configured") return "";
  return [
    "The researcher area is not configured, so every researcher request is refused:",
    ...resolution.problems.map((problem) => `  - ${problem}`),
    "No value of any variable appears above, so this is safe to log.",
  ].join("\n");
}
