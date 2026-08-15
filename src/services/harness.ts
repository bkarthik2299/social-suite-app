import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { startAiMission, cancelAiMission, commitAiMission } from '@/services/aiMissions';
import { compileBrandKnowledge, createBrandGuide, researchBrandWebsite } from '@/services/brandGuides';
import { invokeFunction } from '@/services/edgeFunctions';
import { createFolder, createProject } from '@/services/projects';
import {
  harnessPlanSchema,
  type HarnessAction,
  type HarnessPermissionMode,
  type HarnessPlan,
  type HarnessRun,
  type HarnessRunStatus,
  type HarnessRunStep,
  type HarnessStepStatus,
} from '@/types/harness';

const db = supabase as unknown as SupabaseClient;
const localStorePrefix = 'socialsuite:harness-runs:';

export const harnessActionLabels: Record<HarnessAction, string> = {
  create_project: 'Create project',
  create_default_folder: 'Create AI Campaigns folder',
  create_brand_guide: 'Create brand guide',
  research_brand_website: 'Research website',
  compile_brand_knowledge: 'Generate Brand Knowledge',
  start_ai_mission: 'Generate campaign pack',
  commit_ai_drafts: 'Create approved drafts',
};

export const harnessOutputLabels = {
  socialPosts: 'Social posts',
  googleAds: 'Google ads',
  socialAds: 'Meta ads',
  blogOutlines: 'Blog ideas',
} as const;

const missingTable = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message || '');
  return code === '42P01' || code === 'PGRST205' || message.includes('harness_runs') || message.includes('schema cache');
};

const normalizeWebsite = (value?: string | null) => {
  if (!value) return null;
  const clean = value.replace(/[),.;!?]+$/, '');
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

export function estimateHarnessCredits(plan: HarnessPlan) {
  return (plan.actions.includes('research_brand_website') ? 1 : 0)
    + (plan.actions.includes('compile_brand_knowledge') ? 1 : 0)
    + (plan.actions.includes('start_ai_mission') ? (plan.workMode === 'deep' ? 2 : 1) : 0);
}

export function buildHarnessMissionPrompt(plan: HarnessPlan, originalRequest: string) {
  const brief = plan.campaignBrief?.trim();
  const request = originalRequest.trim();
  if (!brief || brief === request) return request || brief || '';

  return [
    `Campaign brief: ${brief}`,
    `Original user request (authoritative for requested deliverables and quantities): ${request}`,
  ].join('\n\n');
}

export function understandCommandLocally(prompt: string): HarnessPlan {
  const text = prompt.trim();
  const websiteMatch = text.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:\/[^\s]*)?/i);
  const projectMatch = text.match(/\bproject\s+(?:called|named)\s+["']?([^"'.\n]+?)["']?(?=\s+(?:with|for|whose|and)\b|[.!?]|$)/i);
  const projectName = projectMatch?.[1]?.trim() || null;
  const websiteUrl = normalizeWebsite(websiteMatch?.[0]);
  const requestedOutputs = unique([
    ...(/\bsocial\s+(?:posts?|content)\b/i.test(text) ? ['socialPosts' as const] : []),
    ...(/\bgoogle\s+ads?\b/i.test(text) ? ['googleAds' as const] : []),
    ...(/\b(?:meta|paid social|social)\s+ads?\b/i.test(text) ? ['socialAds' as const] : []),
    ...(/\bblogs?\s+(?:ideas?|outlines?|posts?)\b/i.test(text) ? ['blogOutlines' as const] : []),
  ]);
  const wantsCampaign = /\b(campaign|drafts?|posts?|ads?|blog)\b/i.test(text) || requestedOutputs.length > 0;
  const wantsBrandGuide = /\bbrand\s+(?:guide|knowledge)\b/i.test(text) || !!websiteUrl || wantsCampaign;
  const audienceMatch = text.match(/\bfor\s+([^,.]+?(?:buyers?|customers?|audience|investors?|nris?))\b/i);
  const actions: HarnessAction[] = [];
  if (projectName || /\bcreate\s+(?:a\s+)?project\b/i.test(text)) actions.push('create_project');
  if (wantsCampaign) actions.push('create_default_folder');
  if (wantsBrandGuide) actions.push('create_brand_guide');
  if (websiteUrl) actions.push('research_brand_website', 'compile_brand_knowledge');
  if (wantsCampaign) actions.push('start_ai_mission', 'commit_ai_drafts');

  const missingQuestions = [];
  if (actions.includes('create_project') && !projectName) {
    missingQuestions.push({ id: 'projectName', question: 'What should the project be called?', options: [] });
  }
  if (wantsCampaign && requestedOutputs.length === 0) {
    missingQuestions.push({
      id: 'requestedOutputs',
      question: 'Which campaign outputs should I create?',
      options: ['Social posts', 'Google ads', 'Meta ads', 'Blog ideas'],
    });
  }

  return harnessPlanSchema.parse({
    intent: wantsCampaign ? 'create_campaign_workspace' : wantsBrandGuide ? 'build_brand_guide' : projectName ? 'create_project' : 'unknown',
    confidence: websiteUrl && projectName ? 0.9 : projectName || websiteUrl ? 0.76 : 0.58,
    projectName,
    websiteUrl,
    campaignBrief: wantsCampaign ? text : null,
    targetAudience: audienceMatch?.[1]?.trim() || null,
    requestedOutputs,
    workMode: /\b(deep|premium|comprehensive|full)\b/i.test(text) ? 'deep' : 'instant',
    missingQuestions,
    actions: unique(actions),
  });
}

export async function parseHarnessCommand(prompt: string, context: Record<string, unknown> = {}) {
  try {
    const response = await invokeFunction<{ plan: unknown }>('harness-parse-command', { text: prompt, context });
    return harnessPlanSchema.parse(response.plan);
  } catch (error) {
    const message = String((error as Error)?.message || '');
    if (!/not found|failed to send|non-2xx|404|harness-parse-command|invalid plan/i.test(message)) throw error;
    return understandCommandLocally(prompt);
  }
}

function localRuns(orgId: string): HarnessRun[] {
  try {
    return JSON.parse(localStorage.getItem(`${localStorePrefix}${orgId}`) || '[]') as HarnessRun[];
  } catch {
    return [];
  }
}

function saveLocalRun(run: HarnessRun) {
  const runs = localRuns(run.org_id);
  const next = [run, ...runs.filter((item) => item.id !== run.id)].slice(0, 25);
  localStorage.setItem(`${localStorePrefix}${run.org_id}`, JSON.stringify(next));
}

export function stepsForPlan(plan: HarnessPlan, runId = crypto.randomUUID()): HarnessRunStep[] {
  return plan.actions.map((step, position) => {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      run_id: runId,
      step_key: step,
      label: harnessActionLabels[step],
      position,
      status: 'queued',
      detail: null,
      attempt_count: 0,
      output: {},
      error: null,
      started_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
  });
}

export async function createHarnessRun({
  orgId,
  userId,
  prompt,
  plan,
  permissionMode,
}: {
  orgId: string;
  userId: string;
  prompt: string;
  plan: HarnessPlan;
  permissionMode: HarnessPermissionMode;
}): Promise<HarnessRun> {
  const now = new Date().toISOString();
  const draft: HarnessRun = {
    id: crypto.randomUUID(),
    org_id: orgId,
    created_by: userId,
    status: plan.missingQuestions.length ? 'needs_input' : 'queued',
    permission_mode: permissionMode,
    user_prompt: prompt,
    parsed_plan: plan,
    context: {},
    missing_questions: plan.missingQuestions,
    estimated_credits: estimateHarnessCredits(plan),
    current_step: null,
    project_id: null,
    folder_id: null,
    brand_guide_id: null,
    ai_run_id: null,
    artifact_id: null,
    result: {},
    error: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  const { data, error } = await db.from('harness_runs').insert({
    id: draft.id,
    org_id: orgId,
    created_by: userId,
    status: draft.status,
    permission_mode: permissionMode,
    user_prompt: prompt,
    parsed_plan: plan,
    missing_questions: plan.missingQuestions,
    estimated_credits: draft.estimated_credits,
  }).select('*').single();

  if (error) {
    if (!missingTable(error)) throw error;
    draft.harness_run_steps = stepsForPlan(plan, draft.id);
    saveLocalRun(draft);
    return draft;
  }

  const steps = stepsForPlan(plan, draft.id);
  const { data: insertedSteps, error: stepsError } = await db.from('harness_run_steps').insert(steps.map((step) => ({
    run_id: step.run_id,
    step_key: step.step_key,
    label: step.label,
    position: step.position,
  }))).select('*');
  if (stepsError) throw stepsError;
  return { ...(data as HarnessRun), parsed_plan: plan, harness_run_steps: insertedSteps as HarnessRunStep[] };
}

export async function listHarnessRuns(orgId: string): Promise<HarnessRun[]> {
  const { data, error } = await db
    .from('harness_runs')
    .select('*, harness_run_steps(*)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'harness_run_steps', ascending: true })
    .limit(20);
  if (error) {
    if (missingTable(error)) return localRuns(orgId);
    throw error;
  }
  return (data || []) as HarnessRun[];
}

export async function getHarnessRun(runId: string): Promise<HarnessRun | null> {
  const { data, error } = await db
    .from('harness_runs')
    .select('*, harness_run_steps(*)')
    .eq('id', runId)
    .order('position', { referencedTable: 'harness_run_steps', ascending: true })
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return null;
    throw error;
  }
  return data as HarnessRun | null;
}

export const startHarnessExecution = (runId: string) =>
  invokeFunction<{ runId: string; status: 'accepted' }>('harness-execute-run', { runId });

async function patchRun(run: HarnessRun, updates: Partial<HarnessRun>): Promise<HarnessRun> {
  const next = { ...run, ...updates, updated_at: new Date().toISOString() };
  const { error } = await db.from('harness_runs').update(updates).eq('id', run.id);
  if (error) {
    if (!missingTable(error)) throw error;
    saveLocalRun(next);
  }
  return next;
}

async function patchStep(run: HarnessRun, stepKey: HarnessAction, updates: Partial<HarnessRunStep>) {
  const steps = (run.harness_run_steps || []).map((step) => step.step_key === stepKey
    ? { ...step, ...updates, updated_at: new Date().toISOString() }
    : step);
  const { error } = await db.from('harness_run_steps').update(updates).eq('run_id', run.id).eq('step_key', stepKey);
  if (error && !missingTable(error)) throw error;
  return { ...run, harness_run_steps: steps, updated_at: new Date().toISOString() };
}

type RunUpdate = (run: HarnessRun) => void;

export async function executeHarnessRun(initialRun: HarnessRun, onUpdate: RunUpdate): Promise<HarnessRun> {
  let run = await patchRun(initialRun, { status: 'running', error: null });
  onUpdate(run);
  const plan = run.parsed_plan;

  try {
    for (const action of plan.actions) {
      if (action === 'commit_ai_drafts') continue;
      if (run.harness_run_steps?.find((step) => step.step_key === action)?.status === 'completed') continue;

      const startedAt = new Date().toISOString();
      run = await patchRun(run, { current_step: action });
      run = await patchStep(run, action, { status: 'running', started_at: startedAt, error: null });
      onUpdate(run);

      let output: Record<string, unknown> = {};
      if (action === 'create_project') {
        if (!run.project_id) {
          const project = await createProject({ name: plan.projectName || 'Untitled Project', orgId: run.org_id });
          run = await patchRun(run, { project_id: project.id });
          output = { projectId: project.id, name: project.name };
        }
      } else if (action === 'create_default_folder') {
        if (!run.project_id) throw new Error('A project is required before creating the campaign folder');
        if (!run.folder_id) {
          const folder = await createFolder({ projectId: run.project_id, name: 'AI Campaigns' });
          run = await patchRun(run, { folder_id: folder.id });
          output = { folderId: folder.id, name: folder.name };
        }
      } else if (action === 'create_brand_guide') {
        if (!run.brand_guide_id) {
          const guide = await createBrandGuide({
            orgId: run.org_id,
            projectId: run.project_id,
            brandName: plan.projectName || 'Untitled Brand',
            websiteUrl: plan.websiteUrl,
          });
          run = await patchRun(run, { brand_guide_id: guide.id });
          output = { brandGuideId: guide.id, name: guide.brand_name };
        }
      } else if (action === 'research_brand_website') {
        if (!run.brand_guide_id || !plan.websiteUrl) throw new Error('Brand guide and website are required for research');
        const research = await researchBrandWebsite({
          guideId: run.brand_guide_id,
          brandName: plan.projectName || 'Brand',
          websiteUrl: plan.websiteUrl,
        });
        output = { sourceCount: research.sourceCount, fieldsUpdated: research.fieldsUpdated };
      } else if (action === 'compile_brand_knowledge') {
        if (!run.brand_guide_id) throw new Error('Brand guide is required for Brand Knowledge');
        const knowledge = await compileBrandKnowledge({ guideId: run.brand_guide_id });
        run = await patchRun(run, { context: { ...run.context, brandKnowledgeDocumentId: knowledge.document.id } });
        output = { brandKnowledgeDocumentId: knowledge.document.id };
      } else if (action === 'start_ai_mission') {
        if (!run.ai_run_id) {
          const mission = await startAiMission({
            prompt: buildHarnessMissionPrompt(plan, run.user_prompt),
            projectId: run.project_id,
            folderId: run.folder_id,
            brandGuideId: run.brand_guide_id,
            brandKnowledgeDocumentId: String(run.context.brandKnowledgeDocumentId || '') || null,
            context: {
              permissionMode: run.permission_mode === 'autopilot' ? 'autopilot' : 'approval',
              workMode: plan.workMode,
              requestedOutputs: plan.requestedOutputs,
              harnessRunId: run.id,
            },
          });
          run = await patchRun(run, { ai_run_id: mission.run.id, artifact_id: mission.artifact?.id || null });
          output = { aiRunId: mission.run.id };
        }
        run = await patchStep(run, action, { status: 'running', detail: 'Creator AI is building the campaign pack.', output });
        onUpdate(run);
        return run;
      }

      run = await patchStep(run, action, {
        status: 'completed',
        output,
        completed_at: new Date().toISOString(),
        attempt_count: (run.harness_run_steps?.find((step) => step.step_key === action)?.attempt_count || 0) + 1,
      });
      onUpdate(run);
    }

    run = await patchRun(run, { status: 'completed', current_step: null, completed_at: new Date().toISOString() });
    onUpdate(run);
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Harness run failed';
    if (run.current_step) run = await patchStep(run, run.current_step, { status: 'failed', error: message });
    run = await patchRun(run, { status: 'failed', error: message });
    onUpdate(run);
    throw error;
  }
}

export async function refreshHarnessRun(run: HarnessRun): Promise<HarnessRun> {
  const persistedRun = await getHarnessRun(run.id);
  if (persistedRun) run = persistedRun;
  if (!run.ai_run_id || !['running', 'needs_approval'].includes(run.status)) return run;
  const { data: aiRun, error } = await db.from('ai_runs').select('*').eq('id', run.ai_run_id).single();
  if (error) throw error;

  if (aiRun.status === 'failed' || aiRun.status === 'canceled') {
    const next = await patchStep(run, 'start_ai_mission', { status: 'failed', error: aiRun.error || 'AI mission failed' });
    return patchRun(next, { status: aiRun.status === 'canceled' ? 'canceled' : 'failed', error: aiRun.error });
  }
  if (aiRun.status !== 'needs_approval' && aiRun.status !== 'completed') return run;

  const { data: artifact } = await db.from('ai_artifacts').select('*').eq('run_id', run.ai_run_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const content = artifact?.content && typeof artifact.content === 'object' ? artifact.content as Record<string, unknown> : {};
  const generated = {
    socialPosts: Array.isArray(content.socialPosts) ? content.socialPosts.length : 0,
    googleAds: Array.isArray(content.googleAds) ? content.googleAds.length : 0,
    socialAds: Array.isArray(content.socialAds) ? content.socialAds.length : 0,
    blogOutlines: Array.isArray(content.blogOutlines) ? content.blogOutlines.length : 0,
    calendarItems: Array.isArray(content.calendar) ? content.calendar.length : 0,
  };
  let next = await patchStep(run, 'start_ai_mission', {
    status: 'completed',
    detail: 'Campaign pack is ready for review.',
    completed_at: new Date().toISOString(),
  });
  next = await patchRun(next, { artifact_id: artifact?.id || run.artifact_id, result: { ...next.result, generated } });

  if (run.permission_mode === 'autopilot' && aiRun.status === 'needs_approval' && artifact?.id) {
    next = await patchRun(next, { current_step: 'commit_ai_drafts' });
    next = await patchStep(next, 'commit_ai_drafts', { status: 'running', started_at: new Date().toISOString() });
    const committed = await commitAiMission({ runId: run.ai_run_id, artifactId: artifact.id });
    next = await patchStep(next, 'commit_ai_drafts', {
      status: 'completed',
      output: committed.inserted,
      completed_at: new Date().toISOString(),
    });
    return patchRun(next, {
      status: 'completed',
      current_step: null,
      result: committed.inserted,
      completed_at: new Date().toISOString(),
    });
  }

  return patchRun(next, { status: aiRun.status === 'completed' ? 'completed' : 'needs_approval', current_step: null });
}

export async function cancelHarnessRun(run: HarnessRun) {
  if (run.ai_run_id && run.status === 'running') await cancelAiMission(run.ai_run_id);
  return patchRun(run, { status: 'canceled', current_step: null });
}

export async function approveHarnessRun(run: HarnessRun): Promise<HarnessRun> {
  if (!run.ai_run_id || !run.artifact_id) throw new Error('The campaign pack is not ready yet');
  let next = await patchRun(run, { status: 'running', current_step: 'commit_ai_drafts', error: null });
  next = await patchStep(next, 'commit_ai_drafts', { status: 'running', started_at: new Date().toISOString(), error: null });
  try {
    const committed = await commitAiMission({ runId: run.ai_run_id, artifactId: run.artifact_id });
    next = await patchStep(next, 'commit_ai_drafts', {
      status: 'completed',
      output: committed.inserted,
      completed_at: new Date().toISOString(),
    });
    return patchRun(next, {
      status: 'completed',
      current_step: null,
      result: { ...next.result, ...committed.inserted },
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create drafts';
    next = await patchStep(next, 'commit_ai_drafts', { status: 'failed', error: message });
    return patchRun(next, { status: 'failed', error: message });
  }
}

export function statusLabel(status: HarnessRunStatus | HarnessStepStatus) {
  return status.replace('_', ' ').replace(/^./, (value) => value.toUpperCase());
}
