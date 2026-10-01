# Tasks

## 1. Entry gate

- [ ] 1.1 Confirm a real Supabase project exists and all three `SUPABASE_*` variables are present, and verify by reading their **names** from the environment (never their values) and by issuing one real request against the real Supabase API. This task is a **merge precondition for the whole change**: until it is done, tasks in group 7 may not be completed and this Apply must not merge. Record the outcome in the roadmap `Active Blockers` section, replacing the entry that says no project exists.
- [ ] 1.2 Record the gate in the change's own artifacts so it cannot be lost by an implementer reading only the code, and verify by reading the gate back out of `proposal.md` and `design.md` after writing it.

## 2. Admin environment contract

- [ ] 2.1 Add a separate admin environment schema for the operator credential set and the session-protection secret, validated independently of `serverEnvSchema`, and verify with unit tests that an environment with **no** admin variables still parses the existing server environment successfully.
- [ ] 2.2 Treat a present-but-blank operator credential or session secret as absent, and verify with unit tests for the empty string and for whitespace-only values.
- [ ] 2.3 Reject an operator credential list in which any entry is blank, and verify with a test naming the offending entry's position rather than its value.
- [ ] 2.4 Make the admin error name every missing or invalid variable and contain no value of any variable, and verify by asserting the message names all failing variables at once and that the message text contains neither any supplied value nor any fragment long enough to be one.
- [ ] 2.5 Prove the separation is load-bearing rather than decorative, and verify by mutation: adding the admin variables as required members of `serverEnvSchema` turns a named test red with a failure that names the public path it would break.

## 3. Credential verification and session issuance

- [ ] 3.1 Implement operator credential comparison over fixed-length digests with no early exit at either the inner or the outer loop, and verify with unit tests that a correct credential is accepted while a prefix, a suffix, a case variant, and a trailing-whitespace variant are each refused, plus a test that a one-token and a many-token environment both consume comparable work on a hit and on a miss.
- [ ] 3.2 Prove the outer-loop guarantee, and verify by mutation: returning from inside the loop on the first match turns a named test red.
- [ ] 3.3 Issue a session carrying an issued-at instant, an expiry, and the establishing credential's **ordinal**, signed with the session-protection secret, and verify that the issued contents contain no operator credential and that the ordinal is a position rather than anything derived from the credential.
- [ ] 3.4 Verify a session, refusing an altered payload, a missing or truncated signature, a signature produced with a different secret, and an expired session — each with the same refusal a request with no session receives.
- [ ] 3.5 Refuse a session whose ordinal no longer resolves in the currently configured set, so removing one operator credential revokes that operator's outstanding sessions, and verify by removing one credential from a two-credential environment and observing that credential's sessions are refused while the other's are not.
- [ ] 3.6 Assert at the type layer that the issued session carries no credential field, and verify by mutation that adding one turns `pnpm run typecheck` red. An **optional** field is the probe, because a required one breaks every construction with a different error before the pin is reached.
- [ ] 3.7 Verify the public validator paths never read the admin environment, and verify by enumerating every reader of the admin env module and running the enumeration at whole-project scope rather than scoped to one file.

## 4. Attempt limiting

- [ ] 4.1 Add an additive migration for the durable sign-in attempt counter — a new table, no change to any existing table and no change to any policy — and verify by applying the production migration file in the integration project and asserting the counter table exists and its constraints hold.
- [ ] 4.2 Increment and read the counter through the privileged server-only path, keyed by a coarse request origin, and verify with repository unit tests that the filters handed to the client are the ones intended and that a failure surfaces as a typed error rather than as an empty result.
- [ ] 4.3 Refuse further attempts past the configured limit **without comparing the presented value** against the configured credentials, and verify with a test asserting that no comparison is attempted on a refused attempt, so the limit cannot become an oracle.
- [ ] 4.4 Ignore any client-supplied attempt count and use the server's own, and verify with a test that a request claiming a count of zero is still counted.
- [ ] 4.5 Clear the count on a successful sign-in, and verify against a real counter row.
- [ ] 4.6 Prove the limit is durable rather than per-process, and verify by mutation: replacing the durable read with a process-local cache turns a named test red. An in-memory counter would be a guard that cannot fire under the target deployment, so this assertion is not optional.

## 5. Route guard and sign-in surface

- [ ] 5.1 Implement the server-only guard that resolves a request's session and refuses when it does not verify, and verify with unit tests that the guard is reached before any privileged read is constructed, using a recording fake that fails if a privileged read happens first.
- [ ] 5.2 Protect the admin route group at a layout so a newly added admin route is protected by omission, and verify by enumerating the route group's files and asserting every one is covered by the guard.
- [ ] 5.3 Build the sign-in surface as a POST that exchanges a verified credential for a session, and verify in the DOM project that a click issues exactly one request, that a second press while the first is in flight issues none, and that a refused credential renders no session and no research content.
- [ ] 5.4 Mark refused and served admin responses as not publicly cacheable and declare the route group `noindex`, and verify by asserting the emitted headers and the rendered metadata rather than by reading the source.
- [ ] 5.5 Confirm the refusals are indistinguishable across record existence, and verify with a test that the response for a dataset entry that does not exist is byte-identical to the response for one that does.
- [ ] 5.6 Implement sign-out to clear the session without issuing a replacement, and verify in the DOM project that a click issues no privileged read and that a subsequent admin request is refused.
- [ ] 5.7 Prove the guard actually refuses rather than merely existing, and verify by mutation: removing the refusal turns named tests red, with a negative control green before the mutation and the file restored byte-identical afterwards.
- [ ] 5.8 Confirm the public validator experience is unaffected by the whole change, and verify by running the public routes' existing rendered-markup tests unchanged and by confirming the admin variables are absent from every public request path.

## 6. Documentation and configuration

- [ ] 6.1 Document both admin variables in `.env.example` in the server group, correct the documented variable count, and state that the values are placeholders and that a populated `.env`/`.env.local` is never committed. Verify by reading the file back and confirming no variable carries a value that could be mistaken for a real one. **The two admin variables are documented EMPTY, not filled with sample text**, and the comment beside them says why: a published sample operator credential is a valid credential, so a deployed environment carrying one would authorize anyone who has read the repository. Verify by asserting both variables are present, are in the server group rather than the `NEXT_PUBLIC_*` group, and hold no value.
- [ ] 6.2 Confirm that the shipped template produces the intended default behaviour end to end: with both admin variables present but empty, every admin request is refused, and the public validator experience is unaffected. Verify with a test that parses the actual `.env.example` values rather than a hand-written fixture, so a future edit that fills the template in is caught by a test and not by an incident.
- [ ] 6.3 Document at each variable what a blank value means, that reordering the credential set invalidates outstanding sessions, and that the two secrets must differ — and verify by asserting the documented statements are present, since these are the three operational surprises a reader will otherwise hit in production.
- [ ] 6.4 Add the deployment obligation to the roadmap's `Active Blockers`, including the position that an environment without these variables refuses all admin access by design.
- [ ] 6.5 Re-measure every affected row of the `AGENTS.md` verification ledger and the roadmap status block after the final edit, and verify each figure by running the command it describes rather than by carrying it forward.

## 7. Verification and merge

- [ ] 7.1 Run an independent verification pass comparing the implementation against `proposal.md`, `design.md`, and the delta, with a verifier that does not edit the repository. Verify by inspecting the implementation rather than by trusting checked boxes.
- [ ] 7.2 Repair every CRITICAL and WARNING the pass reports and measure each repair, and verify that no claim of enforcement remains in any file that does not hold when reversed.
- [ ] 7.3 Run every verification command in the `AGENTS.md` setup section and record the measured result, including the scoped dataset-guard run and both OpenSpec strict validations.
- [ ] 7.4 Read the CI log back **by step name** and confirm every summary is attributed, treating a refused reader as a stop and re-running a truncated job.
- [ ] 7.5 Merge with a merge commit only after task 1.1 is satisfied. If task 1.1 is not satisfied, this task is **not** completed and the change does not merge; that is the gate working as specified, not a failure of the change.