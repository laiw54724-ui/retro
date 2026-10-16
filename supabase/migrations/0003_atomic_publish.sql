-- Versioned publication is committed in Postgres before the CDN artifact is attempted.
alter table public.sites
  add column if not exists published_artifact_status text not null default 'none',
  add column if not exists published_artifact_key text,
  add column if not exists published_artifact_error text;

alter table public.sites
  drop constraint if exists sites_published_artifact_status_check;
alter table public.sites
  add constraint sites_published_artifact_status_check
  check (published_artifact_status in ('none', 'pending', 'synced', 'failed'));

create or replace function public.publish_site_atomic(
  p_site_id uuid,
  p_owner_id uuid,
  p_expected_version integer,
  p_expected_published_version integer,
  p_document jsonb
)
returns table (
  published_version integer,
  published_at timestamptz,
  artifact_key text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_site public.sites%rowtype;
  v_version integer;
  v_published_at timestamptz := clock_timestamp();
  v_artifact_key text;
begin
  select * into v_site
    from public.sites
   where id = p_site_id
     and owner_id = p_owner_id
   for update;

  if not found then
    raise exception 'site_not_found' using errcode = 'P0001';
  end if;
  if v_site.draft_version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001', detail = v_site.draft_version::text;
  end if;
  if coalesce(v_site.published_version, 0) <> coalesce(p_expected_published_version, 0) then
    raise exception 'published_version_conflict' using errcode = 'P0001', detail = coalesce(v_site.published_version, 0)::text;
  end if;

  v_version := coalesce(v_site.published_version, 0) + 1;
  v_artifact_key := format('published/%s/versions/%s/site.json', v_site.username, v_version);

  -- site_versions has a unique(site_id, version) constraint from 0001_initial.sql.
  insert into public.site_versions (site_id, version, document, created_by)
  values (v_site.id, v_version, p_document, p_owner_id);

  update public.sites
     set published_document = p_document,
         published_version = v_version,
         published_at = v_published_at,
         published_artifact_status = 'pending',
         published_artifact_key = v_artifact_key,
         published_artifact_error = null,
         updated_at = v_published_at
   where id = v_site.id;

  return query select v_version, v_published_at, v_artifact_key;
end;
$$;

revoke all on function public.publish_site_atomic(uuid, uuid, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.publish_site_atomic(uuid, uuid, integer, integer, jsonb) to service_role;
