# Design

## Context

`importDatasetEntries` parses and writes. It has no production caller, and `DatasetEntrySink` has no
production implementation — both measured by enumerating call sites, not inferred. The hosted
project has the schema and no data. This change connects the two.

Everything below was decided against a **measurement taken on this machine on 2026-10-03**, because
three of the four options available for "how does an operator run this" fail for reasons that are
only visible when you try them.

## Goals / Non-Goals

**Goals**

- Populate the hosted `dataset_entries` with all 600 source records, verifiably.
- Make "a re-run cannot rewrite an instruction" a property of the database, not of a caller's
  discipline.
- Keep the write unreachable from any HTTP request.
- Leave exactly one construction site for the privileged client.

**Non-Goals**

- A UI. No screen is added, and no existing screen changes.
- A dataset revision or migration story. Refusing is in scope; reconciling is not.
- Performance work on the importer. It runs once per dataset, by a person.

---

## D1 — The import is an operator command, and the existing comment is why

`dataset-entries.ts:101-103` forbids reaching the importer's write path from a request. There are two
ways to satisfy it. A Server Action behind the researcher guard is easier, and it is **rejected**
because it is exactly what the comment excludes: a browser-triggered privileged write of 600 rows,
with the timeout and retry surface that implies, and with a `dataset_entries` write reachable from
an HTTP endpoint.

A command has none of that. It has one caller, no URL, no session, and no input from a browser. It
is also the shape a thesis team can re-run in a terminal when they doubt the database.

**Rejected:** a `POST /admin/import` route. **Rejected:** an npm lifecycle hook on `postinstall`,
which would write to a production research table as a side effect of installing dependencies —
that is the single worst place to put a destructive-capable operation.

## D2 — What a command costs here, and why `tsx` is being added

Three obstacles, each measured rather than assumed. A probe ran all three and printed a verdict for
each; it exits non-zero if any probe fails to run, because "the alias does not resolve" and "the
probe did not run" are indistinguishable if only the exit code is read.

| obstacle | verdict | consequence |
| --- | --- | --- |
| does Node 26 execute a `.ts` file at all? | **YES** — type stripping is on by default | no compile step needed |
| does plain Node resolve the `@/*` path alias? | **NO** — `Cannot find module` | **the blocker** |
| does `import "server-only"` throw outside a bundler? | **THROWS** — *"cannot be imported from a Client Component module"* | the command cannot reach `@/lib/supabase/admin` |
| is a TS runner already installed? | **NO** — neither `tsx` nor `ts-node` resolves | must be added |

The alias is the blocker, and it cannot be dodged by rewriting imports: enumerating the modules the
importer must reach found **three `@/` imports across four modules** — `@/lib/dataset/synthetic-source`
in the importer, `@/schemas/dataset` in the parser, `@/lib/domain/text` in the schema. Changing them
to relative paths to suit a script would break the `@/*` convention the whole repository uses, so
that is not an option and is not proposed.

`tsx` is a devDependency that resolves `tsconfig` `paths` and runs TypeScript. It is the smallest
thing that makes the existing import graph reachable from a command, which is a concrete reason and
not "we might want it later". It is dev-only and ships in no bundle.

**The `server-only` problem is solved by not needing it.** The command must not import
`@/lib/supabase/admin` or `@/lib/repositories/supabase`, because both throw on load. It therefore
depends on:

1. a **type-only** view of the RPC slice, declared once in a `server-only`-free module and
   re-exported by `supabase/client.ts` — one definition, not a copy; and
2. a **new** `createSupabaseAdminClient(url, key)` that performs the one `createClient` call.

`admin.ts` keeps its `import "server-only"` and keeps reading the environment; it just delegates. The
guard on the *server* path is therefore unchanged, and the guard is what the ESLint boundary rule and
the `supabase-clients` unit test check.

> **Deliberately NOT done:** making the command import `admin.ts` by stubbing `server-only`. The
> package throws deliberately; neutralising it in a script to reach a privileged constructor would be
> working against the mechanism instead of with it.

## D3 — The upsert is a database function, not two application calls

The narrow client interface has `select`, `insert`, `update` and `rpc` — **no `upsert`, and `insert`
takes no options**, so neither `onConflict` nor `ignoreDuplicates` is reachable from the repository
surface. An application-side idempotent write therefore has exactly two shapes:

**(a) insert, and on a unique violation fall back to update.** Two round trips on every re-run, and
the immutability guarantee becomes "the update payload omits `instruction`" — enforced by the
discipline of the caller. The existing integration test already documents why that is not good
enough:

> a re-run must not be able to rewrite what a validator was shown, and the only reliable way to
> guarantee that is for the write itself to exclude the column rather than for a caller to remember.
> — `tests/integration/dataset-import.test.ts:44`

**(b) a `dataset_entries_import` function** holding the whole statement. One round trip, atomic per
row, and the exclusion is structural: there is no version of the update list that rewrites an
instruction, because the column is not in it.

**(b) is chosen.** This repository has recorded the general lesson more than once — *put the pin at
the layer that can see the thing*, and *a guarantee enforced only by one code path's discipline is
not a guarantee* — and this is the same shape as the `clientOrder` case, where no behavioural test
could pin the absence of a parameter and only a structural one could.

There is also direct precedent. `20261002120000_researcher_signin_attempts.sql` already puts
attempt-counter correctness in a function rather than in the application, with the reasoning written
down. The new function copies that precedent exactly: `security invoker`, `set search_path = ''`,
`revoke all … from public`, `grant execute … to service_role`, and no table-privilege grants.

> **`security invoker` is load-bearing, not copied for symmetry.** A `security definer` function runs
> as its owner — `postgres` on a hosted project — which bypasses RLS, so an `anon` caller could write
> rows. The existing migration says so at length and the new one repeats it rather than trusting a
> reader to have read the other file.

## D4 — Which columns may change, and the refusal

`ON CONFLICT (id) DO UPDATE` needs a list, and choosing it is a research decision, not a mechanical
one. Three columns are **never** in it:

- **`instruction`** — the text a validator was shown. Changing it retroactively changes what the
  dataset said.
- **`source_payload`** — the archival copy of the source record. It *contains* the instruction. If it
  could be updated while `instruction` could not, the row would hold two different instructions in
  two columns, which is worse than either being mutable. Keeping both immutable keeps them
  consistent by construction rather than by a rule someone has to remember.
- **`created_at`** — when the entry entered the study. A re-run must not restate it.

The mutable remainder is `category`, `origin`, `destination`, `transit_mode`, `is_active` — the
query-friendly projection the migration's own comment describes, and the operational fields a
dataset revision would legitimately touch.

**A differing instruction is refused, not silently kept.** `DO UPDATE … WHERE dataset_entries.instruction
= excluded.instruction` returns no row when the stored instruction differs, and the function then
raises naming the entry id. The alternative — keep the old instruction and report success — leaves a
silent divergence between the source file and the research database, and this project's own ledger
is a catalogue of how long such divergences survive before someone notices. A loud refusal naming
`OD_0142` is worth more than a green run.

The refusal names the **id only**. It does not include either instruction in the error text: error
messages end up in logs, and Ilocano research text belongs in the dataset, not in a log line.

## D5 — One call per entry, because 600 calls cost under three minutes

Measured against the real project, 20 calls to an existing RPC: **mean 278 ms**, all 20 succeeding,
worst first call 1707 ms. 600 sequential calls project to **about 167 seconds** of round-trip time.

A batch function taking `jsonb[]` would be one round trip, and it is rejected for two reasons: a
single malformed record aborts the whole statement, so the report cannot say *which* entry failed —
which is the entire point of a report on a research import — and the projection above says the
performance is not a problem worth that trade. The command prints progress, so 167 s is visible work
rather than a hung terminal.

## D6 — One construction site for the privileged client

Two callers needing a service-role client is one too many `createClient` calls. `admin-client.ts`
owns the single call; `admin.ts` keeps the guard and delegates; the command calls the owner. A unit
test enumerates every `createClient` call site in `src/` and asserts exactly one passes a
service-role key, so a second construction cannot be added quietly.

The new specifier is added to the ESLint `PRIVILEGED_SPECIFIERS` list. The rule matches **exact**
specifiers and only fires inside `/components/`, which was verified by reading the rule — so a new
sensitive module is not privileged merely by living under a privileged-looking directory, and has to
be listed.

## D7 — The factory header, and what actually becomes true here

`factory.ts` opens with *"No Supabase project and no credential exist in this environment"*. Both
halves were false before this change and the header was corrected for the first; the second half —
that no query in this file has reached PostgREST — becomes false **here**, and the correction is
written to say which specific claims are now backed by a real wire and which remain proved only
against fakes. Specifically, after this change the RPC path is executed against the real gateway;
`.insert()`, `.update().eq()` and `.range()` remain fake-only unless the import path happens to use
them, and the header must not claim otherwise.

## D8 — Gate

**GATE ITEM 3 is measured green before merge, not asserted.** The import is run against the hosted
project and the following are recorded from the real wire, by name and count only:

- the new function exists and `service_role` may call it;
- `anon` and `authenticated` are refused, and the refusal is **refused rather than absent** — a
  `PGRST202` would mean the function is not deployed, which is not a denial and must not be scored
  as one;
- `dataset_entries` holds **600** rows whose id set equals the source id set and whose stored
  instruction equals the source instruction **byte for byte**;
- a second run reports **0 inserted, 600 updated** and leaves all 600 stored instructions
  byte-identical to the first run;
- the table's row count is still 600 afterwards, so the run did not duplicate anything.

A red gate blocks the merge. It is not a warning.

## Risks

- **The migration could fail on the hosted project** for a reason PGlite does not reproduce. Mitigated
  by applying it to a project whose five existing migrations are already proven in force, and by the
  PGlite integration test running the same file first.
- **`tsx` is a new dependency.** If the thesis team forbids it, D2 is the section to re-read: the
  alternative is rewriting three imports to relative paths, which is worse, so the honest response is
  to raise it rather than work around it silently.
- **600 sequential calls can partially complete.** Mitigated by idempotence: a re-run finishes the job
  and reports `inserted` for exactly the entries that were missing.
- **A refusal on entry N leaves N-1 written.** This is intended and is why the run is idempotent; the
  command reports the refusal and exits non-zero rather than reporting partial success as success.

## Open Questions

None that block this change. One is deferred to the thesis team and is recorded rather than answered:
if the synthetic dataset is ever revised after validators have seen it, what happens to existing
entries? This change refuses that case, which is safe and is not the same as deciding it.
