# Tasks

> **How the boxes below were filled.** Every figure is a measurement taken during this Apply and
> re-derived from the run that produced it — none is carried forward from an earlier task, a previous
> session, or a CI checkmark. Where a task's own wording was falsified by a fixture that failed first,
> the task text is corrected here and the correction is named, because ticking a box against wording
> known to be false would make this file a decoration rather than a record.

## 0. Preconditions

- [x] 0.1 Re-measured, from source and not from `design.md`, that exactly four sites build a
      `/validate/<id>` address and exactly one reads the dynamic route parameter, and that all four
      producers currently apply `encodeURIComponent`. Enumerated against the **base commit `eef0bfd`**
      rather than the working tree, because this precondition describes the state the change starts
      from and the fix is already applied here — measuring the fixed tree would have answered a
      different question. `git grep -n "encodeURIComponent" eef0bfd -- src/` returned exactly four
      executable sites:

      | Site | Line at `eef0bfd` |
      | --- | --- |
      | `start-batch.tsx` `resumeHref` | 83 |
      | `start-batch.tsx` allocation `router.push` | 242 |
      | `validation-form.tsx` post-submit `router.push` | 135 |
      | `finished-batch.tsx` continue `router.push` | 99 |

      The fifth textual hit (`start-batch.tsx:78`) is a sentence of prose inside a comment, not a
      call — recorded here because "enumerate every occurrence" and "enumerate every executable
      occurrence" are different tasks and the first returns five. The one reader is
      `page.tsx:73`, `const { batchId } = await params`.

      **No fifth producer and no second reader exists**, so `proposal.md`'s enumeration stands and the
      scope was not widened. Every other `/validate/` hit under `src/` is prose (`ready/page.tsx`
      twice, `session.ts:242`, the route's own header, `batch-route.ts`'s rationale).
- [x] 0.2 Re-measured against the running development server that a stored batch's own address
      currently renders the route's not-found state, and that the same identifier resolves when asked
      of the repository over the real wire. **Both halves, because "the route is broken" and "the
      identifier is not stored" produce the same participant-facing sentence.**

      Before the fix, all three spellings of the address for the live batch rendered "We could not
      find that batch": raw colons, once-encoded, and twice-encoded. The identifier
      `VAL_720f59cd-2026-10-02T19:46:56.320Z` is genuinely present in storage — it is a real row of
      `validation_batches` on the hosted project, read back over the wire, not a value invented for
      this task. Status 200, not-found state rendered.

      **Re-measured after the fix as well**, which is what makes the pair a measurement rather than an
      anecdote — see the table in `design.md` fact 2. Raw and once-encoded now open the batch
      (entry `OD_0156`, "Sentence 1 of 10"); twice-encoded still renders the not-found state, which is
      the intended refusal.

## 1. The contract

- [x] 1.1 `src/lib/validation/batch-route.ts` added, exporting `batchRoutePath`, `batchRouteHref`, and
      `parseBatchRouteParam`, **with no imports at all**. `pnpm run typecheck` exit 0; `pnpm run lint`
      reports nothing for the new file. The absence of imports is asserted rather than described:
      `batch-route-enumeration.test.ts` fails if the file grows an `import`.
- [x] 1.2 `parseBatchRouteParam` applies `decodeURIComponent` exactly once, catches the `URIError` a
      malformed segment throws, and has no second attempt, no `%`-stripping fallback, and no trimming.
      Verified by `tests/unit/batch-route.test.ts` — **17 tests**, including
      `calls decodeURIComponent EXACTLY ONCE` (a source-level occurrence count in the enumeration
      file) and behavioural witnesses for each forbidden behaviour: whitespace is returned **verbatim**
      rather than trimmed, and a malformed segment returns a refusal **without throwing**.

      **Correction to the task's own wording, made because a fixture failed first.** This task as
      written is satisfied by any of several implementations; the statement of *why* is what was wrong
      and is recorded in `design.md` D3 and in the module header. A doubly encoded segment is **valid**
      percent-encoding, so the parser **accepts** it and yields the once-decoded `…19%3A46%3A56.320Z`;
      the refusal surfaces one layer up when the lookup finds no row. Requiring the parser to reject it
      would have meant a shape check here, i.e. a second place holding `batchIdSchema`'s rule, for an
      outcome the participant cannot distinguish. The spec delta's wording — "no lookup against the
      **repeatedly decoded** value" — was already precise about this and was not changed.

## 2. Witnesses for the contract

- [x] 2.1 Round trip asserted over the **production-shaped identifier measured from the live table**,
      `VAL_720f59cd-2026-10-02T19:46:56.320Z`: `recovers a production-shaped identifier character for
      character` and `opens a stored batch by its own address, character for character`. Compared with
      `toBe`, so a partial fix fails.
- [x] 2.2 `is the IDENTITY for an identifier with no reserved characters` — the round trip is not
      accidentally true only in the encoding case. `batch-route-wiring.test.tsx` opens one identifier
      carrying reserved characters and one carrying none, through the **real** route and the **real**
      `openValidationSession`, so both halves are exercised through the route's own read.
- [x] 2.3 **Rewritten, because the original wording asserted a behaviour that does not exist.** As
      written this task asked for a doubly encoded segment and a malformed one to *both* report "not a
      usable identifier". Only the malformed one does.

      | Segment | `parseBatchRouteParam` | Lookup |
      | --- | --- | --- |
      | malformed (`%zz`) | refuses, no throw | none |
      | doubly encoded (`%253A`) | **accepts**, yields `…%3A…` | runs, finds no row |
      | empty | refuses | none |

      What is asserted instead, which is the property that actually matters: the doubly encoded segment
      **never resolves to the batch it appears to name**. `yields an identifier no stored row holds, so
      the lookup comes back empty` proves the value is not the stored identifier, and
      `does NOT resolve a doubly encoded segment to the batch it names` proves it through the real route.
      The "no decoding beyond the single step" half is seeded so a second decode **would** have produced
      a resolvable identifier — `would STILL fail after a second decode, which is why the contract must
      not do one` — which is what makes this a test rather than a restatement of the code.
- [x] 2.4 **CAN FIRE.** Present, and it is a control rather than an assertion of the contract.
      `batch-route-wiring.test.tsx` drives the same identities through a deliberately **pre-encoding**
      producer and asserts the lookup does not find the batch; `batch-route-enumeration.test.ts` names
      its own history in `found producers at all, which the first draft's definition could not do`.
      Both were measured green as controls before any assertion depended on them.

      **A third control worth naming, because it is the one that could not fire.** The first draft of
      the enumeration detector keyed on the literal text `/validate/` under `src/`. On the **fixed**
      tree that text does not occur as executable code anywhere — the route prefix is now a single
      constant inside `batch-route.ts` — so the detector found **zero** producers and would have
      reported the closed enumeration it was not providing. It enumerates **callers** of the module
      instead, and asserts it found a non-empty set. **A guard written against the defect it was
      created for stops guarding once the defect is fixed**; the guard has to be aimed at the
      requirement, not at the shape of the bug.

## 3. Producers

- [x] 3.1 All four producer sites rewired: `resumeHref` (`start-batch.tsx:88`, now `batchRoutePath`),
      the allocation `router.push` (`start-batch.tsx:247`), the post-submit `router.push`
      (`validation-form.tsx:140`, with `position + 1`), and the continue `router.push`
      (`finished-batch.tsx:100`). Enumeration over the working tree confirms no `encodeURIComponent`
      **call** remains anywhere under `src/` — the four surviving textual hits are all inside
      comments, and the scan reported its own file count (111) as a control so a broken enumeration
      could not read as a clean one.
- [x] 3.2 Each existing DOM assertion in `start-batch.test.tsx`, `validation-form.test.tsx`, and
      `finished-batch.test.tsx` now recovers the identifier **through the route's own parse function**
      via the shared `tests/dom/support/batch-address.ts`, rather than against an
      `encodeURIComponent`-built literal. Recorded so a reviewer can check strictness rather than take
      it on trust — each replacement is strictly stronger:

      | File | Replaced | Now proves |
      | --- | --- | --- |
      | `start-batch.test.tsx` ×2 | `toBe(\`/validate/${encodeURIComponent(id)}\`)` | the address names the batch the **server chose**; a hand-written string shaped like a batch id could not pass |
      | `start-batch.test.tsx` | `toContain(encodeURIComponent(<whole instant>))` | the **whole** id round-trips, not one substring of it |
      | `finished-batch.test.tsx` ×2 | `toEqual([literal])` | the round trip, plus a length check so an extra push cannot hide |
      | `validation-form.test.tsx` ×4 | `toBe(\`/validate/${id}?position=${n}\`)` | both the id **and** the position, recovered by the route's own readers |

      The four `toContain(encodeURIComponent(...))`-shaped assertions could not distinguish "carries the
      batch's timestamp" from "carries a fragment of it"; one of them had **already** proved that, by
      reporting a green `expected +0 to be 1` against an href that no longer contained a whole id.
- [x] 3.3 Closed enumeration added in `tests/unit/batch-route-enumeration.test.ts` — **13 tests**:
      every site building a batch address or reading the dynamic route parameter is either the module
      or a caller of it; the four named producers are accounted for and `resumeHref` is asserted to be a
      **delegation** rather than a second definition; the dynamic parameter is read in exactly one file
      and recovered through the module; no session lookup happens at all when the segment is refused;
      the module imports nothing and exports exactly three functions and one result type. It asserts it
      **read a non-empty set of sources**, and separately asserts it **found producers at all** — the
      second is the control for the defect described in 2.4, since those are precisely the two
      assertions that would have reported success had the scan matched nothing.

## 4. Consumer

- [x] 4.1 `src/app/validate/[batchId]/page.tsx` recovers the identifier through `parseBatchRouteParam`
      and reports the route's existing not-found state when it does not parse, **before** any session
      dependency is touched. `tests/unit/batch-route-wiring.test.tsx` — **8 tests**, all green — includes
      `renders rather than throwing when the segment is not valid percent-encoding` and
      `performs NO lookup at all for an EMPTY segment`. The refusal reuses the existing not-found state
      (`{ status: "absent" }`), so no new participant-visible state was introduced.
- [x] 4.2 Route-level assertion added: `hands the batch lookup the stored identifier CHARACTER FOR
      CHARACTER` drives the **real** route component and the **real** `openValidationSession` against a
      recording `findById` fake, then asserts on what the lookup was handed — not on whether a parameter
      was passed. `opens the OTHER stored batch too, so the first one is not special` and
      `still reads the requested position from the query string` keep it from being a single-fixture
      witness.

## 5. Close out

- [x] 5.1 All seven checks run on this branch, **re-derived rather than incremented**:

      | Command | Result |
      | --- | --- |
      | `pnpm run typecheck` | exit 0 |
      | `pnpm run lint` | exit 0, no errors, no warnings |
      | `pnpm run format:check` | "All matched files use Prettier code style!" |
      | `pnpm run test:unit` | **73 files / 1639 tests passed** |
      | `pnpm run test:dom` | **7 files / 87 tests passed** |
      | `pnpm run test:integration` | **12 files / 197 tests passed** |
      | `pnpm run build` | exit 0, `/validate/[batchId]` present and dynamic |

      The unit figure is `+3` files and `+41` tests over the base's `70`/`1598`, and `batch-route`'s own
      three files account for `17 + 16 + 8 = 41` after the verification repairs below. DOM and
      integration are **unchanged** at `7`/`87` and `12`/`197`, which is the correct result: the DOM
      files were edited, not added to. `pnpm run format` was run once between the repairs, so the
      `format:check` figure above was taken **after** formatting rather than before.
- [x] 5.2 `openspec change validate batch-route-round-trip --strict` exits 0 — "Change
      'batch-route-round-trip' is valid". `openspec validate --specs --strict` reports
      **`Totals: 16 passed, 0 failed (16 items)`** — **unchanged**, which is the expected value: this
      delta is not synced until the Sync stage, and a figure that had risen here would have meant the
      delta was written to the wrong place. It is re-measured after the `design.md` corrections below,
      which is why 5.2 is stated twice in this file's history rather than once.
- [x] 5.3 Independent verification pass run, **and it found a CRITICAL that blocked completion**. The
      verifier enumerated all nine scenarios (all implemented, each with a named test), confirmed all
      three Corrections below are **true as stated**, and re-derived every figure in 5.1 independently.

      **CRITICAL — the "closed enumeration" was closed over `src/app` and over three navigation
      idioms, not over the application, and three measured violations of the named scenario passed
      green.** The requirement says "no other route, island, or **helper**", and the guard's own
      header claimed whole-application coverage. Violations reproduced by the verifier: a rogue
      component under `src/components/` hand-building an address; a `src/middleware.ts` reading the
      batch segment from `request.url.pathname`; and — the one that made the scope limit
      indefensible rather than conservative — a `window.location.assign` added to a real producer file
      *inside* `src/app`, missed because the detector listed three idioms (`router.push(`, `href={`,
      ``return ` ``) rather than defining what a producer is.

      Repaired, and **proved in both directions rather than asserted**:
      - The scan now covers the whole `src` tree.
      - Hand-built detection is "route prefix followed by an interpolation or a concatenation",
        replacing the idiom list. Both candidate detectors were **measured on the real tree before**
        the regexes were written: only two code lines under `src` contain `/validate/` and neither
        builds an address — the contract module's own prefix constant, and a sentence of
        participant-facing copy in `ready/page.tsx` that spells the route to explain where a link does
        *not* go. Both are asserted as non-producers using text copied from the tree, because a
        can-fire control drawn from imagination is the mistake this repository records twice.
      - Consumer detection no longer requires both `params` and `batchId`, and no longer scopes to the
        route folder; it matches a line touching a route-parameter source (`params`, `useParams`,
        `searchParams`, `pathname`) that names a batch identifier. Measured on the clean tree it yields
        exactly two lines in one file: the props type (excluded) and the one real read at line 74.
      - Two new self-tests feed the detector its own violations as fixtures — the four mechanisms that
        were measured to slip past, and a middleware reading `pathname` — plus a negative test that a
        *mention* of the route is not an address.

      **All three violations then re-measured RED** against a green control of `16 passed (16)`,
      naming the intended tests: `2 failed | 14 passed` for the rogue component (both `routes every
      producer` and `accounts for the four producers`), `1 failed | 15 passed` for the middleware
      (`reads the dynamic parameter in exactly one file`), and `2 failed | 14 passed` for the
      `window.location.assign`. The mutated file was restored **byte-identically** (`d638fe3b…`
      before and after) and both probe files were deleted.

      **WARNING 1 — this file claimed a length check `finished-batch.test.tsx` does not have.**
      Repaired in the test rather than in the prose: both replaced assertions now assert
      `h.pushes` has length 1 before indexing it. The adjacent `toHaveLength(1)` was on `h.requests`,
      a different array, so the round trip was satisfiable alongside an unwanted second navigation.

      **WARNING 2 — `proposal.md` listed `tests/unit/validation-routes.test.tsx` among the files whose
      assertions changed, and that file was unmodified.** It contained an assertion that had become
      **permanently satisfied**: it asserted the ready screen does not link to
      `/validate/${encodeURIComponent(…)}`, and after this change no producer may emit that spelling,
      so the string became unreachable by construction — a guard reporting coverage it does not
      provide. Rewritten to assert the spelling that *does* exist, with the prefix derived from
      `batchRoutePath` so a route-prefix change cannot leave it checking a string nothing produces.

      **WARNING 3 — the spec delta gained a normative requirement and a scenario during the Apply,
      and the Corrections section below did not record it.** Now recorded, since it is the ledger a
      reader would rely on: the no-path-separator requirement and its scenario were **added to the
      approved requirement text during the Apply**, which `AGENTS.md` sanctions over silent
      divergence.

      **What the verifier could not verify, recorded rather than glossed:** the framework fact the
      whole design rests on (Next.js percent-encoding `params` regardless of the request path) is
      **modelled by the fixtures, not tested** — no test can catch a divergence, because the model is
      the fixture. This is why the live measurement in 0.2 and the table in `design.md` fact 2 exist
      and why they are dated. It also could not confirm `VAL_720f59cd-…` is a real storage row from
      inside the suite; that was read off the hosted project directly and is recorded as a measurement,
      not asserted as a test.
- [ ] 5.4 Merge with a merge commit after 5.1-5.3 are green. **Ticked in the Archive stage, not before
      the merge** — a ticked "merged" box on an unmerged branch claims a fact that does not yet exist.

---

## Corrections made to this change's own artifacts during the Apply

Three of these were found by a fixture failing for the right reason, which is the only reliable signal
that an assertion is load-bearing. Each is a correction to **this project's** claim, made here rather
than in the diff where a reader would not see it.

1. **`design.md` D3 said the parser refuses a doubly encoded segment. It does not.** `%253A` is valid
   percent-encoding; one decoding of it succeeds. The requirement's wording was already precise and the
   design decision was not. The observable outcome is identical, and the live not-found response to a
   twice-encoded request reproduces the corrected account exactly — `params` holds a perfectly decodable
   `%253A` while the route reports not-found.
2. **Removing the pre-encoding removed an *incidental* route-injection protection.** `batchIdSchema` was
   `min(1)`, and `min(1)` accepts `batch/../../admin`. The old code was protected only as a side effect
   of the encoding bug. `batchIdSchema` now refuses a path separator, the route's own request schema
   inherits it (one rejection, not two independent ones — asserted), and every identifier the platform
   can mint is still accepted (asserted, so the rule cannot be quietly narrowed later). `design.md` D6
   originally listed `batchIdSchema` as deliberately unchanged and was **false**.
3. **The first enumeration detector could not fire on the fixed tree**, because it detected the literal
   text of the defect it was written for. See 2.4. It enumerates callers now, and asserts it found
   something.
4. **The spec delta itself grew during the Apply, and that is the fourth correction.** The
   no-path-separator requirement and its scenario were added to the **approved requirement text** —
   not merely to the code — because correction 2 showed the platform was relying on an accidental
   property. `AGENTS.md` sanctions updating the change over silently diverging from it, so this is
   permitted; it is recorded here because the Sync stage will promote this delta into the in-force
   spec and a reader would otherwise meet a normative sentence with no recorded origin.
5. **A closed enumeration is a claim about the whole system, and this one was closed over a
   subdirectory.** Found by the verification pass, not by reading: three violating sites were added to
   the real tree and the suite stayed green. See 5.3 for the repair and its proof. **The general form
   is worth carrying to the remaining changes in this programme, several of which will also want
   "nothing else does X" guards: a closed-set assertion is only as closed as its scan's root, and a
   detector that enumerates the ways a thing is *currently* done is a list, not a definition.**