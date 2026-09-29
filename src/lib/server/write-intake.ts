import "server-only";

import { z } from "zod";

/**
 * Shared write-intake boundary.
 *
 * SERVER ACTIONS ARE NOT A SECURITY BOUNDARY. A Server Action's arguments arrive as data from the
 * network. The framework's argument handling gives type-safety inside the repo and nothing at all
 * against a caller who edited the request. So every write payload — screening, batch request,
 * validation submission, admin action — is re-parsed here with the SAME schema the client used,
 * BEFORE any repository is touched.
 *
 * This is one function rather than a per-action convention so the rule cannot be forgotten in one
 * place. The alternative — a well-meaning action that trusts its arguments — is exactly the failure
 * mode the data-access-boundary spec's "untrusted input is rejected before persistence" scenario
 * exists to prevent.
 *
 * It also cannot be forgotten to *use* the shared schema: the caller passes the schema in, so the
 * contract under test is the same object the UI validated against. One implementation of a rule
 * (see `@/schemas/validation`).
 */

/** One field-level reason a payload was rejected, already reduced to a form-attachable shape. */
export interface WriteIntentFieldIssue {
  /** Dotted/bracketed path to the offending field, for attaching the message to a form control. */
  readonly path: string;
  readonly message: string;
}

export interface WriteIntentErrorOptions {
  /** The original Zod failure, preserved for diagnostics. */
  readonly cause?: unknown;
  /** Name of the schema that rejected the payload, for logs. */
  readonly schemaName?: string;
}

export class WriteIntentError extends Error {
  readonly issues: readonly WriteIntentFieldIssue[];
  readonly schemaName: string | undefined;

  constructor(issues: readonly WriteIntentFieldIssue[], options: WriteIntentErrorOptions = {}) {
    const name = options.schemaName ?? "write intent";
    const listed = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join("\n");
    super(
      `Rejected ${name}: the submitted payload failed shared schema validation. ` +
        `No persistence operation was attempted.\n${listed}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "WriteIntentError";
    this.issues = issues;
    this.schemaName = options.schemaName;
  }

  /** Field issues grouped by path, which is the shape a form state reducer wants. */
  get fieldIssues(): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const issue of this.issues) {
      const existing = grouped[issue.path];
      if (existing) existing.push(issue.message);
      else grouped[issue.path] = [issue.message];
    }

    return grouped;
  }
}

export function isWriteIntentError(value: unknown): value is WriteIntentError {
  return value instanceof WriteIntentError;
}

export interface ParseWriteIntentOptions {
  /** Name used in the error message and in logs, e.g. `"validationResponseInput"`. */
  readonly schemaName?: string;
}

/**
 * Re-parses a write payload with its schema and returns the validated value.
 *
 * Throws `WriteIntentError` listing every offending field path — never a value, and never only the
 * first problem, so a form can show all of them at once. Callers MUST call this before invoking a
 * repository; a rejected payload must leave persistence untouched, which is what
 * `tests/unit/write-intake.test.ts` asserts by counting repository calls.
 *
 * `raw` is `unknown` on purpose. The parameter type is the claim that nothing about the payload can
 * be trusted before this function has run.
 */
export function parseWriteIntent<Schema extends z.ZodType>(
  schema: Schema,
  raw: unknown,
  options: ParseWriteIntentOptions = {},
): z.output<Schema> {
  const result = schema.safeParse(raw);

  if (result.success) return result.data;

  throw new WriteIntentError(
    result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message,
    })),
    { cause: result.error, schemaName: options.schemaName },
  );
}
