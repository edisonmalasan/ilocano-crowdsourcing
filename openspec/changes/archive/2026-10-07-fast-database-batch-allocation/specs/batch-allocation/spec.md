# Spec Delta

## MODIFIED Requirements

### Requirement: Batch entries are chosen on the server by pooled entry completeness

The platform SHALL determine a validator's batch entries on the server. Eligibility SHALL be derived
from each candidate entry's **completeness**, as defined by `entry-completion`: an entry is
eligible while its stored responses do not yet collectively cover the package. The raw count of
stored validation rows SHALL NOT be used as a proxy for that determination, and no per-response
count behind an entry SHALL decide eligibility. A client SHALL NOT supply the
entry list, the per-entry coverage, the ordering, or the effective batch size; any such value
submitted by a client SHALL be ignored.

The eligibility computation SHALL run inside the database in a versioned allocation function,
so the ordinary allocation path transfers neither the 4,800-entry pool nor the pool's response
rows to the application server. The pooled-completeness pillars SHALL exist in exactly one SQL
place inside that function, and SHALL be proven equal to the TypeScript definition by
exhaustive parity tests over every evaluation/correction/translation combination, single- and
multi-response: a fast allocator that classifies any entry differently is a failed allocator.

There SHALL be no coverage target, no independent-validation target, and no such setting in the
platform's configuration.

Eligibility is additionally scoped to the requesting attempt: an entry assigned to any existing
batch of the SAME attempt SHALL be excluded from a new batch for that attempt, whether or not a
response has been submitted for it. Assigned-but-unanswered entries are exactly the remainders of
the attempt's interrupted batches. A separate attempt's batches SHALL NOT exclude anything **by
themselves** — but an entry another attempt currently holds under an unexpired reservation SHALL
be excluded from everyone else's batches until that reservation expires or releases. Reservation
is exclusive, time-boxed, and arbitrated by the database; overlap between attempts without a
reservation is expected collection, never prevented.

A batch is completely allocated only when its entries are reserved: selection, batch persistence,
and reservation claims SHALL commit as one atomic unit from the requester's point of view, so a
second simultaneous request cannot observe or claim the same incomplete entry. The versioned
allocation function performs selection, claim (with bounded in-function backfill past denied
ids), and persistence in one transaction, which is what makes the atomicity real rather than
aspirational. When a claim round grants fewer entries than requested, selection SHALL run again
excluding granted ids, for at most two extra rounds; persistent contention SHALL collapse to
`exhausted` rather than to an empty batch.

#### Scenario: A client cannot choose which entries it receives

- **WHEN** a client requests a batch and submits an entry list or an order
- **THEN** the batch returned is the one the server selected, and none of the submitted values
  influences which entries are in it or in what order

#### Scenario: A client cannot supply a coverage target

- **WHEN** a client requests a batch and submits a coverage or independent-validation target
- **THEN** the submitted value is rejected as an unrecognised input or ignored outright, and no
  allocation decision is derived from it, because no such setting exists

#### Scenario: An entry whose responses contribute no coverage stays in the pool

- **WHEN** an entry has three stored responses and none of them contributes a valid judgment or
  a covering translation
- **THEN** the entry remains eligible for allocation, and it is not treated as covered

#### Scenario: Pooled coverage retires the entry from allocation

- **WHEN** an entry's stored responses collectively cover the package
- **THEN** the entry is complete and normal allocation does not offer it again

#### Scenario: Further responses do not bring a retired entry back

- **WHEN** an entry that has already been offered to other attempts receives additional responses
- **THEN** it stays complete and stays out of the allocation pool

#### Scenario: An entry the validator already answered is not offered again

- **WHEN** a validator requests a batch and has already submitted a response for an entry
- **THEN** that entry is excluded from the batch offered to them

#### Scenario: An entry assigned to the attempt's own earlier batch is not offered again

- **WHEN** a validator requests a batch and an entry sits unanswered in an earlier batch of the
  SAME attempt
- **THEN** that entry is excluded from the new batch, and the earlier batch remains resumable
  through the recovery path rather than duplicated

#### Scenario: Another attempt's batches exclude nothing

- **WHEN** a validator requests a batch and an entry sits in another attempt's batch, answered
  or not, with no unexpired reservation behind it
- **THEN** that entry remains eligible for the requesting validator, and no cross-attempt
  exclusion is applied on account of the other batch alone

#### Scenario: Two simultaneous requests never share an incomplete entry

- **WHEN** two attempts request batches at the same time over a pool whose eligible entries
  overlap
- **THEN** no dataset entry appears in both granted batches, and the arbitration is performed
  by the database rather than by application read-then-write

#### Scenario: Contention shortens or exhausts honestly

- **WHEN** a claim round grants fewer entries than requested and bounded backfill still leaves
  the batch short
- **THEN** the requester receives the granted entries, or `exhausted` when none could be
  granted, and neither outcome is reported as a persistence failure

#### Scenario: Ordinary allocation transfers neither the pool nor its responses

- **WHEN** a validator requests a batch under normal conditions
- **THEN** the application server issues a bounded number of database round trips (profile
  read, allocation call, batch read-back, granted-entry projection) and does not read the
  4,800-entry pool or chunk the pool's responses through the application

#### Scenario: SQL and application completion never disagree

- **WHEN** any stored response combination is classified by both the allocation function and
  the TypeScript completion definition
- **THEN** both report the same complete/incomplete answer, as proven by the exhaustive
  parity suite rather than by inspection

### Requirement: Allocation-scale reads hold at 4800 entries

Whole-pool and id-filtered reads SHALL serve the 4,800-entry corpus through the same
bounded mechanisms proven at 3,000: paged whole-pool reads past the per-request cap
with per-page count agreement, and id filters chunked rather than issued as one giant
`.in()`. Growing the corpus SHALL NOT reintroduce truncation or refusal failures.

These mechanisms remain the fallback and recovery paths: the ordinary allocation path
serves from the versioned allocation function without transferring the pool, and the
bounded reads above are what recovery, review, and export continue to use. The guarantee
is unchanged — every entry considered exactly once, or a loud refusal — whichever path
reads.

#### Scenario: A corpus larger than the response cap still allocates

- **WHEN** allocation reads a pool larger than one PostgREST response
- **THEN** every active entry is considered exactly once, or the read refuses loudly
  rather than serving a short pool

### Requirement: Eligible entries are offered in a randomized order

Among eligible entries the platform SHALL randomize the candidates, so that no entry is
systematically preferred over another. The batch SHALL be taken from the randomized order, and
SHALL be short only when the eligible pool cannot fill the requested size. On the ordinary
path the randomization runs inside the database (`ORDER BY random()` over the eligible set);
seed-reproducibility of the former client-side shuffle is replaced by distribution evidence —
no low-ID bias, all categories reachable — because a seed cannot usefully cross the
application/database boundary. The platform SHALL NOT draw randomness from an ambient
process-wide source inside any application-side selection rule that remains.

> **Superseded scenarios, recorded rather than deleted.** Two scenarios of this requirement
> cannot survive the move and are intentionally removed: "Randomization does not come from
> an ambient source" (there is no caller-supplied source anymore — the database draws its
> own randomness, and no application rule remains to default one) and "The same inputs and
> the same supplied randomness produce the same order" (seed reproducibility cannot cross
> the application/database boundary; distribution evidence replaces it). A reader of an
> earlier commit who expects them here should read this note instead of concluding they
> were forgotten.

The ordering rule no longer sorts candidates by ascending qualifying coverage. Under the corrected
completion model every eligible entry is incomplete, so a least-covered-first ordering would sort a
single group and could not prefer anything over anything else. The randomization it also required is
retained, because that part was doing real work independently of the superseded target.

#### Scenario: Eligible entries are offered in a randomized order

- **WHEN** several eligible entries exist
- **THEN** the order among them is randomized rather than fixed, so that one entry is not
  repeatedly served first

#### Scenario: Randomization does not come from an ambient source

- **SUPERSEDED by this change, kept so the removal is visible rather than silent.**
  Originally: when the selection rule drew randomness, it used the source the caller
  supplied. The caller-supplied source no longer exists — the database draws its own
  randomness — so there is no application rule left for this scenario to govern. Its
  replacement is the distribution evidence in "Randomization shows no systematic
  preference" below.

#### Scenario: The same inputs and the same supplied randomness produce the same order

- **SUPERSEDED by this change, kept so the removal is visible rather than silent.**
  Originally: the same pool, configuration, and randomness source presented twice gave the
  identical order. Seed reproducibility cannot cross the application/database boundary, so
  this guarantee is withdrawn and replaced by the distribution evidence below. No caller
  may rely on a repeated allocation returning the same order.

#### Scenario: Randomization shows no systematic preference

- **WHEN** repeated allocations draw from the same eligible pool
- **THEN** grants spread across the pool rather than serving one fixed set, and the
  deployed function body orders by randomness rather than by entry id

#### Scenario: The batch is short only when the eligible pool is exhausted

- **WHEN** fewer eligible entries remain than the requested batch size
- **THEN** the batch contains all of the remaining eligible entries and no others
