import { createClient } from 'npm:@supabase/supabase-js@2';
import { getRequiredSecret, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';

type Permission = 'read' | 'write';
type JsonObject = Record<string, unknown>;
type ServiceClient = ReturnType<typeof createClient>;

type AgentRequest = {
  action: string;
  input?: JsonObject;
};

type AgentContext = {
  apiKeyId: string;
  orgId: string;
  userId: string;
  permission: Permission;
  role: string;
};

const writeActions = new Set([
  'ensure_project',
  'ensure_folder',
  'ensure_campaign',
  'setup_brand_from_website',
  'create_content_item',
  'create_task',
  'create_calendar_event',
  'create_note',
  'start_campaign_mission',
  'commit_ai_artifact',
  'cancel_ai_mission',
]);

const campaignTypes = new Set(['socials', 'google-ad', 'meta-ad', 'blogs']);
const contentTypes = new Set(['social-post', 'google-ad', 'social-ad', 'blog']);
const workModes = new Set(['instant', 'deep']);
const modelPreferences = new Set(['deepseek', 'anthropic']);
const researchProviders = new Set(['tavily', 'perplexity']);
const userAccessTokens = new Map<string, { token: string; expiresAt: number }>();

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    const service = getServiceClient();
    const apiKey = extractApiKey(req);
    const body = await readJson<AgentRequest>(req);
    if (!body.action) return jsonResponse({ error: 'action is required' }, 400);

    const context = await authenticateApiKey(service, apiKey);
    if (writeActions.has(body.action)) await requireWritePermission(context);

    const result = await dispatch(service, context, body.action, body.input || {});
    await touchKey(service, context.apiKeyId);
    return jsonResponse({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent API request failed';
    const status = statusFromError(message);
    return jsonResponse({ error: message }, status);
  }
});

const getServiceClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, getRequiredSecret('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const getSupabasePublishableKey = () => {
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) return legacyAnonKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    const parsed = JSON.parse(publishableKeys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  throw new Error('Supabase publishable key is not configured');
};

function extractApiKey(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const direct = req.headers.get('x-socialsuite-api-key')?.trim();
  const apiKey = bearer || direct;
  if (!apiKey) throw new Error('SocialSuite API key is required');
  if (!apiKey.startsWith('ss_')) throw new Error('Invalid SocialSuite API key');
  return apiKey;
}

async function authenticateApiKey(service: ServiceClient, apiKey: string): Promise<AgentContext> {
  const keyHash = await sha256(apiKey);
  const { data: key, error } = await service
    .from('account_api_keys')
    .select('id, org_id, user_id, permission, expires_at, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle();
  if (error) throw error;
  if (!key || key.revoked_at) throw new Error('Invalid or revoked SocialSuite API key');
  if (key.expires_at && new Date(String(key.expires_at)).getTime() <= Date.now()) {
    throw new Error('SocialSuite API key has expired');
  }

  const { data: membership, error: membershipError } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', key.org_id)
    .eq('user_id', key.user_id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership?.role) throw new Error('API key owner is no longer a member of this workspace');

  return {
    apiKeyId: String(key.id),
    orgId: String(key.org_id),
    userId: String(key.user_id),
    permission: key.permission === 'write' ? 'write' : 'read',
    role: String(membership.role),
  };
}

async function requireWritePermission(context: AgentContext) {
  if (context.permission !== 'write') throw new Error('This SocialSuite API key is read-only');
  if (!['admin', 'editor'].includes(context.role)) {
    throw new Error('API key owner no longer has write access to this workspace');
  }
}

async function dispatch(service: ServiceClient, context: AgentContext, action: string, input: JsonObject) {
  switch (action) {
    case 'whoami':
      return whoami(service, context);
    case 'workspace_overview':
      return workspaceOverview(service, context, numberInput(input.limit, 25, 1, 100));
    case 'ensure_project':
      return ensureProject(service, context, stringInput(input.name, 'name'));
    case 'ensure_folder':
      return ensureFolder(service, context, stringInput(input.projectId, 'projectId'), stringInput(input.name || 'General', 'name'));
    case 'ensure_campaign':
      return ensureCampaign(
        service,
        context,
        stringInput(input.folderId, 'folderId'),
        stringInput(input.name, 'name'),
        enumInput(input.type || 'socials', campaignTypes, 'type'),
        nullableString(input.deadline),
      );
    case 'get_project_context':
      return getProjectContext(service, context, stringInput(input.projectId, 'projectId'), numberInput(input.limit, 50, 1, 100));
    case 'setup_brand_from_website':
      return setupBrandFromWebsite(service, context, input);
    case 'get_brand_bundle':
      return getBrandBundle(service, context, stringInput(input.guideId, 'guideId'));
    case 'create_content_item':
      return createContentItem(service, context, input);
    case 'create_task':
      return createTask(service, context, input);
    case 'create_calendar_event':
      return createCalendarEvent(service, context, input);
    case 'create_note':
      return createNote(service, context, input);
    case 'start_campaign_mission':
      return startCampaignMission(service, context, input);
    case 'wait_for_ai_artifact':
      return waitForAiRun(service, context, stringInput(input.runId, 'runId'), numberInput(input.timeoutSeconds, 180, 1, 300), numberInput(input.pollSeconds, 3, 1, 15));
    case 'get_ai_run_details':
      return getAiRunDetails(service, context, stringInput(input.runId, 'runId'));
    case 'commit_ai_artifact':
      await requireRunInOrg(service, context, stringInput(input.runId, 'runId'));
      return invokeInternalFunction('ai-commit-run', context, {
        runId: input.runId,
        artifactId: nullableString(input.artifactId),
        selection: objectInput(input.selection || {}),
      });
    case 'cancel_ai_mission':
      await requireRunInOrg(service, context, stringInput(input.runId, 'runId'));
      return invokeInternalFunction('ai-cancel-run', context, { runId: input.runId });
    default:
      throw new Error(`Unsupported agent action: ${action}`);
  }
}

async function whoami(service: ServiceClient, context: AgentContext) {
  const [{ data: user }, { data: org }, { data: memberships, error }] = await Promise.all([
    service.auth.admin.getUserById(context.userId),
    service.from('organizations').select('id, name').eq('id', context.orgId).maybeSingle(),
    service.from('org_members').select('org_id, role, organizations(id, name)').eq('user_id', context.userId),
  ]);
  if (error) throw error;
  return {
    user: { id: context.userId, email: user?.user?.email || null },
    activeOrgId: context.orgId,
    activeOrg: org || null,
    apiKey: { id: context.apiKeyId, permission: context.permission },
    memberships: memberships || [],
  };
}

async function workspaceOverview(service: ServiceClient, context: AgentContext, limit: number) {
  const [projects, folders, campaigns, brandGuides, notes, tasks, calendarEvents, aiRuns] = await Promise.all([
    service.from('projects').select('*').eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
    service.from('folders').select('*, projects!inner(org_id, name)').eq('projects.org_id', context.orgId).limit(limit),
    service.from('campaigns').select('*, folders!inner(project_id, projects!inner(org_id, name))').eq('folders.projects.org_id', context.orgId).limit(limit),
    service.from('brand_guides').select('*').eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
    service.from('notes').select('id,title,project_id,created_at,updated_at').eq('org_id', context.orgId).order('updated_at', { ascending: false }).limit(limit),
    service.from('tasks').select('*').eq('org_id', context.orgId).order('updated_at', { ascending: false }).limit(limit),
    service.from('calendar_events').select('*, campaigns!inner(folder_id, folders!inner(project_id, projects!inner(org_id)))').eq('campaigns.folders.projects.org_id', context.orgId).order('event_date', { ascending: true }).limit(limit),
    service.from('ai_runs').select('*').eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
  ]);
  for (const result of [projects, folders, campaigns, brandGuides, notes, tasks, calendarEvents, aiRuns]) {
    if (result.error) throw result.error;
  }
  return {
    orgId: context.orgId,
    projects: (projects.data || []).map(compactRow),
    folders: folders.data || [],
    campaigns: campaigns.data || [],
    brandGuides: (brandGuides.data || []).map(compactRow),
    notes: notes.data || [],
    tasks: tasks.data || [],
    calendarEvents: calendarEvents.data || [],
    recentAiRuns: (aiRuns.data || []).map(compactRow),
  };
}

async function ensureProject(service: ServiceClient, context: AgentContext, name: string) {
  const cleanName = cleanText(name, 120);
  const { data: existing, error: lookupError } = await service
    .from('projects')
    .select('*')
    .eq('org_id', context.orgId)
    .eq('name', cleanName)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { project: existing, created: false };

  const { data, error } = await service
    .from('projects')
    .insert({ org_id: context.orgId, name: cleanName })
    .select('*')
    .single();
  if (error) throw error;
  return { project: data, created: true };
}

async function ensureFolder(service: ServiceClient, context: AgentContext, projectId: string, name: string) {
  await requireProjectInOrg(service, context, projectId);
  const cleanName = cleanText(name, 120);
  const { data: existing, error: lookupError } = await service
    .from('folders')
    .select('*')
    .eq('project_id', projectId)
    .eq('name', cleanName)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { folder: existing, created: false };

  const { data, error } = await service
    .from('folders')
    .insert({ project_id: projectId, name: cleanName })
    .select('*')
    .single();
  if (error) throw error;
  return { folder: data, created: true };
}

async function ensureCampaign(service: ServiceClient, context: AgentContext, folderId: string, name: string, type: string, deadline?: string | null) {
  await requireFolderInOrg(service, context, folderId);
  const cleanName = cleanText(name, 160);
  const { data: existing, error: lookupError } = await service
    .from('campaigns')
    .select('*')
    .eq('folder_id', folderId)
    .eq('name', cleanName)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { campaign: existing, created: false };

  const { data, error } = await service
    .from('campaigns')
    .insert({ folder_id: folderId, name: cleanName, type, deadline: deadline || null })
    .select('*')
    .single();
  if (error) throw error;
  return { campaign: data, created: true };
}

async function getProjectContext(service: ServiceClient, context: AgentContext, projectId: string, limit: number) {
  await requireProjectInOrg(service, context, projectId);
  const [project, folders, brandGuides, notes, tasks, aiRuns] = await Promise.all([
    service.from('projects').select('*').eq('id', projectId).eq('org_id', context.orgId).maybeSingle(),
    service.from('folders').select('*, campaigns(*, content_items(id,type,status), calendar_events(*))').eq('project_id', projectId).limit(limit),
    service.from('brand_guides').select('*').eq('project_id', projectId).eq('org_id', context.orgId).limit(limit),
    service.from('notes').select('id,title,project_id,created_at,updated_at').eq('project_id', projectId).eq('org_id', context.orgId).limit(limit),
    service.from('tasks').select('*').eq('project_id', projectId).eq('org_id', context.orgId).limit(limit),
    service.from('ai_runs').select('*').eq('project_id', projectId).eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
  ]);
  for (const result of [project, folders, brandGuides, notes, tasks, aiRuns]) {
    if (result.error) throw result.error;
  }
  return {
    project: compactRow(project.data),
    folders: folders.data || [],
    brandGuides: (brandGuides.data || []).map(compactRow),
    notes: notes.data || [],
    tasks: tasks.data || [],
    recentAiRuns: (aiRuns.data || []).map(compactRow),
  };
}

async function setupBrandFromWebsite(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const projectName = stringInput(input.projectName, 'projectName');
  const brandName = stringInput(input.brandName, 'brandName');
  const websiteUrl = normalizeWebsiteUrl(stringInput(input.websiteUrl, 'websiteUrl'));
  const projectResult = input.projectId
    ? { project: await requireProjectInOrg(service, context, stringInput(input.projectId, 'projectId')), created: false }
    : await ensureProject(service, context, projectName);

  const projectId = String(projectResult.project.id);
  const { data: existingGuide, error: guideLookupError } = await service
    .from('brand_guides')
    .select('*')
    .eq('org_id', context.orgId)
    .eq('project_id', projectId)
    .eq('brand_name', brandName.trim())
    .maybeSingle();
  if (guideLookupError) throw guideLookupError;

  let guide = existingGuide;
  let guideCreated = false;
  if (!guide) {
    const { data, error } = await service
      .from('brand_guides')
      .insert({ org_id: context.orgId, project_id: projectId, brand_name: brandName.trim(), website_url: websiteUrl })
      .select('*')
      .single();
    if (error) throw error;
    guide = data;
    guideCreated = true;
  } else if (guide.website_url !== websiteUrl) {
    const { data, error } = await service
      .from('brand_guides')
      .update({ website_url: websiteUrl })
      .eq('id', guide.id)
      .eq('org_id', context.orgId)
      .select('*')
      .single();
    if (error) throw error;
    guide = data;
  }

  const research = await invokeInternalFunction('brand-research-website', context, {
    guideId: guide.id,
    brandName: brandName.trim(),
    websiteUrl,
  });
  const researchCharge = await chargeBrandAiAction(service, context.orgId, String(guide.id), 'brand_research');
  const knowledge = await invokeInternalFunction('brand-compile-knowledge', context, { guideId: guide.id });
  const knowledgeCharge = await chargeBrandAiAction(service, context.orgId, String(guide.id), 'brand_knowledge');
  const bundle = await getBrandBundle(service, context, String(guide.id));

  return {
    project: projectResult.project,
    projectCreated: projectResult.created,
    brandGuideCreated: guideCreated,
    research,
    researchCharge,
    knowledge,
    knowledgeCharge,
    bundle,
  };
}

async function getBrandBundle(service: ServiceClient, context: AgentContext, guideId: string) {
  await requireBrandGuideInOrg(service, context, guideId);
  const [guide, colors, fonts, logos, logoRules, moodImages, document] = await Promise.all([
    service.from('brand_guides').select('*').eq('id', guideId).eq('org_id', context.orgId).maybeSingle(),
    service.from('brand_colors').select('*').eq('guide_id', guideId).order('sort_order'),
    service.from('brand_fonts').select('*').eq('guide_id', guideId).order('sort_order'),
    service.from('brand_logos').select('*').eq('guide_id', guideId).order('sort_order'),
    service.from('brand_logo_rules').select('*').eq('guide_id', guideId).order('sort_order'),
    service.from('brand_mood_images').select('*').eq('guide_id', guideId).order('sort_order'),
    service.from('brand_knowledge_documents').select('*').eq('guide_id', guideId).maybeSingle(),
  ]);
  for (const result of [guide, colors, fonts, logos, logoRules, moodImages, document]) {
    if (result.error) throw result.error;
  }
  return {
    guide: compactRow(guide.data),
    colors: colors.data || [],
    fonts: fonts.data || [],
    logos: (logos.data || []).map(compactRow),
    logoRules: logoRules.data || [],
    moodImages: (moodImages.data || []).map(compactRow),
    knowledgeDocument: compactRow(document.data),
  };
}

async function createContentItem(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const campaignId = stringInput(input.campaignId, 'campaignId');
  await requireCampaignInOrg(service, context, campaignId);
  const { data, error } = await service
    .from('content_items')
    .insert({
      campaign_id: campaignId,
      type: enumInput(input.type, contentTypes, 'type'),
      name: nullableString(input.name),
      status: stringInput(input.status || 'draft', 'status'),
      payload: objectInput(input.payload || {}),
    })
    .select('*')
    .single();
  if (error) throw error;
  return { contentItem: compactRow(data) };
}

async function createTask(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const projectId = nullableString(input.projectId);
  const folderId = nullableString(input.folderId);
  const campaignId = nullableString(input.campaignId);
  if (projectId) await requireProjectInOrg(service, context, projectId);
  if (folderId) await requireFolderInOrg(service, context, folderId);
  if (campaignId) await requireCampaignInOrg(service, context, campaignId);
  const { data, error } = await service
    .from('tasks')
    .insert({
      org_id: context.orgId,
      title: stringInput(input.title, 'title'),
      description: nullableString(input.description),
      status: stringInput(input.status || 'todo', 'status'),
      due_date: nullableString(input.dueDate),
      project_id: projectId,
      folder_id: folderId,
      campaign_id: campaignId,
      assignee_id: nullableString(input.assigneeId),
    })
    .select('*')
    .single();
  if (error) throw error;
  return { task: compactRow(data) };
}

async function createCalendarEvent(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const campaignId = stringInput(input.campaignId, 'campaignId');
  await requireCampaignInOrg(service, context, campaignId);
  const { data, error } = await service
    .from('calendar_events')
    .insert({
      campaign_id: campaignId,
      title: stringInput(input.title, 'title'),
      event_date: stringInput(input.eventDate, 'eventDate'),
      type: enumInput(input.type, campaignTypes, 'type'),
    })
    .select('*')
    .single();
  if (error) throw error;
  return { calendarEvent: compactRow(data) };
}

async function createNote(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const projectId = nullableString(input.projectId);
  if (projectId) await requireProjectInOrg(service, context, projectId);
  const text = String(input.text || '');
  const content = Array.isArray(input.content) ? input.content : [{
    id: crypto.randomUUID(),
    type: 'paragraph',
    props: {},
    content: text ? [{ type: 'text', text, styles: {} }] : [],
    children: [],
  }];
  const { data, error } = await service
    .from('notes')
    .insert({
      org_id: context.orgId,
      project_id: projectId,
      title: stringInput(input.title, 'title'),
      content,
      created_by: context.userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { note: compactRow(data) };
}

async function startCampaignMission(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const projectId = nullableString(input.projectId);
  const folderId = nullableString(input.folderId);
  const campaignId = nullableString(input.campaignId);
  const brandGuideId = nullableString(input.brandGuideId);
  const brandKnowledgeDocumentId = nullableString(input.brandKnowledgeDocumentId);

  if (projectId) await requireProjectInOrg(service, context, projectId);
  if (folderId) await requireFolderInOrg(service, context, folderId);
  if (campaignId) await requireCampaignInOrg(service, context, campaignId);
  if (brandGuideId) await requireBrandGuideInOrg(service, context, brandGuideId);
  if (brandKnowledgeDocumentId) await requireBrandKnowledgeDocumentInOrg(service, context, brandKnowledgeDocumentId);

  const workMode = enumInput(input.workMode || 'instant', workModes, 'workMode');
  const modelPreference = enumInput(input.modelPreference || 'deepseek', modelPreferences, 'modelPreference');
  const researchProvider = enumInput(input.researchProvider || 'tavily', researchProviders, 'researchProvider');
  const response = await invokeInternalFunction<{ run?: { id?: string } }>('ai-start-run', context, {
    prompt: stringInput(input.brief, 'brief'),
    projectId,
    folderId,
    campaignId,
    brandGuideId,
    brandKnowledgeDocumentId,
    context: {
      ...objectInput(input.extraContext || {}),
      workMode,
      aiModelId: modelIdFor(workMode, modelPreference),
      researchProvider,
      researchProviderName: researchProvider === 'tavily' ? 'Tavily' : 'Perplexity',
      researchModel: researchProvider === 'perplexity' ? 'perplexity/sonar-pro' : null,
    },
  });
  const waitForArtifact = input.waitForArtifact === true;
  const waited = waitForArtifact && response.run?.id
    ? await waitForAiRun(service, context, response.run.id, numberInput(input.waitTimeoutSeconds, 180, 1, 300), 3)
    : null;
  return {
    requested: { workMode, modelPreference, modelId: modelIdFor(workMode, modelPreference), researchProvider },
    response,
    waited,
  };
}

async function waitForAiRun(service: ServiceClient, context: AgentContext, runId: string, timeoutSeconds: number, pollSeconds: number) {
  await requireRunInOrg(service, context, runId);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let latest: JsonObject | null = null;
  while (Date.now() <= deadline) {
    latest = await getAiRunDetails(service, context, runId) as JsonObject;
    const status = (latest.run as { status?: string } | null)?.status;
    const artifacts = Array.isArray(latest.artifacts) ? latest.artifacts : [];
    if (artifacts.length > 0 || ['needs_approval', 'completed', 'failed', 'canceled'].includes(status || '')) return latest;
    await sleep(Math.max(1, pollSeconds) * 1000);
  }
  return { ...latest, timedOut: true };
}

async function getAiRunDetails(service: ServiceClient, context: AgentContext, runId: string) {
  await requireRunInOrg(service, context, runId);
  const [run, steps, events, artifacts] = await Promise.all([
    service.from('ai_runs').select('*').eq('id', runId).eq('org_id', context.orgId).maybeSingle(),
    service.from('ai_run_steps').select('*').eq('run_id', runId).order('sort_order'),
    service.from('ai_run_events').select('*').eq('run_id', runId).order('created_at'),
    service.from('ai_artifacts').select('*').eq('run_id', runId).order('created_at', { ascending: false }),
  ]);
  for (const result of [run, steps, events, artifacts]) {
    if (result.error) throw result.error;
  }
  return {
    run: compactRow(run.data),
    steps: steps.data || [],
    events: events.data || [],
    artifacts: artifacts.data || [],
  };
}

async function chargeBrandAiAction(service: ServiceClient, orgId: string, guideId: string, action: 'brand_research' | 'brand_knowledge') {
  const { data, error } = await service.rpc('charge_brand_ai_action_credit', {
    p_org_id: orgId,
    p_action: action,
    p_action_key: `agent-api:${action}:${guideId}:${crypto.randomUUID()}`,
  });
  if (error) throw error;
  return { balanceAfter: data, charged: 1 };
}

async function invokeInternalFunction<T = unknown>(name: string, context: AgentContext, body: JsonObject): Promise<T> {
  const url = `${getRequiredSecret('SUPABASE_URL')}/functions/v1/${name}`;
  const accessToken = await getUserAccessToken(context);
  const publishableKey = getSupabasePublishableKey();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok || payload.error) {
    throw new Error(payload.error || payload.message || `SocialSuite function ${name} failed`);
  }
  return payload as T;
}

async function getUserAccessToken(context: AgentContext) {
  const cached = userAccessTokens.get(context.userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const service = getServiceClient();
  const { data: userData, error: userError } = await service.auth.admin.getUserById(context.userId);
  if (userError) throw userError;
  const email = userData.user?.email;
  if (!email) throw new Error('API key owner does not have an email login');

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) throw linkError;

  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) throw new Error('Could not create temporary SocialSuite user token');

  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  });
  if (verifyError) throw verifyError;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Could not verify temporary SocialSuite user token');

  userAccessTokens.set(context.userId, {
    token,
    expiresAt: Date.now() + Math.max(60, sessionData.session.expires_in || 3600) * 1000,
  });
  return token;
}

async function requireProjectInOrg(service: ServiceClient, context: AgentContext, projectId: string) {
  const { data, error } = await service.from('projects').select('*').eq('id', projectId).eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Project not found or access denied');
  return data;
}

async function requireFolderInOrg(service: ServiceClient, context: AgentContext, folderId: string) {
  const { data, error } = await service
    .from('folders')
    .select('*, projects!inner(org_id)')
    .eq('id', folderId)
    .eq('projects.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Folder not found or access denied');
  return data;
}

async function requireCampaignInOrg(service: ServiceClient, context: AgentContext, campaignId: string) {
  const { data, error } = await service
    .from('campaigns')
    .select('*, folders!inner(project_id, projects!inner(org_id))')
    .eq('id', campaignId)
    .eq('folders.projects.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Campaign not found or access denied');
  return data;
}

async function requireBrandGuideInOrg(service: ServiceClient, context: AgentContext, guideId: string) {
  const { data, error } = await service.from('brand_guides').select('*').eq('id', guideId).eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Brand guide not found or access denied');
  return data;
}

async function requireBrandKnowledgeDocumentInOrg(service: ServiceClient, context: AgentContext, documentId: string) {
  const { data, error } = await service
    .from('brand_knowledge_documents')
    .select('*, brand_guides!inner(org_id)')
    .eq('id', documentId)
    .eq('brand_guides.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Brand knowledge document not found or access denied');
  return data;
}

async function requireRunInOrg(service: ServiceClient, context: AgentContext, runId: string) {
  const { data, error } = await service.from('ai_runs').select('id').eq('id', runId).eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('AI run not found or access denied');
  return data;
}

async function touchKey(service: ServiceClient, keyId: string) {
  await service.from('account_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyId);
}

function cleanText(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) throw new Error('Required text value is empty');
  return cleaned.slice(0, maxLength);
}

function stringInput(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectInput(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function numberInput(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function enumInput(value: unknown, allowed: Set<string>, name: string) {
  const clean = String(value || '').trim();
  if (!allowed.has(clean)) throw new Error(`${name} is invalid`);
  return clean;
}

function normalizeWebsiteUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('websiteUrl is required');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function modelIdFor(mode: string, provider: string) {
  if (mode === 'deep') return provider === 'deepseek' ? 'deepseek/deepseek-v4-pro' : 'anthropic/claude-sonnet-5';
  return provider === 'deepseek' ? 'deepseek/deepseek-v4-flash' : 'anthropic/claude-haiku-4.5';
}

function compactRow(row: unknown) {
  if (!row || typeof row !== 'object') return row;
  const value = row as JsonObject;
  const result: JsonObject = {};
  for (const [key, field] of Object.entries(value)) {
    if (key.includes('token') || key.includes('password') || key.includes('secret') || key.includes('hash')) continue;
    result[key] = field;
  }
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function statusFromError(message: string) {
  if (/required|invalid/i.test(message)) return 400;
  if (/api key|read-only|write access|member/i.test(message)) return 401;
  if (/access denied|not found/i.test(message)) return 403;
  if (/credits/i.test(message)) return 402;
  return 500;
}
