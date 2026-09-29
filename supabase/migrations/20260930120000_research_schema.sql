-- Research schema for the Sadino Crowdsourcing Validation Platform.
--
-- Constraints on this file, all of them load-bearing:
--
--   1. Plain PostgreSQL only. It is applied by the PGlite integration harness in CI as well as
--      by a hosted Supabase project, so it must not require a Supabase-managed extension.
--   2. It runs inside a transaction (one per migration file), so it must not contain
--      `begin;`/`commit;` and must not use CREATE INDEX CONCURRENTLY.
--   3. `auth.uid()` may appear only inside a Row Level Security policy. In fact this schema does
--      not use it at all: validators are anonymous, so there is no authentication subject for a
--      policy to compare against. See design.md D1.
--
-- Two decisions are worth reading before the DDL, because they are not obvious from the column
-- names:
--
--   * Primary keys are DOMAIN identifiers, not uuid surrogates. `dataset_entries.id` is the
--     source id (`OD_0001`) and `validators.id` is the anonymous id (`VAL_` + 8 hex). Nothing in
--     the domain joins on an authentication subject, so a surrogate key would add a second
--     identity per row and a translation bug class for no benefit.
--
--   * Deletes are RESTRICTED on anything that would destroy a research response. A validator may
--     be anonymous, but a validation response is a research record; the database should refuse to
--     make it disappear as a side effect of removing a parent row. The one CASCADE is on
--     `batch_entries`, whose only purpose is to say which batch contained which entry.

-- ---------------------------------------------------------------------------
-- dataset_entries
-- ---------------------------------------------------------------------------
-- The canonical, category-agnostic form of an imported dataset record. `category` is a plain
-- identifier rather than an enum, so a later dataset category is a data import and not a deploy.

create table public.dataset_entries (
  -- The source dataset entry id, preserved verbatim (for example `OD_0001`).
  id                text        primary key,
  category          text        not null,
  instruction       text        not null,
  origin            text,
  destination       text,
  transit_mode      text,
  -- The unmodified source record. The typed columns above are a query-friendly projection of this
  -- column, never a replacement for it: an unmodelled field survives here rather than being
  -- dropped, which is what makes a dropped field recoverable instead of unrecoverable.
  source_payload    jsonb       not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),

  -- A blank instruction is not an instruction. The importer normalizes whitespace only, so this
  -- catches a genuinely empty value without rewriting Ilocano text.
  constraint dataset_entries_instruction_not_blank check (length(btrim(instruction)) > 0),

  -- Mirrors datasetCategorySchema: lowercase snake_case, no leading or trailing underscore.
  constraint dataset_entries_category_format check (category ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$')
);

-- Allocation selects the active pool for a category repeatedly, so the index is partial: retired
-- entries must not enlarge the pool the index has to scan.
create index dataset_entries_active_category_idx
  on public.dataset_entries (category)
  where is_active;

-- ---------------------------------------------------------------------------
-- validators
-- ---------------------------------------------------------------------------
-- An anonymous participant. There is deliberately no column for a name, email address, student id,
-- phone number, address, or social account. The domain schema is already a strictObject that
-- rejects such a payload; this table is the second, independent half of that guarantee.

create table public.validators (
  id                text        primary key,
  -- Self-reported screening metadata, not a quality score. Nothing in the schema derives a
  -- weighting or an eligibility rule from it.
  ilocano_proficiency text,
  created_at        timestamptz not null default now(),
  last_active_at    timestamptz not null default now(),
  total_validations integer     not null default 0,

  constraint validators_total_validations_non_negative check (total_validations >= 0),

  -- The five approved self-reported values, or absent. A validator may be created before, or
  -- without, completing screening, which is why this is nullable.
  constraint validators_proficiency_known check (
    ilocano_proficiency is null
    or ilocano_proficiency in ('native', 'fluent', 'conversational', 'basic', 'not_confident')
  )
);

-- ---------------------------------------------------------------------------
-- validation_sessions
-- ---------------------------------------------------------------------------
-- STRUCTURAL ONLY. This table exists so the roadmap's six-table shape is real and so later phases
-- have somewhere to record participation. It carries its identity and the one foreign key that
-- makes it mean something, and NOTHING ELSE: no timestamps, no state column, no constraint
-- describing a lifecycle. This change writes no row to it and defines no behavior for it; the
-- session lifecycle belongs to the phases that own screening and batch continuation.
--
-- A `started_at`/`last_seen_at`/`ended_at` trio was written here first and removed during review.
-- It looked free, but each column is a claim about what a session IS — when it began, when the
-- validator was last seen, whether it finished — and those claims belong to the change that owns
-- the lifecycle. A column added in the wrong phase has to be lived with or undone, which is the
-- exact cost design D3 exists to avoid. Columns are added by later `alter table` migrations.

create table public.validation_sessions (
  id                text        primary key,
  validator_id      text        not null references public.validators (id) on delete restrict
);

create index validation_sessions_validator_id_idx
  on public.validation_sessions (validator_id);

-- ---------------------------------------------------------------------------
-- validation_batches
-- ---------------------------------------------------------------------------
-- STRUCTURAL ONLY, except that `validations.batch_id` references it. `ValidationResponse.batch_id`
-- is a required field, so this table must exist or that foreign key would be fiction.
--
-- `requested_size` and its `1..50` check constraint were written here first and removed during
-- review, for the same reason as the session timestamps above: a size bound is batch-lifecycle
-- behavior, and duplicating `BATCH_SIZE_HARD_MAX` in SQL is a second authority for a constant
-- that Phase 4 owns. It can be re-added, with the allocation behavior it belongs to.

create table public.validation_batches (
  id                text        primary key,
  validator_id      text        not null references public.validators (id) on delete restrict
);

create index validation_batches_validator_id_idx
  on public.validation_batches (validator_id);

-- ---------------------------------------------------------------------------
-- batch_entries
-- ---------------------------------------------------------------------------
-- STRUCTURAL ONLY. The assignment record: which batch contained which entry. `PRIMARY KEY
-- (batch_id, dataset_entry_id)` is itself a uniqueness constraint, so an entry cannot be assigned
-- to the same batch twice — and it is a constraint the foreign keys require anyway, not invented
-- behavior. Coverage-aware allocation is what decides *which* batch an entry joins; that logic
-- arrives with the allocation change. `assigned_at` was written here first and removed during
-- review, on the same grounds as the timestamps above.

create table public.batch_entries (
  batch_id          text        not null references public.validation_batches (id) on delete cascade,
  dataset_entry_id  text        not null references public.dataset_entries (id) on delete restrict,

  primary key (batch_id, dataset_entry_id)
);

-- The primary key already indexes batch_id as its leading column, so only the reverse lookup
-- needs its own index. Allocation asks "which batches contain this entry" far more often.
create index batch_entries_dataset_entry_id_idx
  on public.batch_entries (dataset_entry_id);

-- ---------------------------------------------------------------------------
-- validations
-- ---------------------------------------------------------------------------
-- One completed entry's response. Called once per completed entry, not once per batch, because
-- the approved saving strategy persists each entry as it is finished.

create table public.validations (
  id                    text        primary key,
  validator_id          text        not null references public.validators (id) on delete restrict,
  dataset_entry_id      text        not null references public.dataset_entries (id) on delete restrict,
  batch_id              text        not null references public.validation_batches (id) on delete restrict,

  -- Lowercase stored values, matching the domain schema. These are deliberately NOT the display
  -- labels: a check written against `Correct and natural` would reject every real write.
  evaluation            text        not null,

  -- A correction is response data. It lives here and is NEVER written back onto
  -- `dataset_entries.instruction`, which is immutable research material. There is no trigger,
  -- rule, or view here that could do so, and the integration test asserts the instruction is
  -- byte-identical after a validation carrying a correction is stored.
  corrected_instruction text,

  translation_language  text,
  translation_text      text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- THE research-integrity constraint this platform depends on. One anonymous validator holds at
  -- most one validation for a given dataset entry, and the DATABASE enforces it, so the rule
  -- still holds if application code is bypassed. Named so a failure can be identified rather
  -- than only detected. Coverage is defined in terms of independent validators, so this is also
  -- what stops a duplicate submission from inflating a coverage count.
  constraint validations_validator_entry_unique unique (validator_id, dataset_entry_id),

  constraint validations_evaluation_known check (
    evaluation in ('correct_natural', 'correct_unnatural', 'incorrect', 'cannot_evaluate')
  ),

  constraint validations_translation_language_known check (
    translation_language is null or translation_language in ('english', 'filipino')
  ),

  -- Absent or present-and-non-empty. A blank correction is not a correction, and silently
  -- storing `''` would make "the validator supplied a correction" indistinguishable from "the
  -- validator left it blank" at the SQL layer, which is exactly the distinction the domain's
  -- `normalizeResearchText` exists to preserve.
  constraint validations_corrected_instruction_not_blank check (
    corrected_instruction is null or length(btrim(corrected_instruction)) > 0
  ),

  constraint validations_translation_text_not_blank check (
    translation_text is null or length(btrim(translation_text)) > 0
  ),

  -- CROSS-COLUMN CHECKS.
  --
  -- Every check above constrains ONE column, and a row can satisfy all of them while being a
  -- record the domain schema rejects. The clearest example: `translation_language = 'english'`
  -- with `translation_text = NULL` satisfies both translation checks, and is not a translation
  -- anybody can use. Three such combinations were open, and they are closed here.
  --
  -- These three are written to mirror `applyValidationIntegrityRules` in `@/schemas/validation`
  -- EXACTLY — neither wider nor narrower, because both mistakes are real. A wider check would
  -- refuse a legitimate research response, and a narrower one would be dead weight that merely
  -- looks like a guarantee. The mapping is:
  --
  --   rules 2 and 3 -> a correction is REQUIRED for `correct_unnatural`/`incorrect` and REFUSED
  --                    for the other two evaluations, which is the same thing said once;
  --   rule 5        -> a translation language and its text are present together or absent
  --                    together;
  --   rules 4 and 6 -> `cannot_evaluate` carries no translation at all, because that evaluation
  --                    supplies no reliable content to translate.
  --
  -- None of these three predicates can evaluate to NULL — every column involved is either NOT NULL
  -- or tested with `IS NULL`/`IS NOT NULL` — so none of them can pass vacuously, which is the way a
  -- SQL `CHECK` usually leaks a row it was meant to exclude.
  constraint validations_correction_matches_evaluation check (
    (evaluation in ('correct_unnatural', 'incorrect')) = (corrected_instruction is not null)
  ),

  constraint validations_translation_pair check (
    (translation_language is null) = (translation_text is null)
  ),

  constraint validations_translation_requires_evaluable_content check (
    evaluation <> 'cannot_evaluate'
    or (translation_language is null and translation_text is null)
  )
);

-- Coverage counting for one entry is the hottest query in the platform: allocation recomputes it
-- across the candidate pool on every batch request.
create index validations_dataset_entry_id_idx
  on public.validations (dataset_entry_id);

create index validations_validator_id_idx
  on public.validations (validator_id);

-- Partially covered by the uniqueness constraint's leading column, but the batch-completion and
-- review paths filter by batch alone, and a batch is not a prefix of that index.
create index validations_batch_id_idx
  on public.validations (batch_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Enabled on every research table, and granted to NOBODY.
--
-- There is no validator session and no client-side persistence access in this architecture, so no
-- public or anon credential has a legitimate reason to read research data. Application access is
-- server-side through the privileged path, which bypasses RLS.
--
-- A refusal is NOT uniform, and the asymmetry is measured rather than assumed. With RLS enabled
-- and no policy:
--
--   select   -> zero rows,          NO error
--   update   -> zero rows affected, NO error
--   delete   -> zero rows affected, NO error
--   insert   -> "new row violates row-level security policy"
--
-- Only `insert` is loud. An update or a delete is filtered by the same policy a select is: the
-- row is simply not visible to the statement, so the statement succeeds against nothing. Nothing
-- is modified — the data is safe — but a successful write that changed nothing is
-- indistinguishable at the call site from one that changed something. That is the reason the
-- repository contract forbids treating an empty or unremarkable result as proof of success, and
-- the reason the server boundary rather than this schema is what authorizes a request. RLS here
-- is a backstop against a future mistake, not the primary authorization control.
--
-- Policies granting `authenticated` any access are added with the admin area, in the change that
-- introduces researcher authentication.
--
-- NOTE: table owners bypass RLS unless FORCE ROW LEVEL SECURITY is set. The privileged role has
-- BYPASSRLS, which is what the platform relies on. The verification therefore impersonates `anon`
-- and `authenticated` to demonstrate refusal, and never the privileged role to demonstrate it,
-- because that role would pass regardless.

alter table public.dataset_entries enable row level security;
alter table public.validators enable row level security;
alter table public.validation_sessions enable row level security;
alter table public.validation_batches enable row level security;
alter table public.batch_entries enable row level security;
alter table public.validations enable row level security;
