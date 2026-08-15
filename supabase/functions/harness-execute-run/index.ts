import { currentUserId, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

type RequestBody = { runId: string };
type SupabaseClient = ReturnType<typeof getUserClient>;
type HarnessAction =
  | 'create_project'
  | 'create_default_folder'
  | 'create_brand_guide'
  | 'research_brand_website'
  | 'compile_brand_knowledge'
  | 'start_ai_mission'
  | 'commit_ai_drafts';

type HarnessPlan = {
  projectName?: string | null;
  websiteUrl?: string | null;
  campaignBrief?: string | null;
  requestedOutputs?: string[];
  workMode?: 'instant' | 'deep';
  actions?: HarnessAction[];
};

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  const supabase = getUserClient(req);
  try {
    await currentUserId(supabase);
    const body = await readJson<RequestBody>(req);
    if (!body.runId) return jsonResponse({ error: 'runId is required' }, 400);

    const { data: run, error } = await supabase
      .from('harness_runs')
      .select('*')
      .eq('id', body.runId)
      .single();
    if (error || !run) throw error || new Error('Harness run not found');
    if (run.status === 'completed' || run.status === 'canceled') {
      return jsonResponse({ runId: run.id, status: run.status });
    }

    const { error: updateError } = await supabase
      .from('harness_runs')
      .update({ status: 'running', error: null })
      .eq('id', run.id);
    if (updateError) throw updateError;

    EdgeRuntime.waitUntil(executeRun(supabase, run.id));
    return jsonResponse({ runId: run.id, status: 'accepted' }, 202);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Could not start harness run' }, 400);
  }
});

async function executeRun(supabase: SupabaseClient, runId: string) {
  let currentStep: HarnessAction | null = null;
  try {
    const { data: initial, error: initialError } = await supabase.from('harness_runs').select('*').eq('id', runId).single();
    if (initialError || !initial) throw initialError || new Error('Harness run not found');
    const plan = (initial.parsed_plan || {}) as HarnessPlan;

    for (const action of plan.actions || []) {
      if (action === 'commit_ai_drafts') continue;
      currentStep = action;

      const [{ data: run, error: runError }, { data: step, error: stepError }] = await Promise.all([
        supabase.from('harness_runs').select('*').eq('id', runId).single(),
        supabase.from('harness_run_steps').select('*').eq('run_id', runId).eq('step_key', action).single(),
      ]);
      if (runError || !run) throw runError || new Error('Harness run not found');
      if (stepError || !step) throw stepError || new Error(`Harness step ${action} not found`);
      if (run.status === 'canceled') return;
      if (step.status === 'completed') continue;

      const startedAt = new Date().toISOString();
      await assertUpdate(supabase.from('harness_runs').update({ current_step: action, status: 'running', error: null }).eq('id', runId));
      await assertUpdate(supabase.from('harness_run_steps').update({
        status: 'running',
        error: null,
        started_at: startedAt,
        attempt_count: Number(step.attempt_count || 0) + 1,
      }).eq('id', step.id));
      await recordEvent(supabase, runId, step.id, 'step_started', `${step.label} started`, { action });

      let output: Record<string, unknown> = {};
      let runUpdates: Record<string, unknown> = {};

      if (action === 'create_project' && !run.project_id) {
        const { data: project, error } = await supabase
          .from('projects')
          .insert({ org_id: run.org_id, name: plan.projectName || 'Untitled Project' })
          .select('*')
          .single();
        if (error) throw error;
        runUpdates = { project_id: project.id };
        output = { projectId: project.id, name: project.name };
      } else if (action === 'create_default_folder' && !run.folder_id) {
        if (!run.project_id) throw new Error('A project is required before creating the campaign folder');
        const { data: folder, error } = await supabase
          .from('folders')
          .insert({ project_id: run.project_id, name: 'AI Campaigns' })
          .select('*')
          .single();
        if (error) throw error;
        runUpdates = { folder_id: folder.id };
        output = { folderId: folder.id, name: folder.name };
      } else if (action === 'create_brand_guide' && !run.brand_guide_id) {
        const { data: guide, error } = await supabase
          .from('brand_guides')
          .insert({
            org_id: run.org_id,
            project_id: run.project_id,
            brand_name: plan.projectName || 'Untitled Brand',
            website_url: plan.websiteUrl || null,
          })
          .select('*')
          .single();
        if (error) throw error;
        runUpdates = { brand_guide_id: guide.id };
        output = { brandGuideId: guide.id, name: guide.brand_name };
      } else if (action === 'research_brand_website') {
        if (!run.brand_guide_id || !plan.websiteUrl) throw new Error('Brand guide and website are required for research');
        const research = await invokeExisting<Record<string, unknown>>(supabase, 'brand-research-website', {
          guideId: run.brand_guide_id,
          brandName: plan.projectName || 'Brand',
          websiteUrl: plan.websiteUrl,
        });
        await invokeExisting(supabase, 'brand-charge-ai-action', { guideId: run.brand_guide_id, action: 'brand_research' });
        output = { sourceCount: research.sourceCount, fieldsUpdated: research.fieldsUpdated };
      } else if (action === 'compile_brand_knowledge') {
        if (!run.brand_guide_id) throw new Error('Brand guide is required for Brand Knowledge');
        const result = await invokeExisting<{ document?: { id?: string } }>(supabase, 'brand-compile-knowledge', { guideId: run.brand_guide_id });
        await invokeExisting(supabase, 'brand-charge-ai-action', { guideId: run.brand_guide_id, action: 'brand_knowledge' });
        const documentId = result.document?.id || null;
        runUpdates = { context: { ...(run.context || {}), brandKnowledgeDocumentId: documentId } };
        output = { brandKnowledgeDocumentId: documentId };
      } else if (action === 'start_ai_mission' && !run.ai_run_id) {
        const documentId = String((run.context || {}).brandKnowledgeDocumentId || '') || null;
        const mission = await invokeExisting<{ run: { id: string }; artifact?: { id?: string } | null }>(supabase, 'ai-start-run', {
          prompt: buildMissionPrompt(plan, run.user_prompt),
          projectId: run.project_id,
          folderId: run.folder_id,
          brandGuideId: run.brand_guide_id,
          brandKnowledgeDocumentId: documentId,
          context: {
            permissionMode: run.permission_mode === 'autopilot' ? 'autopilot' : 'approval',
            workMode: plan.workMode || 'instant',
            requestedOutputs: plan.requestedOutputs || [],
            harnessRunId: run.id,
          },
        });
        await assertUpdate(supabase.from('harness_runs').update({
          ai_run_id: mission.run.id,
          artifact_id: mission.artifact?.id || null,
          current_step: action,
          status: 'running',
        }).eq('id', runId));
        await assertUpdate(supabase.from('harness_run_steps').update({
          status: 'running',
          detail: 'Creator AI is building the campaign pack.',
          output: { aiRunId: mission.run.id },
        }).eq('id', step.id));
        await recordEvent(supabase, runId, step.id, 'ai_mission_started', 'Creator AI mission started', { aiRunId: mission.run.id });
        return;
      }

      if (Object.keys(runUpdates).length) {
        await assertUpdate(supabase.from('harness_runs').update(runUpdates).eq('id', runId));
      }
      await assertUpdate(supabase.from('harness_run_steps').update({
        status: 'completed',
        output,
        completed_at: new Date().toISOString(),
      }).eq('id', step.id));
      await recordEvent(supabase, runId, step.id, 'step_completed', `${step.label} completed`, output);
    }

    await assertUpdate(supabase.from('harness_runs').update({
      status: 'completed',
      current_step: null,
      completed_at: new Date().toISOString(),
    }).eq('id', runId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Harness execution failed';
    if (currentStep) {
      const { data: step } = await supabase.from('harness_run_steps').select('id').eq('run_id', runId).eq('step_key', currentStep).maybeSingle();
      if (step?.id) {
        await supabase.from('harness_run_steps').update({ status: 'failed', error: message }).eq('id', step.id);
        await recordEvent(supabase, runId, step.id, 'step_failed', message, { action: currentStep });
      }
    }
    await supabase.from('harness_runs').update({ status: 'failed', error: message }).eq('id', runId);
  }
}

function buildMissionPrompt(plan: HarnessPlan, originalRequest: string) {
  const brief = plan.campaignBrief?.trim();
  const request = originalRequest.trim();
  if (!brief || brief === request) return request || brief || '';

  return [
    `Campaign brief: ${brief}`,
    `Original user request (authoritative for requested deliverables and quantities): ${request}`,
  ].join('\n\n');
}

async function invokeExisting<T = Record<string, unknown>>(supabase: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      try {
        const payload = await response.clone().json() as { error?: string; message?: string };
        throw new Error(payload.error || payload.message || error.message);
      } catch (nestedError) {
        if (nestedError instanceof Error && nestedError.message !== 'Unexpected end of JSON input') throw nestedError;
      }
    }
    throw error;
  }
  const payload = data as T & { error?: string };
  if (payload && typeof payload === 'object' && payload.error) throw new Error(payload.error);
  return payload;
}

async function assertUpdate(query: PromiseLike<{ error: { message?: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(error.message || 'Database update failed');
}

async function recordEvent(
  supabase: SupabaseClient,
  runId: string,
  stepId: string | null,
  eventType: string,
  message: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from('harness_run_events').insert({
    run_id: runId,
    step_id: stepId,
    event_type: eventType,
    message,
    payload,
  });
  if (error) throw error;
}
