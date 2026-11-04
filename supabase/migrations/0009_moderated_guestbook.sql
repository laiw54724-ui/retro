-- Moderated public guestbook. Anonymous/authenticated clients never access
-- these tables directly; the Worker validates publication state and uses the
-- service-role-only RPCs below.

create table public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  abuse_key text not null check (abuse_key ~ '^[0-9a-f]{64}$'),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (site_id, request_id)
);

create index guestbook_entries_public_idx
  on public.guestbook_entries(site_id, created_at desc)
  where status = 'approved';
create index guestbook_entries_moderation_idx
  on public.guestbook_entries(site_id, status, created_at desc);
create index guestbook_entries_abuse_idx
  on public.guestbook_entries(site_id, abuse_key, created_at desc);

create table public.guestbook_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  entry_id uuid not null references public.guestbook_entries(id) on delete cascade,
  abuse_key text not null check (abuse_key ~ '^[0-9a-f]{64}$'),
  request_id uuid not null,
  reason text not null default 'visitor_report' check (char_length(reason) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (site_id, request_id),
  unique (entry_id, abuse_key)
);

create index guestbook_reports_moderation_idx
  on public.guestbook_reports(site_id, status, created_at desc);

alter table public.guestbook_entries enable row level security;
alter table public.guestbook_reports enable row level security;

revoke all on public.guestbook_entries from public, anon, authenticated;
revoke all on public.guestbook_reports from public, anon, authenticated;
grant select, insert, update, delete on public.guestbook_entries to service_role;
grant select, insert, update, delete on public.guestbook_reports to service_role;

create or replace function public.submit_guestbook_entry(
  p_site_id uuid,
  p_display_name text,
  p_body text,
  p_request_id uuid,
  p_abuse_key text
) returns table(id uuid, display_name text, body text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing public.guestbook_entries%rowtype;
  v_entry public.guestbook_entries%rowtype;
begin
  if char_length(btrim(p_display_name)) not between 1 and 40
     or char_length(btrim(p_body)) not between 1 and 1000
     or p_abuse_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_guestbook_entry';
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.id = p_site_id
      and s.published_document is not null
      and exists (
        select 1
        from jsonb_array_elements(coalesce(s.published_document->'windows', '[]'::jsonb)) as w
        where w->>'type' = 'guestbook'
          and coalesce((w->'content'->>'enabled')::boolean, false)
      )
  ) then
    raise exception 'guestbook_disabled';
  end if;

  select * into v_existing
  from public.guestbook_entries e
  where e.site_id = p_site_id and e.request_id = p_request_id;
  if found then
    return query select v_existing.id, v_existing.display_name, v_existing.body, v_existing.status, v_existing.created_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_site_id::text || ':' || p_abuse_key, 0));
  if (select count(*) from public.guestbook_entries e where e.site_id = p_site_id and e.abuse_key = p_abuse_key and e.created_at > now() - interval '15 minutes') >= 3 then
    raise exception 'guestbook_rate_limited';
  end if;

  insert into public.guestbook_entries(site_id, display_name, body, abuse_key, request_id)
  values (p_site_id, btrim(p_display_name), btrim(p_body), p_abuse_key, p_request_id)
  returning * into v_entry;
  return query select v_entry.id, v_entry.display_name, v_entry.body, v_entry.status, v_entry.created_at;
end;
$$;

create or replace function public.report_guestbook_entry(
  p_site_id uuid,
  p_entry_id uuid,
  p_request_id uuid,
  p_abuse_key text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  if char_length(btrim(p_reason)) not between 1 and 200 or p_abuse_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_guestbook_report';
  end if;
  if not exists (select 1 from public.guestbook_entries where id = p_entry_id and site_id = p_site_id and status = 'approved') then
    raise exception 'guestbook_entry_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site_id::text || ':report:' || p_abuse_key, 0));
  if (select count(*) from public.guestbook_reports where site_id = p_site_id and abuse_key = p_abuse_key and created_at > now() - interval '1 day') >= 5 then
    raise exception 'guestbook_rate_limited';
  end if;
  insert into public.guestbook_reports(site_id, entry_id, abuse_key, request_id, reason)
  values (p_site_id, p_entry_id, p_abuse_key, p_request_id, btrim(p_reason))
  on conflict (site_id, request_id) do update set request_id = excluded.request_id
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'guestbook_report_duplicate';
end;
$$;

revoke all on function public.submit_guestbook_entry(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.report_guestbook_entry(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_guestbook_entry(uuid, text, text, uuid, text) to service_role;
grant execute on function public.report_guestbook_entry(uuid, uuid, uuid, text, text) to service_role;
