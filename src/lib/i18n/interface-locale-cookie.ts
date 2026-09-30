import "server-only";

import { cookies } from "next/headers";

import { resolveInterfaceLocale, type InterfaceLocale } from "@/lib/domain/locale";

/**
 * The interface locale cookie: the ONE piece of server-observable, per-browser state in this
 * project, and it holds a language tag.
 *
 * ============================================================================
 * WHY A COOKIE, WHEN `browser-identity.ts` REJECTS ONE
 * ============================================================================
 * `src/lib/validators/browser-identity.ts` deliberately stores the anonymous validator identifier
 * in `localStorage` and explains why a cookie would be worse there: a cookie would transmit the
 * identifier to the server on *every* request to this origin, which is a bad fit for a project
 * whose headline property is anonymity.
 *
 * That reasoning is sound and it is SPECIFIC TO A SENSITIVE VALUE. A locale cookie carries `en` or
 * `fil` and nothing else. It is not an identifier, it names nobody, it cannot be joined to a
 * response because no response ever records a locale, and clearing it costs a participant their
 * language preference and nothing else. Applying the anonymity rule here would be carrying a
 * principle to a case it was not written for. That reading is recorded in `design.md` D1, and
 * `browser-identity.ts` is NOT to be "fixed" to agree with this file.
 *
 * What the cookie buys is the thing `localStorage` gave up: the server can read the locale, so the
 * FIRST PAINT is already in the right language and `<html lang>` is right without a client round
 * trip. With `localStorage` the server must render English and a client effect swaps it after
 * hydration - a visible flash of the wrong language on every navigation, for a validator on a slow
 * phone. This is the same reasoning that made the webfonts use `display: "swap"`.
 *
 * ============================================================================
 * WHY THE WRITE IS SERVER-AUTHORITATIVE, AND WHY IT STILL NEVER REACHES A DATABASE
 * ============================================================================
 * The write goes through a Server Action like every other write in this repository, so the cookie
 * can be set with explicit attributes in one audited place rather than from a client component.
 *
 * The attributes, and why each is what it is:
 *
 *   - `httpOnly` - TIDINESS, NOT SECRECY. The value is not sensitive and this file says so
 *     explicitly. It is set anyway so the cookie cannot be read or written by script: a page that
 *     could rewrite the locale cookie could also rewrite it mid-render and report a locale the
 *     server never chose.
 *   - `sameSite: "lax"` - this cookie must travel on a top-level navigation back to the site, and
 *     nothing else. `strict` would be marginally tighter and would still work; `none` would send
 *     it cross-site on any request, which is exactly what this value does not need.
 *   - `maxAge` - BOUNDED, so the preference expires rather than becoming permanent state on a
 *     research instrument. One year is long enough that a returning participant is not asked
 *     again on every visit, and short enough that a borrowed or restored browser profile does not
 *     keep showing one person another's language for ever.
 *   - `path: "/"` - the preference applies to the whole site.
 *
 * NOT a database write, and that is the point rather than an omission. See `design.md` D7: a
 * stored locale is a variable sitting next to research responses, and someone will eventually
 * correlate it. Its absence makes the forbidden inference require deliberately re-adding a column,
 * which is a moment where somebody can be asked not to. This module therefore has NO persistence
 * dependency at all, and the Server Action's dependency interface has exactly one member for that
 * reason.
 */

/** The one cookie this module owns. Namespaced so it is unambiguous in a cookie inspector. */
export const INTERFACE_LOCALE_COOKIE_NAME = "sadino.interface-locale";

/** One year, in seconds. Long enough to be remembered; bounded so it is not permanent. */
export const INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The attributes the locale cookie is written with.
 *
 * `as const` is load-bearing rather than stylistic: without it `sameSite` widens to `string` and no
 * longer satisfies the cookie options type, so a typo in the value would be a type error only by
 * accident. `secure` follows the environment so local HTTP development is not left with a cookie
 * the browser silently refuses to store.
 */
export const INTERFACE_LOCALE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
} as const;

/**
 * The locale this request is in, resolved from the cookie.
 *
 * EVERY FAILURE RESOLVES TO ENGLISH rather than throwing, including the failure of the cookie API
 * itself. `resolveInterfaceLocale` handles an absent, empty, unrecognised, or tampered value, and
 * this function is the only thing standing between a hand-edited cookie and a page that cannot
 * render. `cookies()` is awaited inside a function rather than at module scope so importing this
 * file never touches a request, and a stale cookie from a future version degrades to English
 * instead of becoming a hard failure on every page of a research instrument.
 */
export async function getInterfaceLocale(): Promise<InterfaceLocale> {
  return resolveInterfaceLocale((await cookies()).get(INTERFACE_LOCALE_COOKIE_NAME)?.value);
}

/**
 * Writes the locale cookie.
 *
 * The single write path in the project, and the only function anywhere that stores a locale. It
 * takes an already-resolved `InterfaceLocale` rather than `unknown`, so a caller cannot put an
 * unvalidated value in the cookie in the first place - the write-intake schema in the action's core
 * is where an untrusted value is turned into one of the two approved locales.
 *
 * Async because `cookies()` is, so the Server Action's dependency interface stays honest: the core
 * awaits the write rather than firing it and reporting success before the cookie exists.
 */
export async function setInterfaceLocaleCookie(locale: InterfaceLocale): Promise<void> {
  (await cookies()).set(INTERFACE_LOCALE_COOKIE_NAME, locale, INTERFACE_LOCALE_COOKIE_OPTIONS);
}
