alter table public.ai_credit_transactions
  drop constraint if exists ai_credit_transactions_work_mode_check;

alter table public.ai_credit_transactions
  add constraint ai_credit_transactions_work_mode_check
  check (work_mode in ('instant', 'deep', 'image', 'brand_research', 'brand_knowledge', 'visual_analysis'));

alter table public.ai_credit_transactions
  drop constraint if exists ai_credit_transactions_source_check;

alter table public.ai_credit_transactions
  add constraint ai_credit_transactions_source_check
  check (
    (generation_key is null and work_mode in ('instant', 'deep'))
    or (
      run_id is null
      and generation_key is not null
      and work_mode in ('image', 'brand_research', 'brand_knowledge', 'visual_analysis')
    )
  );

create or replace function public.charge_brand_ai_action_credit(
  p_org_id uuid,
  p_action text,
  p_action_key text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_balance integer;
begin
  if p_org_id is null
     or p_action not in ('brand_research', 'brand_knowledge', 'visual_analysis')
     or p_action_key is null
     or length(btrim(p_action_key)) = 0
     or length(p_action_key) > 255 then
    raise exception using
      errcode = '22023',
      message = 'A valid organization, brand action, and action key are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action_key, 0));

  select balance_after
  into next_balance
  from public.ai_credit_transactions
  where generation_key = p_action_key;

  if found then
    return next_balance;
  end if;

  update public.ai_credit_accounts
  set credits_remaining = credits_remaining - 1,
      updated_at = now()
  where org_id = p_org_id
    and credits_remaining >= 1
  returning credits_remaining into next_balance;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Not enough AI credits for this brand action.';
  end if;

  insert into public.ai_credit_transactions (
    org_id,
    generation_key,
    amount,
    work_mode,
    balance_after
  ) values (
    p_org_id,
    p_action_key,
    1,
    p_action,
    next_balance
  );

  return next_balance;
end;
$$;

revoke all on function public.charge_brand_ai_action_credit(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.charge_brand_ai_action_credit(uuid, text, text)
  to service_role;

comment on function public.charge_brand_ai_action_credit(uuid, text, text) is
  'Atomically charges one credit for successful Brand Guide AI actions; callable only by trusted server code.';
