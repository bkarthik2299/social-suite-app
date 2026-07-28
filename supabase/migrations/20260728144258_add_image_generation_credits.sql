-- Successful AI image generations consume one workspace credit. The provider's
-- prediction identifier is the idempotency key, so a repeated ledger write for
-- the same generated image can never double-charge the workspace.

alter table public.ai_credit_transactions
  add column generation_key text;

alter table public.ai_credit_transactions
  drop constraint ai_credit_transactions_work_mode_check;

alter table public.ai_credit_transactions
  add constraint ai_credit_transactions_work_mode_check
  check (work_mode in ('instant', 'deep', 'image'));

alter table public.ai_credit_transactions
  add constraint ai_credit_transactions_generation_key_key
  unique (generation_key);

alter table public.ai_credit_transactions
  add constraint ai_credit_transactions_source_check
  check (
    (generation_key is null and work_mode in ('instant', 'deep'))
    or (run_id is null and generation_key is not null and work_mode = 'image')
  );

create or replace function public.charge_ai_image_credit(
  p_org_id uuid,
  p_generation_key text
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
     or p_generation_key is null
     or length(btrim(p_generation_key)) = 0
     or length(p_generation_key) > 255 then
    raise exception using
      errcode = '22023',
      message = 'A valid organization and image generation key are required.';
  end if;

  -- Serialize retries for the same provider prediction before checking the
  -- ledger. A harmless hash collision only serializes two unrelated charges.
  perform pg_advisory_xact_lock(hashtextextended(p_generation_key, 0));

  select balance_after
  into next_balance
  from public.ai_credit_transactions
  where generation_key = p_generation_key;

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
      message = 'Not enough AI credits to generate an image.';
  end if;

  insert into public.ai_credit_transactions (
    org_id,
    generation_key,
    amount,
    work_mode,
    balance_after
  ) values (
    p_org_id,
    p_generation_key,
    1,
    'image',
    next_balance
  );

  return next_balance;
end;
$$;

revoke all on function public.charge_ai_image_credit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.charge_ai_image_credit(uuid, text)
  to service_role;

comment on function public.charge_ai_image_credit(uuid, text) is
  'Atomically charges one credit for a successfully generated AI image; callable only by trusted server code.';
