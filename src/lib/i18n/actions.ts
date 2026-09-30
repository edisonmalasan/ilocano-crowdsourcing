"use server";

import { revalidatePath } from "next/cache";

import {
  runChangeInterfaceLocale,
  type LocaleChangeDependencies,
  type LocaleChangeOutcome,
} from "./locale-actions-core";
import { setInterfaceLocaleCookie } from "./interface-locale-cookie";

/**
 * The public Server Action for the interface locale.
 *
 * ============================================================================
 * WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT
 * ============================================================================
 * This is the only place the interface locale is ever written, and it is a Server Action so the
 * write is server-authoritative like every other write in this repository. It builds one
 * dependency - the cookie writer - and delegates. Every decision lives in
 * `locale-actions-core.ts`, which takes its dependency as an argument and is therefore unit
 * tested with no request scope, no deployment, and no credential.
 *
 * What it does NOT do, and the absence is the feature: it never reads the server environment and it
 * never constructs a Supabase client. Neither the batch request action nor the onboarding actions
 * can say that, because both of them exist to write research data. A locale preference writes a
 * cookie and nothing else, so importing `@/lib/env/server` or `@/lib/repositories/supabase` here
 * would be a category error rather than a convention - and, in this deployment, which has no
 * Supabase credentials at all, it would mean the language switcher silently did nothing. The
 * dependency interface in the core has exactly one member, and it is the cookie writer.
 *
 * ============================================================================
 * WHY THE PAYLOAD IS NARROWED HERE RATHER THAN IN THE CORE
 * ============================================================================
 * A `<form>` wired to a Server Action receives a `FormData`, which is a transport shape rather than
 * a domain payload. This wrapper is the transport boundary, so it is where the one field the form
 * owns is lifted out and the rest is discarded. The core still re-validates what it is handed
 * through the shared write-intake boundary, because a Server Action's arguments are data from the
 * network and nothing about them is trustworthy before that runs.
 *
 * ============================================================================
 * WHY `revalidatePath` IS CALLED RATHER THAN TRUSTING THE AUTOMATIC REFRESH
 * ============================================================================
 * The switcher lives in the ROOT LAYOUT, and the action is submitted from a page below it. A
 * Server Action refreshes the current route when it completes, and a fresh request carries the new
 * cookie, so the layout would normally pick the change up on its own. Naming the layout explicitly
 * removes the reliance on that behaviour, and it matters here for a specific reason: the layout is
 * also where `<html lang>` is set, and a page that re-rendered in the previous language while
 * declaring the new one would be the exact "the interface changed under me" failure `design.md` D1
 * exists to prevent.
 */

/**
 * Builds the action's dependencies.
 *
 * The only dependency is the cookie writer, and it is built here rather than at module scope so
 * importing this file never reaches `next/headers`. There is no environment check to perform,
 * because there is nothing to configure.
 */
function actionDependencies(): LocaleChangeDependencies {
  return { setInterfaceLocaleCookie };
}

/** Logs the failure for the operator. Never rendered to a participant, and names no value. */
function logForOperator(message: string, detail: unknown): void {
  // No error-monitoring dependency exists yet. The detail is either a locale-tag rejection or a
  // thrown error from the cookie API, neither of which can contain a credential or research data:
  // the core only ever holds two approved language tags.
  console.error(`[sadino:locale] ${message}`, detail);
}

/**
 * Reads the submitted locale, changes it, and refreshes the layout so `<html lang>` and every
 * localized string agree with the cookie.
 *
 * ================================ WHY IT RETURNS `void` ================================
 * React types a `<form action>` as `(formData: FormData) => void | Promise<void>`, and the framework
 * discards whatever a form action resolves to. Returning the typed outcome here is therefore
 * unrepresentable at the only call site, and a `Promise<LocaleChangeOutcome>` is not assignable to
 * React's type - verified, not assumed: it is a `TS2322` at the `<form>`. The outcome is still what
 * this function branches on, and the branch is observable from outside: a change writes the cookie
 * AND revalidates, a rejection does neither. `tests/unit/locale-actions-wrapper.test.ts` asserts
 * exactly that pair of effects rather than an internal enum, which is the stronger claim because it
 * survives renaming the outcome.
 *
 * ============================ DEVIATION FROM `design.md` ============================
 * `tasks.md` 5.3 asks this wrapper to map a `ServerEnvError` to a typed outcome "as
 * `allocation-actions-core.ts` does". That clause is NOT implemented, deliberately. The batch
 * request action can produce a `ServerEnvError` because it needs a Supabase credential to do its
 * job; the locale path needs no credential and reads no environment, so such a branch would be
 * unreachable code introduced for the sake of symmetry. Worse, calling `getServerEnv()` here to
 * obtain one would BREAK the switcher in the current deployment, which has no Supabase credentials
 * configured at all - the participant would press "Filipino" and nothing would happen. A locale
 * preference with a working default must never be able to fail a page because an unrelated service
 * is unconfigured, so the deviation is the correct behaviour and not an omission.
 */
export async function changeInterfaceLocaleAction(formData: FormData): Promise<void> {
  let outcome: LocaleChangeOutcome;
  try {
    outcome = await runChangeInterfaceLocale(
      { locale: formData.get("locale") },
      actionDependencies(),
    );
  } catch (error) {
    // The only realistic cause is the cookie API refusing to write outside a request scope, which
    // is a defect rather than anything a participant did. Reported to the operator; the page is
    // simply unchanged, which is a safe outcome for a preference with a working default.
    logForOperator("the interface locale could not be changed", error);
    return;
  }

  if (outcome.status === "failed") {
    // A tampered or malformed value. Nothing was written, so the page keeps rendering in the
    // locale the cookie already named.
    logForOperator("the interface locale request was rejected", outcome.reason);
    return;
  }

  revalidatePath("/", "layout");
}
