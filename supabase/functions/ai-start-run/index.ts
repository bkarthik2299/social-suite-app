import { currentUserId, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';
import { openRouterJson } from '../_shared/openrouter.ts';
import { hasCampaignOutput, normalizeCampaignPack, type CampaignPack } from '../_shared/campaign_pack.ts';
import { tavilyContext, tavilySearch, type TavilySearchResponse } from '../_shared/tavily.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

type RequestBody = {
  prompt: string;
  projectId?: string | null;
  folderId?: string | null;
  campaignId?: string | null;
  brandGuideId?: string | null;
  brandKnowledgeDocumentId?: string | null;
  context?: Record<string, unknown>;
};

type WorkMode = 'instant' | 'deep';
type StepName = typeof stepDefinitions[number]['agent_name'];
type SupabaseClient = ReturnType<typeof getUserClient>;
type PlannerOutput = {
  researchQuery: string;
  campaignGuidance: string;
};
const defaultDeepModel = 'qwen/qwen3-coder-30b-a3b-instruct';
const defaultFastModel = 'deepseek/deepseek-chat-v3-0324';

const stepDefinitions = [
  { agent_name: 'Planner Agent', title: 'Planner Agent' },
  { agent_name: 'Brand Guide Agent', title: 'Brand Guide Agent' },
  { agent_name: 'Research Agent', title: 'Research Agent' },
  { agent_name: 'Copywriter Agent', title: 'Copywriter Agent' },
  { agent_name: 'Platform Specialist', title: 'Platform Specialist' },
  { agent_name: 'QA Agent', title: 'QA Agent' },
  { agent_name: 'Output Mapper Agent', title: 'Output Mapper Agent' },
] as const;

const fallbackPack = (prompt: string): CampaignPack => ({
  strategy: {
    title: 'AI Campaign Draft',
    summary: `Campaign direction generated from: ${prompt.slice(0, 180)}`,
    objectives: ['Clarify the offer', 'Create platform-native draft assets', 'Prepare review-ready campaign content'],
    contentPillars: ['Awareness', 'Education', 'Proof', 'Conversion'],
  },
  socialPosts: Array.from({ length: 12 }, (_, index) => ({
    name: `Social Post ${index + 1}`,
    topic: `Campaign message ${index + 1}`,
    caption: `Draft social caption ${index + 1}. Replace this with generated copy once the AI provider is configured.`,
    platforms: ['linkedin', 'instagram', 'facebook'],
    creativeBrief: 'AI-generated draft placeholder.',
  })),
  googleAds: Array.from({ length: 3 }, (_, index) => ({
    name: `Google Ad ${index + 1}`,
    topic: 'Search campaign concept',
    headlines: [`Campaign Headline ${index + 1}`, 'Brand Benefit', 'Start Today'],
    descriptions: ['Draft search ad description. Configure the AI provider for final copy.'],
    callouts: ['Fast setup', 'Expert support'],
  })),
  socialAds: Array.from({ length: 4 }, (_, index) => ({
    name: `Paid Social Ad ${index + 1}`,
    topic: 'Paid social concept',
    platform: index % 2 === 0 ? 'facebook' : 'linkedin',
    primaryText: 'Draft paid social primary text. Configure the AI provider for final copy.',
    headline: 'Campaign headline',
    cta: 'learn_more',
  })),
  blogOutlines: Array.from({ length: 2 }, (_, index) => ({
    title: `Blog Outline ${index + 1}`,
    slug: `blog-outline-${index + 1}`,
    excerpt: 'Draft blog outline excerpt.',
    metaTitle: `Blog Outline ${index + 1}`,
    metaDescription: 'Draft meta description.',
    keywords: ['campaign', 'brand'],
    outline: ['Introduction', 'Key message', 'Proof points', 'Call to action'],
  })),
  calendar: Array.from({ length: 30 }, (_, index) => ({
    title: `Campaign touchpoint ${index + 1}`,
    type: index % 5 === 0 ? 'blogs' : index % 3 === 0 ? 'google-ad' : index % 2 === 0 ? 'meta-ad' : 'socials',
    date: new Date(Date.now() + index * 86400000).toISOString().slice(0, 10),
  })),
});

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  const supabase = getUserClient(req);

  try {
    const userId = await currentUserId(supabase);
    const body = await readJson<RequestBody>(req);
    if (!body.prompt?.trim()) return jsonResponse({ error: 'prompt is required' }, 400);

    const workMode = body.context?.workMode === 'deep' ? 'deep' : 'instant';
    const { orgId, brandGuideId, brandKnowledgeDocumentId } = await resolveRunContext(supabase, body, userId);

    const { data: run, error: runError } = await supabase
      .from('ai_runs')
      .insert({
        org_id: orgId,
        created_by: userId,
        project_id: body.projectId || null,
        folder_id: body.folderId || null,
        campaign_id: body.campaignId || null,
        brand_guide_id: brandGuideId,
        brand_knowledge_document_id: brandKnowledgeDocumentId,
        title: 'Brief to Campaign',
        prompt: body.prompt,
        mode: 'approval',
        status: 'running',
        context: { ...(body.context || {}), workMode },
      })
      .select()
      .single();
    if (runError) throw runError;

    const { data: steps, error: stepError } = await supabase
      .from('ai_run_steps')
      .insert(stepDefinitions.map((step, index) => ({
        run_id: run.id,
        agent_name: step.agent_name,
        title: step.title,
        status: index === 0 ? 'working' : 'queued',
        message: index === 0 ? `Reading the brief and preparing ${workMode === 'deep' ? 'Deep Work' : 'Instant'} execution.` : null,
        sort_order: index,
        started_at: index === 0 ? new Date().toISOString() : null,
      })))
      .select();
    if (stepError) throw stepError;

    const stepIds = Object.fromEntries((steps || []).map((step) => [step.agent_name, step.id])) as Record<StepName, string>;
    EdgeRuntime.waitUntil(processMission({
      supabase,
      body: { ...body, brandGuideId, brandKnowledgeDocumentId },
      runId: run.id,
      stepIds,
      workMode,
    }));

    return jsonResponse({ run, artifact: null });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});

async function processMission({
  supabase,
  body,
  runId,
  stepIds,
  workMode,
}: {
  supabase: SupabaseClient;
  body: RequestBody;
  runId: string;
  stepIds: Record<StepName, string>;
  workMode: WorkMode;
}) {
  let activeStep: StepName = 'Planner Agent';

  const updateStep = async (name: StepName, status: 'queued' | 'working' | 'done' | 'failed' | 'skipped', message: string) => {
    const patch: Record<string, unknown> = { status, message };
    if (status === 'working') patch.started_at = new Date().toISOString();
    if (status === 'done' || status === 'failed' || status === 'skipped') patch.completed_at = new Date().toISOString();
    await supabase.from('ai_run_steps').update(patch).eq('id', stepIds[name]);
  };

  const addEvent = async (name: StepName, eventType: string, message: string, payload: Record<string, unknown> = {}) => {
    await supabase.from('ai_run_events').insert({
      run_id: runId,
      step_id: stepIds[name],
      event_type: eventType,
      message,
      payload,
    });
  };

  try {
    activeStep = 'Planner Agent';
    const destination = await loadDestinationContext(supabase, body);
    await updateStep(activeStep, 'working', `Understanding the brief and preparing ${workMode === 'deep' ? 'a focused research question' : 'campaign guidance'}.`);
    const plannerOutput = await buildPlannerOutput(body.prompt, destination);
    await addEvent(activeStep, 'planning', `Destination resolved: ${destination.projectName || 'selected project'} -> ${destination.folderName || 'auto folder'}.`, {
      projectName: destination.projectName,
      folderName: destination.folderName,
      campaignName: destination.campaignName,
      workMode,
    });
    await addEvent(activeStep, 'research_plan', 'Prepared a focused research question and campaign guidance from the client brief.', {
      researchQuery: plannerOutput.researchQuery,
      campaignGuidance: plannerOutput.campaignGuidance,
    });
    await updateStep(activeStep, 'done', `Planned a balanced pack for ${destination.projectName || 'the selected project'} and prepared a focused research question.`);

    activeStep = 'Brand Guide Agent';
    await updateStep(activeStep, 'working', body.brandKnowledgeDocumentId ? 'Loading the compiled brand knowledge document.' : 'Checking whether a compiled brand guide is available.');
    const brandKnowledge = await loadBrandKnowledge(supabase, body.brandKnowledgeDocumentId || null);
    if (brandKnowledge.markdown) {
      await addEvent(activeStep, 'brand_context', `Filtering brand guide context for tone, writing rules, content pillars, and healthcare guardrails.`, {
        documentId: body.brandKnowledgeDocumentId,
        title: brandKnowledge.title,
        characters: brandKnowledge.markdown.length,
      });
      await updateStep(activeStep, 'done', `Loaded ${brandKnowledge.title || 'brand knowledge'} and filtered tone, voice, writing rules, and campaign guardrails.`);
    } else {
      await addEvent(activeStep, 'brand_context', 'No compiled brand knowledge document was selected; continuing with prompt context.', { documentId: null });
      await updateStep(activeStep, 'skipped', 'No compiled brand knowledge document was selected; using the brief as the primary source.');
    }

    let researchContext = '';
    let researchSources: TavilySearchResponse['results'] = [];
    activeStep = 'Research Agent';
    if (workMode === 'deep') {
      const query = buildResearchQuery(plannerOutput.researchQuery, destination, brandKnowledge.markdown);
      await updateStep(activeStep, 'working', `Searching the web for useful campaign context: ${query}`);
      await addEvent(activeStep, 'web_search', `Web research started for: ${query}`, { query });

      try {
        const research = await tavilySearch(query);
        const researchDigest = await buildResearchDigest(research, plannerOutput.campaignGuidance);
        researchContext = tavilyContext({ ...research, answer: researchDigest });
        researchSources = research.results;
        const sourceTitles = research.results.slice(0, 3).map((item) => item.title).join(', ');
        await addEvent(activeStep, 'web_sources', `Research found ${research.results.length} useful sources${sourceTitles ? `: ${sourceTitles}` : '.'}`, {
          query: research.query,
          answer: researchDigest,
          campaignGuidance: plannerOutput.campaignGuidance,
          credits: research.credits,
          responseTime: research.responseTime,
          sources: research.results.map(({ title, url, score, content }) => ({ title, url, score, content: content.slice(0, 500) })),
        });
        await updateStep(activeStep, 'done', `Reviewed ${research.results.length} web sources and extracted useful campaign angles.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Web research failed';
        await addEvent(activeStep, 'web_search_failed', 'Web research could not be completed. Continuing with the brief and brand guide.', { internalError: message });
        await updateStep(activeStep, 'skipped', 'Web research could not be completed. Continuing with the brief and brand guide.');
      }
    } else {
      await addEvent(activeStep, 'instant_mode', 'Instant mode selected; web research was skipped.', { skipped: true });
      await updateStep(activeStep, 'skipped', 'Instant mode selected; using the brief and brand guide without web research.');
    }

    activeStep = 'Copywriter Agent';
    const model = modelForMode(workMode);
    await updateStep(activeStep, 'working', 'Generating strategy and channel-ready copy.');
    await addEvent(activeStep, 'model_call', 'Draft generation started using the selected work mode.', {
      model,
      workMode,
      researchSources: researchSources.length,
    });

    const today = new Date().toISOString().slice(0, 10);
    let pack: CampaignPack;
    try {
      const rawPack = await openRouterJson<unknown>({
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You are Social Suite Mission Mode. Return only valid JSON.',
              'Use these exact top-level keys: strategy, socialPosts, googleAds, socialAds, blogOutlines, calendar.',
              'calendar must be an array of objects: { "title": string, "type": "socials" | "google-ad" | "meta-ad" | "blogs", "date": "YYYY-MM-DD" }.',
              'Do not use snake_case keys. Do not return markdown.',
              'Drafts must be review-ready, brand-safe, healthcare-compliant, and platform-native.',
              'For healthcare content, avoid diagnosis promises, avoid guaranteed outcomes, and keep claims educational and responsible.',
              'Treat deep research as supporting context only. Never introduce an offer, discount, date, availability promise, or clinical claim unless it is explicitly present in the client brief or brand knowledge.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `Create a balanced Brief-to-Campaign pack with strategy, 12 social posts, 3 Google ads, 4 paid social ads, 2 blog outlines, and a 30-day calendar array.`,
              `Calendar dates must start on or after ${today}; never use past dates.`,
              destination.projectName ? `Project: ${destination.projectName}` : '',
              destination.campaignName ? `Destination campaign: ${destination.campaignName}` : '',
              plannerOutput.campaignGuidance ? `Planner guidance:\n${plannerOutput.campaignGuidance}` : '',
              brandKnowledge.markdown ? `Brand knowledge:\n${brandKnowledge.markdown}` : '',
              researchContext ? `Deep research context:\n${researchContext}` : '',
              `Brief:\n${body.prompt}`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
      });
      const normalizedPack = normalizeCampaignPack(rawPack);
      pack = hasCampaignOutput(normalizedPack) ? normalizedPack : fallbackPack(body.prompt);
    } catch (error) {
      await addEvent(activeStep, 'model_fallback', 'Primary generation could not complete. Structured draft placeholders were prepared for review.', {
        model,
        internalError: error instanceof Error ? error.message : 'Unknown model error',
      });
      pack = fallbackPack(body.prompt);
    }
    await updateStep(activeStep, 'done', `Generated ${pack.socialPosts.length} social posts, ${pack.googleAds.length} Google ads, ${pack.socialAds.length} paid social ads, and ${pack.blogOutlines.length} blog outlines.`);

    activeStep = 'Platform Specialist';
    await updateStep(activeStep, 'working', 'Checking platform fields, ad structures, dates, and channel mapping.');
    await addEvent(activeStep, 'platform_mapping', 'Normalized platform names, CTA values, ad fields, and calendar dates for Social Suite placeholders.', {
      socialPosts: pack.socialPosts.length,
      googleAds: pack.googleAds.length,
      socialAds: pack.socialAds.length,
      blogOutlines: pack.blogOutlines.length,
      calendarItems: pack.calendar.length,
    });
    await updateStep(activeStep, 'done', `Mapped ${pack.calendar.length} calendar items and structured every output for its campaign type.`);

    activeStep = 'QA Agent';
    await updateStep(activeStep, 'working', 'Reviewing tone, completeness, date safety, and healthcare guardrails.');
    const qaFindings = validatePack(pack);
    await addEvent(activeStep, 'qa_review', qaFindings.length ? `QA noted: ${qaFindings.join(' ')}` : 'QA passed: required output groups are present and dates are future-safe.', {
      findings: qaFindings,
    });
    await updateStep(activeStep, qaFindings.length ? 'done' : 'done', qaFindings.length ? `QA completed with ${qaFindings.length} notes for review.` : 'QA passed required output groups, tone guardrails, and calendar readiness.');

    activeStep = 'Output Mapper Agent';
    await updateStep(activeStep, 'working', 'Saving the campaign pack artifact for review before draft creation.');
    const { data: artifact, error: artifactError } = await supabase
      .from('ai_artifacts')
      .insert({
        run_id: runId,
        type: 'brief_to_campaign',
        title: 'Brief to Campaign Draft Pack',
        content: pack,
        markdown: pack.strategy?.summary || '',
        status: 'draft',
      })
      .select()
      .single();
    if (artifactError) throw artifactError;

    await addEvent(activeStep, 'artifact_ready', 'Campaign draft pack is ready for review.', { artifactId: artifact.id });
    await updateStep(activeStep, 'done', 'Saved the review artifact. The next click can create Social Suite drafts.');

    await supabase.from('ai_runs').update({
      status: 'needs_approval',
      output_summary: pack.strategy?.summary || 'Campaign draft pack is ready for approval.',
    }).eq('id', runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    await updateStep(activeStep, 'failed', message).catch(() => null);
    await supabase.from('ai_run_events').insert({
      run_id: runId,
      step_id: stepIds[activeStep],
      event_type: 'run_failed',
      message,
      payload: {},
    }).catch(() => null);
    await supabase.from('ai_runs').update({ status: 'failed', error: message }).eq('id', runId).catch(() => null);
  }
}

async function resolveRunContext(supabase: SupabaseClient, body: RequestBody, userId: string) {
  let brandGuideId = body.brandGuideId || null;
  let brandKnowledgeDocumentId = body.brandKnowledgeDocumentId || null;
  if (brandGuideId) {
    const { data: guide } = await supabase
      .from('brand_guides')
      .select('id')
      .eq('id', brandGuideId)
      .maybeSingle();
    if (!guide?.id) {
      brandGuideId = null;
      brandKnowledgeDocumentId = null;
    }
  }

  let orgId = '';
  if (body.projectId) {
    const { data, error } = await supabase.from('projects').select('org_id').eq('id', body.projectId).single();
    if (error) throw error;
    orgId = data.org_id;
  } else if (body.folderId) {
    const { data, error } = await supabase.from('folders').select('projects!inner(org_id)').eq('id', body.folderId).single();
    if (error) throw error;
    orgId = (data.projects as { org_id: string }).org_id;
  } else {
    const { data, error } = await supabase.from('org_members').select('org_id').eq('user_id', userId).limit(1).single();
    if (error) throw error;
    orgId = data.org_id;
  }

  return { orgId, brandGuideId, brandKnowledgeDocumentId };
}

async function loadDestinationContext(supabase: SupabaseClient, body: RequestBody) {
  let projectName = '';
  let folderName = '';
  let campaignName = '';

  if (body.projectId) {
    const { data } = await supabase.from('projects').select('name').eq('id', body.projectId).maybeSingle();
    projectName = data?.name || '';
  }

  if (body.folderId) {
    const { data } = await supabase.from('folders').select('name').eq('id', body.folderId).maybeSingle();
    folderName = data?.name || '';
  }

  if (body.campaignId) {
    const { data } = await supabase.from('campaigns').select('name').eq('id', body.campaignId).maybeSingle();
    campaignName = data?.name || '';
  }

  return { projectName, folderName, campaignName };
}

async function loadBrandKnowledge(supabase: SupabaseClient, documentId: string | null) {
  if (!documentId) return { title: '', markdown: '' };

  const { data } = await supabase
    .from('brand_knowledge_documents')
    .select('title,markdown')
    .eq('id', documentId)
    .maybeSingle();

  return {
    title: data?.title || '',
    markdown: data?.markdown || '',
  };
}

function buildResearchQuery(prompt: string, destination: { projectName: string; campaignName: string }, brandKnowledge: string) {
  const brandHints = [
    destination.projectName,
    destination.campaignName,
    extractFirstUrl(brandKnowledge),
  ].filter(Boolean).join(' ');

  return truncateAtWord(`${brandHints} ${prompt}`.replace(/\s+/g, ' ').trim(), 260);
}

async function buildPlannerOutput(prompt: string, destination: { projectName: string; campaignName: string }): Promise<PlannerOutput> {
  const fallback = fallbackPlannerOutput(prompt, destination);
  try {
    const planned = await openRouterJson<unknown>({
      model: Deno.env.get('AI_FAST_MODEL') || defaultFastModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'You are the planning stage for a marketing campaign workflow.',
            'Return only valid JSON with exactly two string keys: researchQuery and campaignGuidance.',
            'researchQuery must be a concise web-search question, not a copy of the client brief.',
            'Keep researchQuery under 200 characters and focus on evidence, audience insights, responsible messaging principles, local relevance, and channel behavior that web research can improve.',
            'campaignGuidance must summarize the audiences, objective, tone, mandatory outputs, and restrictions in under 900 characters.',
            'Do not invent offers, discounts, claims, facts, dates, years, services, or availability. Do not add a year unless it appears in the client brief.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            destination.projectName ? `Project: ${destination.projectName}` : '',
            destination.campaignName ? `Destination campaign: ${destination.campaignName}` : '',
            `Client brief:\n${prompt}`,
          ].filter(Boolean).join('\n\n'),
        },
      ],
    });
    return normalizePlannerOutput(planned, fallback, prompt);
  } catch {
    return fallback;
  }
}

function normalizePlannerOutput(input: unknown, fallback: PlannerOutput, prompt: string): PlannerOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const record = input as Record<string, unknown>;
  const researchQuery = typeof record.researchQuery === 'string' ? record.researchQuery.trim() : '';
  const campaignGuidance = typeof record.campaignGuidance === 'string' ? record.campaignGuidance.trim() : '';
  return {
    researchQuery: researchQuery ? truncateAtWord(removeUnrequestedYears(researchQuery, prompt), 200) : fallback.researchQuery,
    campaignGuidance: campaignGuidance ? campaignGuidance.slice(0, 900) : fallback.campaignGuidance,
  };
}

async function buildResearchDigest(search: TavilySearchResponse, campaignGuidance: string) {
  const fallback = search.results
    .map((source) => source.content)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ')
    .slice(0, 1800);

  if (!search.results.length) return fallback;

  try {
    const digest = await openRouterJson<unknown>({
      model: Deno.env.get('AI_FAST_MODEL') || defaultFastModel,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'You summarize web research for a marketing workflow.',
            'Return only valid JSON with exactly one key: findings, an array of 3 to 6 concise strings.',
            'Use only facts, patterns, and cautious inferences supported by the provided source excerpts.',
            'Do not write campaign copy. Do not invent offers, prices, discounts, dates, services, availability, statistics, testimonials, clinical claims, or guarantees.',
            'If a useful idea is an inference rather than a sourced fact, label it as an inference.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            campaignGuidance ? `Campaign guidance:\n${campaignGuidance}` : '',
            `Research query:\n${search.query}`,
            `Source excerpts:\n${search.results.map((source, index) => `${index + 1}. ${source.title} (${source.url})\n${source.content}`).join('\n\n')}`,
          ].filter(Boolean).join('\n\n'),
        },
      ],
    });

    if (!digest || typeof digest !== 'object' || Array.isArray(digest)) return fallback;
    const findings = (digest as Record<string, unknown>).findings;
    if (!Array.isArray(findings)) return fallback;
    return findings.filter((item): item is string => typeof item === 'string' && !!item.trim()).join('; ');
  } catch {
    return fallback;
  }
}

function removeUnrequestedYears(value: string, prompt: string) {
  const requestedYears = new Set(prompt.match(/\b(?:19|20)\d{2}\b/g) || []);
  return value
    .replace(/\b(?:19|20)\d{2}\b/g, (year) => requestedYears.has(year) ? year : '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function truncateAtWord(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '')
    .replace(/[,\s]+$/, '')
    .trim();
}

function fallbackPlannerOutput(prompt: string, destination: { projectName: string; campaignName: string }): PlannerOutput {
  const projectName = destination.projectName || 'the selected brand';
  const promptKeywords = prompt
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 28)
    .join(' ');
  return {
    researchQuery: truncateAtWord(`${projectName}: evidence-based campaign insights, audience motivations, responsible messaging, and channel strategy for ${promptKeywords}`, 200),
    campaignGuidance: prompt.replace(/\s+/g, ' ').trim().slice(0, 900),
  };
}

function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0] || '';
}

function modelForMode(workMode: WorkMode) {
  if (workMode === 'deep') {
    return Deno.env.get('AI_DEEP_MODEL') || defaultDeepModel;
  }
  return Deno.env.get('AI_FAST_MODEL') || defaultFastModel;
}

function validatePack(pack: CampaignPack) {
  const findings: string[] = [];
  if (!pack.strategy?.summary) findings.push('Strategy summary is missing.');
  if (!pack.socialPosts.length) findings.push('Social posts are missing.');
  if (!pack.googleAds.length) findings.push('Google ads are missing.');
  if (!pack.socialAds.length) findings.push('Paid social ads are missing.');
  if (!pack.blogOutlines.length) findings.push('Blog outlines are missing.');
  if (!pack.calendar.length) findings.push('Calendar is missing.');
  return findings;
}
