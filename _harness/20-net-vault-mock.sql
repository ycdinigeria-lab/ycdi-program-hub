-- Stand-ins for the two Supabase pieces that don't exist locally:
-- pg_net (outbound web requests) and Vault (secret storage).
-- http_post records the call instead of making it, so the tests can
-- check who would have been emailed and what it would have said.

create schema if not exists net;
create schema if not exists vault;

create table if not exists net.sent (
  id      bigserial primary key,
  url     text,
  headers jsonb,
  body    jsonb,
  at      timestamptz default now()
);

create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}')
returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into net.sent (url, headers, body) values (url, headers, body) returning id into v;
  return v;
end;
$$;

create table if not exists vault.decrypted_secrets (
  name             text primary key,
  decrypted_secret text
);

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('RESEND_API_KEY', 're_test_key_local_only'),
       ('MAIL_FROM', 'YCDI Programme Hub <noreply@ycdinigeria.org>')
on conflict (name) do nothing;
