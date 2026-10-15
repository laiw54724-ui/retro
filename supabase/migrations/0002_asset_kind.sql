-- Additive: distinguish uploaded desktop icons from regular images, and keep a display name.
alter table public.site_assets add column if not exists kind text not null default 'image' check (kind in ('image','icon'));
alter table public.site_assets add column if not exists name text not null default '';
create index if not exists site_assets_kind_idx on public.site_assets(site_id, kind, created_at desc);
