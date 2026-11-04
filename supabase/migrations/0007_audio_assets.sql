-- Audio uploads share the protected draft asset pipeline with images/icons.
alter table public.site_assets
  drop constraint if exists site_assets_kind_check;

alter table public.site_assets
  add constraint site_assets_kind_check check (kind in ('image', 'icon', 'audio'));

