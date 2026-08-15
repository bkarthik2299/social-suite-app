create index harness_runs_created_by_idx on public.harness_runs (created_by);
create index harness_runs_project_idx on public.harness_runs (project_id) where project_id is not null;
create index harness_runs_folder_idx on public.harness_runs (folder_id) where folder_id is not null;
create index harness_runs_brand_guide_idx on public.harness_runs (brand_guide_id) where brand_guide_id is not null;
create index harness_runs_ai_run_idx on public.harness_runs (ai_run_id) where ai_run_id is not null;
create index harness_runs_artifact_idx on public.harness_runs (artifact_id) where artifact_id is not null;
create index harness_run_events_step_idx on public.harness_run_events (step_id) where step_id is not null;
