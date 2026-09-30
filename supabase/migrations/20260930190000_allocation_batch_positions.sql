-- The server-selected order of a batch.
--
-- FORWARD MIGRATION. `20260930120000_research_schema.sql` created `batch_entries` as a structural
-- table carrying only WHICH entries a batch contained, and its own comment says so: "coverage-aware
-- allocation is what decides *which* batch an entry joins; that logic arrives with the allocation
-- change". This is that change, so `position` arrives here rather than being edited back into the
-- original file. Nothing in a shipped migration is rewritten.
--
-- The column was, in fact, written into the base schema first and removed during review — see the
-- comment above the `create table` in `20260930120000_research_schema.sql`. It was removed for the
-- same reason as `requested_size` and `assigned_at` beside it: a column that carries no behaviour
-- is a claim about a lifecycle nobody has built, and the research-schema scenario "structural
-- tables carry no invented behavior" forbids it. Allocation is the change that gives `position`
-- behaviour — it is what the allocation service writes and what a reviewer reads back — so the
-- column is now legitimately non-structural, and here it is.
--
-- ---------------------------------------------------------------------------
-- WHAT `position` IS, AND WHY IT CANNOT BE A SEQUENCE
-- ---------------------------------------------------------------------------
-- It is the SERVER'S choice of order within a batch, not the order the rows happened to be written
-- in. That distinction is the entire reason for the column: `primary key (batch_id,
-- dataset_entry_id)` fixes the row identity, and a `select` from `batch_entries` has no defined
-- order at all. Without `position`, "the order the validator actually worked through" is not stored
-- anywhere, and it would be reconstructed from whatever the database happened to return.
--
-- Hence 1-based and contiguous, with `position` written by the allocation service from the order
-- `selectBatchEntries` returned. NOT `generated always as identity` or `row_number()`: those would
-- record the order rows were INSERTED, which under a concurrent batch request is an accident of
-- scheduling rather than the order the allocation decided on. `batchEntryPositionSchema` in
-- `@/schemas/batch` states the same 1-based rule, and the two are what a divergence would show up
-- in.
--
-- WHY NOT `DEFAULT nextval(...)` EITHER. That is the same mistake with a nicer name: it records
-- arrival order, and it also introduces a sequence whose current value would become part of the
-- research record for no reason.

do $$
begin
  -- -----------------------------------------------------------------------
  -- Property (1): the column must NOT already exist.
  -- -----------------------------------------------------------------------
  -- This is the same "did this file already run, or are its statements out of order?" guard that
  -- `20260930160000_required_bilingual_translations.sql` carries as property (2) of its ordering
  -- note, and it is here for the same reason: without it, a re-applied file fails on `add column`
  -- with a generic duplicate-column error that says nothing about whether the DATA is intact, and a
  -- file whose `set not null` had somehow run before its `add column` would instead refuse on a
  -- missing column. Either way the operator gets an error about mechanics instead of about state.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_entries'
      and column_name = 'position'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'allocation-batch-positions: batch_entries.position already exists, so this '
                'migration has been applied before or its statements are running out of order. '
                'The precondition must run BEFORE the column is added, because the precondition is '
                'the only thing standing between this migration and a fabricated batch order. '
                'Re-apply from a clean state.';
  end if;

  -- -----------------------------------------------------------------------
  -- Property (2): the table must be EMPTY.
  -- -----------------------------------------------------------------------
  -- This is the load-bearing refusal, and the reasoning is the same shape as the bilingual
  -- migration's: `position` is not derivable from anything already stored. A row in `batch_entries`
  -- records that an entry was assigned to a batch; it records nothing about WHERE in that batch.
  -- The information this migration adds therefore does not exist anywhere in the rows that are
  -- already there, and every way of producing it fabricates research data:
  --
  --   * Renumber by rowid or by `dataset_entry_id`. Invented order, presented as the server's
  --     choice. A batch whose recorded order was a lexicographic accident would read as a genuine
  --     allocation decision in the research export.
  --   * Default every position to 1. Immediately refused by the unique constraint below, and only
  --     because that constraint exists — the failure would then name a uniqueness violation rather
  --     than the real problem, which is that the order is unknown.
  --   * Assume the table is empty. True today, unfalsifiable later, and an assumption written into
  --     a migration is indistinguishable from a fact until the day it is wrong.
  --   * Delete the rows. Research data is never discarded as ordinary feature work.
  --
  -- So the migration RAISES and refuses to apply, naming the conflict and stating what it will NOT
  -- do, so an operator reading the failure knows the resolution is theirs and not a bug to retry.
  --
  -- WHY THIS IS A SEPARATE GUARD RATHER THAN A CONSEQUENCE OF `set not null`, MEASURED RATHER THAN
  -- ASSUMED. `alter column set not null` DOES refuse on a non-empty table — it raises that the
  -- column contains null values. So deleting this `do` block would leave a migration that still
  -- refuses. What it would leave is a migration that refuses for the WRONG REASON and says the
  -- wrong thing: `column "position" of relation "batch_entries" contains null values` describes a
  -- column that was just created, when the actual problem is that the ORDER of pre-existing batches
  -- is unknown and cannot be reconstructed.
  --
  -- That message is measured, not predicted. Deleting this block and re-running
  -- `tests/integration/allocation-migration.test.ts` gives `Tests  2 failed | 11 passed (13)` against
  -- a negative control of `Tests  13 passed (13)`, and the two failures are both refusal tests,
  -- failing with `expected 'column "position" of relation "batch_…' to contain
  -- 'allocation-batch-positions:'`. The other eleven pass, and THAT is what makes the result
  -- attributable: the mutated file is still valid SQL that still applies both constraints, so the red
  -- is about the missing explanation and not about a migration that stopped working. The second
  -- failure is the re-apply guard above, which then reports the bare `column "position" … already
  -- exists` instead of naming this precondition.
  --
  -- The consequence, stated plainly rather than left to be inferred: this block is not what makes the
  -- migration SAFE. Transaction rollback and `set not null` already are. What this block makes is the
  -- failure LEGIBLE, and that is the entire value of the lines above.
  if exists (
    select 1
    from public.batch_entries
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'allocation-batch-positions: this database holds pre-existing batch_entries rows, '
                'whose position within their batch is not recorded anywhere and cannot be derived '
                'from anything stored. This migration will not renumber them by rowid or by '
                'dataset_entry_id, will not default them to a single position, will not discard '
                'them, and will not assume the table was empty. The order is unrecoverable and will '
                'not be invented. Resolve the existing rows first, then reapply.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Added NULLABLE first and tightened afterwards, so the precondition above is what decides whether
-- this migration may run — not the accident of whether the table happened to be empty at the moment
-- the `alter` executed. The precondition has already established that it is.

alter table public.batch_entries
  add column position integer;

-- The precondition established that `batch_entries` is empty, so this succeeds. It is stated
-- separately rather than as `add column position integer not null` because `not null` on a new
-- column is validated by the same scan and would produce the SAME uninformative "contains null
-- values" error if the precondition had ever been removed. Keeping the two steps apart is what
-- makes the precondition the thing that guards this migration rather than a check that happens to
-- run first.
alter table public.batch_entries
  alter column position set not null;

-- ---------------------------------------------------------------------------
-- The constraints
-- ---------------------------------------------------------------------------
-- `> 0` rather than `>= 0`, because the domain is 1-BASED (`batchEntryPositionSchema`) so that a
-- reviewer saying "the third entry of batch 12" needs no subtraction. Zero is therefore not a
-- position the application can mean, and accepting it would leave the meaning of position 0
-- dependent on whoever reads the table next.
--
-- NAMED, and named the same in `@/schemas/batch`, so a rejection identifies which rule fired from
-- either side. The integration test matches on this NAME rather than the generic phrase `check
-- constraint`, because a generic pattern passes when the wrong constraint fires.
alter table public.batch_entries
  add constraint batch_entries_position_positive check (
    position > 0
  );

-- Two entries of one batch cannot share a position. Without it, an order could be written twice and
-- the batch would have no defined sequence — a validator given two "entry 4"s and no "entry 3".
--
-- This constraint is also what a fabricator runs into, which is noted above and is not the reason it
-- exists: it exists because a batch order that is not total is not an order.
--
-- NO INDEX IS ADDED FOR IT, and that is deliberate rather than an omission. The unique constraint
-- creates a unique index whose LEADING column is `batch_id`, which is exactly the access pattern
-- `findById` uses (`where batch_id = ? order by position`), so the ordering read is served by this
-- index and needs nothing else. A separate `position` index would only serve "every batch containing
-- position 4", which is not a question this application asks.
--
-- Deliberately NOT `unique (batch_id, position)` covering `dataset_entry_id`: the two same-entry rows
-- in one batch are already impossible via `primary key (batch_id, dataset_entry_id)`, so this
-- constraint is purely about the ORDER.
alter table public.batch_entries
  add constraint batch_entries_batch_position_unique unique (
    batch_id,
    position
  );