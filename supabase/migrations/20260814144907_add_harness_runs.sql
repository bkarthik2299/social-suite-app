create table public.harness_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'needs_input', 'needs_approval', 'completed', 'failed', 'canceled')),
  permission_mode text not null default 'ask' check (permission_mode in ('ask', 'autopilot')),
  user_prompt text not null check (char_length(btrim(user_prompt)) between 1 and 12000),
  parsed_plan jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  missing_questions jsonb not null default '[]'::jsonb,
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  current_step text,
  project_id uuid references public.projects(id) on delete set null,
  folder_id uuid references public.folders(id) on delete set null,
  brand_guide_id uuid references public.brand_guides(id) on delete set null,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  artifact_id uuid references public.ai_artifacts(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.harness_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(id) on delete cascade,
  step_key text not null,
  label text not null,
  position integer not null check (position >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  detail text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_key)
);

create table public.harness_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(id) on delete cascade,
  step_id uuid references public.harness_run_steps(id) on delete set null,
  event_type text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index harness_runs_org_created_idx on public.harness_runs (org_id, created_at desc);
create index harness_runs_active_idx on public.harness_runs (org_id, status, updated_at desc)
  where status in ('queued', 'running', 'needs_input', 'needs_approval');
create index harness_run_steps_run_position_idx on public.harness_run_steps (run_id, position);
create index harness_run_events_run_created_idx on public.harness_run_events (run_id, created_at);

create trigger set_updated_at_harness_runs
  before update on public.harness_runs
  for each row execute function public.update_updated_at();

create trigger set_updated_at_harness_run_steps
  before update on public.harness_run_steps
  for each row execute function public.update_updated_at();

alter table public.harness_runs enable row level security;
alter table public.harness_run_steps enable row level security;
alter table public.harness_run_events enable row level security;

grant select, insert, update on public.harness_runs to authenticated;
grant select, insert, update on public.harness_run_steps to authenticated;
grant select, insert on public.harness_run_events to authenticated;
grant all on public.harness_runs, public.harness_run_steps, public.harness_run_events to service_role;

create policy "Members can view harness runs"
  on public.harness_runs for select to authenticated
  using (public.is_org_member(org_id));

create policy "Editors can create harness runs"
  on public.harness_runs for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_edit_org(org_id));

create policy "Editors can update harness runs"
  on public.harness_runs for update to authenticated
  using (public.can_edit_org(org_id))
  with check (created_by = (select auth.uid()) and public.can_edit_org(org_id));

create policy "Members can view harness steps"
  on public.harness_run_steps for select to authenticated
  using (exists (
    select 1 from public.harness_runs run
    where run.id = harness_run_steps.run_id and public.is_org_member(run.org_id)
  ));

create policy "Editors can create harness steps"
  on public.harness_run_steps for insert to authenticated
  with check (exists (
    select 1 from public.harness_runs run
    where run.id = harness_run_steps.run_id
      and run.created_by = (select auth.uid())
      and public.can_edit_org(run.org_id)
  ));

create policy "Editors can update harness steps"
  on public.harness_run_steps for update to authenticated
  using (exists (
    select 1 from public.harness_runs run
    where run.id = harness_run_steps.run_id and public.can_edit_org(run.org_id)
  ))
  with check (exists (
    select 1 from public.harness_runs run
    where run.id = harness_run_steps.run_id
      and run.created_by = (select auth.uid())
      and public.can_edit_org(run.org_id)
  ));

create policy "Members can view harness events"
  on public.harness_run_events for select to authenticated
  using (exists (
    select 1 from public.harness_runs run
    where run.id = harness_run_events.run_id and public.is_org_member(run.org_id)
  ));

create policy "Editors can create harness events"
  on public.harness_run_events for insert to authenticated
  with check (exists (
    select 1 from public.harness_runs run
    where run.id = harness_run_events.run_id
      and run.created_by = (select auth.uid())
      and public.can_edit_org(run.org_id)
  ));
