-- ============================================================
-- YCDI Programme Hub
-- Batch 1, part two: notification emails
-- ============================================================
-- Run this AFTER batch1-notifications.sql, and after you have put
-- the Resend key into Supabase Vault (the instructions that came
-- with this file walk you through that).
--
-- What this builds:
--   Email delivery on top of the notifications that already exist.
--   Every time a notification is written, this decides whether that
--   person wants it by email, and if so sends it through Resend.
--
--   Three settings per person, chosen in the app:
--     instant  - an email each time (the default)
--     daily    - one summary a day instead
--     off      - the bell only, no email ever
--
--   Everything sent is written to an outbox table first, so when
--   somebody says "I never got that email" there is an actual
--   record to look at rather than a shrug.
--
-- Also fixes the gap from part one: a rejected sign-up now gets an
-- email, since that person has no profile and no bell to look at.
--
-- Safe to run more than once.
-- ============================================================

-- pg_net is what lets the database make an outbound web request.
-- Wrapped so that if it is already there, or cannot be created, the
-- rest of this file still runs.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not created here: %', sqlerrm;
end;
$$;

-- ------------------------------------------------------------
-- 1. Who wants what
-- ------------------------------------------------------------
create table if not exists public.notification_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_mode text not null default 'instant' check (email_mode in ('instant','daily','off')),
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists np_read on public.notification_prefs;
create policy np_read on public.notification_prefs
  for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.notification_prefs from authenticated;
grant select on public.notification_prefs to authenticated;

-- Anybody without a row is treated as 'instant'. Existing members
-- get a row now so the setting screen has something to show.
insert into public.notification_prefs (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

create or replace function public.email_mode_for(target uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select email_mode from public.notification_prefs where profile_id = target), 'instant')
$$;

create or replace function public.my_notification_pref()
returns text language sql stable security definer set search_path = public as $$
  select public.email_mode_for(auth.uid())
$$;

create or replace function public.set_notification_pref(mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if mode not in ('instant','daily','off') then
    raise exception 'Unrecognised setting.';
  end if;
  insert into public.notification_prefs (profile_id, email_mode, updated_at)
  values (auth.uid(), mode, now())
  on conflict (profile_id) do update set email_mode = excluded.email_mode, updated_at = now();
end;
$$;

grant execute on function public.my_notification_pref()      to authenticated;
grant execute on function public.set_notification_pref(text) to authenticated;

-- ------------------------------------------------------------
-- 2. The outbox
-- ------------------------------------------------------------
create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete set null,
  to_email    text not null,
  subject     text not null,
  body_html   text not null,
  kind        text,
  status      text not null default 'queued',
  request_id  bigint,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists email_outbox_recent on public.email_outbox(created_at desc);

alter table public.email_outbox enable row level security;

drop policy if exists eo_read on public.email_outbox;
create policy eo_read on public.email_outbox
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.email_outbox from authenticated;
grant select on public.email_outbox to authenticated;

-- ------------------------------------------------------------
-- 3. Settings that must not sit in plain sight
-- ------------------------------------------------------------
-- The Resend key lives in Supabase Vault. This reads it back out.
-- If it isn't there, sending is skipped and the outbox says why,
-- rather than the whole thing erroring and rolling back somebody's
-- programme submission.

create or replace function public.resend_key()
returns text language plpgsql stable security definer set search_path = public, vault as $$
declare k text;
begin
  begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'RESEND_API_KEY' limit 1;
  exception when others then
    return null;
  end;
  return k;
end;
$$;

create or replace function public.mail_from()
returns text language plpgsql stable security definer set search_path = public, vault as $$
declare k text;
begin
  begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'MAIL_FROM' limit 1;
  exception when others then
    return null;
  end;
  return coalesce(k, 'YCDI Programme Hub <noreply@ycdinigeria.org>');
end;
$$;

revoke execute on function public.resend_key() from public, authenticated;
revoke execute on function public.mail_from()  from public, authenticated;

-- ------------------------------------------------------------
-- 4. The one place an email is sent
-- ------------------------------------------------------------
-- Everything goes through here. Nothing raises. A failure to send
-- must never undo the thing that caused it, so problems are written
-- to the outbox and the transaction carries on.

create or replace function public.send_email(
  p_to      text,
  p_subject text,
  p_html    text,
  p_profile uuid default null,
  p_kind    text default null
)
returns void language plpgsql security definer set search_path = public, net as $$
declare
  v_key text;
  v_id  uuid;
  v_req bigint;
begin
  if p_to is null or p_to = '' then
    return;
  end if;

  insert into public.email_outbox (profile_id, to_email, subject, body_html, kind)
  values (p_profile, p_to, left(p_subject, 200), p_html, p_kind)
  returning id into v_id;

  v_key := public.resend_key();
  if v_key is null then
    update public.email_outbox
       set status = 'skipped', error = 'No Resend key found in Vault.'
     where id = v_id;
    return;
  end if;

  begin
    select net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || v_key,
                   'Content-Type',  'application/json'),
      body    := jsonb_build_object(
                   'from',    public.mail_from(),
                   'to',      jsonb_build_array(p_to),
                   'subject', p_subject,
                   'html',    p_html)
    ) into v_req;
    update public.email_outbox set status = 'sent', request_id = v_req where id = v_id;
  exception when others then
    update public.email_outbox set status = 'failed', error = left(sqlerrm, 400) where id = v_id;
  end;
end;
$$;

revoke execute on function public.send_email(text, text, text, uuid, text) from public, authenticated;

-- ------------------------------------------------------------
-- 5. How an email looks
-- ------------------------------------------------------------
create or replace function public.email_shell(p_title text, p_body text, p_note text default null)
returns text language sql immutable set search_path = public as $$
  select
  '<div style="background:#F2F2F2;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
  || '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:10px;overflow:hidden;">'
  || '<div style="background:#09ADEA;padding:16px 22px;">'
  || '<div style="color:#FFFFFF;font-size:15px;font-weight:bold;">YCDI Programme Hub</div>'
  || '</div>'
  || '<div style="height:4px;background:#FCDE02;"></div>'
  || '<div style="padding:22px;">'
  || '<div style="font-size:17px;font-weight:bold;color:#000001;margin-bottom:10px;">' || p_title || '</div>'
  || '<div style="font-size:14px;color:#333333;line-height:1.6;">' || p_body || '</div>'
  || case when p_note is null then ''
       else '<div style="font-size:12px;color:#5a5a5a;margin-top:18px;line-height:1.5;">' || p_note || '</div>' end
  || '</div>'
  || '<div style="background:#000001;color:rgba(255,255,255,0.45);padding:12px 22px;font-size:11px;text-align:center;">'
  || 'Young Christian Development Initiative &middot; Raising Godly Leaders'
  || '</div></div></div>'
$$;

-- ------------------------------------------------------------
-- 6. Instant emails, hung off the notifications table
-- ------------------------------------------------------------
create or replace function public.email_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode  text;
  v_email text;
begin
  v_mode := public.email_mode_for(new.profile_id);
  if v_mode <> 'instant' then
    return new;
  end if;

  select email into v_email from auth.users where id = new.profile_id;
  if v_email is null then
    return new;
  end if;

  perform public.send_email(
    v_email,
    new.title,
    public.email_shell(
      new.title,
      coalesce(new.body, ''),
      'You are getting this because you are a member of the YCDI Programme Hub. '
      || 'You can switch to a daily summary, or turn these off, from the bell icon in the app.'),
    new.profile_id,
    new.kind);

  return new;
end;
$$;

drop trigger if exists trg_email_on_notification on public.notifications;
create trigger trg_email_on_notification
  after insert on public.notifications
  for each row execute function public.email_on_notification();

-- ------------------------------------------------------------
-- 7. The daily summary
-- ------------------------------------------------------------
-- One email listing everything unread from the last day, for people
-- who chose 'daily'. Run once a day by the schedule at the bottom.

create or replace function public.send_daily_digest()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r       record;
  n       record;
  v_email text;
  v_list  text;
  v_count integer;
  v_sent  integer := 0;
begin
  for r in
    select p.id, p.full_name
    from public.profiles p
    join public.notification_prefs np on np.profile_id = p.id
    where np.email_mode = 'daily'
  loop
    v_list := '';
    v_count := 0;

    for n in
      select title, body from public.notifications
      where profile_id = r.id
        and read_at is null
        and created_at > now() - interval '25 hours'
      order by created_at desc
      limit 25
    loop
      v_count := v_count + 1;
      v_list := v_list
        || '<div style="border-left:3px solid #09ADEA;padding:6px 0 6px 10px;margin-bottom:10px;">'
        || '<div style="font-weight:bold;color:#000001;">' || n.title || '</div>'
        || case when n.body is null or n.body = '' then ''
             else '<div style="color:#5a5a5a;font-size:13px;">' || n.body || '</div>' end
        || '</div>';
    end loop;

    if v_count = 0 then
      continue;
    end if;

    select email into v_email from auth.users where id = r.id;
    if v_email is null then
      continue;
    end if;

    perform public.send_email(
      v_email,
      'Your YCDI Hub summary: ' || v_count || case when v_count = 1 then ' update' else ' updates' end,
      public.email_shell(
        'Since yesterday',
        v_list,
        'This is your daily summary. Open the hub to see the detail.'),
      r.id,
      'digest');

    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

-- ------------------------------------------------------------
-- 8. A rejected sign-up
-- ------------------------------------------------------------
-- The gap left open in part one. There is no profile and no bell to
-- write to, so this has to be an email or it is nothing.

create or replace function public.reject_signup(signup_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_signup record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reject sign-ups.';
  end if;

  select * into v_signup from public.pending_signups where id = signup_id;
  if v_signup is null then
    raise exception 'That sign-up request no longer exists.';
  end if;

  if v_signup.email is not null then
    perform public.send_email(
      v_signup.email,
      'About your YCDI Programme Hub request',
      public.email_shell(
        'Your request was not approved',
        'Thank you for asking to join the YCDI Programme Hub. Your request has not been approved at this time.'
        || '<br><br>If you think this is a mistake, please speak to your chapter coordinator, who can ask for it to be looked at again.'),
      null,
      'signup_rejected');
  end if;

  delete from public.pending_signups where id = signup_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. Housekeeping
-- ------------------------------------------------------------
create or replace function public.prune_email_outbox()
returns void language sql security definer set search_path = public as $$
  delete from public.email_outbox where created_at < now() - interval '90 days'
$$;

-- ------------------------------------------------------------
-- 10. The daily schedule
-- ------------------------------------------------------------
-- Runs at 06:00 UTC, which is 07:00 in Lagos. If pg_cron is not
-- enabled on the project this block does nothing and the rest of
-- the file still works. Instant email is unaffected either way.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ycdi-daily-digest')
      where exists (select 1 from cron.job where jobname = 'ycdi-daily-digest');
    perform cron.schedule('ycdi-daily-digest', '0 6 * * *', 'select public.send_daily_digest();');
  end if;
exception when others then
  raise notice 'Daily digest schedule not set up: %', sqlerrm;
end;
$$;
