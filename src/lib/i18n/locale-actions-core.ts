import "server-only";

import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@/lib/domain/locale";
import { z } from "zod";

/**
 * The interface-locale Server Action's core - the testable half.
 *
 * ============================================================================
 * WHY THE CORE IS SEPARATE FROM THE `"use server"` WRAPPER
 * ============================================================================
 * The same split as `allocation-actions-core.ts` and `onboarding-actions-core.ts`, for the same
 * reason: a file marked `"use server"` may only export async functions, and it may only import
 * server-only modules, so the decisions that matter cannot be exercised without a Next.js runtime
 * and a request scope. Here they are a plain function over an injected dependency, and every claim
 * in this header is verifiable in this repository with no deployment and no credential.
 *
 * ============================================================================
 * WHAT THE INTENT SCHEMA IS FOR
 * ============================================================================
 * The submitted value arrives from the network, so a caller who edited the request can send
 * anything: no `locale` at all, `locale=fil` twice, `locale` set to a file, or a third key the form
 * does not own. `z.enum(INTERFACE_LOCALES)` is derived from the approved locale list in the domain
 * module, so the set of accepted values has exactly one definition in the repository, and
 * `strictObject` means a payload carrying anything besides `locale` is refused rather than stripped.
 *
 * A refusal is reported as `invalid` and NOTHING IS WRITTEN - not the cookie, and emphatically not
 * a database row, because there is no repository in this dependency interface for one to reach.
 *
 * ============================================================================
 * THE DEPENDENCY INTERFACE IS THE PROOF THAT THE LOCALE IS NOT RESEARCH DATA
 * ============================================================================
 * `LocaleChangeDependencies` has EXACTLY ONE member, and it writes a cookie. There is no
 * repository, no client, and no environment to reach, so "the locale is never written to the
 * research database" is not a promise made in a comment: it is unrepresentable.
 *
 * That is why the guarantee is pinned as an EXACT KEY SET rather than asserted by a test. A test
 * that counted repository calls would only observe today's call graph, and the mutation that breaks
 * the guarantee is precisely the one that adds a repository to this interface - at which point
 * every behavioural assertion written against the current graph is still green. The compiler is the
 * layer that can see a member which does not exist yet, which is why
 * `tests/unit/locale-actions-core.test.ts` carries a `KeySetIsExactly` assertion and a
 * `@ts-expect-error` control for it. Adding a second member - whatever it is called - fails
 * `pnpm run typecheck`.
 *
 * This is the same mechanism as the `AllocationRequest` key-set pin recorded in
 * `tests/unit/domain-types.test.ts`, and for the same reason: absence is not observable at runtime.
 *
 * ============================================================================
 * WHY THERE IS NO `not_configured` OUTCOME HERE
 * ============================================================================
 * `allocation-actions-core.ts` maps a missing database to `not_configured`, because every one of
 * its operations needs a database. THIS ACTION NEEDS NO DATABASE, and the consequence is that
 * `LocaleChangeOutcome` has no persistence-shaped variant at all - the union is `changed` or
 * `invalid`, and there is no third name for a failure to write to a research record because there
 * is no research record to fail to write to.
 *
 * A parallel reason for keeping it that way: adding a `ServerEnvError` branch here, for symmetry
 * with the other cores, would be an unreachable one. Nothing in the locale write path reads the
 * environment, so the branch could never fire; and calling `getServerEnv()` from this path to
 * make it reachable would break the switcher in every deployment without database credentials -
 * which is this one - for a language preference. A presentation preference must never be able to
 * fail, and a code path that cannot execute is dead weight that a reader has to reason about.
 */

/**
 * What a locale-change request may contain.
 *
 * `strictObject` rather than a bare `z.enum` on the field, so the CONTRACT under test is a whole
 * request and a payload that grew a second field is refused. That is the same reasoning as the
 * allocation intent: a silently stripped field looks, from the outside, exactly like a successful
 * request whose extra values happened not to matter.
 */
const localeChangeIntentSchema = z.strictObject({
  locale: z.enum(INTERFACE_LOCALES),
});

/**
 * The locale change's entire dependency surface.
 *
 * Deliberately a single member. See "THE DEPENDENCY INTERFACE IS THE PROOF" above: this is where
 * the guarantee that the locale never reaches the research database is made unrepresentable rather
 * than merely documented.
 */
export interface LocaleChangeDependencies {
  /** Writes the locale cookie. The only effect a locale change is allowed to have. */
  setInterfaceLocaleCookie: (locale: InterfaceLocale) => Promise<void>;
}

/**
 * What happened, in a shape a caller can act on.
 *
 * `changed` carries the locale that was actually written, so a caller can log or revalidate from
 * the value the schema approved rather than the value the request claimed. `invalid` carries a
 * reason and nothing else - in particular no locale, so there is no way for a rejected request to
 * leave a value anywhere.
 */
export type LocaleChangeOutcome =
  | { readonly status: "changed"; readonly locale: InterfaceLocale }
  | { readonly status: "failed"; readonly reason: "invalid" };

/**
 * Changes the interface locale from an untrusted payload.
 *
 * The payload is re-parsed with the shared write-intake boundary BEFORE the cookie writer is
 * called, so a rejected request cannot write anything. That is not taken on trust from this
 * comment: a test calls the core with a payload carrying a third key and a non-locale value and
 * asserts the cookie writer was never invoked.
 *
 * A throw that is not a `WriteIntentError` propagates rather than being reported as a rejected
 * request, because it would be a bug in the schema or the writer and reporting it as `invalid`
 * would tell an operator the participant sent something wrong.
 */
export async function runChangeInterfaceLocale(
  raw: unknown,
  deps: LocaleChangeDependencies,
): Promise<LocaleChangeOutcome> {
  let intent: z.output<typeof localeChangeIntentSchema>;
  try {
    intent = parseWriteIntent(localeChangeIntentSchema, raw, { schemaName: "localeChangeIntent" });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  await deps.setInterfaceLocaleCookie(intent.locale);
  return { status: "changed", locale: intent.locale };
}
