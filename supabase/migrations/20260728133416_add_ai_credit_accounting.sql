-- AI credits are owned by the workspace because plan limits and brand limits are
-- workspace-level. Only successful AI mission outputs consume credits.

create table public.ai_credit_accounts (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'growth'
    check (plan in ('growth', 'scale', 'agency_pro')),
  monthly_allowance integer not null default 200
    check (monthly_allowance in (200, 600, 1500)),
  credits_remaining integer not null default 200
    check (credits_remaining >= 0 and credits_remaining <= monthly_allowance),
  period_started_at timestamptz not null default date_trunc('month', now()),
  updated_at timestamptz not null default now(),
  constraint ai_credit_accounts_plan_allowance_match check (
    (plan = 'growth' and monthly_allowance = 200)
    or (plan = 'scale' and monthly_allowance = 600)
    or (plan = 'agency_pro' and monthly_allowance = 1500)
  )
);

create table public.ai_credit_transactions (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid unique references public.ai_runs(id) on delete set null,
  amount integer not null check (amount in (1, 2)),
  work_mode text not null check (work_mode in ('instant', 'deep')),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

create index ai_credit_transactions_org_created_idx
  on public.ai_credit_transactions (org_id, created_at desc);

alter table public.ai_credit_accounts enable row level security;
alter table public.ai_credit_transactions enable row level security;

grant select on table public.ai_credit_accounts to authenticated;
grant select on table public.ai_credit_transactions to authenticated;

create policy "Members can view workspace AI credits"
  on public.ai_credit_accounts
  for select
  to authenticated
  using ((select public.is_org_member(org_id)));

create policy "Members can view workspace AI credit usage"
  on public.ai_credit_transactions
  for select
  to authenticated
  using ((select public.is_org_member(org_id)));

insert into public.ai_credit_accounts (org_id)
select id from public.organizations
on conflict (org_id) do nothing;

create or replace function public.initialize_ai_credit_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_credit_accounts (org_id)
  values (new.id)
  on conflict (org_id) do nothing;
  return new;
end;
$$;

revoke all on function public.initialize_ai_credit_account() from public, anon, authenticated;

create trigger initialize_ai_credit_account_after_organization_insert
after insert on public.organizations
for each row execute function public.initialize_ai_credit_account();

create or replace function public.charge_ai_run_credits_on_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  credit_cost integer;
  next_balance integer;
  work_mode text;
begin
  if new.status not in ('needs_approval', 'completed')
     or old.status in ('needs_approval', 'completed') then
    return new;
  end if;

  -- The unique run_id is a second idempotency guard for unusual status retries.
  if exists (
    select 1 from public.ai_credit_transactions where run_id = new.id
  ) then
    return new;
  end if;

  work_mode := case
    when new.context ->> 'workMode' = 'deep' then 'deep'
    else 'instant'
  end;
  credit_cost := case when work_mode = 'deep' then 2 else 1 end;

  update public.ai_credit_accounts
  set credits_remaining = credits_remaining - credit_cost,
      updated_at = now()
  where org_id = new.org_id
    and credits_remaining >= credit_cost
  returning credits_remaining into next_balance;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = format('Not enough AI credits for this %s mission.',
        case when work_mode = 'deep' then 'Deep Work' else 'Instant' end);
  end if;

  insert into public.ai_credit_transactions (
    org_id,
    run_id,
    amount,
    work_mode,
    balance_after
  ) values (
    new.org_id,
    new.id,
    credit_cost,
    work_mode,
    next_balance
  );

  return new;
end;
$$;

revoke all on function public.charge_ai_run_credits_on_success() from public, anon, authenticated;

create trigger charge_ai_run_credits_after_success
after update of status on public.ai_runs
for each row execute function public.charge_ai_run_credits_on_success();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'ai_credit_accounts'
     ) then
    alter publication supabase_realtime add table public.ai_credit_accounts;
  end if;
end;
$$;

comment on table public.ai_credit_accounts is
  'Workspace AI plan and current monthly credit balance.';
comment on table public.ai_credit_transactions is
  'Immutable, idempotent usage ledger created only when an AI run produces a successful output.';
