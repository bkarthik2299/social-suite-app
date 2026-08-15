import { z } from 'zod';

export const harnessOutputSchema = z.enum(['socialPosts', 'googleAds', 'socialAds', 'blogOutlines']);
export const harnessActionSchema = z.enum([
  'create_project',
  'create_default_folder',
  'create_brand_guide',
  'research_brand_website',
  'compile_brand_knowledge',
  'start_ai_mission',
  'commit_ai_drafts',
]);

export const harnessQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).max(4).default([]),
}).strict();

export const harnessPlanSchema = z.object({
  intent: z.enum(['create_campaign_workspace', 'create_project', 'build_brand_guide', 'start_ai_mission', 'resume_mission', 'unknown']),
  confidence: z.number().min(0).max(1),
  projectName: z.string().trim().min(1).nullable(),
  websiteUrl: z.string().url().nullable(),
  campaignBrief: z.string().trim().min(1).nullable(),
  targetAudience: z.string().trim().min(1).nullable().default(null),
  requestedOutputs: z.array(harnessOutputSchema),
  workMode: z.enum(['instant', 'deep']),
  missingQuestions: z.array(harnessQuestionSchema),
  actions: z.array(harnessActionSchema),
}).strict();

export type HarnessOutput = z.infer<typeof harnessOutputSchema>;
export type HarnessAction = z.infer<typeof harnessActionSchema>;
export type HarnessQuestion = z.infer<typeof harnessQuestionSchema>;
export type HarnessPlan = z.infer<typeof harnessPlanSchema>;
export type HarnessPermissionMode = 'ask' | 'autopilot';
export type HarnessRunStatus = 'queued' | 'running' | 'needs_input' | 'needs_approval' | 'completed' | 'failed' | 'canceled';
export type HarnessStepStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export type HarnessRunStep = {
  id: string;
  run_id: string;
  step_key: HarnessAction;
  label: string;
  position: number;
  status: HarnessStepStatus;
  detail: string | null;
  attempt_count: number;
  output: Record<string, unknown>;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HarnessRun = {
  id: string;
  org_id: string;
  created_by: string;
  status: HarnessRunStatus;
  permission_mode: HarnessPermissionMode;
  user_prompt: string;
  parsed_plan: HarnessPlan;
  context: Record<string, unknown>;
  missing_questions: HarnessQuestion[];
  estimated_credits: number;
  current_step: HarnessAction | null;
  project_id: string | null;
  folder_id: string | null;
  brand_guide_id: string | null;
  ai_run_id: string | null;
  artifact_id: string | null;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  harness_run_steps?: HarnessRunStep[];
};
