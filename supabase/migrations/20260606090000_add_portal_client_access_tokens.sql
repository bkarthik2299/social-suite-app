create extension if not exists pgcrypto;

alter table public.portal_clients
  alter column access_token set default encode(gen_random_bytes(24), 'hex');

update public.portal_clients
set access_token = encode(gen_random_bytes(24), 'hex')
where access_token is null;

create unique index if not exists idx_portal_clients_access_token
  on public.portal_clients(access_token)
  where access_token is not null;
