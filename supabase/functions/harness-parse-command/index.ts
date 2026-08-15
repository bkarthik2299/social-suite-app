import { z } from 'npm:zod@3.25.76';
import { currentUserId, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';
import { openRouterJson } from '../_shared/openrouter.ts';

type RequestBody = {
  text: string;
  context?: Record<string, unknown>;
};

const outputSchema = z.enum(['socialPosts', 'googleAds', 'socialAds', 'blogOutlines']);
const actionSchema = z.enum([
  'create_project',
  'create_default_folder',
  'create_brand_guide',
  'research_brand_website',
  'compile_brand_knowledge',
  'start_ai_mission',
  'commit_ai_drafts',
]);
const questionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).max(4).default([]),
}).strict();
const planSchema = z.object({
  intent: z.enum(['create_campaign_workspace', 'create_project', 'build_brand_guide', 'start_ai_mission', 'resume_mission', 'unknown']),
  confidence: z.number().min(0).max(1),
  projectName: z.string().trim().min(1).nullable(),
  websiteUrl: z.string().url().nullable(),
  campaignBrief: z.string().trim().min(1).nullable(),
  targetAudience: z.string().trim().min(1).nullable(),
  requestedOutputs: z.array(outputSchema),
  workMode: z.enum(['instant', 'deep']),
  missingQuestions: z.array(questionSchema),
  actions: z.array(actionSchema),
}).strict();

const normalizeUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.trim().replace(/[),.;!?]+$/, '');
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
};

const token = (value: unknown) => String(value || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const normalizeIntent = (value: unknown) => {
  const key = token(value);
  if (key.includes('campaign') && (key.includes('workspace') || key.includes('create'))) return 'create_campaign_workspace';
  if (key.includes('project')) return 'create_project';
  if (key.includes('brand')) return 'build_brand_guide';
  if (key.includes('resume')) return 'resume_mission';
  if (key.includes('mission') || key.includes('campaign')) return 'start_ai_mission';
  return 'unknown';
};

const normalizeOutput = (value: unknown) => {
  const key = token(value);
  if (key.includes('google')) return 'googleAds';
  if (key.includes('meta') || key.includes('paid_social') || key === 'social_ads') return 'socialAds';
  if (key.includes('blog')) return 'blogOutlines';
  if (key.includes('social')) return 'socialPosts';
  return null;
};

const normalizeAction = (value: unknown) => {
  const key = token(value);
  if (key.includes('commit') || key.includes('create_drafts')) return 'commit_ai_drafts';
  if (key.includes('start') && (key.includes('ai') || key.includes('mission'))) return 'start_ai_mission';
  if (key.includes('compile') || key.includes('knowledge')) return 'compile_brand_knowledge';
  if (key.includes('research') && (key.includes('brand') || key.includes('website'))) return 'research_brand_website';
  if (key.includes('brand') && key.includes('guide')) return 'create_brand_guide';
  if (key.includes('folder')) return 'create_default_folder';
  if (key.includes('project')) return 'create_project';
  return null;
};

const deterministicPlan = (text: string) => {
  const websiteMatch = text.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:\/[^\s]*)?/i);
  const projectMatch = text.match(/\bproject\s+(?:called|named)\s+["']?([^"'.\n]+?)["']?(?=\s+(?:with|for|whose|and)\b|[.!?]|$)/i);
  const projectName = projectMatch?.[1]?.trim() || null;
  const websiteUrl = normalizeUrl(websiteMatch?.[0]);
  const requestedOutputs = Array.from(new Set([
    ...(/\bsocial\s+(?:posts?|content)\b/i.test(text) ? ['socialPosts'] : []),
    ...(/\bgoogle\s+ads?\b/i.test(text) ? ['googleAds'] : []),
    ...(/\b(?:meta|paid social|social)\s+ads?\b/i.test(text) ? ['socialAds'] : []),
    ...(/\bblogs?\s+(?:ideas?|outlines?|posts?)\b/i.test(text) ? ['blogOutlines'] : []),
  ]));
  const wantsCampaign = /\b(campaign|drafts?|posts?|ads?|blog)\b/i.test(text) || requestedOutputs.length > 0;
  const wantsBrandGuide = /\bbrand\s+(?:guide|knowledge)\b/i.test(text) || !!websiteUrl || wantsCampaign;
  const audienceMatch = text.match(/\bfor\s+([^,.]+?(?:buyers?|customers?|audience|investors?|operators?|authorities|businesses|fleets?))\b/i);
  const actions: string[] = [];
  if (projectName || /\bcreate\s+(?:a\s+)?project\b/i.test(text)) actions.push('create_project');
  if (wantsCampaign) actions.push('create_default_folder');
  if (wantsBrandGuide) actions.push('create_brand_guide');
  if (websiteUrl) actions.push('research_brand_website', 'compile_brand_knowledge');
  if (wantsCampaign) actions.push('start_ai_mission', 'commit_ai_drafts');
  const missingQuestions: Array<{ id: string; question: string; options: string[] }> = [];
  if (actions.includes('create_project') && !projectName) {
    missingQuestions.push({ id: 'projectName', question: 'What should the project be called?', options: [] });
  }
  if (wantsCampaign && requestedOutputs.length === 0) {
    missingQuestions.push({ id: 'requestedOutputs', question: 'Which campaign outputs should I create?', options: ['Social posts', 'Google ads', 'Meta ads', 'Blog ideas'] });
  }
  return planSchema.parse({
    intent: wantsCampaign ? 'create_campaign_workspace' : wantsBrandGuide ? 'build_brand_guide' : projectName ? 'create_project' : 'unknown',
    confidence: websiteUrl && projectName ? 0.9 : projectName || websiteUrl ? 0.76 : 0.58,
    projectName,
    websiteUrl,
    campaignBrief: wantsCampaign ? text : null,
    targetAudience: audienceMatch?.[1]?.trim() || null,
    requestedOutputs,
    workMode: /\b(deep|premium|comprehensive|full)\b/i.test(text) ? 'deep' : 'instant',
    missingQuestions,
    actions: Array.from(new Set(actions)),
  });
};

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  const supabase = getUserClient(req);
  let commandText = '';
  try {
    await currentUserId(supabase);
    const body = await readJson<RequestBody>(req);
    const text = String(body.text || '').trim();
    commandText = text;
    if (!text || text.length > 12000) return jsonResponse({ error: 'Command text must be between 1 and 12000 characters.' }, 400);

    const raw = await openRouterJson<Record<string, unknown>>({
      model: 'deepseek/deepseek-v4-flash',
      temperature: 0.1,
      maxTokens: 1400,
      timeoutMs: 25_000,
      messages: [
        {
          role: 'system',
          content: [
            'You are the Social Suite command harness parser. You are a traffic controller, not a content generator.',
            'Convert messy user requests into one strict JSON execution plan. Never claim to execute work.',
            'Ask only questions that block safe execution. Do not ask for audience if it is already stated or can be inferred from the brief.',
            'Normalize website URLs to https://. Meta ads map to socialAds. Blog ideas map to blogOutlines.',
            'Use deep mode for premium, comprehensive, research-heavy, or multi-channel requests; otherwise instant.',
            'For a campaign workspace, order actions as create_project, create_default_folder, create_brand_guide, research_brand_website, compile_brand_knowledge, start_ai_mission, commit_ai_drafts.',
            'Include commit_ai_drafts as the final possible action, but permission and approval policy is enforced outside this parser.',
            'Return exactly these keys: intent, confidence, projectName, websiteUrl, campaignBrief, targetAudience, requestedOutputs, workMode, missingQuestions, actions.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Current app context:\n${JSON.stringify(body.context || {})}\n\nUser request:\n${text}`,
        },
      ],
    });

    const fallback = deterministicPlan(text);
    const normalizedOutputs = Array.from(new Set((Array.isArray(raw.requestedOutputs) ? raw.requestedOutputs : [])
      .map(normalizeOutput)
      .filter(Boolean)));
    const normalizedActions = Array.from(new Set((Array.isArray(raw.actions) ? raw.actions : [])
      .map(normalizeAction)
      .filter(Boolean)));
    const normalizedIntent = normalizeIntent(raw.intent);
    const candidate = {
      ...raw,
      intent: normalizedIntent === 'unknown' ? fallback.intent : normalizedIntent,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : fallback.confidence,
      projectName: typeof raw.projectName === 'string' && raw.projectName.trim() ? raw.projectName.trim() : fallback.projectName,
      websiteUrl: normalizeUrl(raw.websiteUrl) || fallback.websiteUrl,
      campaignBrief: typeof raw.campaignBrief === 'string' && raw.campaignBrief.trim() ? raw.campaignBrief.trim() : fallback.campaignBrief,
      targetAudience: typeof raw.targetAudience === 'string' && raw.targetAudience.trim() ? raw.targetAudience.trim() : fallback.targetAudience,
      requestedOutputs: normalizedOutputs.length ? normalizedOutputs : fallback.requestedOutputs,
      workMode: raw.workMode === 'deep' ? 'deep' : raw.workMode === 'instant' ? 'instant' : fallback.workMode,
      missingQuestions: Array.isArray(raw.missingQuestions) ? raw.missingQuestions : fallback.missingQuestions,
      actions: normalizedActions.length ? normalizedActions : fallback.actions,
    };
    let plan;
    try {
      plan = planSchema.parse(candidate);
    } catch {
      plan = fallback;
    }
    return jsonResponse({ plan, model: 'deepseek/deepseek-v4-flash' });
  } catch (error) {
    try {
      if (commandText) return jsonResponse({ plan: deterministicPlan(commandText), model: 'deterministic-fallback' });
    } catch {
      // Return the original parser error below when the request itself is invalid.
    }
    const message = error instanceof Error ? error.message : 'Could not parse command';
    return jsonResponse({ error: message }, 400);
  }
});
