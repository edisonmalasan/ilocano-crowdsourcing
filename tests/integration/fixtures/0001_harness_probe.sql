-- Harness fixture. Exercises the three migration features the harness must support:
--   1. a table with a foreign key,
--   2. a UNIQUE constraint that the application relies on for research integrity,
--   3. an RLS policy that references auth.uid().
-- This file lives under tests/ and is NEVER applied to a real Supabase project.

create table public.fixture_owners (
  id uuid primary key default gen_random_uuid(),
  label text not null
);

create table public.fixture_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.fixture_owners (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),

  -- The application must be able to rely on the database to reject a second note for the same
  -- owner. This is the same shape as UNIQUE (validator_id, dataset_entry_id) in the real schema.
  constraint fixture_notes_owner_body_unique unique (owner_id, body)
);

alter table public.fixture_owners enable row level security;
alter table public.fixture_notes enable row level security;

create policy fixture_owners_read_anon on public.fixture_owners
  for select to anon, authenticated
  using (true);

create policy fixture_notes_owner_own on public.fixture_notes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
