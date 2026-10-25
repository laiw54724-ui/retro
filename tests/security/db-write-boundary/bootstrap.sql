-- LOCAL TEST DATABASE ONLY. Minimal Auth fixtures, not a Supabase installation.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase normally supplies service ACLs separately from application migrations.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'owner-b@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'editor@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'viewer@example.invalid');
