import { createClient } from 'npm:@supabase/supabase-js@2';
import CryptoJS from 'npm:crypto-js@4.2.0';
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
  'update_project',
  'update_folder',
  'update_campaign',
  'update_content_item',
  'generate_content_image',
  'delete_content_item',
  'setup_brand_from_website',
  'create_content_item',
  'create_task',
  'update_task',
  'delete_task',
  'move_task',
  'save_task_stages',
  'add_task_comment',
  'delete_task_comment',
  'mark_task_comments_read',
  'create_calendar_event',
  'update_calendar_event',
  'delete_calendar_event',
  'create_note',
  'update_note',
  'delete_note',
  'create_vault_credential',
  'update_vault_credential',
  'delete_vault_credential',
  'create_feed_folder',
  'update_feed_folder',
  'delete_feed_folder',
  'create_feed_post',
  'update_feed_post',
  'delete_feed_post',
  'create_portal_client',
  'update_portal_client',
  'delete_portal_client',
  'create_portal_feed',
  'delete_portal_feed',
  'create_portal_review_post',
  'update_portal_review_status',
  'add_portal_comment',
  'delete_portal_review_post',
  'update_brand_guide',
  'delete_brand_guide',
  'upsert_brand_item',
  'delete_brand_item',
  'update_brand_knowledge_markdown',
  'analyze_brand_visual_direction',
  'start_campaign_mission',
  'commit_ai_artifact',
  'cancel_ai_mission',
  'delete_ai_run',
  'save_ai_agent_skill',
  'create_ai_agent',
  'delete_ai_agent',
  'save_ai_workflow',
  'invite_team_member',
  'revoke_team_invite',
  'update_account_profile',
  'create_account_api_key',
  'revoke_account_api_key',
  'create_table_row',
  'update_table_row',
  'delete_table_rows',
]);

const campaignTypes = new Set(['socials', 'google-ad', 'meta-ad', 'blogs']);
const contentTypes = new Set(['social-post', 'google-ad', 'social-ad', 'blog']);
const workModes = new Set(['instant', 'deep']);
const modelPreferences = new Set(['deepseek', 'anthropic']);
const researchProviders = new Set(['tavily', 'perplexity']);
const imageAspectRatios = new Set(['1:1', '4:5', '9:16', '16:9']);
const genericFilterOps = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in']);
const genericTables = [
  'organizations',
  'org_members',
  'projects',
  'folders',
  'campaigns',
  'content_items',
  'tasks',
  'task_stages',
  'task_comments',
  'task_comment_reads',
  'calendar_events',
  'notes',
  'vault_credentials',
  'feed_folders',
  'feed_posts',
  'portal_clients',
  'portal_feeds',
  'portal_review_posts',
  'portal_comments',
  'portal_review_events',
  'brand_guides',
  'brand_colors',
  'brand_fonts',
  'brand_logos',
  'brand_logo_rules',
  'brand_mood_images',
  'brand_knowledge_documents',
  'ai_agents',
  'ai_agent_versions',
  'ai_agent_workflow_steps',
  'ai_runs',
  'ai_run_steps',
  'ai_run_events',
  'ai_artifacts',
  'ai_run_approvals',
  'ai_run_documents',
  'ai_credit_accounts',
  'org_tools',
  'tool_registry',
] as const;
const genericTableSet = new Set<string>(genericTables);
const brandItemTables = new Set(['brand_colors', 'brand_fonts', 'brand_logos', 'brand_logo_rules', 'brand_mood_images']);
const readOnlyTables = new Set(['organizations', 'org_members', 'ai_credit_accounts', 'tool_registry']);
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
    case 'update_project':
      return updateProject(service, context, input);
    case 'ensure_folder':
      return ensureFolder(service, context, stringInput(input.projectId, 'projectId'), stringInput(input.name || 'General', 'name'));
    case 'update_folder':
      return updateFolder(service, context, input);
    case 'ensure_campaign':
      return ensureCampaign(
        service,
        context,
        stringInput(input.folderId, 'folderId'),
        stringInput(input.name, 'name'),
        enumInput(input.type || 'socials', campaignTypes, 'type'),
        nullableString(input.deadline),
      );
    case 'update_campaign':
      return updateCampaign(service, context, input);
    case 'get_project_context':
      return getProjectContext(service, context, stringInput(input.projectId, 'projectId'), numberInput(input.limit, 50, 1, 100));
    case 'setup_brand_from_website':
      return setupBrandFromWebsite(service, context, input);
    case 'get_brand_bundle':
      return getBrandBundle(service, context, stringInput(input.guideId, 'guideId'));
    case 'create_content_item':
      return createContentItem(service, context, input);
    case 'update_content_item':
      return updateContentItem(service, context, input);
    case 'generate_content_image':
      return generateContentImage(service, context, input);
    case 'delete_content_item':
      return deleteContentItem(service, context, stringInput(input.contentItemId || input.id, 'contentItemId'));
    case 'create_task':
      return createTask(service, context, input);
    case 'list_tasks':
      return listTasks(service, context, numberInput(input.limit, 100, 1, 250));
    case 'update_task':
      return updateTask(service, context, input);
    case 'delete_task':
      return deleteTask(service, context, stringInput(input.taskId || input.id, 'taskId'));
    case 'move_task':
      return moveTask(service, context, input);
    case 'save_task_stages':
      return saveTaskStages(service, context, input);
    case 'add_task_comment':
      return addTaskComment(service, context, input);
    case 'delete_task_comment':
      return deleteTaskComment(service, context, stringInput(input.commentId || input.id, 'commentId'));
    case 'mark_task_comments_read':
      return markTaskCommentsRead(service, context, stringInput(input.taskId, 'taskId'));
    case 'create_calendar_event':
      return createCalendarEvent(service, context, input);
    case 'list_calendar_events':
      return listCalendarEvents(service, context, input);
    case 'update_calendar_event':
      return updateCalendarEvent(service, context, input);
    case 'delete_calendar_event':
      return deleteCalendarEvent(service, context, stringInput(input.eventId || input.id, 'eventId'));
    case 'create_note':
      return createNote(service, context, input);
    case 'list_notes':
      return listNotes(service, context, input);
    case 'update_note':
      return updateNote(service, context, input);
    case 'delete_note':
      return deleteNote(service, context, stringInput(input.noteId || input.id, 'noteId'));
    case 'list_vault_credentials':
      return listVaultCredentials(service, context, input);
    case 'create_vault_credential':
      return createVaultCredential(service, context, input);
    case 'update_vault_credential':
      return updateVaultCredential(service, context, input);
    case 'delete_vault_credential':
      return deleteVaultCredential(service, context, stringInput(input.credentialId || input.id, 'credentialId'));
    case 'list_feed_monitor':
      return listFeedMonitor(service, context, numberInput(input.limit, 100, 1, 250));
    case 'create_feed_folder':
      return createFeedFolder(service, context, input);
    case 'update_feed_folder':
      return updateFeedFolder(service, context, input);
    case 'delete_feed_folder':
      return deleteFeedFolder(service, context, stringInput(input.folderId || input.id, 'folderId'));
    case 'create_feed_post':
      return createFeedPost(service, context, input);
    case 'update_feed_post':
      return updateFeedPost(service, context, input);
    case 'delete_feed_post':
      return deleteFeedPost(service, context, stringInput(input.postId || input.id, 'postId'));
    case 'list_client_portal':
      return listClientPortal(service, context, numberInput(input.limit, 100, 1, 250));
    case 'create_portal_client':
      return createPortalClient(service, context, input);
    case 'update_portal_client':
      return updatePortalClient(service, context, input);
    case 'delete_portal_client':
      return deletePortalClient(service, context, stringInput(input.clientId || input.id, 'clientId'));
    case 'create_portal_feed':
      return createPortalFeed(service, context, input);
    case 'delete_portal_feed':
      return deletePortalFeed(service, context, stringInput(input.feedId || input.id, 'feedId'));
    case 'create_portal_review_post':
      return createPortalReviewPost(service, context, input);
    case 'update_portal_review_status':
      return updatePortalReviewStatus(service, context, input);
    case 'add_portal_comment':
      return addPortalComment(service, context, input);
    case 'delete_portal_review_post':
      return deletePortalReviewPost(service, context, stringInput(input.postId || input.id, 'postId'));
    case 'update_brand_guide':
      return updateBrandGuide(service, context, input);
    case 'delete_brand_guide':
      return deleteBrandGuide(service, context, stringInput(input.guideId, 'guideId'));
    case 'upsert_brand_item':
      return upsertBrandItem(service, context, input);
    case 'delete_brand_item':
      return deleteBrandItem(service, context, input);
    case 'update_brand_knowledge_markdown':
      return updateBrandKnowledgeMarkdown(service, context, input);
    case 'analyze_brand_visual_direction':
      return analyzeBrandVisualDirection(service, context, stringInput(input.guideId, 'guideId'));
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
    case 'delete_ai_run':
      return deleteAiRun(service, context, stringInput(input.runId, 'runId'));
    case 'list_ai_credits':
      return listAiCredits(service, context);
    case 'list_ai_agents':
      return listAiAgents(service, context);
    case 'save_ai_agent_skill':
      return saveAiAgentSkill(service, context, input);
    case 'create_ai_agent':
      return createAiAgent(service, context, input);
    case 'delete_ai_agent':
      return deleteAiAgent(service, context, stringInput(input.agentId, 'agentId'));
    case 'save_ai_workflow':
      return saveAiWorkflow(service, context, input);
    case 'list_team':
      return invokeInternalFunction('team-invitations', context, { action: 'list', orgId: context.orgId });
    case 'invite_team_member':
      return inviteTeamMember(context, input);
    case 'revoke_team_invite':
      return invokeInternalFunction('team-invitations', context, {
        action: 'revoke',
        orgId: context.orgId,
        invitationId: stringInput(input.invitationId, 'invitationId'),
      });
    case 'get_account_profile':
      return getAccountProfile(service, context);
    case 'update_account_profile':
      return updateAccountProfile(service, context, input);
    case 'list_account_api_keys':
      return invokeInternalFunction('account-api-keys', context, { action: 'list', orgId: context.orgId });
    case 'create_account_api_key':
      return invokeInternalFunction('account-api-keys', context, {
        action: 'create',
        orgId: context.orgId,
        name: stringInput(input.name, 'name'),
        permission: enumInput(input.permission || 'read', new Set(['read', 'write']), 'permission'),
      });
    case 'revoke_account_api_key':
      return invokeInternalFunction('account-api-keys', context, {
        action: 'revoke',
        orgId: context.orgId,
        keyId: stringInput(input.keyId, 'keyId'),
      });
    case 'list_micro_tools':
      return listMicroTools(service, context);
    case 'list_table_rows':
      return listTableRows(service, context, input);
    case 'get_table_row':
      return getTableRow(service, context, input);
    case 'create_table_row':
      return createTableRow(service, context, input);
    case 'update_table_row':
      return updateTableRow(service, context, input);
    case 'delete_table_rows':
      return deleteTableRows(service, context, input);
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

async function updateProject(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const projectId = stringInput(input.projectId || input.id, 'projectId');
  await requireProjectInOrg(service, context, projectId);
  const updates = pick(input.updates || input, ['name']);
  const { data, error } = await service
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .eq('org_id', context.orgId)
    .select('*')
    .single();
  if (error) throw error;
  return { project: compactRow(data) };
}

async function updateFolder(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const folderId = stringInput(input.folderId || input.id, 'folderId');
  await requireFolderInOrg(service, context, folderId);
  const updates = pick(input.updates || input, ['name']);
  const { data, error } = await service.from('folders').update(updates).eq('id', folderId).select('*').single();
  if (error) throw error;
  return { folder: compactRow(data) };
}

async function updateCampaign(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const campaignId = stringInput(input.campaignId || input.id, 'campaignId');
  await requireCampaignInOrg(service, context, campaignId);
  const updates = pick(input.updates || input, ['name', 'type', 'deadline']);
  const { data, error } = await service.from('campaigns').update(updates).eq('id', campaignId).select('*').single();
  if (error) throw error;
  return { campaign: compactRow(data) };
}

async function updateContentItem(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const contentItemId = stringInput(input.contentItemId || input.id, 'contentItemId');
  await requireContentItemInOrg(service, context, contentItemId);
  const updates = pick(input.updates || input, ['name', 'type', 'status', 'payload']);
  const { data, error } = await service.from('content_items').update(updates).eq('id', contentItemId).select('*').single();
  if (error) throw error;
  return { contentItem: compactRow(data) };
}

async function generateContentImage(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const contentItemId = stringInput(input.contentItemId || input.id, 'contentItemId');
  const contentItem = await requireContentItemInOrg(service, context, contentItemId) as JsonObject;
  const type = String(contentItem.type || '');
  if (!['social-post', 'social-ad'].includes(type)) {
    throw new Error('Image generation is available only for social posts and social ads');
  }

  const campaignId = stringInput(contentItem.campaign_id, 'campaignId');
  const campaign = await requireCampaignInOrg(service, context, campaignId) as JsonObject;
  const projectId = nullableString(campaignProjectId(campaign));
  const payload = objectInput(contentItem.payload || {});
  const visualGuide = (
    nullableString(input.visualGuide || input.visual_guide)
    || nullableString(payload.visualGuide || payload.visual_guide)
    || (type === 'social-post' ? nullableString(payload.creativeBrief || payload.creative_brief) : null)
    || ''
  ).trim();
  if (visualGuide.length < 12) throw new Error('Visual Guide must be at least 12 characters');

  const aspectRatio = enumInput(
    input.aspectRatio || input.aspect_ratio || payload.imageAspectRatio || payload.image_aspect_ratio || '1:1',
    imageAspectRatios,
    'aspectRatio',
  );
  const useBrandGuide = input.useBrandGuide !== false && input.use_brand_guide !== false;
  const brandGuide = useBrandGuide
    ? await loadBrandVisualContext(service, context, nullableString(input.brandGuideId || input.brand_guide_id), projectId)
    : null;
  const selectedLogoId = nullableString(input.selectedLogoId || input.selected_logo_id || payload.selectedLogoId || payload.selected_logo_id);
  if (selectedLogoId) await requireBrandChildInOrg(service, context, 'brand_logos', selectedLogoId);

  const generationContext = {
    ...contentImageContext(type, contentItem, payload),
    ...objectInput(input.context || input.contextOverrides || {}),
    aspectRatio,
    useBrandGuide,
    brandGuide,
    selectedLogoId,
  };
  const generation = await invokeInternalFunction<{
    imageUrl?: string;
    imageUrls?: string[];
    format?: string;
    slideCount?: number;
    logoUrl?: string;
    predictionIds?: string[];
    predictionUrls?: string[];
  }>('generate-visual-asset', context, {
    campaignId,
    visualGuide,
    context: generationContext,
  });

  const generatedUrls = uniqueStrings([
    ...(Array.isArray(generation.imageUrls) ? generation.imageUrls : []),
    generation.imageUrl || '',
  ]);
  if (!generatedUrls.length) throw new Error('Image generation did not return an image');

  const assets = await uploadGeneratedCampaignMedia(service, campaignId, generatedUrls);
  const persistedUrls = assets.map((asset) => String(asset.url || '')).filter(Boolean);
  const replaceExistingImages = input.replaceExistingImages === true || input.replace_existing_images === true;
  const updateVisualGuide = input.updateVisualGuide !== false && input.update_visual_guide !== false;
  const nextPayload: JsonObject = {
    ...payload,
    image: persistedUrls[0] || '',
    mediaAssets: assets,
    mediaFormat: generation.format === 'carousel' || assets.length > 1 ? 'carousel' : 'single',
    generatedImages: replaceExistingImages
      ? persistedUrls
      : uniqueStrings([...persistedUrls, ...stringArray(payload.generatedImages || payload.generated_images)]),
    imageAspectRatio: aspectRatio,
    useBrandGuide,
    selectedLogoId: selectedLogoId || null,
  };
  if (updateVisualGuide) nextPayload.visualGuide = visualGuide;

  const { data, error } = await service
    .from('content_items')
    .update({ payload: nextPayload })
    .eq('id', contentItemId)
    .select('*')
    .single();
  if (error) throw error;

  return {
    contentItem: compactRow(data),
    generated: {
      imageUrls: persistedUrls,
      mediaAssets: assets,
      format: nextPayload.mediaFormat,
      slideCount: Math.max(Number(generation.slideCount || 0), assets.length),
      aspectRatio,
      visualGuide,
      useBrandGuide,
      brandGuideId: brandGuide ? brandGuide.guideId : null,
      selectedLogoId: selectedLogoId || null,
      predictionIds: generation.predictionIds || [],
      predictionUrls: generation.predictionUrls || [],
    },
  };
}

async function deleteContentItem(service: ServiceClient, context: AgentContext, contentItemId: string) {
  await requireContentItemInOrg(service, context, contentItemId);
  const { error } = await service.from('content_items').delete().eq('id', contentItemId);
  if (error) throw error;
  return { deleted: true, contentItemId };
}

async function listTasks(service: ServiceClient, context: AgentContext, limit: number) {
  const [tasks, stages, comments, reads, members] = await Promise.all([
    service.from('tasks').select('*').eq('org_id', context.orgId).order('sort_order', { ascending: true }).limit(limit),
    service.from('task_stages').select('*').eq('org_id', context.orgId).order('sort_order'),
    service.from('task_comments').select('*').eq('org_id', context.orgId).order('created_at'),
    service.from('task_comment_reads').select('*').eq('org_id', context.orgId).eq('user_id', context.userId),
    loadTeamMembersLite(service, context.orgId),
  ]);
  for (const result of [tasks, stages, comments, reads]) if (result.error) throw result.error;
  return {
    tasks: (tasks.data || []).map(compactRow),
    stages: stages.data || [],
    comments: comments.data || [],
    readMarkers: reads.data || [],
    members,
  };
}

async function updateTask(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const taskId = stringInput(input.taskId || input.id, 'taskId');
  await requireTaskInOrg(service, context, taskId);
  const updates = pick(input.updates || input, ['title', 'description', 'status', 'due_date', 'dueDate', 'project_id', 'projectId', 'folder_id', 'folderId', 'campaign_id', 'campaignId', 'assignee_id', 'assigneeId', 'sort_order', 'sortOrder']);
  normalizeAlias(updates, 'dueDate', 'due_date');
  normalizeAlias(updates, 'projectId', 'project_id');
  normalizeAlias(updates, 'folderId', 'folder_id');
  normalizeAlias(updates, 'campaignId', 'campaign_id');
  normalizeAlias(updates, 'assigneeId', 'assignee_id');
  normalizeAlias(updates, 'sortOrder', 'sort_order');
  await validateTaskLinks(service, context, updates);
  const { data, error } = await service.from('tasks').update(updates).eq('id', taskId).eq('org_id', context.orgId).select('*').single();
  if (error) throw error;
  return { task: compactRow(data) };
}

async function deleteTask(service: ServiceClient, context: AgentContext, taskId: string) {
  await requireTaskInOrg(service, context, taskId);
  const { error } = await service.from('tasks').delete().eq('id', taskId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, taskId };
}

async function moveTask(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const taskId = stringInput(input.taskId || input.id, 'taskId');
  const status = stringInput(input.status, 'status');
  await requireTaskInOrg(service, context, taskId);
  const { error } = await service.from('tasks').update({ status }).eq('id', taskId).eq('org_id', context.orgId);
  if (error) throw error;
  const orderedIds = Array.isArray(input.orderedIds) ? input.orderedIds.filter((id): id is string => typeof id === 'string') : [];
  if (orderedIds.length) await updateTaskSortOrder(service, context, orderedIds);
  return { moved: true, taskId, status };
}

async function saveTaskStages(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const stages = Array.isArray(input.stages) ? input.stages as JsonObject[] : [];
  if (!stages.length) throw new Error('stages is required');
  const normalized = stages.map((stage, index) => ({
    id: stringInput(stage.id, 'stage.id'),
    org_id: context.orgId,
    title: cleanText(stringInput(stage.title, 'stage.title'), 100),
    color: stringInput(stage.color || 'bg-slate-500', 'stage.color'),
    sort_order: Number.isFinite(Number(stage.sort_order ?? stage.sortOrder)) ? Number(stage.sort_order ?? stage.sortOrder) : index,
  }));
  const { error } = await service.from('task_stages').upsert(normalized, { onConflict: 'org_id,id' });
  if (error) throw error;
  return { stages: normalized };
}

async function addTaskComment(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const taskId = stringInput(input.taskId, 'taskId');
  await requireTaskInOrg(service, context, taskId);
  const profile = await getAccountProfile(service, context);
  const { data, error } = await service
    .from('task_comments')
    .insert({
      org_id: context.orgId,
      task_id: taskId,
      parent_id: nullableString(input.parentId),
      author_user_id: context.userId,
      author_name: nullableString(input.authorName) || profile.name || profile.email || 'Hermes',
      author_avatar: nullableString(input.authorAvatar) || profile.avatarUrl || null,
      body: stringInput(input.body, 'body'),
    })
    .select('*')
    .single();
  if (error) throw error;
  return { comment: data };
}

async function deleteTaskComment(service: ServiceClient, context: AgentContext, commentId: string) {
  const { error } = await service
    .from('task_comments')
    .delete()
    .eq('id', commentId)
    .eq('org_id', context.orgId)
    .eq('author_user_id', context.userId);
  if (error) throw error;
  return { deleted: true, commentId };
}

async function markTaskCommentsRead(service: ServiceClient, context: AgentContext, taskId: string) {
  await requireTaskInOrg(service, context, taskId);
  const { error } = await service.from('task_comment_reads').upsert({
    task_id: taskId,
    user_id: context.userId,
    org_id: context.orgId,
    last_read_at: new Date().toISOString(),
  }, { onConflict: 'task_id,user_id' });
  if (error) throw error;
  return { markedRead: true, taskId };
}

async function listCalendarEvents(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const limit = numberInput(input.limit, 100, 1, 250);
  let query = service
    .from('calendar_events')
    .select('*, campaigns!inner(folder_id, folders!inner(project_id, projects!inner(org_id)))')
    .eq('campaigns.folders.projects.org_id', context.orgId)
    .order('event_date', { ascending: true })
    .limit(limit);
  if (input.from) query = query.gte('event_date', stringInput(input.from, 'from'));
  if (input.to) query = query.lte('event_date', stringInput(input.to, 'to'));
  const { data, error } = await query;
  if (error) throw error;
  return { events: data || [] };
}

async function updateCalendarEvent(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const eventId = stringInput(input.eventId || input.id, 'eventId');
  await requireCalendarEventInOrg(service, context, eventId);
  const updates = pick(input.updates || input, ['campaign_id', 'campaignId', 'title', 'event_date', 'eventDate', 'type']);
  normalizeAlias(updates, 'campaignId', 'campaign_id');
  normalizeAlias(updates, 'eventDate', 'event_date');
  if (updates.campaign_id) await requireCampaignInOrg(service, context, String(updates.campaign_id));
  const { data, error } = await service.from('calendar_events').update(updates).eq('id', eventId).select('*').single();
  if (error) throw error;
  return { calendarEvent: compactRow(data) };
}

async function deleteCalendarEvent(service: ServiceClient, context: AgentContext, eventId: string) {
  await requireCalendarEventInOrg(service, context, eventId);
  const { error } = await service.from('calendar_events').delete().eq('id', eventId);
  if (error) throw error;
  return { deleted: true, eventId };
}

async function listNotes(service: ServiceClient, context: AgentContext, input: JsonObject) {
  let query = service.from('notes').select('*').eq('org_id', context.orgId).order('updated_at', { ascending: false }).limit(numberInput(input.limit, 100, 1, 250));
  if (input.projectId) query = query.eq('project_id', stringInput(input.projectId, 'projectId'));
  const { data, error } = await query;
  if (error) throw error;
  return { notes: data || [] };
}

async function updateNote(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const noteId = stringInput(input.noteId || input.id, 'noteId');
  await requireNoteInOrg(service, context, noteId);
  const updates = pick(input.updates || input, ['title', 'content', 'project_id', 'projectId']);
  normalizeAlias(updates, 'projectId', 'project_id');
  if (updates.project_id) await requireProjectInOrg(service, context, String(updates.project_id));
  const { data, error } = await service.from('notes').update(updates).eq('id', noteId).eq('org_id', context.orgId).select('*').single();
  if (error) throw error;
  return { note: compactRow(data) };
}

async function deleteNote(service: ServiceClient, context: AgentContext, noteId: string) {
  await requireNoteInOrg(service, context, noteId);
  const { error } = await service.from('notes').delete().eq('id', noteId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, noteId };
}

async function listVaultCredentials(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const select = input.includeEncryptedPassword === true
    ? '*'
    : 'id,org_id,project_id,service_name,username,url,category,color_class,created_at,updated_at,created_by';
  const { data, error } = await service
    .from('vault_credentials')
    .select(select)
    .eq('org_id', context.orgId)
    .order('created_at', { ascending: false })
    .limit(numberInput(input.limit, 100, 1, 250));
  if (error) throw error;
  return { credentials: data || [] };
}

async function createVaultCredential(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const projectId = nullableString(input.projectId);
  if (projectId) await requireProjectInOrg(service, context, projectId);
  const encryptedPassword = await vaultEncryptedPassword(input);
  const { data, error } = await service
    .from('vault_credentials')
    .insert({
      org_id: context.orgId,
      project_id: projectId,
      service_name: stringInput(input.serviceName || input.service_name, 'serviceName'),
      username: stringInput(input.username, 'username'),
      encrypted_password: encryptedPassword,
      url: nullableString(input.url),
      category: nullableString(input.category),
      color_class: nullableString(input.colorClass || input.color_class),
      created_by: context.userId,
    })
    .select('id,org_id,project_id,service_name,username,url,category,color_class,created_at,updated_at,created_by')
    .single();
  if (error) throw error;
  return { credential: data };
}

async function updateVaultCredential(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const credentialId = stringInput(input.credentialId || input.id, 'credentialId');
  await requireDirectOrgRow(service, context, 'vault_credentials', credentialId);
  const rawUpdates = input.updates && typeof input.updates === 'object' ? input.updates as JsonObject : input;
  const updates = pick(rawUpdates, ['project_id', 'projectId', 'service_name', 'serviceName', 'username', 'url', 'category', 'color_class', 'colorClass', 'encrypted_password', 'encryptedPassword']);
  normalizeAlias(updates, 'projectId', 'project_id');
  normalizeAlias(updates, 'serviceName', 'service_name');
  normalizeAlias(updates, 'colorClass', 'color_class');
  normalizeAlias(updates, 'encryptedPassword', 'encrypted_password');
  if (rawUpdates.password) updates.encrypted_password = await encryptVaultPassword(String(rawUpdates.password));
  if (updates.project_id) await requireProjectInOrg(service, context, String(updates.project_id));
  const { data, error } = await service
    .from('vault_credentials')
    .update(updates)
    .eq('id', credentialId)
    .eq('org_id', context.orgId)
    .select('id,org_id,project_id,service_name,username,url,category,color_class,created_at,updated_at,created_by')
    .single();
  if (error) throw error;
  return { credential: data };
}

async function deleteVaultCredential(service: ServiceClient, context: AgentContext, credentialId: string) {
  await requireDirectOrgRow(service, context, 'vault_credentials', credentialId);
  const { error } = await service.from('vault_credentials').delete().eq('id', credentialId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, credentialId };
}

async function listFeedMonitor(service: ServiceClient, context: AgentContext, limit: number) {
  const [folders, posts] = await Promise.all([
    service.from('feed_folders').select('*').eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
    service.from('feed_posts').select('*').eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
  ]);
  if (folders.error) throw folders.error;
  if (posts.error) throw posts.error;
  return { folders: folders.data || [], posts: posts.data || [] };
}

async function createFeedFolder(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const { data, error } = await service
    .from('feed_folders')
    .insert({
      org_id: context.orgId,
      name: stringInput(input.name, 'name'),
      description: nullableString(input.description),
      color: nullableString(input.color),
      created_by: context.userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { folder: data };
}

async function updateFeedFolder(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const folderId = stringInput(input.folderId || input.id, 'folderId');
  await requireDirectOrgRow(service, context, 'feed_folders', folderId);
  const updates = pick(input.updates || input, ['name', 'description', 'color']);
  const { data, error } = await service.from('feed_folders').update(updates).eq('id', folderId).eq('org_id', context.orgId).select('*').single();
  if (error) throw error;
  return { folder: data };
}

async function deleteFeedFolder(service: ServiceClient, context: AgentContext, folderId: string) {
  await requireDirectOrgRow(service, context, 'feed_folders', folderId);
  const { error } = await service.from('feed_folders').delete().eq('id', folderId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, folderId };
}

async function createFeedPost(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const folderId = nullableString(input.folderId || input.folder_id);
  if (folderId) await requireDirectOrgRow(service, context, 'feed_folders', folderId);
  const { data, error } = await service
    .from('feed_posts')
    .insert({
      org_id: context.orgId,
      platform: stringInput(input.platform, 'platform'),
      url: stringInput(input.url, 'url'),
      folder_id: folderId,
      content: nullableString(input.content),
      og_title: nullableString(input.ogTitle || input.og_title),
      og_description: nullableString(input.ogDescription || input.og_description),
      og_image: nullableString(input.ogImage || input.og_image),
      og_site_name: nullableString(input.ogSiteName || input.og_site_name),
      created_by: context.userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { post: data };
}

async function updateFeedPost(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const postId = stringInput(input.postId || input.id, 'postId');
  await requireDirectOrgRow(service, context, 'feed_posts', postId);
  const updates = pick(input.updates || input, ['platform', 'url', 'folder_id', 'folderId', 'content', 'og_title', 'ogTitle', 'og_description', 'ogDescription', 'og_image', 'ogImage', 'og_site_name', 'ogSiteName']);
  normalizeAlias(updates, 'folderId', 'folder_id');
  normalizeAlias(updates, 'ogTitle', 'og_title');
  normalizeAlias(updates, 'ogDescription', 'og_description');
  normalizeAlias(updates, 'ogImage', 'og_image');
  normalizeAlias(updates, 'ogSiteName', 'og_site_name');
  if (updates.folder_id) await requireDirectOrgRow(service, context, 'feed_folders', String(updates.folder_id));
  const { data, error } = await service.from('feed_posts').update(updates).eq('id', postId).eq('org_id', context.orgId).select('*').single();
  if (error) throw error;
  return { post: data };
}

async function deleteFeedPost(service: ServiceClient, context: AgentContext, postId: string) {
  await requireDirectOrgRow(service, context, 'feed_posts', postId);
  const { error } = await service.from('feed_posts').delete().eq('id', postId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, postId };
}

async function listClientPortal(service: ServiceClient, context: AgentContext, limit: number) {
  const [clients, feeds, posts] = await Promise.all([
    service.from('portal_clients').select('*').eq('org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
    service.from('portal_feeds').select('*, portal_clients!inner(org_id, name, company)').eq('portal_clients.org_id', context.orgId).order('created_at', { ascending: false }).limit(limit),
    service
      .from('portal_review_posts')
      .select('*, portal_comments(*), portal_review_events(*), portal_feeds!inner(client_id, name, portal_clients!inner(org_id, name, company))')
      .eq('portal_feeds.portal_clients.org_id', context.orgId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  for (const result of [clients, feeds, posts]) if (result.error) throw result.error;
  return {
    clients: (clients.data || []).map(compactRow),
    feeds: feeds.data || [],
    reviewPosts: posts.data || [],
  };
}

async function createPortalClient(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const { data, error } = await service
    .from('portal_clients')
    .insert({
      org_id: context.orgId,
      name: stringInput(input.name, 'name'),
      company: nullableString(input.company),
      logo: nullableString(input.logo),
      access_token: crypto.randomUUID(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return { client: compactRow(data) };
}

async function updatePortalClient(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const clientId = stringInput(input.clientId || input.id, 'clientId');
  await requireDirectOrgRow(service, context, 'portal_clients', clientId);
  const updates = pick(input.updates || input, ['name', 'company', 'logo']);
  const { data, error } = await service.from('portal_clients').update(updates).eq('id', clientId).eq('org_id', context.orgId).select('*').single();
  if (error) throw error;
  return { client: compactRow(data) };
}

async function deletePortalClient(service: ServiceClient, context: AgentContext, clientId: string) {
  await requireDirectOrgRow(service, context, 'portal_clients', clientId);
  const feeds = await service.from('portal_feeds').select('id').eq('client_id', clientId);
  if (feeds.error) throw feeds.error;
  for (const feed of feeds.data || []) await deletePortalFeed(service, context, String(feed.id));
  const { error } = await service.from('portal_clients').delete().eq('id', clientId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, clientId };
}

async function createPortalFeed(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const clientId = stringInput(input.clientId, 'clientId');
  await requireDirectOrgRow(service, context, 'portal_clients', clientId);
  const { data, error } = await service
    .from('portal_feeds')
    .insert({ client_id: clientId, name: stringInput(input.name, 'name') })
    .select('*')
    .single();
  if (error) throw error;
  return { feed: data };
}

async function deletePortalFeed(service: ServiceClient, context: AgentContext, feedId: string) {
  await requirePortalFeedInOrg(service, context, feedId);
  const posts = await service.from('portal_review_posts').select('id').eq('feed_id', feedId);
  if (posts.error) throw posts.error;
  const postIds = (posts.data || []).map((post) => post.id);
  if (postIds.length) {
    const comments = await service.from('portal_comments').delete().in('post_id', postIds);
    if (comments.error) throw comments.error;
    const reviewPosts = await service.from('portal_review_posts').delete().in('id', postIds);
    if (reviewPosts.error) throw reviewPosts.error;
  }
  const { error } = await service.from('portal_feeds').delete().eq('id', feedId);
  if (error) throw error;
  return { deleted: true, feedId };
}

async function createPortalReviewPost(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const feedId = stringInput(input.feedId, 'feedId');
  await requirePortalFeedInOrg(service, context, feedId);
  const contentItemId = nullableString(input.contentItemId || input.content_item_id);
  if (contentItemId) await requireContentItemInOrg(service, context, contentItemId);
  const { data, error } = await service
    .from('portal_review_posts')
    .insert({
      id: nullableString(input.id) || undefined,
      feed_id: feedId,
      content_item_id: contentItemId,
      content_type: stringInput(input.contentType || input.content_type, 'contentType'),
      snapshot: objectInput(input.snapshot || {}),
      status: nullableString(input.status) || 'pending',
    })
    .select('*, portal_comments(*), portal_review_events(*)')
    .single();
  if (error) throw error;
  return { reviewPost: data };
}

async function updatePortalReviewStatus(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const postId = stringInput(input.postId || input.id, 'postId');
  await requirePortalReviewPostInOrg(service, context, postId);
  const profile = await getAccountProfile(service, context);
  const { error } = await service.rpc('record_portal_review_action', {
    p_post_id: postId,
    p_status: stringInput(input.status, 'status'),
    p_reviewer_name: nullableString(input.reviewerName) || profile.name || profile.email || 'Hermes',
    p_is_client: false,
  });
  if (error) throw error;
  const { data, error: loadError } = await service
    .from('portal_review_posts')
    .select('*, portal_comments(*), portal_review_events(*)')
    .eq('id', postId)
    .single();
  if (loadError) throw loadError;
  return { reviewPost: data };
}

async function addPortalComment(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const postId = stringInput(input.postId, 'postId');
  await requirePortalReviewPostInOrg(service, context, postId);
  const profile = await getAccountProfile(service, context);
  const { data, error } = await service
    .from('portal_comments')
    .insert({
      post_id: postId,
      author: nullableString(input.author) || profile.name || profile.email || 'Hermes',
      text: stringInput(input.text, 'text'),
      avatar: nullableString(input.avatar) || profile.avatarUrl || null,
      is_client: Boolean(input.isClient),
    })
    .select('*')
    .single();
  if (error) throw error;
  return { comment: data };
}

async function deletePortalReviewPost(service: ServiceClient, context: AgentContext, postId: string) {
  await requirePortalReviewPostInOrg(service, context, postId);
  const comments = await service.from('portal_comments').delete().eq('post_id', postId);
  if (comments.error) throw comments.error;
  const { error } = await service.from('portal_review_posts').delete().eq('id', postId);
  if (error) throw error;
  return { deleted: true, postId };
}

async function updateBrandGuide(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const guideId = stringInput(input.guideId, 'guideId');
  await requireBrandGuideInOrg(service, context, guideId);
  const updates = input.updates && typeof input.updates === 'object' ? input.updates as JsonObject : input;
  delete updates.guideId;
  delete updates.id;
  const { data, error } = await service.from('brand_guides').update(updates).eq('id', guideId).eq('org_id', context.orgId).select('*').single();
  if (error) throw error;
  return { guide: compactRow(data) };
}

async function deleteBrandGuide(service: ServiceClient, context: AgentContext, guideId: string) {
  await requireBrandGuideInOrg(service, context, guideId);
  for (const table of ['brand_colors', 'brand_fonts', 'brand_logos', 'brand_logo_rules', 'brand_mood_images', 'brand_knowledge_documents']) {
    const { error } = await service.from(table).delete().eq('guide_id', guideId);
    if (error) throw error;
  }
  const { error } = await service.from('brand_guides').delete().eq('id', guideId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, guideId };
}

async function upsertBrandItem(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = brandItemTable(input.table);
  const guideId = stringInput(input.guideId || (input.values as JsonObject | undefined)?.guide_id, 'guideId');
  await requireBrandGuideInOrg(service, context, guideId);
  const values = objectInput(input.values || {});
  values.guide_id = guideId;
  const query = input.id
    ? service.from(table).update(values).eq('id', stringInput(input.id, 'id'))
    : service.from(table).insert(values);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return { table, row: compactRow(data) };
}

async function deleteBrandItem(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = brandItemTable(input.table);
  const id = stringInput(input.id, 'id');
  await requireBrandChildInOrg(service, context, table, id);
  const { error } = await service.from(table).delete().eq('id', id);
  if (error) throw error;
  return { deleted: true, table, id };
}

async function updateBrandKnowledgeMarkdown(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const documentId = stringInput(input.documentId, 'documentId');
  await requireBrandKnowledgeDocumentInOrg(service, context, documentId);
  const { data, error } = await service
    .from('brand_knowledge_documents')
    .update({ markdown: stringInput(input.markdown, 'markdown'), manual_edit: true, status: 'ready' })
    .eq('id', documentId)
    .select('*')
    .single();
  if (error) throw error;
  return { knowledgeDocument: compactRow(data) };
}

async function analyzeBrandVisualDirection(service: ServiceClient, context: AgentContext, guideId: string) {
  await requireBrandGuideInOrg(service, context, guideId);
  const analysis = await invokeInternalFunction('brand-analyze-visual-direction', context, { guideId });
  const charge = await chargeBrandVisualAction(service, context.orgId, guideId);
  return { analysis, charge };
}

async function deleteAiRun(service: ServiceClient, context: AgentContext, runId: string) {
  await requireRunInOrg(service, context, runId);
  const { error } = await service.from('ai_runs').delete().eq('id', runId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, runId };
}

async function listAiCredits(service: ServiceClient, context: AgentContext) {
  const { data, error } = await service.from('ai_credit_accounts').select('*').eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  return { creditAccount: data };
}

async function listAiAgents(service: ServiceClient, context: AgentContext) {
  const [agents, workflow] = await Promise.all([
    service.from('ai_agents').select('*').or(`org_id.is.null,org_id.eq.${context.orgId}`).eq('is_enabled', true).order('name'),
    service.from('ai_agent_workflow_steps').select('*').eq('org_id', context.orgId).order('sort_order'),
  ]);
  if (agents.error) throw agents.error;
  if (workflow.error) throw workflow.error;
  return {
    agents: (agents.data || []).map(compactRow),
    workflow: workflow.data || [],
  };
}

async function saveAiAgentSkill(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const agentId = stringInput(input.agentId, 'agentId');
  const skillMd = stringInput(input.skillMd || input.skill_md, 'skillMd');
  const agent = await requireAiAgentEditable(service, context, agentId);
  const { data, error } = await service
    .from('ai_agents')
    .update({ skill_md: skillMd })
    .eq('id', agent.id)
    .eq('org_id', context.orgId)
    .select('*')
    .single();
  if (error) throw error;
  const version = await service.from('ai_agent_versions').insert({
    agent_id: agent.id,
    skill_md: skillMd,
    change_note: nullableString(input.changeNote) || 'Updated from SocialSuite Agent API.',
    created_by: context.userId,
  });
  if (version.error) throw version.error;
  return { agent: compactRow(data) };
}

async function createAiAgent(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const name = cleanText(stringInput(input.name, 'name'), 120);
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  const skillMd = stringInput(input.skillMd || input.skill_md, 'skillMd');
  const { data, error } = await service
    .from('ai_agents')
    .insert({
      org_id: context.orgId,
      slug,
      name,
      description: nullableString(input.description) || 'Workspace agent with a custom Social Suite skill.',
      skill_md: skillMd,
      tools: Array.isArray(input.tools) ? input.tools : [],
      output_schema: nullableString(input.outputSchema || input.output_schema) || 'workspace_skill',
      permissions: objectInput(input.permissions || { can_write: false }),
      is_default: false,
      is_enabled: true,
      created_by: context.userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  const version = await service.from('ai_agent_versions').insert({
    agent_id: data.id,
    skill_md: skillMd,
    change_note: 'Created from SocialSuite Agent API.',
    created_by: context.userId,
  });
  if (version.error) throw version.error;
  return { agent: compactRow(data) };
}

async function deleteAiAgent(service: ServiceClient, context: AgentContext, agentId: string) {
  const agent = await requireAiAgentEditable(service, context, agentId);
  const workflow = await service.from('ai_agent_workflow_steps').delete().eq('org_id', context.orgId).eq('agent_slug', agent.slug);
  if (workflow.error) throw workflow.error;
  const { error } = await service.from('ai_agents').delete().eq('id', agentId).eq('org_id', context.orgId);
  if (error) throw error;
  return { deleted: true, agentId };
}

async function saveAiWorkflow(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const agentSlugs = Array.isArray(input.agentSlugs)
    ? input.agentSlugs.filter((value): value is string => typeof value === 'string' && !!value.trim())
    : [];
  if (!agentSlugs.length) throw new Error('agentSlugs is required');
  const { data, error } = await service.rpc('replace_ai_agent_workflow', {
    p_org_id: context.orgId,
    p_agent_slugs: Array.from(new Set(agentSlugs)),
  });
  if (error) throw error;
  return { workflow: data };
}

async function inviteTeamMember(context: AgentContext, input: JsonObject) {
  return invokeInternalFunction('team-invitations', context, {
    action: 'invite',
    orgId: context.orgId,
    email: stringInput(input.email, 'email'),
    role: enumInput(input.role || 'viewer', new Set(['admin', 'editor', 'viewer']), 'role'),
    sendEmail: input.sendEmail === true,
    siteUrl: nullableString(input.siteUrl),
  });
}

async function getAccountProfile(service: ServiceClient, context: AgentContext) {
  const { data, error } = await service.auth.admin.getUserById(context.userId);
  if (error) throw error;
  const user = data.user;
  const metadata = (user?.user_metadata || {}) as JsonObject;
  return {
    id: context.userId,
    email: user?.email || null,
    name: nullableString(metadata.full_name || metadata.name),
    avatarUrl: nullableString(metadata.avatar_url),
    metadata: compactRow(metadata),
  };
}

async function updateAccountProfile(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const profile = await getAccountProfile(service, context);
  const metadata = {
    ...objectInput(profile.metadata || {}),
    ...(input.fullName || input.name ? { full_name: stringInput(input.fullName || input.name, 'fullName') } : {}),
    ...(input.avatarUrl !== undefined ? { avatar_url: nullableString(input.avatarUrl) } : {}),
  };
  const { data, error } = await service.auth.admin.updateUserById(context.userId, { user_metadata: metadata });
  if (error) throw error;
  return {
    id: context.userId,
    email: data.user?.email || null,
    metadata: compactRow(data.user?.user_metadata || {}),
  };
}

async function listMicroTools(service: ServiceClient, context: AgentContext) {
  const { data, error } = await service
    .from('org_tools')
    .select('*, tool_registry(*)')
    .eq('org_id', context.orgId);
  if (error) throw error;
  return { tools: data || [] };
}

async function listTableRows(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = genericTable(input.table);
  const limit = numberInput(input.limit, 25, 1, 250);
  const ascending = input.ascending === true;
  let query = scopedSelect(service, context, table, String(input.select || '*'));
  query = applyGenericFilters(query, Array.isArray(input.filters) ? input.filters : []);
  if (input.orderBy) query = query.order(stringInput(input.orderBy, 'orderBy'), { ascending });
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return { table, count: data?.length || 0, rows: (data || []).map(compactRow) };
}

async function getTableRow(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = genericTable(input.table);
  const id = stringInput(input.id, 'id');
  const { data, error } = await scopedSelect(service, context, table, String(input.select || '*')).eq('id', id).maybeSingle();
  if (error) throw error;
  return { table, row: compactRow(data) };
}

async function createTableRow(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = genericWritableTable(input.table);
  const values = await prepareGenericInsert(service, context, table, objectInput(input.values));
  const { data, error } = await service.from(table).insert(values).select(String(input.select || '*')).single();
  if (error) throw error;
  return { table, row: compactRow(data) };
}

async function updateTableRow(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = genericWritableTable(input.table);
  const id = stringInput(input.id, 'id');
  await requireGenericRowInOrg(service, context, table, id);
  const values = await prepareGenericUpdate(service, context, table, objectInput(input.values));
  const { data, error } = await service.from(table).update(values).eq('id', id).select(String(input.select || '*')).single();
  if (error) throw error;
  return { table, row: compactRow(data) };
}

async function deleteTableRows(service: ServiceClient, context: AgentContext, input: JsonObject) {
  const table = genericWritableTable(input.table);
  const filters = Array.isArray(input.filters) ? input.filters : [];
  if (!filters.length) throw new Error('filters are required for delete_table_rows');
  const listed = await listTableRows(service, context, { table, select: 'id', filters, limit: numberInput(input.limit, 100, 1, 250) });
  const ids = (listed.rows as JsonObject[]).map((row) => String(row.id)).filter(Boolean);
  if (!ids.length) return { table, deletedCount: 0 };
  const { error } = await service.from(table).delete().in('id', ids);
  if (error) throw error;
  return { table, deletedCount: ids.length };
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

async function loadTeamMembersLite(service: ServiceClient, orgId: string) {
  const { data, error } = await service.from('org_members').select('id, org_id, user_id, role, joined_at').eq('org_id', orgId);
  if (error) throw error;
  return await Promise.all((data || []).map(async (member) => {
    const { data: userData } = await service.auth.admin.getUserById(member.user_id);
    const metadata = (userData.user?.user_metadata || {}) as JsonObject;
    const email = userData.user?.email || '';
    return {
      id: member.id,
      userId: member.user_id,
      role: member.role,
      joinedAt: member.joined_at,
      email,
      name: nullableString(metadata.full_name || metadata.name) || (email ? email.split('@')[0] : 'Member'),
      avatarUrl: nullableString(metadata.avatar_url),
    };
  }));
}

async function validateTaskLinks(service: ServiceClient, context: AgentContext, updates: JsonObject) {
  if (updates.project_id) await requireProjectInOrg(service, context, String(updates.project_id));
  if (updates.folder_id) await requireFolderInOrg(service, context, String(updates.folder_id));
  if (updates.campaign_id) await requireCampaignInOrg(service, context, String(updates.campaign_id));
}

async function updateTaskSortOrder(service: ServiceClient, context: AgentContext, orderedIds: string[]) {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await requireTaskInOrg(service, context, orderedIds[index]);
    const { error } = await service.from('tasks').update({ sort_order: index }).eq('id', orderedIds[index]).eq('org_id', context.orgId);
    if (error) throw error;
  }
}

async function vaultEncryptedPassword(input: JsonObject) {
  const existing = nullableString(input.encryptedPassword || input.encrypted_password);
  if (existing) return existing;
  return encryptVaultPassword(stringInput(input.password, 'password'));
}

async function encryptVaultPassword(password: string) {
  const key = Deno.env.get('VITE_VAULT_ENCRYPTION_KEY') || Deno.env.get('VAULT_ENCRYPTION_KEY') || '';
  if (!key) {
    throw new Error('Vault encryption key is not configured. Provide encryptedPassword instead of password.');
  }
  return CryptoJS.AES.encrypt(password, key).toString();
}

async function chargeBrandVisualAction(service: ServiceClient, orgId: string, guideId: string) {
  const { data, error } = await service.rpc('charge_brand_ai_action_credit', {
    p_org_id: orgId,
    p_action: 'visual_analysis',
    p_action_key: `agent-api:visual_analysis:${guideId}:${crypto.randomUUID()}`,
  });
  if (error) throw error;
  return { balanceAfter: data, charged: 1 };
}

async function loadBrandVisualContext(
  service: ServiceClient,
  context: AgentContext,
  guideId: string | null,
  projectId: string | null,
): Promise<JsonObject | null> {
  let resolvedGuideId = guideId;
  if (resolvedGuideId) {
    await requireBrandGuideInOrg(service, context, resolvedGuideId);
  } else if (projectId) {
    const { data, error } = await service
      .from('brand_guides')
      .select('id')
      .eq('org_id', context.orgId)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    resolvedGuideId = nullableString(data?.id);
  }

  if (!resolvedGuideId) {
    const { data, error } = await service
      .from('brand_guides')
      .select('id')
      .eq('org_id', context.orgId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    resolvedGuideId = nullableString(data?.id);
  }

  if (!resolvedGuideId) return null;
  const bundle = await getBrandBundle(service, context, resolvedGuideId) as JsonObject;
  const guide = objectInput(bundle.guide);
  const colors = arrayOfObjects(bundle.colors);
  const fonts = arrayOfObjects(bundle.fonts);
  const logoRules = arrayOfObjects(bundle.logoRules);
  const logos = arrayOfObjects(bundle.logos)
    .map((logo) => ({
      id: nullableString(logo.id) || '',
      label: nullableString(logo.label) || 'Brand logo',
      variant: nullableString(logo.variant) || 'approved',
      url: normalizeBrandAssetUrl(logo.file_url),
    }))
    .filter((logo) => logo.id && logo.url);
  const knowledge = objectInput(bundle.knowledgeDocument);
  const styleNotes = [
    guide.photography_style ? `Photography: ${guide.photography_style}` : '',
    guide.illustration_style ? `Illustration: ${guide.illustration_style}` : '',
    guide.iconography_rules ? `Iconography: ${guide.iconography_rules}` : '',
    guide.layout_composition ? `Layout & composition: ${guide.layout_composition}` : '',
    guide.social_rules ? `Social rules: ${guide.social_rules}` : '',
    guide.ad_rules ? `Ad rules: ${guide.ad_rules}` : '',
  ].filter(Boolean).join('; ');

  return {
    guideId: resolvedGuideId,
    brandName: nullableString(guide.brand_name) || undefined,
    summary: [
      guide.brand_name ? `Brand: ${guide.brand_name}` : '',
      colors.length ? `Colors: ${colors.slice(0, 8).map((color) => `${color.name || color.role}: ${color.hex}`).join('; ')}` : '',
      fonts.length ? `Typography: ${fonts.slice(0, 5).map((font) => `${font.category}: ${font.font_family}${font.weight ? ` ${font.weight}` : ''}`).join('; ')}` : '',
      styleNotes,
      logoRules.length ? `Logo rules: ${logoRules.map((rule) => `${rule.rule_type}: ${rule.caption}`).join('; ')}` : '',
      knowledge.markdown ? `Brand Knowledge:\n${String(knowledge.markdown).slice(0, 1200)}` : '',
    ].filter(Boolean).join('\n').slice(0, 2400),
    logos,
  };
}

function contentImageContext(type: string, contentItem: JsonObject, payload: JsonObject) {
  if (type === 'social-ad') {
    return {
      kind: 'social-ad',
      name: nullableString(contentItem.name) || nullableString(payload.name),
      topic: nullableString(payload.topic),
      platform: nullableString(payload.platform),
      primaryText: nullableString(payload.primaryText || payload.primary_text),
      headline: nullableString(payload.headline),
      description: nullableString(payload.description),
      cta: nullableString(payload.cta),
      destinationUrl: nullableString(payload.destinationUrl || payload.destination_url),
    };
  }

  return {
    kind: 'social-post',
    name: nullableString(contentItem.name) || nullableString(payload.name),
    topic: nullableString(payload.topic),
    caption: nullableString(payload.caption),
    platforms: stringArray(payload.platforms),
    creativeBrief: nullableString(payload.creativeBrief || payload.creative_brief),
  };
}

async function uploadGeneratedCampaignMedia(service: ServiceClient, campaignId: string, urls: string[]) {
  const uploadedPaths: string[] = [];
  const assets: JsonObject[] = [];

  try {
    for (let index = 0; index < urls.length; index += 1) {
      const file = await imageBytes(urls[index], index);
      if (file.bytes.byteLength > 10 * 1024 * 1024) {
        throw new Error(`Generated image ${index + 1} is larger than 10 MB`);
      }
      const id = crypto.randomUUID();
      const path = `${campaignId}/${id}-${safeStorageFilename(file.name)}`;
      const { error } = await service.storage
        .from('campaign-media')
        .upload(path, file.bytes, {
          cacheControl: '3600',
          contentType: file.mimeType,
          upsert: false,
        });
      if (error) throw error;
      uploadedPaths.push(path);

      const { data } = service.storage.from('campaign-media').getPublicUrl(path);
      assets.push({
        id,
        url: data.publicUrl,
        kind: 'image',
        name: file.name,
        mimeType: file.mimeType,
        size: file.bytes.byteLength,
        storagePath: path,
      });
    }
  } catch (error) {
    if (uploadedPaths.length) await service.storage.from('campaign-media').remove(uploadedPaths);
    throw error;
  }

  return assets;
}

async function imageBytes(url: string, index: number) {
  if (/^data:/i.test(url)) return dataUrlBytes(url, index);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Generated image ${index + 1} could not be downloaded`);
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  if (!mimeType.startsWith('image/')) throw new Error(`Generated asset ${index + 1} is not an image`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType,
    name: `generated-slide-${index + 1}.${extensionForMime(mimeType)}`,
  };
}

function dataUrlBytes(url: string, index: number) {
  const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
  if (!match) throw new Error(`Generated image ${index + 1} was not a valid data URL`);
  const mimeType = match[1] || 'image/png';
  if (!mimeType.startsWith('image/')) throw new Error(`Generated asset ${index + 1} is not an image`);
  const raw = match[2]
    ? atob(match[3])
    : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return {
    bytes,
    mimeType,
    name: `generated-slide-${index + 1}.${extensionForMime(mimeType)}`,
  };
}

function campaignProjectId(campaign: JsonObject) {
  const folder = objectInput(campaign.folders);
  return nullableString(folder.project_id);
}

function arrayOfObjects(value: unknown) {
  return Array.isArray(value) ? value.map(objectInput).filter((item) => Object.keys(item).length) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean) : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeBrandAssetUrl(value: unknown) {
  const url = nullableString(value) || '';
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/_next/image') {
      const source = parsed.searchParams.get('url');
      if (source) return new URL(source, parsed.origin).toString();
    }
  } catch {
    return '';
  }
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : '';
}

function safeStorageFilename(filename: string) {
  const lastDot = filename.lastIndexOf('.');
  const extension = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  const base = (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'asset';
  return `${base}${extension.replace(/[^a-z0-9.]/g, '')}`;
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'png';
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

async function requireContentItemInOrg(service: ServiceClient, context: AgentContext, contentItemId: string) {
  const { data, error } = await service
    .from('content_items')
    .select('*, campaigns!inner(folder_id, folders!inner(project_id, projects!inner(org_id)))')
    .eq('id', contentItemId)
    .eq('campaigns.folders.projects.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Content item not found or access denied');
  return data;
}

async function requireBrandGuideInOrg(service: ServiceClient, context: AgentContext, guideId: string) {
  const { data, error } = await service.from('brand_guides').select('*').eq('id', guideId).eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Brand guide not found or access denied');
  return data;
}

async function requireBrandChildInOrg(service: ServiceClient, context: AgentContext, table: string, id: string) {
  const { data, error } = await service
    .from(table)
    .select('id, guide_id, brand_guides!inner(org_id)')
    .eq('id', id)
    .eq('brand_guides.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Brand item not found or access denied');
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

async function requireTaskInOrg(service: ServiceClient, context: AgentContext, taskId: string) {
  return requireDirectOrgRow(service, context, 'tasks', taskId);
}

async function requireNoteInOrg(service: ServiceClient, context: AgentContext, noteId: string) {
  return requireDirectOrgRow(service, context, 'notes', noteId);
}

async function requireCalendarEventInOrg(service: ServiceClient, context: AgentContext, eventId: string) {
  const { data, error } = await service
    .from('calendar_events')
    .select('id, campaigns!inner(folder_id, folders!inner(project_id, projects!inner(org_id)))')
    .eq('id', eventId)
    .eq('campaigns.folders.projects.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Calendar event not found or access denied');
  return data;
}

async function requirePortalFeedInOrg(service: ServiceClient, context: AgentContext, feedId: string) {
  const { data, error } = await service
    .from('portal_feeds')
    .select('*, portal_clients!inner(org_id)')
    .eq('id', feedId)
    .eq('portal_clients.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Portal feed not found or access denied');
  return data;
}

async function requirePortalReviewPostInOrg(service: ServiceClient, context: AgentContext, postId: string) {
  const { data, error } = await service
    .from('portal_review_posts')
    .select('*, portal_feeds!inner(client_id, portal_clients!inner(org_id))')
    .eq('id', postId)
    .eq('portal_feeds.portal_clients.org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Portal review post not found or access denied');
  return data;
}

async function requireRunInOrg(service: ServiceClient, context: AgentContext, runId: string) {
  const { data, error } = await service.from('ai_runs').select('id').eq('id', runId).eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('AI run not found or access denied');
  return data;
}

async function requireAiAgentEditable(service: ServiceClient, context: AgentContext, agentId: string) {
  const { data, error } = await service
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('org_id', context.orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_default) throw new Error('AI agent not found, built-in, or access denied');
  return data as JsonObject & { id: string; slug: string };
}

async function requireDirectOrgRow(service: ServiceClient, context: AgentContext, table: string, id: string) {
  const { data, error } = await service.from(table).select('id').eq('id', id).eq('org_id', context.orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table} row not found or access denied`);
  return data;
}

async function requireGenericRowInOrg(service: ServiceClient, context: AgentContext, table: string, id: string) {
  const { data, error } = await scopedSelect(service, context, table, 'id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table} row not found or access denied`);
  return data;
}

async function touchKey(service: ServiceClient, keyId: string) {
  await service.from('account_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyId);
}

function scopedSelect(service: ServiceClient, context: AgentContext, table: string, select: string) {
  switch (table) {
    case 'organizations':
      return service.from(table).select(select).eq('id', context.orgId);
    case 'tool_registry':
      return service.from(table).select(select);
    case 'ai_agents':
      return service.from(table).select(select).or(`org_id.is.null,org_id.eq.${context.orgId}`);
    case 'folders':
      return service.from(table).select(withScopeSelect(select, 'projects!inner(org_id)')).eq('projects.org_id', context.orgId);
    case 'campaigns':
      return service.from(table).select(withScopeSelect(select, 'folders!inner(project_id, projects!inner(org_id))')).eq('folders.projects.org_id', context.orgId);
    case 'content_items':
      return service.from(table).select(withScopeSelect(select, 'campaigns!inner(folder_id, folders!inner(project_id, projects!inner(org_id)))')).eq('campaigns.folders.projects.org_id', context.orgId);
    case 'calendar_events':
      return service.from(table).select(withScopeSelect(select, 'campaigns!inner(folder_id, folders!inner(project_id, projects!inner(org_id)))')).eq('campaigns.folders.projects.org_id', context.orgId);
    case 'brand_colors':
    case 'brand_fonts':
    case 'brand_logos':
    case 'brand_logo_rules':
    case 'brand_mood_images':
    case 'brand_knowledge_documents':
      return service.from(table).select(withScopeSelect(select, 'brand_guides!inner(org_id)')).eq('brand_guides.org_id', context.orgId);
    case 'portal_feeds':
      return service.from(table).select(withScopeSelect(select, 'portal_clients!inner(org_id)')).eq('portal_clients.org_id', context.orgId);
    case 'portal_review_posts':
      return service.from(table).select(withScopeSelect(select, 'portal_feeds!inner(client_id, portal_clients!inner(org_id))')).eq('portal_feeds.portal_clients.org_id', context.orgId);
    case 'portal_comments':
    case 'portal_review_events':
      return service.from(table).select(withScopeSelect(select, 'portal_review_posts!inner(feed_id, portal_feeds!inner(client_id, portal_clients!inner(org_id)))')).eq('portal_review_posts.portal_feeds.portal_clients.org_id', context.orgId);
    case 'ai_run_steps':
    case 'ai_run_events':
    case 'ai_artifacts':
    case 'ai_run_approvals':
    case 'ai_run_documents':
      return service.from(table).select(withScopeSelect(select, 'ai_runs!inner(org_id)')).eq('ai_runs.org_id', context.orgId);
    case 'ai_agent_versions':
      return service.from(table).select(withScopeSelect(select, 'ai_agents!inner(org_id)')).eq('ai_agents.org_id', context.orgId);
    default:
      return service.from(table).select(select).eq('org_id', context.orgId);
  }
}

function withScopeSelect(select: string, scope: string) {
  if (select.includes(scope.split('!')[0])) return select;
  return select === '*' ? `*, ${scope}` : `${select}, ${scope}`;
}

function applyGenericFilters(query: any, filters: unknown[]) {
  for (const raw of filters) {
    const filter = objectInput(raw);
    const column = stringInput(filter.column, 'filter.column');
    const op = String(filter.op || 'eq');
    if (!genericFilterOps.has(op)) throw new Error(`Unsupported filter op: ${op}`);
    if (op === 'in') {
      if (!Array.isArray(filter.value)) throw new Error(`Filter "${column}" uses in but value is not an array`);
      query = query.in(column, filter.value);
    } else {
      query = query[op](column, filter.value);
    }
  }
  return query;
}

function genericTable(value: unknown) {
  const table = stringInput(value, 'table');
  if (!genericTableSet.has(table)) throw new Error(`Table "${table}" is not exposed by this connector`);
  return table;
}

function genericWritableTable(value: unknown) {
  const table = genericTable(value);
  if (readOnlyTables.has(table)) throw new Error(`Table "${table}" is read-only through this connector`);
  return table;
}

async function prepareGenericInsert(service: ServiceClient, context: AgentContext, table: string, values: JsonObject) {
  delete values.id;
  await validateGenericWriteValues(service, context, table, values);
  if (usesDirectOrgScope(table)) values.org_id = context.orgId;
  if (table === 'task_comments') values.author_user_id = context.userId;
  if (table === 'task_comment_reads') values.user_id = context.userId;
  return values;
}

async function prepareGenericUpdate(service: ServiceClient, context: AgentContext, table: string, values: JsonObject) {
  delete values.id;
  delete values.org_id;
  await validateGenericWriteValues(service, context, table, values);
  return values;
}

async function validateGenericWriteValues(service: ServiceClient, context: AgentContext, table: string, values: JsonObject) {
  if (values.project_id) await requireProjectInOrg(service, context, String(values.project_id));
  if (values.folder_id) await requireFolderInOrg(service, context, String(values.folder_id));
  if (values.campaign_id) await requireCampaignInOrg(service, context, String(values.campaign_id));
  if (values.guide_id) await requireBrandGuideInOrg(service, context, String(values.guide_id));
  if (values.run_id) await requireRunInOrg(service, context, String(values.run_id));
  if (values.client_id) await requireDirectOrgRow(service, context, 'portal_clients', String(values.client_id));
  if (values.feed_id) await requirePortalFeedInOrg(service, context, String(values.feed_id));
  if (values.post_id && (table === 'portal_comments' || table === 'portal_review_events')) {
    await requirePortalReviewPostInOrg(service, context, String(values.post_id));
  }
  if (values.task_id && (table === 'task_comments' || table === 'task_comment_reads')) {
    await requireTaskInOrg(service, context, String(values.task_id));
  }
}

function usesDirectOrgScope(table: string) {
  return [
    'projects',
    'tasks',
    'task_stages',
    'task_comments',
    'task_comment_reads',
    'notes',
    'vault_credentials',
    'feed_folders',
    'feed_posts',
    'portal_clients',
    'brand_guides',
    'ai_agents',
    'ai_agent_workflow_steps',
    'org_tools',
  ].includes(table);
}

function brandItemTable(value: unknown) {
  const table = stringInput(value, 'table');
  if (!brandItemTables.has(table)) throw new Error('table must be a brand item table');
  return table;
}

function pick(source: unknown, keys: string[]) {
  const value = objectInput(source);
  const result: JsonObject = {};
  for (const key of keys) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

function normalizeAlias(value: JsonObject, from: string, to: string) {
  if (value[from] !== undefined && value[to] === undefined) value[to] = value[from];
  delete value[from];
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'custom-agent';
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
