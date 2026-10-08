# Tasks

## 1. Throttle buckets

- [ ] 1.1 Add `enroll` (origin 30), `allocate` (origin 60 + attempt 20), `submit` (origin 300 + batch 30) buckets to `public-throttle.ts` and verify the bucket unit tests pin each threshold
- [ ] 1.2 Verify existing `resume`/`session_open` thresholds and key derivation are byte-unchanged by the bucket addition

## 2. Enrollment pacing

- [ ] 2.1 Check the `enroll` origin bucket in `runEnroll` after write-intake parsing and before `validators.create`, returning the typed throttled outcome with zero writes on refusal, and verify unit tests cover burst-refused, invalid-consumes-nothing, and single-enrollment-unaffected
- [ ] 2.2 Wire the origin key plus shared throttle into the enroll action wrapper and verify the wrapper test pins the context construction

## 3. Allocation pacing

- [ ] 3.1 Check the `allocate` buckets first in `runStartValidation` before any database read, returning the typed throttled outcome with retry on refusal, and verify unit tests cover burst-refused, throttled-not-exhausted, and ordinary-start-unaffected
- [ ] 3.2 Wire the origin key plus shared throttle into the start action and verify the wrapper test pins the context construction

## 4. Submission pacing

- [ ] 4.1 Check the `submit` origin plus batch buckets in the `POST /api/validation-responses` path after strict parsing and before the submission RPC, returning the typed throttled reason with zero RPCs on refusal, and verify tests cover burst-refused and malformed-before-throttle
- [ ] 4.2 Classify the throttled reason as transient in the save-queue retry path (bounded backoff, payload retained, never parked) and verify a test pins the transient mapping
- [ ] 4.3 Verify ordinary human-speed batch submission and the already-recorded idempotency path are unaffected by the submit check

## 5. Integration and full verification

- [ ] 5.1 Run `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, and `build`, and verify every command exits 0 with counts read back from output
- [ ] 5.2 Verify no migration was added, no new dependency was introduced, no participant request logging was added, and Change 1 behavior (128-bit mint, ownership gate, resume/session_open pacing) is preserved by the passing suites
