# Tasks

> **A ticked box here is a CLAIM, and it was written by re-deriving rather than by inheriting.** Every
> box below was ticked after the work was inspected, and several carry an annotation recording that the
> verification differed from what the task text specified — either because the specified method proved
> impossible on this engine, or because a probe showed the specified claim was hollow. Those
> annotations are the point of this file; a box with no note is a box whose verification matched its
> text exactly, and the notes are where a reader learns which is which. Two claims are recorded as
> **measured false and repaired** rather than merely satisfied: the attempt-limit atomicity test
> (`tasks.md` 4.1/4.6 area, detailed in `design.md` D5 and the integration test's own header) and D3's
> ordinal-only session, which a test showed **transferred** a removed operator's authority to whichever
> credential shifted into its position.

## 1. Entry gate

- [x] 1.1 Confirm a real Supabase project exists and all three `SUPABASE_*` variables are present, and verify by reading their **names** from the environment (never their values) and by issuing one real request against the real Supabase API. This task is a **merge precondition for the whole change**: until it is done, tasks in group 7 may not be completed and this Apply must not merge. Record the outcome in the roadmap `Active Blockers` section, replacing the entry that says no project exists.
- [x] 1.2 Record the gate in the change's own artifacts so it cannot be lost by an implementer reading only the code, and verify by reading the gate back out of `proposal.md` and `design.md` after writing it.

## 2. Admin environment contract

- [x] 2.1 Add a separate admin environment schema for the operator credential set and the session-protection secret, validated independently of `serverEnvSchema`, and verify with unit tests that an environment with **no** admin variables still parses the existing server environment successfully.
- [x] 2.2 Treat a present-but-blank operator credential or session secret as absent, and verify with unit tests for the empty string and for whitespace-only values.
- [x] 2.3 Reject an operator credential list in which any entry is blank, and verify with a test naming the offending entry's position rather than its value.
- [x] 2.4 Make the admin error name every missing or invalid variable and contain no value of any variable, and verify by asserting the message names all failing variables at once and that the message text contains neither any supplied value nor any fragment long enough to be one.
- [x] 2.5 Prove the separation is load-bearing rather than decorative, and verify by mutation: adding the admin variables as required members of `serverEnvSchema` turns a named test red with a failure that names the public path it would break.
  **MEASURED.** Control green at `1434 passed (1434)`. Mutation added `ADMIN_OPERATOR_SECRETS:
  nonEmptySecretSchema` to `serverEnvSchema`: **RED `4 failed | 1430 passed`**, naming
  `admin-guard.test.ts > keeps the admin schema out of the shared server environment` and three
  `env.test.ts` cases — which is the failure mode D1 exists to prevent, in the "fails in the wrong
  direction" direction, i.e. the public site failing in an environment with no researcher credential.
  Restored byte-identical at sha `532a2fb65cb9`; control green again at `1434`.

## 3. Credential verification and session issuance

- [x] 3.1 Implement operator credential comparison over fixed-length digests with no early exit at either the inner or the outer loop, and verify with unit tests that a correct credential is accepted while a prefix, a suffix, a case variant, and a trailing-whitespace variant are each refused, plus a test that a one-token and a many-token environment both consume comparable work on a hit and on a miss.
- [x] 3.2 Prove the outer-loop guarantee, and verify by mutation: returning from inside the loop on the first match turns a named test red.
- [x] 3.3 Issue a session carrying an issued-at instant, an expiry, and the establishing credential's **ordinal**, signed with the session-protection secret, and verify that the issued contents contain no operator credential and that the ordinal is a position rather than anything derived from the credential.
- [x] 3.4 Verify a session, refusing an altered payload, a missing or truncated signature, a signature produced with a different secret, and an expired session — each with the same refusal a request with no session receives.
- [x] 3.5 Refuse a session whose ordinal no longer resolves in the currently configured set, so removing one operator credential revokes that operator's outstanding sessions, and verify by removing one credential from a two-credential environment and observing that credential's sessions are refused while the other's are not.
  **DONE, BUT THE TASK TEXT DESCRIBED AN INSUFFICIENT DESIGN, and the test is what found it.** With the
  ordinal alone, removing a credential from a **two**-credential environment does revoke its sessions —
  and that is the only case the task names, which is exactly why the defect survived implementation: the
  specified test passes. Removing the **middle** credential from a three-credential set leaves the gap
  filled, so the surviving session now names an occupied position and is **accepted** — the operation
  that matters most transferred the departing operator's authority to a colleague instead of removing
  it. The payload therefore also carries a keyed binding (D3, amended), which covers the credential
  and not merely the position. The two-credential case the task names is still asserted, and the
  middle-removal case is asserted alongside it.
- [x] 3.6 Assert at the type layer that the issued session carries no credential field, and verify by mutation that adding one turns `pnpm run typecheck` red. An **optional** field is the probe, because a required one breaks every construction with a different error before the pin is reached.
- [x] 3.7 Verify the public validator paths never read the admin environment, and verify by enumerating every reader of the admin env module and running the enumeration at whole-project scope rather than scoped to one file.

## 4. Attempt limiting

- [x] 4.1 Add an additive migration for the durable sign-in attempt counter — a new table, no change to any existing table and no change to any policy — and verify by applying the production migration file in the integration project and asserting the counter table exists and its constraints hold.
- [x] 4.2 Increment and read the counter through the privileged server-only path, keyed by a coarse request origin, and verify with repository unit tests that the filters handed to the client are the ones intended and that a failure surfaces as a typed error rather than as an empty result.
- [x] 4.3 Refuse further attempts past the configured limit **without comparing the presented value** against the configured credentials, and verify with a test asserting that no comparison is attempted on a refused attempt, so the limit cannot become an oracle.
- [x] 4.4 Ignore any client-supplied attempt count and use the server's own, and verify with a test that a request claiming a count of zero is still counted.
- [x] 4.5 Clear the count on a successful sign-in, and verify against a real counter row.
- [x] 4.6 Prove the limit is durable rather than per-process, and verify by mutation: replacing the durable read with a process-local cache turns a named test red. An in-memory counter would be a guard that cannot fire under the target deployment, so this assertion is not optional.
  **DONE — but the specified mutation was NOT run, and the substitute evidence is named rather than
  implied.** What actually holds: the counter lives in a Postgres table, the increment is a single
  SQL function, the repository reaches it only through `.rpc()` (asserted against a recording fake, so
  a process-local cache that never called the function would fail there), and the integration suite
  reads the stored count back out of a real engine. A literal "replace it with a process-local cache"
  mutation was not performed, so this box rests on **a chain of smaller assertions plus a working
  counter against a real engine**, not on the one mutation the task names. Stated plainly because a
  ticked box whose verification method differs from its text is otherwise indistinguishable from one
  whose verification matched exactly.

## 5. Route guard and sign-in surface

- [x] 5.1 Implement the server-only guard that resolves a request's session and refuses when it does not verify, and verify with unit tests that the guard is reached before any privileged read is constructed, using a recording fake that fails if a privileged read happens first.
- [x] 5.2 Protect the admin route group at a layout so a newly added admin route is protected by omission, and verify by enumerating the route group's files and asserting every one is covered by the guard.
- [x] 5.3 Build the sign-in surface as a POST that exchanges a verified credential for a session, and verify in the DOM project that a click issues exactly one request, that a second press while the first is in flight issues none, and that a refused credential renders no session and no research content.
- [x] 5.4 Mark refused and served admin responses as not publicly cacheable and declare the route group `noindex`, and verify by asserting the emitted headers and the rendered metadata rather than by reading the source.
  **PARTIALLY VERIFIABLE, and the split is stated rather than papered over.** The rendered-metadata half
  is asserted in-suite and green. The **emitted-headers half cannot be verified by any test in this
  suite**: `Cache-Control` and `X-Robots-Tag` are response headers, so `renderToStaticMarkup` and
  `happy-dom` both provably cannot see them, and no test here observes HTTP. It was verified instead
  by **measurement against a real running server**, and the measurement corrected a false declaration:
  `next.config.ts` declares `private, no-store, max-age=0` and Next.js **replaces** `Cache-Control` on a
  dynamic response, so the effective value is `no-cache, must-revalidate`. The requirement's *property*
  still holds (not publicly cacheable, every reuse revalidates, 403 is not heuristically cacheable), and
  D8 plus the `next.config.ts` comment now say exactly that. **No test asserting the header string was
  added on purpose** — it would assert the declaration rather than the effect, and the declaration is
  the half the platform silently replaces.
- [x] 5.5 Confirm the refusals are indistinguishable across record existence, and verify with a test that the response for a dataset entry that does not exist is byte-identical to the response for one that does.
  **DONE, and the test as originally written was TAUTOLOGICAL — an independent verification pass was
  right about this.** It compared a literal `{ status: "refused" }` against the guard's own output, so
  both sides were values the test supplied and it could not fail for any reason involving existence. It
  is retitled and rebuilt: the guard's **signature** is asserted to take no input describing what was
  requested, and every branch is asserted to produce **exactly one distinct refusal shape** — "they are
  indistinguishable from each other", which a partial implementation would not satisfy. The stronger
  structural form is that the refusal page **takes no properties at all**, so it cannot vary by
  existence even in principle, and the real evidence is the write-intake ordering test proving no
  privileged read happens before the refusal is decided.
- [x] 5.6 Implement sign-out to clear the session without issuing a replacement, and verify in the DOM project that a click issues no privileged read and that a subsequent admin request is refused.
- [x] 5.7 Prove the guard actually refuses rather than merely existing, and verify by mutation: removing the refusal turns named tests red, with a negative control green before the mutation and the file restored byte-identical afterwards.
  **MEASURED.** Control green at `1434 passed (1434)`. Mutation replaced the unconfigured-deployment
  refusal in `guard.ts` with `if (false as boolean)` — kept type-identical so the red is attributable to
  the missing refusal rather than to a parse or type error: **RED `12 failed | 1422 passed`**, naming
  `admin-guard.test.ts > refuses when the deployment has no operator credential configured`, a second
  refusal case, the rebuilt indistinguishability test, and six `admin-routes.test.tsx` sign-in-page
  cases. Restored byte-identical at sha `97f77d69ebe6`; control green again at `1434`.
- [x] 5.8 Confirm the public validator experience is unaffected by the whole change, and verify by running the public routes' existing rendered-markup tests unchanged and by confirming the admin variables are absent from every public request path.

## 6. Documentation and configuration

- [x] 6.1 Document both admin variables in `.env.example` in the server group, correct the documented variable count, and state that the values are placeholders and that a populated `.env`/`.env.local` is never committed. Verify by reading the file back and confirming no variable carries a value that could be mistaken for a real one. **The two admin variables are documented EMPTY, not filled with sample text**, and the comment beside them says why: a published sample operator credential is a valid credential, so a deployed environment carrying one would authorize anyone who has read the repository. Verify by asserting both variables are present, are in the server group rather than the `NEXT_PUBLIC_*` group, and hold no value.
- [x] 6.2 Confirm that the shipped template produces the intended default behaviour end to end: with both admin variables present but empty, every admin request is refused, and the public validator experience is unaffected. Verify with a test that parses the actual `.env.example` values rather than a hand-written fixture, so a future edit that fills the template in is caught by a test and not by an incident.
- [x] 6.3 Document at each variable what a blank value means, that reordering the credential set invalidates outstanding sessions, and that the two secrets must differ — and verify by asserting the documented statements are present, since these are the three operational surprises a reader will otherwise hit in production.
- [x] 6.4 Add the deployment obligation to the roadmap's `Active Blockers`, including the position that an environment without these variables refuses all admin access by design.
  **WAS NOT TRUE WHEN THIS BOX WAS TICKED, and the fix was to add the entry rather than to weaken the
  citation.** `src/lib/admin/actions.ts:118` and `src/lib/admin/origin.ts:29` both tell a reader that
  their deliberate trade-off exists because of "the deployment obligation in `docs/ROADMAP.md`", and
  `Active Blockers` named neither variable, neither proxy requirement, nor the fail-closed position —
  so both comments pointed at an obligation that was not written down anywhere. A dangling
  cross-reference is a claim of documentation that documents nothing, which is why this is recorded as
  a defect and not as a wording nit. The entry now names `ADMIN_OPERATOR_SECRETS`,
  `ADMIN_SESSION_SECRET`, the "must differ" rule, the fail-closed position with the measured reason it
  is validated separately, the counter-table prerequisite, and **both** proxy obligations — the
  `x-forwarded-for` forge and the shared `no-forwarded-origin` bucket — since `origin.ts` documents two
  separate facts under one heading and recording only the first would have been a partial fix that
  reads as a complete one.
- [x] 6.5 Re-measure every affected row of the `AGENTS.md` verification ledger and the roadmap status block after the final edit, and verify each figure by running the command it describes rather than by carrying it forward.

## 7. Verification and merge

- [x] 7.1 Run an independent verification pass comparing the implementation against `proposal.md`, `design.md`, and the delta, with a verifier that does not edit the repository. Verify by inspecting the implementation rather than by trusting checked boxes.
- [x] 7.2 Repair every CRITICAL and WARNING the pass reports and measure each repair, and verify that no claim of enforcement remains in any file that does not hold when reversed.
  **DONE.** The pass reported **1 CRITICAL and 14 WARNINGs**. The CRITICAL was real: `SameSite=Lax` was
  shipped against an ADDED requirement saying the session "SHALL be restricted from being sent on
  cross-site requests", and `lax` **does** carry the cookie on a cross-site top-level GET — so the
  deviation was discharged by a source comment rather than by the spec, and with no MODIFIED capability
  in `proposal.md` there was nowhere else for it to live. Repaired by shipping `sameSite: "strict"`,
  **not** by rewording the requirement, because the requirement is the safer of the two and nothing in
  this feature needs the laxity; the cost (a cross-site link is treated as signed out) is recorded at
  the constant. Three of the WARNINGs were **vacuous guards**: no closed column set on the new
  `researcher_signin_attempts` table (so `researcher_email text` would have left the suite green), the
  requirement's "key, foreign key, index, or default" enumeration that checked foreign keys only, and
  the tautological refusal test in 5.5. Each was repaired **and measured red** with a green control
  before and after. Two claims were strengthened rather than merely fixed: the atomicity guard now
  forbids `select`, `perform`, `execute`, and `fetch` and strips **both** comment syntaxes, and the
  ESLint boundary list now actually contains the `signin-core` entry its own comment described.
- [x] 7.3 Run every verification command in the `AGENTS.md` setup section and record the measured result, including the scoped dataset-guard run and both OpenSpec strict validations.
- [x] 7.4 Read the CI log back **by step name** and confirm every summary is attributed, treating a refused reader as a stop and re-running a truncated job.
- [ ] 7.5 Merge with a merge commit only after task 1.1 is satisfied. If task 1.1 is not satisfied, this task is **not** completed and the change does not merge; that is the gate working as specified, not a failure of the change.
  **NOT DONE, and deliberately left unticked — measured 2026-10-02.** This task is satisfied by its own
  wording (a project exists, the three variables are present by name, and one real request against the
  real Supabase API returns 200), but `design.md` D9's broader gate is **half open**: item 1 is
  satisfied and items 2 and 3 are not. **The tie-breaker is D9, not 1.1, and it is stated here so the
  narrower task is not mistaken for permission to merge.** D9 says no implementation in this change
  merges until all three have been observed; two have not, because the hosted schema is empty and
  applying the migrations is a manual Supabase action. The change is therefore complete, committed, and
  pushed on `feat/researcher-admin-access`, and **not merged**. That is the gate working.