export type BrandKnowledgeDocument = {
  id: string;
  org_id: string;
  guide_id: string;
  title: string;
  markdown: string;
  summary: string | null;
  source_hash: string;
  status: 'missing' | 'generating' | 'ready' | 'stale' | 'failed';
  model: string | null;
  manual_edit: boolean;
  error: string | null;
  generated_by: string | null;
  generated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AiAgent = {
  id: string;
  org_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  skill_md: string;
  tools: string[];
  output_schema: string | null;
  permissions: Record<string, unknown>;
  is_default: boolean;
  is_enabled: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AiWorkflowStep = {
  id: string;
  org_id: string;
  agent_slug: string;
  sort_order: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AiRunStatus = 'queued' | 'running' | 'needs_approval' | 'completed' | 'failed' | 'canceled';
export type AiStepStatus = 'queued' | 'working' | 'needs_approval' | 'done' | 'failed' | 'skipped';

export type AiRun = {
  id: string;
  org_id: string;
  created_by: string | null;
  project_id: string | null;
  folder_id: string | null;
  campaign_id: string | null;
  brand_guide_id: string | null;
  brand_knowledge_document_id: string | null;
  title: string;
  prompt: string;
  mode: 'review' | 'approval' | 'autopilot';
  status: AiRunStatus;
  context: Record<string, unknown>;
  output_summary: string | null;
  error: string | null;
  token_usage: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

export type AiRunStep = {
  id: string;
  run_id: string;
  agent_id: string | null;
  agent_name: string;
  title: string;
  status: AiStepStatus;
  message: string | null;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AiRunEvent = {
  id: string;
  run_id: string;
  step_id: string | null;
  event_type: string;
  message: string | null;
  payload: Record<string, unknown>;
  created_at: string | null;
};

export type SocialPostDraft = {
  name: string;
  topic: string;
  caption: string;
  platforms: string[];
  scheduledDate?: string;
  creativeBrief?: string;
};

export type GoogleAdDraft = {
  name: string;
  topic: string;
  startDate?: string;
  finalUrl?: string;
  path1?: string;
  path2?: string;
  headlines: string[];
  descriptions: string[];
  callouts?: string[];
};

export type SocialAdDraft = {
  name: string;
  topic: string;
  platform: string;
  primaryText: string;
  headline: string;
  description?: string;
  cta: string;
  destinationUrl?: string;
  scheduledDate?: string;
};

export type BlogOutlineDraft = {
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  outline: string[];
  publishDate?: string;
};

export type CalendarDraft = {
  title: string;
  type: 'socials' | 'google-ad' | 'meta-ad' | 'blogs';
  date: string;
};

export type BriefToCampaignArtifact = {
  strategy?: {
    title: string;
    summary: string;
    objectives: string[];
    contentPillars: string[];
  };
  socialPosts?: SocialPostDraft[];
  googleAds?: GoogleAdDraft[];
  socialAds?: SocialAdDraft[];
  blogOutlines?: BlogOutlineDraft[];
  calendar?: CalendarDraft[];
};

export type AiDraftSelection = {
  socialPosts: number[];
  googleAds: number[];
  socialAds: number[];
  blogOutlines: number[];
  calendar: number[];
};

export type AiArtifact = {
  id: string;
  run_id: string;
  type: string;
  title: string;
  content: BriefToCampaignArtifact;
  markdown: string | null;
  status: 'draft' | 'approved' | 'inserted' | 'rejected';
  version: number;
  created_at: string | null;
  updated_at: string | null;
};
