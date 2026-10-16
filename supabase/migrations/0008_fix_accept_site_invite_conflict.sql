-- Avoid PL/pgSQL output-column ambiguity in the membership upsert.
-- The function returns columns named site_id and role, so column-list conflict
-- inference can collide with those output variables at runtime.
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
  on conflict on constraint site_memberships_pkey do update
    set email = excluded.email,
        role = excluded.role,
        updated_at = clock_timestamp();

  update public.site_invites
     set accepted_at = clock_timestamp(), accepted_by = p_user_id
   where site_invites.id = v_invite.id;
  insert into public.site_collaboration_audit (site_id, actor_user_id, target_user_id, invite_id, event, details)
  values (v_invite.site_id, p_user_id, p_user_id, v_invite.id, 'invite_accepted', jsonb_build_object('email', v_invite.email, 'role', v_invite.role));

  return query select v_invite.site_id, v_invite.role;
end;
$$;

revoke all on function public.accept_site_invite(text, uuid, citext) from public, anon, authenticated;
grant execute on function public.accept_site_invite(text, uuid, citext) to service_role;
