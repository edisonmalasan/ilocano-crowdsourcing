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
-- have somewhere to record participation. This change writes no row to it and defines no behavior
-- for it; the session lifecycle belongs to the phases that own screening and batch continuation.

create table public.validation_sessions (
  id                text        primary key,
  validator_id      text        not null references public.validators (id) on delete restrict,
  started_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  ended_at          timestamptz
);

create index validation_sessions_validator_id_idx
  on public.validation_sessions (validator_id);

-- ---------------------------------------------------------------------------
-- validation_batches
-- ---------------------------------------------------------------------------
-- STRUCTURAL ONLY, except that `validations.batch_id` references it. `ValidationResponse.batch_id`
-- is a required field, so this table must exist or that foreign key would be fiction. The batch
-- lifecycle itself is owned by the allocation change; the size bounds here mirror
-- BATCH_SIZE_HARD_MAX so an obviously impossible batch cannot be stored.

create table public.validation_batches (
  id                text        primary key,
  validator_id      text        not null references public.validators (id) on delete restrict,
  requested_size    integer     not null,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,

  constraint validation_batches_requested_size_range check (requested_size between 1 and 50)
);

create index validation_batches_validator_id_idx
  on public.validation_batches (validator_id);

-- ---------------------------------------------------------------------------
-- batch_entries
-- ---------------------------------------------------------------------------
-- STRUCTURAL ONLY. The assignment record: which batch contained which entry. `PRIMARY KEY
-- (batch_id, dataset_entry_id)` is itself a uniqueness constraint, so an entry cannot be assigned
-- to the same batch twice. Coverage-aware allocation is what decides *which* batch an entry joins;
-- that logic arrives with the allocation change.

create table public.batch_entries (
  batch_id          text        not null references public.validation_batches (id) on delete cascade,
  dataset_entry_id  text        not null references public.dataset_entries (id) on delete restrict,
  assigned_at       timestamptz not null default now(),

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
-- A denied read is SILENT: `select` as `anon` returns zero rows with no error, while `insert` is
-- rejected with "new row violates row-level security policy". That asymmetry is the reason the
-- repository contract forbids treating an empty result as proof that a query succeeded. RLS here
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
