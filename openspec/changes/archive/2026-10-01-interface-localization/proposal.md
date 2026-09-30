# Proposal

## Why

The public validator site is English-only. `src/app/layout.tsx` hardcodes
`lang="en"`, there is no locale infrastructure anywhere, and **no in-force spec
mentions interface localization at all** — searching all eight capabilities for
`locale`, `localization`, or `lang` returns nothing, and every hit for
`translation` is *research* translation.

That matters for who this is built for. The participants are people who are
comfortable in Ilocano, and the site asks them to read and judge Ilocano. A
Filipino-preferring participant who is also comfortable in English is fine; one
who is not has no way to participate at all. The roadmap calls this
**interface accessibility**, and the approved durable constraint is that
*research translations* and *interface localization* share the word
"translation" and nothing else.

The second reason is that this feature is unusually easy to build wrong in a way
that silently damages research data. The word "translation" already means
something else in this codebase: a **required, validator-authored, per-response
English and Filipino rendering of a validated Ilocano sentence**, stored as
research data. A localization feature that "translates" things, keyed on the same
word, in the same repository, is one careless edit away from mutating a stored
research value or localizing the synthetic dataset. So the change is scoped as
much by what it **must never touch** as by what it adds.

## What Changes

- **A pure locale domain** — `src/lib/domain/locale.ts`: the two approved
  locales, English as the default, and a resolver that accepts an unknown input
  and returns the default rather than throwing. A validator with a tampered or
  stale cookie must still get a working page.
- **An exhaustively typed copy catalog** — `src/lib/i18n/copy.ts`. Every key
  carries both an English and a Filipino string, and the type makes a missing
  Filipino string a **`pnpm run typecheck` failure** rather than an English
  string silently appearing in the Filipino interface.
- **A locale cookie, read on the server**, so the first paint is already in the
  right language and `<html lang>` is correct without a client round trip.
- **A Server Action** to change the locale, so the write is server-authoritative
  like every other write in this repository.
- **A locale switcher** in the header — an `ENG | FIL` control, placed by the
  design but consistently reachable and not dominating the task.
- **Localized copy for the four existing public routes** — `/`, `/start`,
  `/ready`, and the not-found page — plus the layout's skip link, document title,
  and description.
- **A new `interface-localization` capability** in `openspec/specs/`, stating
  both what localization covers and the six things it must never touch.

## What it must never touch

Stated as a requirement with scenarios, not as a comment, because this is the
part that can damage research data:

- the synthetic Ilocano dataset instruction;
- a validator's corrected Ilocano text;
- a validator's English or Filipino research-translation text;
- place names;
- dataset identifiers;
- machine-readable evaluation values;
- research records — the locale is **never** persisted to the research database.

The last one deserves emphasis. The switcher must not record a participant's
locale against their responses, and **nothing may infer a research conclusion
from it** — a Filipino interface does not indicate lower English proficiency.
Recording it would create a variable that invites exactly that inference later.

## The evaluation-label separation this change relies on

The screening choices already keep the machine-readable value and the human
label apart. `src/schemas/validator.ts` holds
`{ value: "fluent", label: "Fluent" }`, and its own comment records why: a
loop selecting `ILOCANO_PROFICIENCY_CHOICES[1].value` for every participant is
only possible because `"fluent"` never appears — the value arrives by property
access, invisible to anything that cannot see the label.

That means **localizing labels is already safe** and this change does not have to
invent the separation. It does have to keep it: the stored proficiency stays
`fluent` whether the interface shows *"Fluent"* or *"Madaling fluent"*, and the
stored evaluation stays `correct_natural` whether its label reads *"Correct and
natural"* or *"Tama ati natural"*.

## Impact

- Affected specs: **new capability `interface-localization`**. No existing
  requirement changes — no in-force spec mentions localization, so there is
  nothing to modify, and modifying a requirement that does not mention the
  subject would be a way to hide that fact.
- Affected code: `src/lib/domain/locale.ts` and `src/lib/i18n/*` (new),
  `src/app/layout.tsx`, the four public routes, and a new switcher component.
- No migration. **The locale is never written to the database**, so there is no
  schema change and nothing to refuse over.
- No change to the allocation, validation, dataset, or repository layers.
- Risk: the real risk is not a bug but a **category error** — a string that
  should have stayed Ilocano or machine-readable getting localized because the
  catalog made it convenient. The scenarios exist to make that a spec violation
  rather than a reviewer's memory.
- Explicitly **not** in scope: localizing copy for screens that do not exist yet
  (the per-entry validation experience is Phase 5 and will add its own keys
  through the same catalog), and the roadmap's open question of whether to
  persist locale, which this change answers **no** to.
