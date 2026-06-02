-- n8n Workflow + Google Sheets Cloner — job history + Excel-upload persistence.
-- Follows the conventions in 001_create_tables.sql: text + check "enums",
-- per-user row level security, and idempotent (re-runnable) statements.

-- ---------------------------------------------------------------------------
-- cloner_jobs — one row per clone run (in-progress, done, or failed).
-- ---------------------------------------------------------------------------
create table if not exists public.cloner_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_workflow_id text not null default '',
  source_workflow_name text not null default '',
  new_domain text not null default '',
  new_site_url text not null default '',
  wp_username text not null default '',
  sheet_id text not null default '',
  sheet_url text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'connecting', 'uploading', 'cloning', 'done', 'failed')),
  mapping jsonb not null default '{}',
  changes jsonb not null default '[]',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cloner_jobs_user_id on public.cloner_jobs(user_id);
create index if not exists idx_cloner_jobs_status on public.cloner_jobs(status);
create index if not exists idx_cloner_jobs_created_at on public.cloner_jobs(created_at desc);
create index if not exists idx_cloner_jobs_user_created_at on public.cloner_jobs(user_id, created_at desc);

alter table public.cloner_jobs enable row level security;

drop policy if exists "Users can view own cloner jobs" on public.cloner_jobs;
create policy "Users can view own cloner jobs"
  on public.cloner_jobs for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own cloner jobs" on public.cloner_jobs;
create policy "Users can insert own cloner jobs"
  on public.cloner_jobs for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own cloner jobs" on public.cloner_jobs;
create policy "Users can update own cloner jobs"
  on public.cloner_jobs for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own cloner jobs" on public.cloner_jobs;
create policy "Users can delete own cloner jobs"
  on public.cloner_jobs for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- cloner_excel_uploads — the parsed .xlsx that fed a clone, linked to its job.
-- Ownership is inherited from the parent job (no direct user_id column).
-- ---------------------------------------------------------------------------
create table if not exists public.cloner_excel_uploads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cloner_jobs(id) on delete cascade,
  file_name text not null default '',
  sheet_count integer not null default 0,
  total_rows integer not null default 0,
  parsed_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_cloner_excel_uploads_job_id on public.cloner_excel_uploads(job_id);
create index if not exists idx_cloner_excel_uploads_created_at on public.cloner_excel_uploads(created_at desc);

alter table public.cloner_excel_uploads enable row level security;

drop policy if exists "Users can view own cloner uploads" on public.cloner_excel_uploads;
create policy "Users can view own cloner uploads"
  on public.cloner_excel_uploads for select
  using (
    exists (
      select 1 from public.cloner_jobs j
      where j.id = cloner_excel_uploads.job_id
        and j.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can insert own cloner uploads" on public.cloner_excel_uploads;
create policy "Users can insert own cloner uploads"
  on public.cloner_excel_uploads for insert
  with check (
    exists (
      select 1 from public.cloner_jobs j
      where j.id = cloner_excel_uploads.job_id
        and j.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete own cloner uploads" on public.cloner_excel_uploads;
create policy "Users can delete own cloner uploads"
  on public.cloner_excel_uploads for delete
  using (
    exists (
      select 1 from public.cloner_jobs j
      where j.id = cloner_excel_uploads.job_id
        and j.user_id = (select auth.uid())
    )
  );
