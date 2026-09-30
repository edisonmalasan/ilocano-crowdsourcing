# Design

## Context

The public site is English-only and has no locale infrastructure. This change adds
an `ENG | FIL` switcher as **presentation-only, browser-local state**. The full
derivation is in `proposal.md`; this document records the decisions a reader would
otherwise have to reverse-engineer, and the one that is genuinely contested.

## Goals / Non-Goals

**Goals**

- A validator can switch the interface between English and Filipino, and the
  choice survives navigation and later visits.
- The first paint is already in the right language, with a correct `<html lang>`.
- A missing or unrecognised locale degrades to English rather than to an error.
- Nothing that is research data, machine-readable, or Ilocano is ever localized.

**Non-Goals**

- No i18n routing, no locale-prefixed URLs, no middleware.
- No persistence of the locale to the research database.
- No localized copy for screens that do not exist yet.
- No inference, storage, or display of any proficiency conclusion derived from
  the locale.

## Decisions

### D1 — A cookie, not `localStorage` — and the anonymity argument does *not* transfer

This is the contested decision, and the repository has already made the opposite
call once. `src/lib/validators/browser-identity.ts` rejects a cookie for the
anonymous validator identifier, and states why:

> It would also transmit the identifier to the server on *every* request to this
> origin, which is a worse fit for a project whose headline property is anonymity
> than a value that leaves the browser only when the participant asks to resume.

That reasoning is sound and it is **specific to a sensitive value**. A locale
cookie carries `en` or `fil` and nothing else. It is not an identifier, reveals
nothing about a participant, and cannot be joined to a response because no
response ever records it. So the anonymity argument does not apply, and treating
this change as inconsistent with D2-in-that-file would be cargo-culting a rule to
a case it was not written for.

What the cookie buys is the thing `localStorage` explicitly gave up: the server
can read the locale, so the page renders in the right language on the **first
paint**. With `localStorage`, the server must render English, and a client effect
swaps it after hydration. For a validator on a slow mobile connection that is a
visible flash of the wrong language on every navigation — the same concern that
made this repository choose `display: "swap"` for its webfonts, and for the same
reason. For a research instrument, a validator seeing the interface change
language under them is a bad look and, worse, a hint that something is being
recorded.

The switch is written by a **Server Action**, so the locale write is
server-authoritative like every other write here, and the cookie can be set with
`httpOnly`, `sameSite: "lax"`, and a bounded `maxAge`. It is explicitly **not**
sensitive, so `httpOnly` is about tidiness rather than secrecy.

### D2 — English by default, and the resolver never throws

`resolveInterfaceLocale(unknown): InterfaceLocale` returns English for anything
that is not exactly one of the two approved locales — absent, empty, tampered,
from an older version, or hand-edited in devtools.

It does not throw and does not warn. A presentation preference is not worth an
error boundary, and a validator who arrives with a corrupt cookie must still get
a working page. The alternative — throwing on an unrecognised value — would make
a stale cookie a hard failure on every page of a research instrument, which is
the wrong trade for a preference that has a sensible default.

### D3 — The copy catalog is exhaustive **by type**, so a missing Filipino string cannot ship

The failure mode for a copy catalog is a key that exists in English and not in
Filipino. Then the Filipino interface silently shows English for that string, and
nothing fails: no test, no type error, no build error. A validator reads a
half-localized page and the research instrument looks unfinished.

The fix is to make the catalog's *type* carry the guarantee rather than a test.
The English catalog defines the key set; the Filipino catalog is typed
`Record<keyof typeof english, string>`. Adding an English key without a Filipino
string is then a **`pnpm run typecheck` failure**, and a typo'd Filipino key is
too. This is the same lesson as the `AllocationRequest` key-set pin, and for the
same reason: **absence is not observable at runtime, so the pin belongs at the
layer that can see a key which does not exist yet.**

A test still checks that no Filipino string is empty or identical to the English
one for keys that are genuinely the same in both languages — the type cannot catch
a copy-paste that leaves English in the Filipino catalog, and a validator would
read that as a bug in the tool.

### D4 — Localization must never reach the synthetic dataset, and that is a requirement not a comment

The catalog makes it *convenient* to localize a string. That is the whole danger.
The synthetic Ilocano instruction is the research material; a localized rendering
of `OD_0001` in a validator-facing surface would be a modified dataset entry
displayed as if authoritative.

The mitigation is threefold and none of it is "be careful":

1. **The Ilocano dataset is never a catalog key.** The instruction is read from
   `dataset_entries.instruction` and rendered as-is. There is no path from a
   dataset string to a translation lookup, so there is nothing to get wrong.
2. **Machine-readable values are never catalog keys.** Only *labels* are. The
   screening choices already separate `value` from `label`, and the stored
   `fluent` / `correct_natural` is what the research record holds.
3. **A scenario states it**, so a future change that wires the instruction
   through the catalog fails the spec review rather than passing a code review
   nobody re-reads.

### D5 — No i18n routing; the public URLs do not change

`/en/`, `/fil/`, or `Accept-Language`-driven redirects are the standard Next.js
approaches. All three are rejected here.

Routing changes **every public URL of a research instrument** for presentation
reasons alone, and a link already in a validator's browser, in a consent form, or
in a printed instruction would break. `Accept-Language` is a weak and noisy
signal for this population — a Filipino-preferring validator on an English
browser would be shown English by default, which is precisely the case the
feature exists to serve.

The cookie achieves the same result with no URL change, no middleware, and no
redirect to lose a POST.

### D6 — Scope is the four routes that exist

The roadmap lists a long list of surfaces, most of which are Phase 5 screens that
do not exist yet. This change localizes what exists — `layout`, `/`, `/start`,
`/ready`, not-found — and establishes the catalog that Phase 5 will extend.

The alternative, writing copy keys for screens with no markup, would produce
strings nothing renders and nothing tests, which is the dead weight the repository
keeps recording as a failure mode.

### D7 — The locale is never persisted to the research database

Not deferred, not "for a future methodology": **no**, and the spec says so.

The reason is not privacy theatre. A stored locale is a variable sitting next to
research responses, and someone will eventually correlate it. The roadmap's own
warning is the strongest argument available: *do not infer that a Filipino
interface indicates lower English proficiency*. A column makes that inference one
query away; its absence makes it require deliberately re-adding it, which is a
moment where someone can be asked not to.

## Risks / Trade-offs

- **A cookie is state on a research instrument.** Mitigated by D5: the URL never
  changes, the cookie is not sensitive, and clearing it returns the site to
  English with no other effect.
- **A stale cookie from a future version** is handled by D2 — unknown values fall
  back to English rather than erroring.
- **A copy-paste leaving English in the Filipino catalog** is not catchable by the
  type, and is caught by a test instead. Recorded as a known limit of D3 rather
  than presented as fully solved.
- **The exhaustive catalog is a compile-time cost** proportional to the number of
  keys. Irrelevant at this size, and it is the mechanism that makes D3 work.

## Migration Plan

None. No database change, no data migration, no deployment step. The change adds
a cookie, a catalog, and localized copy.

## Open Questions

None blocking. One recorded for the thesis team rather than decided here:

Whether a future approved methodology should record the interface locale as
research metadata. The recommendation is **no**, for the reason in D7, and this
change implements that recommendation rather than leaving a placeholder column.
If a future methodology does require it, that is a new spec delta against
`research-schema`, not an extension of this capability.
