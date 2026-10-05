# Design

## Context

Post-CHANGE-1 inventory (measured with `git grep`, classified by hand): 2,195 U+2014 lines across `src/`/`tests/`/`scripts/`/`supabase/`/`data/`, of which 28 render to users — 20 `src/lib/i18n/copy.ts` catalog values, 5 researcher review literals, 3 researcher overview sentences. The 2 site-title values are the intentional exception. The dataset holds zero U+2014. Everything else is developer comments, docs, migrations, archived history, or test text, and is out of scope by design: a repo-wide replace would churn hundreds of unrelated lines.

## Goals

- Zero U+2014 in rendered product copy except the two site titles.
- Each rewrite reads as written by a person: short, ordinary words; no verbose workaround that trades one AI-looking habit for another.
- Meanings, key sets, sentence counts, and all existing copy guards stay exactly as specified (the `humanize-interface-copy` constraints still hold).
- A guard makes reintroduction fail.

## Non-goals

- No comment/docs/migration/history rewrite; no methodology, export, database, or research-data change; no Supabase work.

## Decisions

### D1: Rewrite by hand, per string, not by rule

A mechanical `—` → `-` (or `,`/`.`) pass produces awkward prose (`Finish here, then start a new one - nothing you...`). Each of the 28 sites gets its own rewrite below. The pattern is still simple: a mid-sentence break becomes a period (two sentences) where the halves stand alone, a comma where the second half narrows the first, and a colon where the second half explains the first (the two translation descriptions).

### D2: The exact rewrites

Catalog EN:
- `start.lead`: `…research record — it is not a score…` → `…research record. It is not a score…`
- `start.beforeAnswer.item1`: `…close the tab — nothing is saved…` → `…close the tab. Nothing is saved…`
- `validateStart.exhausted`: `…people. Thank you — there is nothing…` → `…people. Thank you. There is nothing…`
- `validateStart.screeningRequired`: `…answer it — nothing you have already submitted…` → `…answer it. Nothing you have already submitted…`
- `validation.translation.english.description`: `…into English — your correction…` → `…into English: your correction…`
- `validation.translation.filipino.description`: `…pangungusap — ang iyong correction…` → `…pangungusap: ang iyong correction…`
- `validation.failure.persistence`: `…nothing is lost — try again…` → `…nothing is lost. Try again…`
- `validate.finished.finishNote`: `…browser session — to take part again…` → `…browser session. To take part again…`
- `validate.finished.failure.screeningRequired`: `…start a new one — nothing you already submitted…` → `…start a new one. Nothing you already submitted…`

Catalog FIL:
- `start.lead`: `…talaan ng pananaliksik — hindi ito iskor…` → `…talaan ng pananaliksik. Hindi ito iskor…`
- `start.beforeAnswer.item1`: `…ang tab — walang nase-save…` → `…ang tab. Walang nase-save…`
- `ready.notStarted.body`: `…bilang validator — walang paraan…` → `…bilang validator. Walang paraan…`
- `validateStart.exhausted`: `…ngayon. Salamat — wala nang…` → `…ngayon. Salamat. Wala nang…`
- `validateStart.screeningRequired`: `…sagutin ito — walang naaapektuhan…` → `…sagutin ito. Walang naaapektuhan…`
- `validation.translation.english.description`: `…na Ilocano — ang pagwawasto mo…` → `…na Ilocano: ang pagwawasto mo…`
- `validation.translation.filipino.description`: `…na pangungusap — ang iyong pagwawasto…` → `…na pangungusap: ang iyong pagwawasto…`
- `validation.translation.choice.hint`: `…o laktawan — walang mawawala…` → `…o laktawan. Walang mawawala…`
- `validation.failure.persistence`: `…kaya walang nawala — subukan mong…` → `…kaya walang nawala. Subukan mong…`
- `validate.finished.finishNote`: `…session na ito — para makilahok muli…` → `…session na ito. Para makilahok muli…`
- `validate.finished.failure.screeningRequired`: `…ng bagong pagsubok — walang naaapektuhan…` → `…ng bagong pagsubok. Walang naaapektuhan…`

Researcher review (`entry-review.tsx`):
- `REASON_COPY.unevaluable`: `Marked cannot confidently evaluate — abstentions…` → `Marked cannot confidently evaluate. Abstentions…`
- Three `?? "—"` absent-field placeholders → `?? "None"`.
- `` ` — ${reason}` `` suffix → `` `: ${reason}` ``.

Researcher overview (`overview.tsx`):
- `…counts here — including ones…` → `…counts here, including ones…`
- `…not a score — nothing here ranks…` → `…not a score. Nothing here ranks…`
- `…was submitted — never over translation…` → `…was submitted, never over translation…`

### D3: Guard shape

Extend the locale-copy guard surface (not a whole-repo grep): assert over both catalogs' values that no value except the two `meta.siteTitle` entries contains U+2014, and assert over the non-catalog literals (review reason copy, placeholder, overview sentences) via a closed enumeration of the files that render them. A changed comment must not fail this guard. The site titles are asserted byte-identical in both languages.

### D4: What is deliberately left alone

- Env/server error formats (`admin/env.ts`, `env/server.ts`): operator diagnostics, not product copy; changing them would alter log shapes tests pin.
- All comments, docs, migrations, archived OpenSpec history, dataset (zero U+2014, stays byte-identical).

## Risks / trade-offs

- Tests asserting the old wording (F) must move to the new wording; each update is reviewed as a copy change, never a weakening.
- Filipino rewrites keep sentence counts and meanings; the bilateral research-material guard re-proves no instruction leaked in.

## Open questions

- None.
