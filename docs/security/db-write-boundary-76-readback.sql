-- Read-only metadata receipt. No site rows, Auth records, keys or policy bodies.
-- Run against the explicitly selected project, before and after approved 0010.
begin read only;
with targets(name) as (
  values ('sites'), ('site_versions'), ('site_assets')
), clients(name) as (
  values ('anon'), ('authenticated')
), mutation_rpcs as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as arguments
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'publish_site_atomic', 'migrate_site_assets_private',
    'create_site_invite', 'revoke_site_invite', 'accept_site_invite',
    'update_site_member_role', 'remove_site_member',
    'submit_guestbook_entry', 'report_guestbook_entry'
  )
)
select jsonb_build_object(
  'checked_at', clock_timestamp(),
  'server_version', current_setting('server_version'),
  'service_role_bypassrls', (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role'),
  'tables', (select jsonb_agg(jsonb_build_object(
    'name', t.name,
    'rls_enabled', c.relrowsecurity,
    'authenticated_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
    'anon_any_select', has_any_column_privilege('anon', c.oid, 'SELECT'),
    'service_select', has_table_privilege('service_role', c.oid, 'SELECT'),
    'service_insert', has_table_privilege('service_role', c.oid, 'INSERT'),
    'service_update', has_table_privilege('service_role', c.oid, 'UPDATE'),
    'service_delete', has_table_privilege('service_role', c.oid, 'DELETE'),
    'policy_commands', (select jsonb_agg(distinct polcmd) from pg_catalog.pg_policy where polrelid = c.oid)
  ) order by t.name) from targets t join pg_catalog.pg_class c on c.oid = ('public.' || t.name)::regclass),
  'client_write_grants', (select coalesce(jsonb_agg(jsonb_build_object(
    'table', t.name, 'role', r.name, 'privilege', p.name
  ) order by t.name, r.name, p.name), '[]'::jsonb)
    from targets t cross join clients r cross join (values
      ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) p(name) where has_table_privilege(r.name, 'public.' || t.name, p.name)),
  'client_column_write_grants', (select coalesce(jsonb_agg(jsonb_build_object(
    'table', t.name, 'role', r.name, 'privilege', p.name
  ) order by t.name, r.name, p.name), '[]'::jsonb)
    from targets t cross join clients r cross join (values
      ('INSERT'), ('UPDATE'), ('REFERENCES')
    ) p(name) where has_any_column_privilege(r.name, 'public.' || t.name, p.name)),
  'mutation_rpcs', (select jsonb_agg(jsonb_build_object(
    'name', m.proname, 'arguments', m.arguments,
    'anon_execute', has_function_privilege('anon', m.oid, 'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated', m.oid, 'EXECUTE'),
    'service_execute', has_function_privilege('service_role', m.oid, 'EXECUTE')
  ) order by m.proname, m.arguments) from mutation_rpcs m)
) as receipt;
commit;
