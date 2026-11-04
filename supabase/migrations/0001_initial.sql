create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  username citext not null unique,
  site_name text not null,
  draft_document jsonb not null,
  draft_version integer not null default 1 check (draft_version >= 1),
  published_document jsonb,
  published_version integer,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$')
);

create index if not exists sites_owner_id_idx on public.sites(owner_id);
create index if not exists sites_published_at_idx on public.sites(published_at desc) where published_document is not null;

create table if not exists public.site_versions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  version integer not null check (version >= 1),
  document jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(site_id, version)
);

create index if not exists site_versions_site_id_idx on public.site_versions(site_id, version desc);

create table if not exists public.site_assets (
  id uuid primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_key text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  public_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists site_assets_site_id_idx on public.site_assets(site_id, created_at desc);
create index if not exists site_assets_owner_id_idx on public.site_assets(owner_id);

alter table public.sites enable row level security;
alter table public.site_versions enable row level security;
alter table public.site_assets enable row level security;

create policy "owners can read their sites"
on public.sites for select
using (auth.uid() = owner_id);

create policy "owners can create sites"
on public.sites for insert
with check (auth.uid() = owner_id);

create policy "owners can update their sites"
on public.sites for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "owners can delete their sites"
on public.sites for delete
using (auth.uid() = owner_id);

create policy "owners can read site versions"
on public.site_versions for select
using (
  exists (
    select 1 from public.sites
    where sites.id = site_versions.site_id
      and sites.owner_id = auth.uid()
  )
);

create policy "owners can create site versions"
on public.site_versions for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.sites
    where sites.id = site_versions.site_id
      and sites.owner_id = auth.uid()
  )
);

create policy "owners can read site assets"
on public.site_assets for select
using (auth.uid() = owner_id);

create policy "owners can create site assets"
on public.site_assets for insert
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.sites
    where sites.id = site_assets.site_id
      and sites.owner_id = auth.uid()
  )
);

create policy "owners can delete site assets"
on public.site_assets for delete
using (auth.uid() = owner_id);

revoke all on public.sites from anon;
revoke all on public.site_versions from anon;
revoke all on public.site_assets from anon;

grant select, insert, update, delete on public.sites to authenticated;
grant select, insert on public.site_versions to authenticated;
grant select, insert, delete on public.site_assets to authenticated;
