-- Remove the retired AI command harness without affecting Creator AI runs.
drop trigger if exists sync_harness_run_after_ai_run_update on public.ai_runs;
drop trigger if exists sync_harness_artifact_after_insert on public.ai_artifacts;

drop function if exists public.sync_harness_run_from_ai_run();
drop function if exists public.sync_harness_artifact_from_ai_artifact();

drop table if exists public.harness_run_events;
drop table if exists public.harness_run_steps;
drop table if exists public.harness_runs;
