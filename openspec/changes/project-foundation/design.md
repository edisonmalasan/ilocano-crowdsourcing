# Design

## Context

See `proposal.md` for motivation and the spec deltas for behavior requirements.

Repository reality that shapes this design:

- The only executable artifact today is `data/ilocano-synthetic-data.json` (600 records,
  `OD_0001`–`OD_0600`). It is immutable reference material.
- No Supabase project, credentials, `docker`, `psql`, or `supabase` CLI exist on the developer
  machine. Migrations therefore cannot be applied or verified here yet.
- The approved stack is Next.js App Router + TypeScript + Tailwind + Zod + Supabase, deployed
  on Vercel, with no ORM.
- The visual direction is a **synthesis** of the repository's design skills, not any one of them
  verbatim. `industrial-brutalist-ui` supplies the structural language; `high-end-visual-design`
  supplies restraint and polish. Several directives in those skills contradict the roadmap and
  are overridden by it.

## Goals / Non-Goals

**Goals:**

- A repository whose `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:unit`, and `pnpm test:integration` commands have all been executed successfully at
  least once, and are recorded as such in `AGENTS.md`.
- Domain integrity rules expressed once, in pure, dependency-free TypeScript, that both the
  client and the server import — so a rule cannot be enforced in one place and skipped in
  another.
- A persistence seam that is provable in CI without a database, so later changes can test
  allocation and validation persistence for real.
- A design system whose tokens encode the research constraint that answer options must not look
  preferential.

**Non-Goals:**

- No database schema, no migration, no dataset import. Those are the next change.
- No screening, allocation, validation, or admin behavior. This change only establishes the
  contracts those behaviors will be written against.
- No authentication for researchers, no rate limiting, no observability.
- No shadcn/ui. It is "where useful", and its default neutral-token assumptions would need
  overriding by this design system anyway. Primitives are hand-built on the token set.
- No deployment configuration beyond what the build needs.

## Decisions

### D1 — Package manager: pnpm, with `packageManager` and `engines` pinned

`package.json` will pin `"packageManager": "pnpm@<exact version>"` and
`"engines": { "node": ">=24 <27" }`, and a `pnpm-lock.yaml` is committed.

Node 26.10.0 is what the developer machine runs; Vercel's supported range covers it. The range
is a range rather than an exact pin so a contributor on Node 24 LTS is not blocked, while the
`packageManager` field keeps every contributor on one package manager (satisfying the
"do not mix package managers" rule).

*Alternative considered:* npm, since it is bundled with Node. Rejected: pnpm is present on the
machine, produces a stricter and smaller lockfile, and its symlinked `node_modules` makes an
accidental mixed-manager install much easier to notice.

### D2 — Tailwind v4 with a `@theme` token block, no `tailwind.config.js`

Tailwind v4 is configured in CSS. The entire design system is a `@theme` block in
`src/styles/globals.css` that maps CSS custom properties to Tailwind utility names. Component
code therefore never contains a raw hex value, a raw pixel shadow, or a raw radius.

*Alternative considered:* shadcn/ui on Tailwind v3. Rejected — v3 token indirection plus
shadcn's default palette would produce two competing token systems, and the roadmap requires one
strict soft neo-brutalist language.

### D3 — The design system is an explicit, documented synthesis, not either skill verbatim

`industrial-brutalist-ui` alone yields: 90-degree corners, a dark terminal option, aviation-red
as the only accent, `clamp(4rem,…)` display type, halftone/CRT/grain post-processing, and ASCII
framing. The roadmap forbids all of those. `high-end-visual-design` alone yields: glassmorphism,
`backdrop-blur` shells, pill buttons, scroll-reveal choreography, and 2rem radii. That is not
neo-brutalism either.

The resolved system takes structure from the first and restraint from the second:

| Concern | Source | Resolution |
| --- | --- | --- |
| Borders | industrial | 2px solid ink border on every surface |
| Shadows | industrial | 4px/6px hard offset, zero blur, ink at full strength |
| Surfaces | industrial (light Swiss print arm) | warm cream, never dark |
| Corners | industrial (rejected: 0) | 12px card / 10px control — "slightly softened" |
| Accent | industrial (rejected: hazard red only) | single copper accent + muted sage/clay for real status only |
| Display type | industrial | `Archivo` heavy, tight tracking, used for headings only |
| Micro type | industrial | `JetBrains Mono`, uppercase, wide tracking, for metadata only |
| Body type | high-end (bans Inter/Roboto/Arial/Helvetica) | `Public Sans`, min 16px, 1.6 line-height |
| Spacing | high-end | 4px base scale, section padding 96–160px on desktop |
| Motion | high-end (rejected: scroll choreography, 700ms) | 120–180ms opacity/transform only |
| Texture | industrial (rejected: halftone/CRT) | single low-opacity paper-grain fixed overlay |

The design system is documented in `docs/DESIGN-SYSTEM.md` with the rationale, so the next
changes do not re-litigate it.

### D4 — Answer-choice neutrality is a token-level constraint

The `design-system` spec requires unselected answer options to be visually identical. This is
implemented by giving answer options a *dedicated* neutral token pair (`--answer-surface`,
`--answer-border`) and reserving `--accent` for `data-selected="true"`. A component that needs
to render an answer option therefore cannot reach an accent token in its default state. The rule
is documented on the primitive so it survives review.

### D5 — Domain rules live in `src/lib/domain` as pure functions over Zod-inferred types

`src/schemas/*` hold the wire contracts; `src/lib/domain/validation-response.ts` holds the
cross-field integrity rules expressed with `superRefine` over the same inferred type. The
integrity rules are *data*, not control flow, so they cannot be bypassed by calling a different
code path, and they are directly unit-testable.

*Alternative considered:* duplicating the rules in React form validation. Rejected: two
implementations of one research rule is precisely the failure mode `AGENTS.md` warns about.

### D6 — Persistence seam: interface + Supabase implementation + PGlite-backed tests

`src/lib/repositories/*.ts` export interfaces only. Implementations live in
`src/lib/repositories/supabase/*.ts` and are constructed by a single server-only factory.

`@electric-sql/pglite` runs real PostgreSQL compiled to WASM inside Node. Migration files in
`supabase/migrations/*.sql` are plain Postgres, so the *next* change's schema, its constraints,
and its partial indexes can be applied and asserted in CI with no Docker and no Supabase
account. The only thing PGlite cannot verify is Supabase-managed behavior (Auth, Storage,
Realtime, and the `auth` schema) — which is why no migration may depend on `auth.uid()`;
`auth.uid()` appears only inside RLS policies, which PGlite runs with a stub role.

This is the single most important decision in this change: it converts "we have no database"
from a blocker on the whole roadmap into a blocker on one deploy step.

*Alternative considered:* `pg-mem` in-memory Postgres emulator. Rejected — it is a partial
emulator that silently accepts invalid SQL, which would defeat the purpose of the harness.
*Alternative considered:* an in-memory hand-written repository fake. Rejected — it can only
prove the fake's behavior. It is still provided, but only for pure domain-service unit tests
where SQL is irrelevant.

### D7 — The server/client boundary is enforced by `server-only`, ESLint, and module layout

Three independent mechanisms, because `AGENTS.md` requires the boundary be a real trust
boundary rather than a convention:

1. `import 'server-only'` at the top of every module that reads a privileged credential or
   constructs a privileged client. This throws at build time on client import.
2. `eslint-plugin-boundaries` (or a local `no-restricted-imports` config) restricting
   `src/lib/supabase/server` and `src/lib/repositories/supabase` so `src/app` client modules
   and `src/components` cannot import them.
3. Browser access path in `src/lib/supabase/browser.ts` deliberately does not re-export the
   server or privileged constructors.

*Alternative considered:* relying on `server-only` alone. Rejected: it protects against runtime
import but produces a confusing bundler error; the lint rule names the violation and the file.

### D8 — Environment validation is a Zod module with a secret-safe client/server split

`src/lib/env/server.ts` parses `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and throws named errors. `src/lib/env/client.ts` exposes only
`NEXT_PUBLIC_*` values and asserts none of them is service-role shaped.

*Design note:* the anon key is public by definition (it ships to the browser), so it is not
treated as a secret. `SUPABASE_SERVICE_ROLE_KEY` is, and is server-only. `.env.example` carries
placeholders only.

### D9 — Testing stack: Vitest with two projects

One Vitest config with two projects: `unit` (node environment, no I/O) and `integration` (node
environment, boots PGlite per test file). Playwright is **not** added here — no product flow
exists yet, so there is nothing meaningful to drive. It is added in the change that first ships
a user flow, so no test is ever written against a UI that does not exist.

*Alternative considered:* Jest. Rejected: slower, and its ESM/TS story is weaker than Vitest's
for a Next.js App Router project.

### D10 — Server Actions for the product write path, Route Handlers only where a URL is needed

Server Actions are the default for validator intent (screening, start batch, submit
validation). They give argument validation, progressive enhancement, and no hand-written
serialization. Route Handlers are reserved for export downloads and any webhook-shaped need.

Server Actions are **not** a security boundary. Every Action re-parses its input with the same
Zod schema and re-derives authoritative state server-side; the `data-access-boundary` spec
requires exactly this.

## Risks / Trade-offs

- **[PGlite is not Supabase]** → It runs real Postgres, so schema, constraints, indexes,
  triggers, and transactional allocation logic are genuinely verified. It does not verify
  Supabase Auth, Storage, Realtime, RLS *as enforced by the Supabase API gateway*, or Vercel's
  runtime. Those are recorded as explicitly unverified in `AGENTS.md`, and the admin
  authorization change must include a check against a real project.
- **[No live Supabase yet]** → Migrations in the next change are written and applied against
  PGlite, but the first real `supabase db push` is unverified until the team provides a project.
  Recorded as a roadmap blocker, not silently skipped.
- **Tailwind v4 is newer than v3, so ecosystem familiarity is lower** → Mitigated by keeping the
  surface small (one `@theme` block, no plugins) and by verifying the production build.
- **`next/font` downloads fonts at build time** → A build without network access fails. Mitigated
  by using `next/font/google` with an explicit `fallback` and by recording this in `AGENTS.md`.
- **[A domain-rule bug would be silently encoded in the schema]** → Mitigated by an exhaustive
  unit-test matrix over all four evaluations crossed with correction present/absent and
  translation language present/absent, in `validation-response.test.ts`.
- **Hand-built primitives drift from accessibility expectations** → Mitigated by keeping the
  primitive count small and testing keyboard/label/contrast behavior, not just presence.

## Migration Plan

1. Land the scaffold on a feature branch; `main` keeps working (it is documentation-only today),
   so the change is revertible by reverting the merge commit.
2. No data migration: there is no database yet.
3. Rollback: revert the merge commit. `.env.example` and docs are inert; nothing persists.

## Open Questions

None that would change the specs, the approach, or the task breakdown. The items below are
recorded in the roadmap's `Project Status` and are **not** resolved by assumption:

- Which proficiency levels count toward the independent-validation target, and whether
  `Conversational` is eligible. The domain contract therefore stores proficiency as plain
  metadata and computes no eligibility flag; eligibility stays configurable for the allocation
  change.
- Final target count (planning default 3) and final batch size (default 10). Both are
  configuration, validated at the boundary with a hard upper bound, so the later value can
  change without a schema or code change.
