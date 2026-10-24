-- Requires owner approval before applying security settings (Refs #76).
-- Browsers authenticate with Supabase, then mutate through the Worker. Owner and
-- editor draft/asset edits stay available through that validated service path.
-- Keep SELECT policies/visibility, data and RPC bodies unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all privileges on table public.sites, public.site_versions, public.site_assets
  from public, anon, authenticated;

-- Table REVOKE does not remove independent column grants. Clear existing column
-- ACLs as well, including PUBLIC grants, without hard-coding a schema version.
do $$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array['sites', 'site_versions', 'site_assets'] loop
    select string_agg(format('%I', attname), ', ' order by attnum)
      into v_columns
      from pg_catalog.pg_attribute
     where attrelid = format('public.%I', v_table)::regclass
       and attnum > 0 and not attisdropped;
    execute format(
      'revoke all privileges (%s) on table public.%I from public, anon, authenticated',
      v_columns, v_table
    );
  end loop;
end;
$$;

grant select on table public.sites, public.site_versions, public.site_assets to authenticated;

-- Defense in depth: SELECT policies never authorize a client mutation even if
-- someone later mistakenly re-grants DML. service_role retains BYPASSRLS.
drop policy if exists "owners can create sites" on public.sites;
drop policy if exists "owners can update their sites" on public.sites;
drop policy if exists "owners can delete their sites" on public.sites;
drop policy if exists "owners can create site versions" on public.site_versions;
drop policy if exists "owners can create site assets" on public.site_assets;
drop policy if exists "owners can delete site assets" on public.site_assets;

-- Required Worker table operations; do not depend on platform default grants.
-- Do not revoke unrelated existing service privileges or alter role attributes.
grant select, insert, update on table public.sites to service_role;
grant select, insert on table public.site_versions to service_role;
grant select, insert, update, delete on table public.site_assets to service_role;

-- Caller-supplied owner IDs in these RPCs are trusted only after Worker checks.
revoke all on function public.publish_site_atomic(uuid, uuid, integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.migrate_site_assets_private(uuid, uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_site_atomic(uuid, uuid, integer, integer, jsonb) to service_role;
grant execute on function public.migrate_site_assets_private(uuid, uuid, integer, jsonb, jsonb) to service_role;

-- Fail closed on unexpected inherited privileges or policy/RLS drift. Do not
-- silently alter other roles or delete unknown deployment-specific policies.
do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
  v_rpc text;
begin
  if not (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'worker_write_boundary_service_requires_existing_bypassrls';
  end if;
  foreach v_table in array array['sites', 'site_versions', 'site_assets'] loop
    if not (select relrowsecurity from pg_catalog.pg_class
             where oid = format('public.%I', v_table)::regclass) then
      raise exception 'worker_write_boundary_rls_disabled: %', v_table;
    end if;
    if exists (select 1 from pg_catalog.pg_policy
                where polrelid = format('public.%I', v_table)::regclass
                  and polcmd <> 'r') then
      raise exception 'worker_write_boundary_unexpected_write_policy: %', v_table;
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(v_role, format('public.%I', v_table), v_privilege) then
          raise exception 'worker_write_boundary_inherited_table_grant: % / % / %', v_role, v_table, v_privilege;
        end if;
      end loop;
      foreach v_privilege in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
        if has_any_column_privilege(v_role, format('public.%I', v_table), v_privilege) then
          raise exception 'worker_write_boundary_inherited_column_grant: % / % / %', v_role, v_table, v_privilege;
        end if;
      end loop;
    end loop;
    if has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
       or has_any_column_privilege('anon', format('public.%I', v_table), 'SELECT') then
      raise exception 'worker_write_boundary_inherited_anonymous_read: %', v_table;
    end if;
  end loop;
  foreach v_rpc in array array[
    'public.publish_site_atomic(uuid,uuid,integer,integer,jsonb)',
    'public.migrate_site_assets_private(uuid,uuid,integer,jsonb,jsonb)'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_rpc, 'EXECUTE') then
        raise exception 'worker_write_boundary_inherited_rpc_grant: % / %', v_role, v_rpc;
      end if;
    end loop;
  end loop;
end;
$$;

commit;
