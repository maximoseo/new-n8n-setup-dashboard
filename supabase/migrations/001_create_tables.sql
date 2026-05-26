create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  name text not null default '',
  language text not null default 'en' check (language in ('he', 'en')),
  direction text not null default 'ltr' check (direction in ('rtl', 'ltr')),
  site_type text not null default 'regular' check (site_type in ('regular', 'ecommerce')),
  sitemap_url text not null default '',
  about_page_url text not null default '',
  contact_page_url text not null default '',
  style_profile jsonb not null default '{}',
  logo_url text not null default '',
  logo_verified boolean not null default false,
  phone text not null default '',
  whatsapp text not null default '',
  social_links jsonb not null default '{}',
  author_name text not null default '',
  author_bio text not null default '',
  author_image_url text not null default '',
  google_sheets_url text not null default '',
  webhook_url text not null default '',
  github_repo_url text,
  prompts jsonb not null default '{}',
  workflow jsonb not null default '{}',
  html_template jsonb not null default '{}',
  keywords jsonb not null default '[]',
  checks jsonb not null default '[]',
  status text not null default 'input' check (status in ('input','discovery','keywords','prompts','workflow','template','testing','review','deployed')),
  chat_history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sites_user_id on public.sites(user_id);
create index if not exists idx_sites_user_updated_at on public.sites(user_id, updated_at desc);

alter table public.sites enable row level security;

drop policy if exists "Users can view own sites" on public.sites;
create policy "Users can view own sites"
  on public.sites for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own sites" on public.sites;
create policy "Users can insert own sites"
  on public.sites for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own sites" on public.sites;
create policy "Users can update own sites"
  on public.sites for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own sites" on public.sites;
create policy "Users can delete own sites"
  on public.sites for delete
  using ((select auth.uid()) = user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  ahrefs_api_key_encrypted text,
  dataforseo_login_encrypted text,
  llm_provider_key_encrypted text,
  github_token_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can manage own settings" on public.user_settings;
create policy "Users can manage own settings"
  on public.user_settings for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
