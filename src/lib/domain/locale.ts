/**
 * The interface locale: the two approved languages the public validator site is presented in.
 *
 * ============================================================================
 * WHAT "INTERFACE LOCALE" MEANS HERE, AND WHAT IT CANNOT MEAN
 * ============================================================================
 * The word "translation" already means something else in this repository, and the two meanings
 * are kept strictly apart:
 *
 *   - a RESEARCH TRANSLATION is validator-authored data. Every evaluable validation carries an
 *     English and a Filipino rendering of the Ilocano sentence that was judged, stored on the
 *     validation record, and part of the research dataset.
 *   - the INTERFACE LOCALE is presentation state. It changes what a participant READS and nothing
 *     else. It is held in the participant's browser and is never written to the research database.
 *
 * The locale never touches research data, Ilocano text, place names, dataset identifiers, or any
 * machine-readable value. Those rules belong to the `interface-localization` spec, and the code
 * that enforces them lives with the copy catalog and the routes - but this module is the one
 * place that would have to change if a THIRD language were ever approved, so it is the place the
 * "two, and only two" claim is pinned.
 *
 * ============================================================================
 * WHY THE RESOLVER NEVER THROWS
 * ============================================================================
 * `resolveInterfaceLocale` takes `unknown` and returns one of the two approved values, for
 * everything else returning English. The rejected alternative is throwing on an unrecognised value.
 *
 * Throwing would be defensible if the value were trustworthy input. It is not: this function is
 * the reader for a cookie that a participant can edit in devtools, that a future version of the
 * site might rename, and that a shared or restored session might carry a value this build has
 * never heard of. A stale cookie would then be a hard failure on EVERY page of a research
 * instrument, for a preference that has an obviously correct default. Trading a working English
 * page for a thrown error is the wrong trade every time, which is why the resolver is total.
 *
 * It also does not warn. A presentation preference is not worth an error boundary, and a warning
 * in a server render is either invisible or noise on every single request.
 *
 * ============================================================================
 * WHY ENGLISH IS THE DEFAULT RATHER THAN THE BROWSER'S LANGUAGE
 * ============================================================================
 * `DEFAULT_INTERFACE_LOCALE` is English because the participant population is the reason this
 * feature exists, not an argument against it. A Filipino-preferring participant on an English
 * browser is precisely the case the switcher serves, so inferring from `Accept-Language` would
 * show that person English by default - the outcome the feature was built to avoid. See
 * `design.md` D5 for why there is no locale-prefixed routing either.
 *
 * ============================================================================
 * WHY THIS MODULE IMPORTS NOTHING
 * ============================================================================
 * Same standard as `@/lib/domain/allocation`: the locale is needed by a Server Component, a
 * Server Action, a client component, and a plain test, and it must not drag Zod, `next/headers`, or
 * `server-only` into any of them. The two approved locales are therefore plain literals here, and
 * the Zod schema that guards the Server Action is declared over them in the action's core rather
 * than in this file.
 *
 * ============================================================================
 * WHY THE LOCALE IS NOT A BRANDED TYPE
 * ============================================================================
 * `InterfaceLocale` is a string union, so a `string` from a cookie cannot be assigned to it without
 * going through `resolveInterfaceLocale` - which is exactly the property wanted, and is why the
 * resolver's parameter is `unknown` rather than `string`. A branded type would additionally stop a
 * caller from writing `resolveInterfaceLocale` over an unrelated string with no complaint, at the
 * cost of a cast at the one boundary that must accept anything. The union is the smaller, clearer
 * trade, and it matches how `DatasetEntryId` is a plain `string` in this repository.
 */

/**
 * The two approved interface locales.
 *
 * Closed on purpose. Adding a third language is a research- and translation-budget decision, not
 * something a contributor does by appending to a list, and `INTERFACE_LOCALES` is what both the
 * copy catalog and the Server Action's write-intake schema are derived from - so this tuple is the
 * single place that would have to be edited, and the Zod enum fails to compile against a key the
 * catalog has not been given a string for.
 *
 * These are BCP 47 language subtags and they are also what `<html lang>` receives, because the
 * document must declare the language actually being rendered or a screen reader pronounces
 * Filipino text with English phonetics.
 */
export const INTERFACE_LOCALES = ["en", "fil"] as const;

/** One of the two approved interface locales. */
export type InterfaceLocale = (typeof INTERFACE_LOCALES)[number];

/**
 * The locale used for a browser or session that has expressed no preference.
 *
 * A named constant rather than a literal at each call site, so that "English" has exactly one
 * definition and the context default, the cookie reader, and every test agree on it.
 */
export const DEFAULT_INTERFACE_LOCALE: InterfaceLocale = "en";

/**
 * Narrows an arbitrary value to an approved interface locale.
 *
 * The `typeof` guard is load-bearing rather than defensive noise: it means a value that merely
 * *stringifies* to `"fil"` - an object with a `toString`, a `String` wrapper, an array of one
 * element - is not accepted. Only a real string that is exactly one of the two approved values is.
 *
 * `includes` is safe here on a literal tuple: no prototype lookup is involved, so `"constructor"`
 * or `"toString"` are rejected like any other unapproved value rather than hitting `Array`
 * prototype members. There is a test that says so by value.
 */
export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  if (typeof value !== "string") return false;
  return (INTERFACE_LOCALES as ReadonlyArray<string>).includes(value);
}

/**
 * Resolves any value to an approved interface locale, defaulting to English.
 *
 * TOTAL BY CONTRACT. There is no input this throws on, and there is no input for which it returns
 * anything other than one of the two approved values. That is the whole reason it exists rather
 * than a `z.enum(...).safeParse(...)` at each call site: one total function, so the "a stale cookie
 * cannot break a page" property has a single owner and can be asserted exhaustively.
 *
 * Accepted unchanged: an absent value, an empty string, an unrecognised language, a value from a
 * future version, a value hand-edited in devtools, and a non-string. All of them resolve to
 * `DEFAULT_INTERFACE_LOCALE`.
 */
export function resolveInterfaceLocale(value: unknown): InterfaceLocale {
  return isInterfaceLocale(value) ? value : DEFAULT_INTERFACE_LOCALE;
}
