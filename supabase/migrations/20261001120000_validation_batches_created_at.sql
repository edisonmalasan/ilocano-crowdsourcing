-- When a batch was created — the one column interrupted-batch-recovery adds.
--
-- FORWARD MIGRATION. `20260930120000_research_schema.sql` created `validation_batches` with `id` and
-- `validator_id` and nothing else, and its own comment says why the other candidates are absent:
-- "a column that carries no behaviour is a claim about a lifecycle nobody has built". That is still
-- the rule, and this file is where it is satisfied rather than worked around: interrupted-batch
-- recovery adds behaviour, so a column carrying that behaviour legitimately arrives here. Nothing in
-- a shipped migration is rewritten, and in particular this is NOT an `alter` of the base file.
--
-- ---------------------------------------------------------------------------
-- WHY ONE COLUMN, FOR ONE REASON: MAKING THE CHOICE TOTAL
-- ---------------------------------------------------------------------------
-- The capability's requirement is "offer the MOST RECENTLY CREATED interrupted batch". That needs an
-- age, and the table has none. The three candidates were considered:
--
--   * SORT BY THE BATCH ID. `defaultBatchId` builds `` `${validatorId}-${now.toISOString()}` ``, so
--     the identifier happens to encode an ISO instant and is lexically time-sortable for a fixed
--     validator. Rejected: it couples a persistence query to the shape of a string that exists for a
--     different reason — `defaultBatchId`'s own docstring says the identifier is built so a log line
--     naming a batch also names whose batch it is — and a future id scheme would break the ordering
--     SILENTLY, with the query still succeeding. A research rule that depends on an incidental
--     property of another field's format is a rule nobody will remember to check.
--
--   * ADD A LIFECYCLE COLUMN OR STATUS FLAG. Rejected by the change's D1 on the strongest grounds:
--     a stored flag is a SECOND AUTHORITY. A batch marked `in_progress` whose entries are all
--     answered would then be reported as interrupted, and the repair is a scheduled reconciliation
--     job nobody has a reason to write. Recognition is derived from the stored entries and the
--     validator's responses instead, so there is no such state to fall out of step.
--
--   * `created_at timestamptz`. What this file adds.
--
-- It exists for exactly one purpose, which is worth stating because a timestamp on a batch table is
-- the kind of addition that invites the next one: it orders the recovery read, and nothing else. It
-- is not an activity signal, is not written on resume, and is never rendered to a participant.
--
-- ---------------------------------------------------------------------------
-- WHY THE SERVER WRITES IT AND THE DATABASE DOES NOT DEFAULT IT
-- ---------------------------------------------------------------------------
-- `created_at` here is an ordinary nullable-then-tightened column, but the writer is the
-- APPLICATION, not a column default. The server already mints every other timestamp in this schema
-- from an injected `now`, so a database default would make the database a SECOND SOURCE OF TIME for
-- the same fact — and that is precisely the move this project refused when it removed
-- `requested_size` from this very table for being a second authority for a constant the application
-- owns. `tests/unit/repositories-supabase.test.ts` asserts the insert carries `created_at`
-- explicitly, so a default added later would not even be noticed by the read-back.
--
-- ---------------------------------------------------------------------------
-- WHY THE BACKFILL IS `now()` AND NOT SOMETHING RECONSTRUCTED
-- ---------------------------------------------------------------------------
-- Every existing row gets ONE IDENTICAL `now()`. Two reasons, and the second is load-bearing:
--
--   1. The honest backfill for "created at a moment nobody recorded" is "the moment it became
--      knowable". Any other value would be a fabrication, and there is nothing to derive it from —
--      the base table stored no timestamp and the identifier's embedded ISO string was rejected as an
--      ordering source above, which means it is not consulted here either. Consistency between the
--      two rules matters: a migration that refuses to order by `id` will not quietly order by the
--      timestamp inside it.
--
--   2. THE TIE IS REAL, NOT HYPOTHETICAL, and that is what makes the `id` tiebreaker below
--      necessary rather than decorative. A validator who allocated two batches before this migration
--      has two interrupted batches stamped with the SAME instant, so the ordering genuinely can tie
--      in the world — not merely in a test fixture. This is stated because the first draft of this
--      file's design justified the tiebreaker with `toISOString()`'s millisecond precision, and that
--      was false in an instructive way: two batches minted by ONE validator in the same millisecond
--      produce the IDENTICAL id, because both halves of the template match. That is a primary-key
--      collision on `validation_batches.id` and a refused insert, not a tie. The backfill is the
--      actual source of ties.
--
--   There are no production rows — no Supabase project has ever been created in this repository, per
--   `docs/ROADMAP.md` — so no research record is misdated by the backfill. That is a property of the
--   current environment, not a general one, and an operator applying this to a populated database
--   should read the second reason above as a warning that their pre-existing batches will tie.

do $$
begin
  -- -------------------------------------------------------------------------
  -- The column must NOT already exist.
  -- -------------------------------------------------------------------------
  -- The same "did this file already run, or are its statements out of order?" guard
  -- `20260930190000_allocation_batch_positions.sql` carries as its property (1), and here for the
  -- same reason: without it, a re-applied file dies on `add column` with a duplicate-column error
  -- that says nothing about whether the DATA is intact, and a file whose `set not null` had run
  -- before its `add column` would instead refuse on a missing column. Either way the operator reads
  -- a message about mechanics instead of about state.
  --
  -- The name is `interrupted-batch-recovery:` rather than something generic, because that prefix is
  -- what `tests/integration/batch-recovery-migration.test.ts` matches on. A test matching the generic
  -- phrase "check constraint" or even a neighbouring migration's prefix would pass when the WRONG
  -- precondition fired, which is the reason this project's rejection tests match a constraint by name
  -- rather than by category.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'validation_batches'
      and column_name = 'created_at'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'interrupted-batch-recovery: validation_batches.created_at already exists, so this '
                'migration has been applied before or its statements are running out of order. The '
                'precondition must run BEFORE the column is added, because the precondition is the '
                'only thing standing between this migration and a fabricated batch order. Re-apply '
                'from a clean state.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The column, nullable first
-- ---------------------------------------------------------------------------
-- Nullable, backfilled, and only then tightened — the same three steps
-- `20260930190000_allocation_batch_positions.sql` uses, and for the same reason: it makes the
-- BACKFILL the thing that decides whether this migration may complete, rather than the accident of
-- whether `set not null` happened to scan a table that was already tidy. The alternative,
-- `add column created_at timestamptz not null default now()`, would satisfy the constraint in one
-- statement and make the backfill invisible — and it would also reintroduce exactly the database
-- default this file's own reasoning rejects two sections above.

alter table public.validation_batches
  add column created_at timestamptz;

-- The backfill. One statement, one identical `now()` for every row, deliberately NOT
-- `default now()` and not a per-row function that could return different instants. See the header
-- for why the tie this creates is the reason the index below carries an `id` key.
update public.validation_batches
  set created_at = now()
  where created_at is null;

-- ---------------------------------------------------------------------------
-- `not null`, once the backfill has made it true
-- ---------------------------------------------------------------------------
-- A batch whose creation instant is unknown would make "the most recently created" undefined rather
-- than merely imprecise, and the requirement says the choice must be TOTAL — no two batches may tie
-- and the same stored data must always yield the same choice. A nullable age cannot make that
-- guarantee, so this column is never null rather than null-with-a-fallback.

alter table public.validation_batches
  alter column created_at set not null;

-- ---------------------------------------------------------------------------
-- The access path: (validator_id, created_at DESC, id DESC)
-- ---------------------------------------------------------------------------
-- WHY A SECOND INDEX, ON REASONING RATHER THAN ON A MEASUREMENT
-- ---------------------------------------------------------------------------
-- `validation_batches_validator_id_idx` already exists on `(validator_id)` alone. It finds a
-- validator's batches; it cannot ORDER them. A b-tree can satisfy `where validator_id = ?` from that
-- index and then sort, and a sort of one validator's batches is cheap — so it is honest to say that
-- this index is unlikely to be a large win at this study's scale, and it would be dishonest to claim
-- a measured improvement nobody can take. No Supabase project exists, so there is no `EXPLAIN
-- ANALYZE` to run and no row counts to reason from.
--
-- It is added anyway, and the reasoning that does not need a measurement is about the ORDER rather
-- than about speed. The recovery read is `where validator_id = ? order by created_at desc, id desc`,
-- and this index is that predicate and that order as one structure: the index is already in the
-- required order, so the read is a single forward scan with no sort step. `(validator_id)` alone can
-- only offer the rows and leave the ordering to the planner. The cost is one more index on a table
-- that grows by one row per allocation, and the benefit is that the recovery lookup — the one query
-- this change adds — does not depend on the planner choosing well.
--
-- `id DESC` IS PART OF THE INDEX, and it is what makes the order total rather than merely stated.
-- `id` is the primary key, so no two rows share one and the ordering can never leave the choice to
-- the driver's row order — a property a caller can rely on and a test can assert. The backfill above
-- guarantees that rows DO share `created_at`, so without the `id` key this index would serve a query
-- whose result order is undefined precisely in the case the requirement calls out.
--
-- `id` is ordered DESCENDING to match, so that "newest first" is one direction in the index and not
-- two.
--
-- NO `VALID BATCHES` AND NO PARTIAL CONDITION, and that is deliberate: the index serves the whole
-- lookup, including the "no interrupted batch" case where every row belongs to a finished batch. A
-- partial index over "interrupted batches" would require a stored notion of interruption, which is
-- the derived flag this change exists to avoid.

create index validation_batches_validator_created_at_idx
  on public.validation_batches (validator_id, created_at desc, id desc);