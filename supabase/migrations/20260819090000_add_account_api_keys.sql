create table if not exists public.account_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  permission text not null check (permission in ('read', 'write')),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_api_keys_user_created_idx
  on public.account_api_keys (user_id, created_at desc);

create index if not exists account_api_keys_org_user_idx
  on public.account_api_keys (org_id, user_id);

create index if not exists account_api_keys_active_hash_idx
  on public.account_api_keys (key_hash)
  where revoked_at is null;

alter table public.account_api_keys enable row level security;

revoke all on public.account_api_keys from public, anon, authenticated;
grant all on public.account_api_keys to service_role;

drop policy if exists "Users can view their own account api key metadata" on public.account_api_keys;
create policy "Users can view their own account api key metadata"
  on public.account_api_keys for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_org_member(org_id));

drop policy if exists "Users can revoke their own account api keys" on public.account_api_keys;
create policy "Users can revoke their own account api keys"
  on public.account_api_keys for update
  to authenticated
  using (user_id = (select auth.uid()) and public.is_org_member(org_id))
  with check (user_id = (select auth.uid()) and public.is_org_member(org_id));
