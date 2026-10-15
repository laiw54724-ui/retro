alter table public.site_assets
  add column if not exists storage_scope text not null default 'legacy_public',
  add column if not exists migration_status text not null default 'not_required';

update public.site_assets
set migration_status = 'not_required'
where storage_scope = 'legacy_public' and migration_status is null;

alter table public.site_assets
  drop constraint if exists site_assets_storage_scope_check,
  drop constraint if exists site_assets_migration_status_check;
alter table public.site_assets
  add constraint site_assets_storage_scope_check check (storage_scope in ('legacy_public', 'draft_private')),
  add constraint site_assets_migration_status_check check (migration_status in ('not_required', 'pending', 'migrated', 'failed'));

create index if not exists site_assets_site_scope_idx on public.site_assets(site_id, storage_scope, created_at desc);

create or replace function public.migrate_site_assets_private(
  p_site_id uuid,
  p_owner_id uuid,
  p_expected_version integer,
  p_document jsonb,
  p_asset_updates jsonb
) returns table(draft_version integer, draft_document jsonb, migrated_count integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_site public.sites%rowtype;
  v_update jsonb;
  v_count integer := 0;
  v_expected integer := jsonb_array_length(coalesce(p_asset_updates, '[]'::jsonb));
  v_id uuid;
  v_ref text;
  v_old_prefix text;
  v_new_prefix text;
  v_seen text[] := '{}'::text[];
begin
  if jsonb_typeof(coalesce(p_asset_updates, '[]'::jsonb)) <> 'array' then raise exception 'invalid_asset_updates'; end if;
  select * into v_site from public.sites where id = p_site_id and owner_id = p_owner_id for update;
  if not found then raise exception 'site_not_found'; end if;
  if v_site.draft_version <> p_expected_version then raise exception 'version_conflict'; end if;
  v_old_prefix := 'users/' || p_owner_id::text || '/sites/' || p_site_id::text || '/';
  v_new_prefix := 'draft/users/' || p_owner_id::text || '/sites/' || p_site_id::text || '/';
  for v_update in select * from jsonb_array_elements(coalesce(p_asset_updates, '[]'::jsonb)) loop
    if jsonb_typeof(v_update) <> 'object' then raise exception 'invalid_asset_update'; end if;
    begin v_id := (v_update->>'id')::uuid; exception when others then raise exception 'invalid_asset_update'; end;
    if v_id::text = any(v_seen) then raise exception 'duplicate_asset_update'; end if;
    v_seen := array_append(v_seen, v_id::text);
    v_ref := 'retro-asset:' || v_id::text;
    if v_update->>'oldObjectKey' is null or v_update->>'oldPublicUrl' is null or v_update->>'objectKey' is null or v_update->>'publicUrl' is null then raise exception 'invalid_asset_update'; end if;
    if (v_update->>'oldObjectKey') !~ ('^' || v_old_prefix || v_id::text || E'\\.(jpg|png|webp|gif)$') then raise exception 'invalid_legacy_asset_key'; end if;
    if (v_update->>'objectKey') !~ ('^' || v_new_prefix || v_id::text || E'\\.(jpg|png|webp|gif)$') then raise exception 'invalid_draft_asset_key'; end if;
    if v_update->>'publicUrl' <> v_ref then raise exception 'invalid_asset_reference'; end if;
    update public.site_assets
    set object_key = v_update->>'objectKey', public_url = v_update->>'publicUrl', storage_scope = 'draft_private', migration_status = 'migrated'
    where id = (v_update->>'id')::uuid
      and site_id = p_site_id
      and owner_id = p_owner_id
      and storage_scope = 'legacy_public'
      and object_key = v_update->>'oldObjectKey'
      and public_url = v_update->>'oldPublicUrl';
    if found then v_count := v_count + 1; end if;
  end loop;
  if v_count <> v_expected then raise exception 'asset_migration_conflict'; end if;
  update public.sites set draft_document = p_document, draft_version = draft_version + 1, updated_at = now() where id = p_site_id;
  return query select v_site.draft_version + 1, p_document, v_count;
end;
$$;

revoke all on function public.migrate_site_assets_private(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.migrate_site_assets_private(uuid, uuid, integer, jsonb, jsonb) to service_role;
