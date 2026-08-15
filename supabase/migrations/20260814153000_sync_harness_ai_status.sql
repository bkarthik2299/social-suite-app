-- Keep durable command-harness missions synchronized with their underlying AI run.
-- The AI pipeline remains the source of truth; this trigger only projects its
-- lifecycle and artifact identifiers onto the harness timeline.

create or replace function public.sync_harness_run_from_ai_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  harness_status text;
  harness_error text;
begin
  if new.status = old.status
     and new.error is not distinct from old.error
     and new.completed_at is not distinct from old.completed_at then
    return new;
  end if;

  harness_status := case new.status
    when 'needs_approval' then 'needs_approval'
    when 'completed' then 'completed'
    when 'failed' then 'failed'
    when 'canceled' then 'canceled'
    else 'running'
  end;
  harness_error := case
    when new.status = 'failed' then coalesce(new.error, 'AI mission failed.')
    when new.status = 'canceled' then coalesce(new.error, 'AI mission canceled.')
    else null
  end;

  update public.harness_runs
  set status = harness_status,
      current_step = case
        when new.status = 'needs_approval' then 'commit_ai_drafts'
        when new.status in ('completed', 'failed', 'canceled') then null
        else 'start_ai_mission'
      end,
      error = harness_error,
      completed_at = case
        when new.status = 'completed' then coalesce(new.completed_at, now())
        else null
      end
  where ai_run_id = new.id
    and status <> 'canceled';

  update public.harness_run_steps step
  set status = case
        when new.status in ('needs_approval', 'completed') then 'completed'
        when new.status in ('failed', 'canceled') then 'failed'
        else 'running'
      end,
      detail = case
        when new.status = 'needs_approval' then 'Campaign pack is ready for review.'
        when new.status = 'completed' then 'AI mission completed.'
        else step.detail
      end,
      error = harness_error,
      started_at = coalesce(step.started_at, now()),
      completed_at = case
        when new.status in ('needs_approval', 'completed', 'failed', 'canceled') then now()
        else null
      end
  from public.harness_runs run
  where step.run_id = run.id
    and run.ai_run_id = new.id
    and step.step_key = 'start_ai_mission';

  if new.status = 'completed' then
    update public.harness_run_steps step
    set status = 'completed',
        detail = 'Drafts created in Social Suite.',
        error = null,
        started_at = coalesce(step.started_at, now()),
        completed_at = now()
    from public.harness_runs run
    where step.run_id = run.id
      and run.ai_run_id = new.id
      and step.step_key = 'commit_ai_drafts';
  end if;

  insert into public.harness_run_events (run_id, event_type, message, payload)
  select id,
         'ai_run_status_changed',
         format('AI mission is %s.', replace(new.status, '_', ' ')),
         jsonb_build_object('aiRunId', new.id, 'status', new.status)
  from public.harness_runs
  where ai_run_id = new.id;

  return new;
end;
$$;

revoke all on function public.sync_harness_run_from_ai_run() from public, anon, authenticated;

drop trigger if exists sync_harness_run_after_ai_run_update on public.ai_runs;
create trigger sync_harness_run_after_ai_run_update
after update of status, error, completed_at on public.ai_runs
for each row execute function public.sync_harness_run_from_ai_run();

create or replace function public.sync_harness_artifact_from_ai_artifact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.harness_runs
  set artifact_id = new.id
  where ai_run_id = new.run_id
    and artifact_id is null;
  return new;
end;
$$;

revoke all on function public.sync_harness_artifact_from_ai_artifact() from public, anon, authenticated;

drop trigger if exists sync_harness_artifact_after_insert on public.ai_artifacts;
create trigger sync_harness_artifact_after_insert
after insert on public.ai_artifacts
for each row execute function public.sync_harness_artifact_from_ai_artifact();
