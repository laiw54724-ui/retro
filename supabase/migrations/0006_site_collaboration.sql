-- Site collaboration keeps sites.owner_id as the only owner source of truth.
-- Membership rows represent editor/viewer access only; invitation secrets are
-- stored as SHA-256 digests and all mutations are service-role RPCs so audit
-- records commit atomically with the state change.

create table public.site_memberships (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create index site_memberships_user_id_idx
  on public.site_memberships(user_id, updated_at desc);

create table public.site_invites (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor', 'viewer')),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create index site_invites_site_id_idx
  on public.site_invites(site_id, created_at desc);
create index site_invites_email_idx
  on public.site_invites(email, created_at desc);

create table public.site_collaboration_audit (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  invite_id uuid references public.site_invites(id) on delete set null,
  event text not null check (event in (
    'invite_created',
    'invite_revoked',
    'invite_accepted',
    'member_role_changed',
    'member_removed'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index site_collaboration_audit_site_idx
  on public.site_collaboration_audit(site_id, created_at desc);

alter table public.site_memberships enable row level security;
alter table public.site_invites enable row level security;
alter table public.site_collaboration_audit enable row level security;

-- These predicates derive the caller from auth.uid() and accept no user id,
-- avoiding recursive sites <-> memberships policy evaluation.
create or replace function public.is_site_owner(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.sites
    where id = p_site_id and owner_id = auth.uid()
  );
$$;

create or replace function public.can_read_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.sites
    where id = p_site_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.site_memberships
    where site_id = p_site_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_site_owner(uuid) from public, anon;
revoke all on function public.can_read_site(uuid) from public, anon;
grant execute on function public.is_site_owner(uuid) to authenticated, service_role;
grant execute on function public.can_read_site(uuid) to authenticated, service_role;

create policy "members can read shared sites"
on public.sites for select
using (public.can_read_site(id));

create policy "members can read site memberships"
on public.site_memberships for select
using (user_id = auth.uid() or public.is_site_owner(site_id));

create policy "owners can read site invites"
on public.site_invites for select
using (public.is_site_owner(site_id));

create policy "owners can read collaboration audit"
on public.site_collaboration_audit for select
using (public.is_site_owner(site_id));

create policy "members can read site assets"
on public.site_assets for select
using (public.can_read_site(site_id));

grant select on public.site_memberships to authenticated;
grant select on public.site_invites to authenticated;
grant select on public.site_collaboration_audit to authenticated;
revoke insert, update, delete on public.site_memberships from authenticated;
revoke insert, update, delete on public.site_invites from authenticated;
revoke insert, update, delete on public.site_collaboration_audit from authenticated;
revoke all on public.site_memberships from anon;
revoke all on public.site_invites from anon;
revoke all on public.site_collaboration_audit from anon;
grant select, insert, update, delete on public.site_memberships to service_role;
grant select, insert, update, delete on public.site_invites to service_role;
grant select, insert on public.site_collaboration_audit to service_role;

create or replace function public.create_site_invite(
  p_site_id uuid,
  p_actor_id uuid,
  p_email citext,
  p_role text,
  p_token_digest text,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  site_id uuid,
  email citext,
  role text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.site_invites%rowtype;
begin
  if not exists (select 1 from public.sites where sites.id = p_site_id and sites.owner_id = p_actor_id) then
    raise exception 'collaboration_forbidden' using errcode = 'P0001';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  if p_email is null or btrim(p_email::text) = '' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  if p_expires_at < clock_timestamp() + interval '15 minutes'
     or p_expires_at > clock_timestamp() + interval '7 days' then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;

  insert into public.site_invites (site_id, email, role, token_digest, created_by, expires_at)
  values (p_site_id, lower(btrim(p_email::text))::citext, p_role, p_token_digest, p_actor_id, p_expires_at)
  returning * into v_invite;

  insert into public.site_collaboration_audit (site_id, actor_user_id, invite_id, event, details)
  values (p_site_id, p_actor_id, v_invite.id, 'invite_created', jsonb_build_object('email', v_invite.email, 'role', v_invite.role));

  return query select v_invite.id, v_invite.site_id, v_invite.email, v_invite.role, v_invite.expires_at, v_invite.created_at;
end;
$$;

create or replace function public.revoke_site_invite(
  p_site_id uuid,
  p_invite_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.site_invites%rowtype;
begin
  if not exists (select 1 from public.sites where sites.id = p_site_id and sites.owner_id = p_actor_id) then
    raise exception 'collaboration_forbidden' using errcode = 'P0001';
  end if;
  select * into v_invite from public.site_invites
   where site_invites.id = p_invite_id and site_invites.site_id = p_site_id
   for update;
  if not found then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite_used' using errcode = 'P0001'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite_revoked' using errcode = 'P0001'; end if;

  update public.site_invites
     set revoked_at = clock_timestamp(), revoked_by = p_actor_id
   where site_invites.id = p_invite_id;
  insert into public.site_collaboration_audit (site_id, actor_user_id, invite_id, event, details)
  values (p_site_id, p_actor_id, p_invite_id, 'invite_revoked', jsonb_build_object('email', v_invite.email, 'role', v_invite.role));
end;
$$;

create or replace function public.accept_site_invite(
  p_token_digest text,
  p_user_id uuid,
  p_email citext
)
returns table (site_id uuid, role text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.site_invites%rowtype;
  v_owner_id uuid;
begin
  if p_token_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  select * into v_invite from public.site_invites
   where token_digest = p_token_digest
   for update;
  if not found then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite_revoked' using errcode = 'P0001'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite_used' using errcode = 'P0001'; end if;
  if v_invite.expires_at <= clock_timestamp() then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  if p_email is null or v_invite.email <> lower(btrim(p_email::text))::citext then
    raise exception 'invite_email_mismatch' using errcode = 'P0001';
  end if;

  select owner_id into v_owner_id from public.sites where sites.id = v_invite.site_id;
  if not found then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  if v_owner_id = p_user_id then raise exception 'owner_cannot_join' using errcode = 'P0001'; end if;

  insert into public.site_memberships (site_id, user_id, email, role, created_by)
  values (v_invite.site_id, p_user_id, lower(btrim(p_email::text))::citext, v_invite.role, v_invite.created_by)
  on conflict (site_id, user_id) do update
    set email = excluded.email, role = excluded.role, updated_at = clock_timestamp();

  update public.site_invites
     set accepted_at = clock_timestamp(), accepted_by = p_user_id
   where site_invites.id = v_invite.id;
  insert into public.site_collaboration_audit (site_id, actor_user_id, target_user_id, invite_id, event, details)
  values (v_invite.site_id, p_user_id, p_user_id, v_invite.id, 'invite_accepted', jsonb_build_object('email', v_invite.email, 'role', v_invite.role));

  return query select v_invite.site_id, v_invite.role;
end;
$$;

create or replace function public.update_site_member_role(
  p_site_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_member public.site_memberships%rowtype;
begin
  if not exists (select 1 from public.sites where sites.id = p_site_id and sites.owner_id = p_actor_id) then
    raise exception 'collaboration_forbidden' using errcode = 'P0001';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  select * into v_member from public.site_memberships
   where site_memberships.site_id = p_site_id and site_memberships.user_id = p_user_id
   for update;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;

  update public.site_memberships
     set role = p_role, updated_at = clock_timestamp()
   where site_memberships.site_id = p_site_id and site_memberships.user_id = p_user_id;
  insert into public.site_collaboration_audit (site_id, actor_user_id, target_user_id, event, details)
  values (p_site_id, p_actor_id, p_user_id, 'member_role_changed', jsonb_build_object('from', v_member.role, 'to', p_role));
end;
$$;

create or replace function public.remove_site_member(
  p_site_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_member public.site_memberships%rowtype;
begin
  if not exists (select 1 from public.sites where sites.id = p_site_id and sites.owner_id = p_actor_id) then
    raise exception 'collaboration_forbidden' using errcode = 'P0001';
  end if;
  select * into v_member from public.site_memberships
   where site_memberships.site_id = p_site_id and site_memberships.user_id = p_user_id
   for update;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;

  delete from public.site_memberships
   where site_memberships.site_id = p_site_id and site_memberships.user_id = p_user_id;
  insert into public.site_collaboration_audit (site_id, actor_user_id, target_user_id, event, details)
  values (p_site_id, p_actor_id, p_user_id, 'member_removed', jsonb_build_object('email', v_member.email, 'role', v_member.role));
end;
$$;

revoke all on function public.create_site_invite(uuid, uuid, citext, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_site_invite(uuid, uuid, citext, text, text, timestamptz) to service_role;
revoke all on function public.revoke_site_invite(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_site_invite(uuid, uuid, uuid) to service_role;
revoke all on function public.accept_site_invite(text, uuid, citext) from public, anon, authenticated;
grant execute on function public.accept_site_invite(text, uuid, citext) to service_role;
revoke all on function public.update_site_member_role(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_site_member_role(uuid, uuid, uuid, text) to service_role;
revoke all on function public.remove_site_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_site_member(uuid, uuid, uuid) to service_role;
