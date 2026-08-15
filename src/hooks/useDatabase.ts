/**
 * React Query hooks for all Supabase database operations.
 * These replace the in-memory state + idb-keyval persistence in AppContext.
 *
 * Each hook provides: query data, and CRUD mutation functions.
 * All mutations automatically invalidate related queries.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { sortPortalRowsByCreatedAt } from '@/lib/portalReview';
import { useAuth } from '@/context/AuthContext';
import type { Database, Json } from '@/types/supabase';
import type { Campaign, CampaignType, Folder, Note, Project, Task, TaskComment, TaskStage, TeamMember } from '@/types';
import { createFolder as createFolderAction, createProject as createProjectAction, updateFolder as updateFolderAction, updateProject as updateProjectAction } from '@/services/projects';
import { createBrandGuide as createBrandGuideAction, updateBrandGuide as updateBrandGuideAction } from '@/services/brandGuides';

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type FolderRow = Database['public']['Tables']['folders']['Row'];
type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type ContentItemRow = Database['public']['Tables']['content_items']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type TaskCommentRow = Database['public']['Tables']['task_comments']['Row'];
type TaskCommentReadRow = Database['public']['Tables']['task_comment_reads']['Row'];
type TaskStageRow = Database['public']['Tables']['task_stages']['Row'];
type PortalClientUpdate = Database['public']['Tables']['portal_clients']['Update'];
type PortalReviewPostRow = Database['public']['Tables']['portal_review_posts']['Row'];
type PortalReviewPostInsert = Database['public']['Tables']['portal_review_posts']['Insert'];
type PortalCommentRow = Database['public']['Tables']['portal_comments']['Row'];
type PortalReviewEventRow = Database['public']['Tables']['portal_review_events']['Row'];
type PortalReviewPostWithComments = PortalReviewPostRow & {
    portal_comments?: PortalCommentRow[] | null;
    portal_review_events?: PortalReviewEventRow[] | null;
};
type JsonRecord = Record<string, unknown>;
type AddPortalReviewPostInput = {
    id: string;
    content_item_id?: string;
    content_type: string;
    snapshot: JsonRecord;
};
type TeamMemberResponse = {
    id?: string;
    userId?: string;
    name?: string;
    email?: string;
    role?: TeamMember['role'];
    avatarUrl?: string;
};
type TeamListResponse = {
    members?: TeamMemberResponse[];
};

const getString = (value: unknown): string => typeof value === 'string' ? value : '';
const getStringArray = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
const getFirstString = (value: unknown): string => getStringArray(value)[0] || getString(value);

const getTime = (value?: string | null) => value ? new Date(value).getTime() || 0 : 0;

const sortPortalReviewPosts = (posts: PortalReviewPostWithComments[]) =>
    sortPortalRowsByCreatedAt(posts);

const sortPortalComments = (comments: PortalCommentRow[]) =>
    [...comments].sort((a, b) => getTime(a.created_at) - getTime(b.created_at));

const sortPortalReviewEvents = (events: PortalReviewEventRow[]) =>
    [...events].sort((a, b) => getTime(b.created_at) - getTime(a.created_at));

const normalizePortalReviewPost = (
    post: PortalReviewPostRow | PortalReviewPostWithComments,
    existing?: PortalReviewPostWithComments,
): PortalReviewPostWithComments => ({
    ...existing,
    ...post,
    portal_comments: sortPortalComments([
        ...((post as PortalReviewPostWithComments).portal_comments || existing?.portal_comments || []),
    ]),
    portal_review_events: sortPortalReviewEvents([
        ...((post as PortalReviewPostWithComments).portal_review_events || existing?.portal_review_events || []),
    ]),
});

const upsertPortalReviewPost = (
    posts: PortalReviewPostWithComments[] = [],
    post: PortalReviewPostRow | PortalReviewPostWithComments,
) => {
    const existing = posts.find(item => item.id === post.id);
    const nextPost = normalizePortalReviewPost(post, existing);
    const nextPosts = existing
        ? posts.map(item => item.id === post.id ? nextPost : item)
        : [nextPost, ...posts];

    return sortPortalReviewPosts(nextPosts);
};

const removePortalReviewPost = (posts: PortalReviewPostWithComments[] = [], id?: string) =>
    id ? posts.filter(post => post.id !== id) : posts;

const upsertPortalComment = (
    posts: PortalReviewPostWithComments[] = [],
    comment: PortalCommentRow,
) => posts.map(post => {
    if (post.id !== comment.post_id) return post;

    const comments = post.portal_comments || [];
    const exists = comments.some(item => item.id === comment.id);
    const nextComments = exists
        ? comments.map(item => item.id === comment.id ? { ...item, ...comment } : item)
        : [...comments, comment];

    return {
        ...post,
        portal_comments: sortPortalComments(nextComments),
    };
});

const removePortalComment = (posts: PortalReviewPostWithComments[] = [], id?: string) =>
    id
        ? posts.map(post => ({
            ...post,
            portal_comments: (post.portal_comments || []).filter(comment => comment.id !== id),
        }))
        : posts;

const toPortalReviewPostInsert = (feedId: string, post: AddPortalReviewPostInput): PortalReviewPostInsert => ({
    id: post.id,
    content_item_id: post.content_item_id || null,
    content_type: post.content_type,
    snapshot: post.snapshot as Json,
    feed_id: feedId,
});

const toPortalReviewContentType = (value: unknown) => {
    switch (getString(value)) {
        case 'post':
        case 'socials':
        case 'social-post':
            return 'social-post';
        case 'google-ad':
            return 'google-ad';
        case 'meta-ad':
        case 'social-ad':
            return 'social-ad';
        case 'blog':
        case 'blogs':
            return 'blog';
        default:
            return 'social-post';
    }
};

const getPortalReviewContent = (contentType: string, payload: JsonRecord, fallback = 'Untitled') => {
    switch (contentType) {
        case 'google-ad':
            return getFirstString(payload.headlines) || getString(payload.headline) || getString(payload.content) || fallback;
        case 'social-ad':
            return getString(payload.primaryText) || getString(payload.headline) || getString(payload.content) || fallback;
        case 'blog':
            return getString(payload.content) || getString(payload.excerpt) || getString(payload.title) || fallback;
        default:
            return getString(payload.caption) || getString(payload.content) || fallback;
    }
};

const getPortalReviewImage = (payload: JsonRecord) =>
    getString(payload.image_url) || getString(payload.image) || getString(payload.featuredImage);

const buildPortalReviewSnapshot = (item: ContentItemRow | ContentItem) => {
    const payload = toPayloadRecord(item.payload);
    const contentType = toPortalReviewContentType(item.type);
    const platform = getString(payload.platform) || getFirstString(payload.platforms) || contentType;
    const content = getPortalReviewContent(contentType, payload, item.name || 'Untitled');
    const image = getPortalReviewImage(payload);
    const ctaText = getString(payload.ctaText) || getString(payload.cta);
    const snapshot: JsonRecord = {
        ...payload,
        name: item.name,
        platform,
        content,
    };

    if (image) snapshot.image_url = image;
    if (ctaText) snapshot.ctaText = ctaText;

    return { contentType, snapshot };
};

export type BrandGuide = {
    id: string;
    org_id: string;
    project_id: string | null;
    brand_name: string | null;
    website_url: string | null;
    tagline: string | null;
    mission: string | null;
    vision: string | null;
    brand_values: string[] | null;
    personality: string[] | null;
    industry: string | null;
    target_audience: string | null;
    elevator_pitch: string | null;
    voice_attributes: Json | null;
    tone_spectrum: Json | null;
    writing_dos: string[] | null;
    writing_donts: string[] | null;
    preferred_terms: string[] | null;
    avoided_terms: string[] | null;
    sample_copy: Json | null;
    content_pillars: string[] | null;
    photography_style: string | null;
    illustration_style: string | null;
    iconography_rules: string | null;
    layout_composition: string | null;
    social_rules: string | null;
    ad_rules: string | null;
    custom_sections: Json | null;
    logo_clearspace: string | null;
    logo_min_digital: string | null;
    logo_min_print: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type BrandColor = {
    id: string;
    guide_id: string;
    name: string;
    role: 'primary' | 'secondary' | 'accent' | 'neutral' | 'background';
    hex: string;
    rgb: string | null;
    hsl: string | null;
    sort_order: number | null;
    created_at: string | null;
};

export type BrandFont = {
    id: string;
    guide_id: string;
    font_family: string;
    weight: string | null;
    category: 'heading' | 'body' | 'accent' | 'code';
    source_url: string | null;
    license: string | null;
    type_scale: Json | null;
    sort_order: number | null;
    created_at: string | null;
};

export type BrandLogo = {
    id: string;
    guide_id: string;
    label: string;
    variant: 'primary' | 'secondary' | 'icon' | 'monochrome' | 'reversed';
    file_url: string;
    format: 'svg' | 'png' | 'jpg' | 'webp' | null;
    dimensions: string | null;
    sort_order: number | null;
    created_at: string | null;
};

export type BrandLogoRule = {
    id: string;
    guide_id: string;
    rule_type: 'do' | 'dont';
    image_url: string | null;
    caption: string;
    sort_order: number | null;
    created_at: string | null;
};

export type BrandMoodImage = {
    id: string;
    guide_id: string;
    image_url: string;
    caption: string | null;
    sort_order: number | null;
    created_at: string | null;
};

type FolderWithProject = FolderRow & {
    projects?: { org_id: string };
};

type CampaignWithFolder = CampaignRow & {
    folders?: {
        project_id: string;
        projects?: { org_id: string };
    };
};

type ContentItemWithCampaign = ContentItemRow & {
    campaigns?: {
        folder_id: string;
        folders?: {
            project_id: string;
            projects?: { org_id: string };
        };
    };
};

export type ContentItem = Omit<ContentItemRow, 'payload'> & {
    payload: JsonRecord;
    campaignId: string;
    campaign_id: string;
    createdAt: string;
    updatedAt: string;
    campaigns?: ContentItemWithCampaign['campaigns'];
};

const toPayloadRecord = (payload: Json | null): JsonRecord => {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as JsonRecord)
        : {};
};

const mapProject = (project: ProjectRow): Project => ({
    id: project.id,
    name: project.name,
    createdAt: project.created_at || '',
});

const mapFolder = (folder: FolderRow): Folder => ({
    id: folder.id,
    projectId: folder.project_id,
    name: folder.name,
    createdAt: folder.created_at || '',
});

const mapCampaign = (campaign: CampaignRow): Campaign => ({
    id: campaign.id,
    folderId: campaign.folder_id,
    name: campaign.name,
    type: campaign.type as CampaignType,
    deadline: campaign.deadline || '',
    createdAt: campaign.created_at || '',
});

const mapContentItem = (item: ContentItemWithCampaign): ContentItem => ({
    ...item,
    payload: toPayloadRecord(item.payload),
    campaignId: item.campaign_id,
    createdAt: item.created_at || '',
    updatedAt: item.updated_at || '',
});

const mapNote = (note: NoteRow): Note => ({
    id: note.id,
    orgId: note.org_id,
    projectId: note.project_id || undefined,
    title: note.title,
    content: Array.isArray(note.content) ? note.content : [],
    createdBy: note.created_by || undefined,
    createdAt: note.created_at || '',
    updatedAt: note.updated_at || '',
});

const mapTask = (task: TaskRow): Task => ({
    id: task.id,
    title: task.title,
    description: task.description || undefined,
    status: task.status,
    dueDate: task.due_date || undefined,
    projectId: task.project_id || undefined,
    folderId: task.folder_id || undefined,
    campaignId: task.campaign_id || undefined,
    assigneeId: task.assignee_id || undefined,
});

const mapTaskComment = (comment: TaskCommentRow): TaskComment => ({
    id: comment.id,
    taskId: comment.task_id,
    parentId: comment.parent_id || undefined,
    authorUserId: comment.author_user_id || undefined,
    authorName: comment.author_name,
    authorAvatar: comment.author_avatar || undefined,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
});

const mapTaskStage = (stage: TaskStageRow): TaskStage => ({
    id: stage.id,
    title: stage.title,
    color: stage.color,
    sortOrder: stage.sort_order,
});

// ── Key Factories ──────────────────────────────────────────────────────

const keys = {
    projects: (orgId: string) => ['projects', orgId] as const,
    folders: (projectId: string) => ['folders', projectId] as const,
    campaigns: (folderId: string) => ['campaigns', folderId] as const,
    contentItems: (campaignId: string) => ['content_items', campaignId] as const,
    tasks: (orgId: string) => ['tasks', orgId] as const,
    teamMembers: (orgId: string) => ['team_members', orgId] as const,
    taskComments: (orgId: string) => ['task_comments', orgId] as const,
    taskCommentReads: (orgId: string, userId: string) => ['task_comment_reads', orgId, userId] as const,
    taskStages: (orgId: string) => ['task_stages', orgId] as const,
    calendarEvents: (campaignId?: string) => ['calendar_events', campaignId] as const,
    // Micro tools
    vaultCredentials: (orgId: string) => ['vault_credentials', orgId] as const,
    feedFolders: (orgId: string) => ['feed_folders', orgId] as const,
    feedPosts: (orgId: string) => ['feed_posts', orgId] as const,
    portalClients: (orgId: string) => ['portal_clients', orgId] as const,
    portalFeeds: (clientId: string) => ['portal_feeds', clientId] as const,
    allPortalFeeds: (orgId: string) => ['portal_feeds', 'all', orgId] as const,
    portalReviewPosts: (feedId: string) => ['portal_review_posts', feedId] as const,
    portalComments: (postId: string) => ['portal_comments', postId] as const,
    orgTools: (orgId: string) => ['org_tools', orgId] as const,
    notes: (orgId: string) => ['notes', orgId] as const,
    brandGuides: (orgId: string) => ['brand_guides', orgId] as const,
    brandGuide: (orgId: string, guideId: string) => ['brand_guide', orgId, guideId] as const,
    brandColors: (guideId: string) => ['brand_colors', guideId] as const,
    brandFonts: (guideId: string) => ['brand_fonts', guideId] as const,
    brandLogos: (guideId: string) => ['brand_logos', guideId] as const,
    brandLogoRules: (guideId: string) => ['brand_logo_rules', guideId] as const,
    brandMoodImages: (guideId: string) => ['brand_mood_images', guideId] as const,
};

// ── PROJECTS ───────────────────────────────────────────────────────────

export function useProjects() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.projects(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data.map(mapProject);
        },
        enabled: !!orgId,
    });

    const addProject = useMutation({
        mutationFn: async (name: string) => createProjectAction({ name, orgId }),
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects(orgId) }),
    });

    const updateProject = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: { name?: string } }) => {
            await updateProjectAction({ id, updates });
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects(orgId) }),
    });

    const deleteProject = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('projects').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects(orgId) }),
    });

    return { ...query, addProject, updateProject, deleteProject };
}

// ── FOLDERS ────────────────────────────────────────────────────────────

export function useAllFolders() {
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';
    return useQuery({
        queryKey: ['all_folders', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('folders')
                .select('*, projects!inner(org_id)')
                .eq('projects.org_id', orgId);
            if (error) throw error;
            return (data as FolderWithProject[]).map(mapFolder);
        },
        enabled: !!orgId,
    });
}

export function useFolders(projectId: string) {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: keys.folders(projectId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('folders')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data.map(mapFolder);
        },
        enabled: !!projectId,
    });

    const addFolder = useMutation({
        mutationFn: async (name: string) => createFolderAction({ name, projectId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.folders(projectId) });
            qc.invalidateQueries({ queryKey: ['all_folders'] });
        },
    });

    const updateFolder = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: { name?: string } }) => {
            await updateFolderAction({ id, updates });
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.folders(projectId) }),
    });

    const deleteFolder = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('folders').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.folders(projectId) }),
    });

    return { ...query, addFolder, updateFolder, deleteFolder };
}

// ── CAMPAIGNS ──────────────────────────────────────────────────────────

export function useCampaigns(folderId: string) {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: keys.campaigns(folderId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('campaigns')
                .select('*')
                .eq('folder_id', folderId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data.map(mapCampaign);
        },
        enabled: !!folderId,
    });

    const addCampaign = useMutation({
        mutationFn: async (campaign: { name: string; type: string; deadline?: string }) => {
            const { data, error } = await supabase
                .from('campaigns')
                .insert({ ...campaign, folder_id: folderId })
                .select()
                .single();
            if (error) throw error;
            return mapCampaign(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.campaigns(folderId) });
            qc.invalidateQueries({ queryKey: ['all_campaigns'] });
        },
    });

    const updateCampaign = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<{ name: string; type: string; deadline: string }> }) => {
            const { error } = await supabase.from('campaigns').update(updates).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns(folderId) }),
    });

    const deleteCampaign = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('campaigns').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns(folderId) }),
    });

    return { ...query, addCampaign, updateCampaign, deleteCampaign };
}

export function useAllCampaigns() {
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';

    return useQuery({
        queryKey: ['all_campaigns', orgId],
        queryFn: async () => {
            // Need to join to get org_id
            const { data, error } = await supabase
                .from('campaigns')
                .select(`
                    *,
                    folders!inner (
                        project_id,
                        projects!inner ( org_id )
                    )
                `)
                .eq('folders.projects.org_id', orgId);
            if (error) throw error;
            return (data as CampaignWithFolder[]).map((campaign) => ({
                ...mapCampaign(campaign),
                projectId: campaign.folders?.project_id,
            }));
        },
        enabled: !!orgId,
    });
}

// ── CONTENT ITEMS (Polymorphic) ────────────────────────────────────────

export function useContentItems(campaignId: string) {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: keys.contentItems(campaignId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('content_items')
                .select('*')
                .eq('campaign_id', campaignId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data.map((item) => mapContentItem(item as ContentItemWithCampaign));
        },
        enabled: !!campaignId,
    });

    const addContentItem = useMutation({
        mutationFn: async (item: { type: string; name?: string; status?: string; payload: Record<string, unknown> }) => {
            const { data, error } = await supabase
                .from('content_items')
                .insert({ ...item, payload: item.payload as Json, campaign_id: campaignId })
                .select('*')
                .single();
            if (error) throw error;
            return mapContentItem(data as ContentItemWithCampaign);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.contentItems(campaignId) });
            qc.invalidateQueries({ queryKey: ['all_content_items'] });
        },
    });

    const updateContentItem = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<{ name: string; status: string; payload: Record<string, unknown> }> }) => {
            const { data, error } = await supabase
                .from('content_items')
                .update(updates as { name?: string; status?: string; payload?: Json })
                .eq('id', id)
                .select('*')
                .single();
            if (error) throw error;

            const { contentType, snapshot } = buildPortalReviewSnapshot(data as ContentItemRow);
            const { error: syncError } = await supabase
                .from('portal_review_posts')
                .update({
                    content_type: contentType,
                    snapshot: snapshot as Json,
                })
                .eq('content_item_id', id);
            if (syncError) throw syncError;

            return mapContentItem(data as ContentItemWithCampaign);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.contentItems(campaignId) });
            qc.invalidateQueries({ queryKey: ['all_content_items'] });
            qc.invalidateQueries({ queryKey: ['portal_review_posts'] });
        },
    });

    const deleteContentItem = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('content_items').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.contentItems(campaignId) });
            qc.invalidateQueries({ queryKey: ['all_content_items'] });
        },
    });

    return { ...query, addContentItem, updateContentItem, deleteContentItem };
}

// ── TASKS ──────────────────────────────────────────────────────────────

export function useTaskStages() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.taskStages(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_stages')
                .select('*')
                .eq('org_id', orgId)
                .order('sort_order', { ascending: true });
            if (error) throw error;
            return data.map(mapTaskStage);
        },
        enabled: !!orgId,
    });

    const saveTaskStages = useMutation({
        mutationFn: async (stages: TaskStage[]) => {
            if (!orgId) throw new Error('No organization is selected.');
            if (stages.length === 0) throw new Error('At least one task stage is required.');

            const normalizedStages = stages.map((stage, index) => ({
                id: stage.id,
                org_id: orgId,
                title: stage.title.trim(),
                color: stage.color,
                sort_order: index,
            }));

            if (normalizedStages.some((stage) => !stage.title)) {
                throw new Error('Every task stage needs a name.');
            }

            const { error: upsertError } = await supabase
                .from('task_stages')
                .upsert(normalizedStages, { onConflict: 'org_id,id' });
            if (upsertError) throw upsertError;

            const nextIds = new Set(normalizedStages.map((stage) => stage.id));
            const removedIds = (query.data || [])
                .filter((stage) => !nextIds.has(stage.id))
                .map((stage) => stage.id);

            if (removedIds.length > 0) {
                const fallbackStageId = normalizedStages[0].id;
                const { error: moveError } = await supabase
                    .from('tasks')
                    .update({ status: fallbackStageId })
                    .eq('org_id', orgId)
                    .in('status', removedIds);
                if (moveError) throw moveError;

                const { error: deleteError } = await supabase
                    .from('task_stages')
                    .delete()
                    .eq('org_id', orgId)
                    .in('id', removedIds);
                if (deleteError) throw deleteError;
            }

            return normalizedStages.map((stage) => ({
                id: stage.id,
                title: stage.title,
                color: stage.color,
                sortOrder: stage.sort_order,
            }));
        },
        onSuccess: (stages) => {
            qc.setQueryData(keys.taskStages(orgId), stages);
            qc.invalidateQueries({ queryKey: keys.tasks(orgId) });
        },
    });

    return { ...query, saveTaskStages };
}

export function useTasks() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const updateTaskOrder = async (orderedIds: string[]) => {
        const results = await Promise.all(
            orderedIds.map((id, idx) =>
                supabase.from('tasks').update({ sort_order: idx }).eq('id', id)
            )
        );
        const failedUpdate = results.find((result) => result.error);
        if (failedUpdate?.error) throw failedUpdate.error;
    };

    const query = useQuery({
        queryKey: keys.tasks(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('org_id', orgId)
                .order('sort_order', { ascending: true });
            if (error) throw error;
            return data.map(mapTask);
        },
        enabled: !!orgId,
    });

    const addTask = useMutation({
        mutationFn: async (task: {
            title: string;
            description?: string;
            status?: string;
            due_date?: string;
            project_id?: string;
            folder_id?: string;
            campaign_id?: string;
            assignee_id?: string;
            sort_order?: number;
        }) => {
            const { data, error } = await supabase
                .from('tasks')
                .insert({ ...task, org_id: orgId })
                .select()
                .single();
            if (error) throw error;
            return mapTask(data);
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks(orgId) }),
    });

    const updateTask = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
            const { error } = await supabase.from('tasks').update(updates).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks(orgId) }),
    });

    const deleteTask = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('tasks').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks(orgId) }),
    });

    const reorderTasks = useMutation({
        mutationFn: updateTaskOrder,
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks(orgId) }),
    });

    const moveTask = useMutation({
        mutationFn: async ({ id, status, orderedIds }: { id: string; status: string; orderedIds: string[] }) => {
            const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
            if (error) throw error;
            await updateTaskOrder(orderedIds);
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks(orgId) }),
    });

    return { ...query, addTask, updateTask, deleteTask, reorderTasks, moveTask };
}

// ── CALENDAR EVENTS ────────────────────────────────────────────────────

export function useOrganizationTeamMembers() {
    const { organization, user } = useAuth();
    const orgId = organization?.id ?? '';

    return useQuery({
        queryKey: keys.teamMembers(orgId),
        queryFn: async () => {
            const { data, error } = await supabase.functions.invoke('team-invitations', {
                body: { action: 'list', orgId },
            });
            if (error) throw error;

            const members = ((data as TeamListResponse | null)?.members || []);
            return members
                .map((member): TeamMember => {
                    const id = member.userId || member.id || '';
                    const email = member.email || '';
                    return {
                        id,
                        name: member.name || (email ? email.split('@')[0] : 'Member'),
                        email,
                        role: member.role || 'viewer',
                        avatar: member.avatarUrl || undefined,
                    };
                })
                .filter((member) => Boolean(member.id));
        },
        enabled: !!orgId && !!user?.id,
    });
}

export function useTaskComments() {
    const { organization, user } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';
    const userId = user?.id ?? '';
    const commentsKey = keys.taskComments(orgId);
    const readsKey = keys.taskCommentReads(orgId, userId);

    const commentsQuery = useQuery({
        queryKey: commentsKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_comments')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data.map(mapTaskComment);
        },
        enabled: !!orgId,
    });

    const readMarkersQuery = useQuery({
        queryKey: readsKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_comment_reads')
                .select('*')
                .eq('org_id', orgId)
                .eq('user_id', userId);
            if (error) throw error;
            return (data || []) as TaskCommentReadRow[];
        },
        enabled: !!orgId && !!userId,
    });

    useEffect(() => {
        if (!orgId) return;

        const channel = supabase
            .channel(`task-comments:${orgId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'task_comments', filter: `org_id=eq.${orgId}` },
                () => {
                    qc.invalidateQueries({ queryKey: keys.taskComments(orgId) });
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [orgId, qc]);

    const addTaskComment = useMutation({
        mutationFn: async (comment: {
            taskId: string;
            body: string;
            authorName: string;
            authorAvatar?: string;
            parentId?: string;
        }) => {
            if (!orgId || !userId) throw new Error('Sign in to comment on tasks.');

            const { data, error } = await supabase
                .from('task_comments')
                .insert({
                    org_id: orgId,
                    task_id: comment.taskId,
                    parent_id: comment.parentId || null,
                    author_user_id: userId,
                    author_name: comment.authorName,
                    author_avatar: comment.authorAvatar || null,
                    body: comment.body,
                })
                .select()
                .single();
            if (error) throw error;
            return mapTaskComment(data);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: commentsKey });
        },
    });

    const deleteTaskComment = useMutation({
        mutationFn: async (commentId: string) => {
            if (!orgId || !userId) throw new Error('Sign in to delete comments.');

            const { error } = await supabase
                .from('task_comments')
                .delete()
                .eq('id', commentId)
                .eq('org_id', orgId)
                .eq('author_user_id', userId);
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: commentsKey });
        },
    });

    const markTaskCommentsRead = useMutation({
        mutationFn: async (taskId: string) => {
            if (!orgId || !userId) return;

            const { error } = await supabase
                .from('task_comment_reads')
                .upsert({
                    task_id: taskId,
                    user_id: userId,
                    org_id: orgId,
                    last_read_at: new Date().toISOString(),
                }, { onConflict: 'task_id,user_id' });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: readsKey });
        },
    });

    return {
        comments: commentsQuery.data || [],
        commentsQuery,
        readMarkers: readMarkersQuery.data || [],
        readMarkersQuery,
        addTaskComment,
        deleteTaskComment,
        markTaskCommentsRead,
    };
}

export function useAllContentItems() {
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';

    return useQuery({
        queryKey: ['all_content_items', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('content_items')
                .select(`
                    *,
                    campaigns!inner (
                        folder_id,
                        folders!inner (
                            project_id,
                            projects!inner ( org_id )
                        )
                    )
                `)
                .eq('campaigns.folders.projects.org_id', orgId);
            if (error) throw error;
            return data.map((item) => mapContentItem(item as ContentItemWithCampaign));
        },
        enabled: !!orgId,
    });
}

// ── VAULT CREDENTIALS ──────────────────────────────────────────────────

export function useVault() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.vaultCredentials(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('vault_credentials')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!orgId,
    });

    const addCredential = useMutation({
        mutationFn: async (cred: {
            service_name: string;
            username: string;
            encrypted_password: string;
            url?: string;
            category?: string;
            color_class?: string;
            project_id?: string;
        }) => {
            const { error } = await supabase
                .from('vault_credentials')
                .insert({ ...cred, org_id: orgId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.vaultCredentials(orgId) }),
    });

    const updateCredential = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
            const { error } = await supabase.from('vault_credentials').update(updates).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.vaultCredentials(orgId) }),
    });

    const deleteCredential = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('vault_credentials').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.vaultCredentials(orgId) }),
    });

    return { ...query, addCredential, updateCredential, deleteCredential };
}

// ── FEED MONITOR ───────────────────────────────────────────────────────

export function useFeedFolders() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.feedFolders(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('feed_folders')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!orgId,
    });

    const addFolder = useMutation({
        mutationFn: async (folder: { name: string; description?: string; color?: string }) => {
            const { error } = await supabase
                .from('feed_folders')
                .insert({ ...folder, org_id: orgId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.feedFolders(orgId) }),
    });

    const updateFolder = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
            const { error } = await supabase.from('feed_folders').update(updates).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.feedFolders(orgId) }),
    });

    const deleteFolder = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('feed_folders').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.feedFolders(orgId) }),
    });

    return { ...query, addFolder, updateFolder, deleteFolder };
}

export function useFeedPosts() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.feedPosts(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('feed_posts')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!orgId,
    });

    const addPost = useMutation({
        mutationFn: async (post: {
            platform: string;
            url: string;
            folder_id?: string;
            og_title?: string;
            og_description?: string;
            og_image?: string;
            og_site_name?: string;
            content?: string;
        }) => {
            const { error } = await supabase
                .from('feed_posts')
                .insert({ ...post, org_id: orgId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.feedPosts(orgId) }),
    });

    const updatePost = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
            const { error } = await supabase.from('feed_posts').update(updates).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.feedPosts(orgId) }),
    });

    const deletePost = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('feed_posts').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.feedPosts(orgId) }),
    });

    return { ...query, addPost, updatePost, deletePost };
}

// ── CLIENT PORTAL ──────────────────────────────────────────────────────

export function usePortalClients() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.portalClients(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('portal_clients')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!orgId,
    });

    const addClient = useMutation({
        mutationFn: async (client: { name: string; company?: string }) => {
            const accessToken = crypto.randomUUID();
            const { error } = await supabase
                .from('portal_clients')
                .insert({ ...client, access_token: accessToken, org_id: orgId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalClients(orgId) }),
    });

    const updateClient = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
            const { error } = await supabase.from('portal_clients').update(updates as PortalClientUpdate).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalClients(orgId) }),
    });

    const deleteClient = useMutation({
        mutationFn: async (id: string) => {
            const { data: feeds, error: feedsError } = await supabase
                .from('portal_feeds')
                .select('id')
                .eq('client_id', id);
            if (feedsError) throw feedsError;

            const feedIds = (feeds || []).map(feed => feed.id);
            if (feedIds.length > 0) {
                const { data: posts, error: postsError } = await supabase
                    .from('portal_review_posts')
                    .select('id')
                    .in('feed_id', feedIds);
                if (postsError) throw postsError;

                const postIds = (posts || []).map(post => post.id);
                if (postIds.length > 0) {
                    const { error: commentsError } = await supabase
                        .from('portal_comments')
                        .delete()
                        .in('post_id', postIds);
                    if (commentsError) throw commentsError;

                    const { error: postsDeleteError } = await supabase
                        .from('portal_review_posts')
                        .delete()
                        .in('id', postIds);
                    if (postsDeleteError) throw postsDeleteError;
                }

                const { error: feedsDeleteError } = await supabase
                    .from('portal_feeds')
                    .delete()
                    .in('id', feedIds);
                if (feedsDeleteError) throw feedsDeleteError;
            }

            const { error } = await supabase.from('portal_clients').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalClients(orgId) }),
    });

    return { ...query, addClient, updateClient, deleteClient };
}

export function usePortalFeeds(clientId: string) {
    const qc = useQueryClient();
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.portalFeeds(clientId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('portal_feeds')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!clientId,
    });

    const addFeed = useMutation({
        mutationFn: async (name: string) => {
            const { error } = await supabase
                .from('portal_feeds')
                .insert({ name, client_id: clientId });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.portalFeeds(clientId) });
            if (orgId) qc.invalidateQueries({ queryKey: keys.allPortalFeeds(orgId) });
        },
    });

    const deleteFeed = useMutation({
        mutationFn: async (id: string) => {
            const { data: posts, error: postsError } = await supabase
                .from('portal_review_posts')
                .select('id')
                .eq('feed_id', id);
            if (postsError) throw postsError;

            const postIds = (posts || []).map(post => post.id);
            if (postIds.length > 0) {
                const { error: commentsError } = await supabase
                    .from('portal_comments')
                    .delete()
                    .in('post_id', postIds);
                if (commentsError) throw commentsError;

                const { error: postsDeleteError } = await supabase
                    .from('portal_review_posts')
                    .delete()
                    .in('id', postIds);
                if (postsDeleteError) throw postsDeleteError;
            }

            const { error } = await supabase.from('portal_feeds').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: (_data, id) => {
            qc.invalidateQueries({ queryKey: keys.portalFeeds(clientId) });
            if (orgId) qc.invalidateQueries({ queryKey: keys.allPortalFeeds(orgId) });
            qc.invalidateQueries({ queryKey: keys.portalReviewPosts(id) });
        },
    });

    return { ...query, addFeed, deleteFeed };
}

export type PortalFeedRecord = Database['public']['Tables']['portal_feeds']['Row'];

export function useAllPortalFeeds() {
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';

    return useQuery({
        queryKey: keys.allPortalFeeds(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('portal_feeds')
                .select('*, portal_clients!inner(org_id)')
                .eq('portal_clients.org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as PortalFeedRecord[];
        },
        enabled: !!orgId,
    });
}

export function usePortalReviewPosts(feedId: string) {
    const qc = useQueryClient();
    const queryKey = useMemo(() => keys.portalReviewPosts(feedId), [feedId]);

    const query = useQuery<PortalReviewPostWithComments[]>({
        queryKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('portal_review_posts')
                .select('*, portal_comments(*), portal_review_events(*)')
                .eq('feed_id', feedId)
                .order('created_at', { ascending: false })
                .order('id', { ascending: true });
            if (error) throw error;
            return sortPortalReviewPosts(
                ((data || []) as PortalReviewPostWithComments[]).map(post => normalizePortalReviewPost(post))
            );
        },
        enabled: !!feedId,
        refetchInterval: feedId ? 5000 : false,
        refetchIntervalInBackground: false,
    });

    useEffect(() => {
        if (!feedId) return;

        const channel = supabase
            .channel(`portal-review-posts:${feedId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'portal_review_posts',
                    filter: `feed_id=eq.${feedId}`,
                },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const deletedId = (payload.old as Partial<PortalReviewPostRow>)?.id;
                        qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                            removePortalReviewPost(current || [], deletedId)
                        );
                        return;
                    }

                    const nextPost = payload.new as PortalReviewPostRow;
                    if (!nextPost?.id) return;

                    qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                        upsertPortalReviewPost(current || [], nextPost)
                    );
                }
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    void qc.invalidateQueries({ queryKey });
                }
            });

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [feedId, qc, queryKey]);

    const commentPostIds = (query.data || [])
        .map(post => post.id)
        .filter(Boolean)
        .sort()
        .join(',');

    useEffect(() => {
        if (!feedId || !commentPostIds) return;

        const postIds = commentPostIds.split(',').filter(Boolean);
        const postIdSet = new Set(postIds);
        const filter = postIds.length <= 100
            ? `post_id=in.(${postIds.join(',')})`
            : undefined;
        const channelKey = postIds.length > 8
            ? `${postIds.length}:${postIds[0]}:${postIds[postIds.length - 1]}`
            : postIds.join(':');

        const channel = supabase
            .channel(`portal-comments:${feedId}:${channelKey}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'portal_comments',
                    ...(filter ? { filter } : {}),
                },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const deletedId = (payload.old as Partial<PortalCommentRow>)?.id;
                        qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                            removePortalComment(current || [], deletedId)
                        );
                        return;
                    }

                    const comment = payload.new as PortalCommentRow;
                    if (!comment?.id || !postIdSet.has(comment.post_id)) return;

                    qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                        upsertPortalComment(current || [], comment)
                    );
                }
            )
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    void qc.invalidateQueries({ queryKey });
                }
            });

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [commentPostIds, feedId, qc, queryKey]);

    const addReviewPost = useMutation({
        mutationFn: async (post: AddPortalReviewPostInput) => {
            const { data, error } = await supabase
                .from('portal_review_posts')
                .insert(toPortalReviewPostInsert(feedId, post))
                .select('*, portal_comments(*), portal_review_events(*)')
                .single();
            if (error) throw error;
            return data as PortalReviewPostWithComments;
        },
        onMutate: async (post) => {
            await qc.cancelQueries({ queryKey });
            const previous = qc.getQueryData<PortalReviewPostWithComments[]>(queryKey);
            const now = new Date().toISOString();

            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                upsertPortalReviewPost(current || [], {
                    id: post.id,
                    feed_id: feedId,
                    content_item_id: post.content_item_id || null,
                    content_type: post.content_type,
                    snapshot: post.snapshot as Json,
                    status: 'pending',
                    created_at: now,
                    updated_at: now,
                    portal_comments: [],
                    portal_review_events: [],
                })
            );

            return { previous };
        },
        onError: (_error, _post, context) => {
            if (context?.previous) qc.setQueryData(queryKey, context.previous);
        },
        onSuccess: (post) => {
            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                upsertPortalReviewPost(current || [], post)
            );
        },
    });

    const addReviewPosts = useMutation({
        mutationFn: async (posts: AddPortalReviewPostInput[]) => {
            if (posts.length === 0) return [];

            const { data, error } = await supabase
                .from('portal_review_posts')
                .insert(posts.map(post => toPortalReviewPostInsert(feedId, post)))
                .select('*, portal_comments(*), portal_review_events(*)');
            if (error) throw error;
            return data as PortalReviewPostWithComments[];
        },
        onMutate: async (posts) => {
            await qc.cancelQueries({ queryKey });
            const previous = qc.getQueryData<PortalReviewPostWithComments[]>(queryKey);
            const now = new Date().toISOString();

            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                posts.reduce(
                    (nextPosts, post) => upsertPortalReviewPost(nextPosts, {
                        id: post.id,
                        feed_id: feedId,
                        content_item_id: post.content_item_id || null,
                        content_type: post.content_type,
                        snapshot: post.snapshot as Json,
                        status: 'pending',
                        created_at: now,
                        updated_at: now,
                        portal_comments: [],
                        portal_review_events: [],
                    }),
                    current || [],
                )
            );

            return { previous };
        },
        onError: (_error, _posts, context) => {
            if (context) qc.setQueryData(queryKey, context.previous);
        },
        onSuccess: (posts) => {
            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                posts.reduce(
                    (nextPosts, post) => upsertPortalReviewPost(nextPosts, post),
                    current || [],
                )
            );
        },
    });

    const updateReviewStatus = useMutation({
        mutationFn: async ({ id, status, reviewerName }: { id: string; status: string; reviewerName: string }) => {
            const { error: actionError } = await supabase.rpc('record_portal_review_action', {
                p_post_id: id,
                p_status: status,
                p_reviewer_name: reviewerName,
                p_is_client: false,
            });
            if (actionError) throw actionError;

            const { data, error: postError } = await supabase
                .from('portal_review_posts')
                .select('*, portal_comments(*), portal_review_events(*)')
                .eq('id', id)
                .single();
            if (postError) throw postError;
            return data as PortalReviewPostWithComments;
        },
        onMutate: ({ id, status, reviewerName }) => {
            const previous = qc.getQueryData<PortalReviewPostWithComments[]>(queryKey);
            const now = new Date().toISOString();
            const optimisticEvent: PortalReviewEventRow = {
                id: crypto.randomUUID(),
                post_id: id,
                status,
                reviewer_name: reviewerName,
                reviewer_is_client: false,
                actor_user_id: null,
                created_at: now,
            };

            void qc.cancelQueries({ queryKey });

            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                (current || []).map(post =>
                    post.id === id
                        ? {
                            ...post,
                            status,
                            updated_at: now,
                            portal_review_events: sortPortalReviewEvents([
                                ...(post.portal_review_events || []),
                                optimisticEvent,
                            ]),
                        }
                        : post
                )
            );

            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) qc.setQueryData(queryKey, context.previous);
        },
        onSuccess: (post) => {
            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                upsertPortalReviewPost(current || [], post)
            );
        },
    });

    const addComment = useMutation({
        mutationFn: async ({ postId, comment }: {
            postId: string;
            comment: { id: string; author: string; text: string; avatar?: string; is_client?: boolean; created_at?: string };
        }) => {
            const { data, error } = await supabase
                .from('portal_comments')
                .insert({
                    id: comment.id,
                    author: comment.author,
                    text: comment.text,
                    avatar: comment.avatar,
                    is_client: comment.is_client,
                    created_at: comment.created_at,
                    post_id: postId,
                })
                .select('*')
                .single();
            if (error) throw error;
            return data as PortalCommentRow;
        },
        onMutate: async ({ postId, comment }) => {
            await qc.cancelQueries({ queryKey });
            const previous = qc.getQueryData<PortalReviewPostWithComments[]>(queryKey);
            const optimisticComment: PortalCommentRow = {
                id: comment.id,
                post_id: postId,
                author: comment.author,
                text: comment.text,
                avatar: comment.avatar || null,
                is_client: comment.is_client ?? false,
                created_at: comment.created_at || new Date().toISOString(),
            };

            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                upsertPortalComment(current || [], optimisticComment)
            );

            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) qc.setQueryData(queryKey, context.previous);
        },
        onSuccess: (comment) => {
            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                upsertPortalComment(current || [], comment)
            );
        },
    });

    const deleteReviewPost = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('portal_review_posts')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return id;
        },
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey });
            const previous = qc.getQueryData<PortalReviewPostWithComments[]>(queryKey);

            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                removePortalReviewPost(current || [], id)
            );

            return { previous };
        },
        onError: (_error, _id, context) => {
            if (context?.previous) qc.setQueryData(queryKey, context.previous);
        },
        onSuccess: (id) => {
            qc.setQueryData<PortalReviewPostWithComments[]>(queryKey, current =>
                removePortalReviewPost(current || [], id)
            );
        },
    });

    return { ...query, addReviewPost, addReviewPosts, updateReviewStatus, addComment, deleteReviewPost };
}

// ── ORG TOOLS ──────────────────────────────────────────────────────────

export function useOrgTools() {
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';

    return useQuery({
        queryKey: keys.orgTools(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('org_tools')
                .select('*, tool_registry(*)')
                .eq('org_id', orgId);
            if (error) throw error;
            return data;
        },
        enabled: !!orgId,
    });
}

// ── NOTES ──────────────────────────────────────────────────────────────

export function useNotes() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.notes(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('notes')
                .select('*')
                .eq('org_id', orgId)
                .order('updated_at', { ascending: false });
            if (error) throw error;
            return data.map(mapNote);
        },
        enabled: !!orgId,
    });

    const addNote = useMutation({
        mutationFn: async (note: {
            title: string;
            content: Json[];
            project_id?: string;
        }) => {
            const { data, error } = await supabase
                .from('notes')
                .insert({ ...note, org_id: orgId })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.notes(orgId) }),
    });

    const updateNote = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
            const { error } = await supabase.from('notes').update(updates).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.notes(orgId) }),
    });

    const deleteNote = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('notes').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.notes(orgId) }),
    });

    return { ...query, addNote, updateNote, deleteNote };
}

// --- BRAND GUIDE ---

type BrandGuideStore = {
    guides: BrandGuide[];
    colors: BrandColor[];
    fonts: BrandFont[];
    logos: BrandLogo[];
    logoRules: BrandLogoRule[];
    moodImages: BrandMoodImage[];
};

const emptyBrandGuideStore = (): BrandGuideStore => ({
    guides: [],
    colors: [],
    fonts: [],
    logos: [],
    logoRules: [],
    moodImages: [],
});

const brandGuideStorageKey = (orgId: string) => `social-suite:brand-guide:${orgId}`;

const isMissingBrandTableError = (error: unknown) => {
    const record = error as { status?: number; code?: string; message?: string };
    const message = record?.message || '';
    return record?.status === 404
        || record?.code === 'PGRST205'
        || message.includes('Could not find the table')
        || message.includes('schema cache');
};

const readBrandGuideStore = (orgId: string): BrandGuideStore => {
    if (typeof window === 'undefined' || !orgId) return emptyBrandGuideStore();
    try {
        const raw = window.localStorage.getItem(brandGuideStorageKey(orgId));
        return raw ? { ...emptyBrandGuideStore(), ...JSON.parse(raw) } : emptyBrandGuideStore();
    } catch {
        return emptyBrandGuideStore();
    }
};

const writeBrandGuideStore = (orgId: string, store: BrandGuideStore) => {
    if (typeof window === 'undefined' || !orgId) return;
    window.localStorage.setItem(brandGuideStorageKey(orgId), JSON.stringify(store));
};

const brandGuideId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createLocalBrandGuide = (orgId: string, projectId?: string | null, brandName?: string): BrandGuide => {
    const store = readBrandGuideStore(orgId);

    const now = new Date().toISOString();
    const guide: BrandGuide = {
        id: brandGuideId(),
        org_id: orgId,
        project_id: projectId || null,
        brand_name: brandName || 'Untitled Brand',
        website_url: null,
        tagline: null,
        mission: null,
        vision: null,
        brand_values: [],
        personality: [],
        industry: null,
        target_audience: null,
        elevator_pitch: null,
        voice_attributes: [],
        tone_spectrum: {},
        writing_dos: [],
        writing_donts: [],
        preferred_terms: [],
        avoided_terms: [],
        sample_copy: [],
        content_pillars: [],
        photography_style: null,
        illustration_style: null,
        iconography_rules: null,
        layout_composition: null,
        social_rules: null,
        ad_rules: null,
        custom_sections: [],
        logo_clearspace: null,
        logo_min_digital: null,
        logo_min_print: null,
        created_by: null,
        created_at: now,
        updated_at: now,
    };

    writeBrandGuideStore(orgId, { ...store, guides: [guide, ...store.guides] });
    return guide;
};

const updateLocalBrandGuide = (orgId: string, id: string, updates: Partial<BrandGuide>) => {
    const store = readBrandGuideStore(orgId);
    writeBrandGuideStore(orgId, {
        ...store,
        guides: store.guides.map((guide) => guide.id === id ? { ...guide, ...updates, updated_at: new Date().toISOString() } : guide),
    });
};

const resetBrandGuideFields = (): Partial<BrandGuide> => ({
    project_id: null,
    brand_name: null,
    website_url: null,
    tagline: null,
    mission: null,
    vision: null,
    brand_values: [],
    personality: [],
    industry: null,
    target_audience: null,
    elevator_pitch: null,
    voice_attributes: [],
    tone_spectrum: {},
    writing_dos: [],
    writing_donts: [],
    preferred_terms: [],
    avoided_terms: [],
    sample_copy: [],
    content_pillars: [],
    photography_style: null,
    illustration_style: null,
    iconography_rules: null,
    layout_composition: null,
    social_rules: null,
    ad_rules: null,
    custom_sections: [],
    logo_clearspace: null,
    logo_min_digital: null,
    logo_min_print: null,
});

const resetLocalBrandGuide = (orgId: string, id: string) => {
    const store = readBrandGuideStore(orgId);
    writeBrandGuideStore(orgId, {
        guides: store.guides.map((guide) => guide.id === id ? { ...guide, ...resetBrandGuideFields(), updated_at: new Date().toISOString() } : guide),
        colors: store.colors.filter((color) => color.guide_id !== id),
        fonts: store.fonts.filter((font) => font.guide_id !== id),
        logos: store.logos.filter((logo) => logo.guide_id !== id),
        logoRules: store.logoRules.filter((rule) => rule.guide_id !== id),
        moodImages: store.moodImages.filter((image) => image.guide_id !== id),
    });
};

const deleteLocalBrandGuide = (orgId: string, id: string) => {
    const store = readBrandGuideStore(orgId);
    writeBrandGuideStore(orgId, {
        guides: store.guides.filter((guide) => guide.id !== id),
        colors: store.colors.filter((color) => color.guide_id !== id),
        fonts: store.fonts.filter((font) => font.guide_id !== id),
        logos: store.logos.filter((logo) => logo.guide_id !== id),
        logoRules: store.logoRules.filter((rule) => rule.guide_id !== id),
        moodImages: store.moodImages.filter((image) => image.guide_id !== id),
    });
};

const hasLocalBrandGuide = (orgId: string, id: string) => {
    return readBrandGuideStore(orgId).guides.some((guide) => guide.id === id);
};

const hasLocalBrandItem = (
    orgId: string,
    key: keyof Omit<BrandGuideStore, 'guides'>,
    id: string,
) => {
    return (readBrandGuideStore(orgId)[key] as { id: string }[]).some((item) => item.id === id);
};

const addLocalBrandItem = <T extends { id: string; created_at: string | null }>(
    orgId: string,
    key: keyof Omit<BrandGuideStore, 'guides'>,
    item: Omit<T, 'id' | 'created_at'>,
) => {
    const store = readBrandGuideStore(orgId);
    const nextItem = { ...item, id: brandGuideId(), created_at: new Date().toISOString() } as T;
    writeBrandGuideStore(orgId, { ...store, [key]: [...(store[key] as T[]), nextItem] });
    return nextItem;
};

const updateLocalBrandItem = <T extends { id: string }>(
    orgId: string,
    key: keyof Omit<BrandGuideStore, 'guides'>,
    id: string,
    updates: Partial<T>,
) => {
    const store = readBrandGuideStore(orgId);
    writeBrandGuideStore(orgId, {
        ...store,
        [key]: (store[key] as T[]).map((item) => item.id === id ? { ...item, ...updates } : item),
    });
};

const deleteLocalBrandItem = <T extends { id: string }>(
    orgId: string,
    key: keyof Omit<BrandGuideStore, 'guides'>,
    id: string,
) => {
    const store = readBrandGuideStore(orgId);
    writeBrandGuideStore(orgId, {
        ...store,
        [key]: (store[key] as T[]).filter((item) => item.id !== id),
    });
};

export function useBrandGuide(guideId: string) {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';
    const db = supabase as unknown as SupabaseClient;

    const guidesQuery = useQuery({
        queryKey: keys.brandGuides(orgId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_guides')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).guides;
                }
                throw error;
            }
            const localGuides = readBrandGuideStore(orgId).guides;
            const remoteGuides = (data || []) as BrandGuide[];
            return [
                ...localGuides,
                ...remoteGuides.filter((guide) => !localGuides.some((local) => local.id === guide.id)),
            ];
        },
        enabled: !!orgId,
    });

    const guideQuery = useQuery({
        queryKey: keys.brandGuide(orgId, guideId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_guides')
                .select('*')
                .eq('org_id', orgId)
                .eq('id', guideId)
                .maybeSingle();
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).guides.find((guide) => guide.id === guideId) || null;
                }
                throw error;
            }
            return ((data || readBrandGuideStore(orgId).guides.find((guide) => guide.id === guideId)) || null) as BrandGuide | null;
        },
        enabled: !!orgId && !!guideId,
    });

    const activeGuideId = guideQuery.data?.id ?? guideId ?? '';

    const colorsQuery = useQuery({
        queryKey: keys.brandColors(activeGuideId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_colors')
                .select('*')
                .eq('guide_id', activeGuideId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).colors.filter((color) => color.guide_id === activeGuideId);
                }
                throw error;
            }
            const localColors = readBrandGuideStore(orgId).colors.filter((color) => color.guide_id === activeGuideId);
            const remoteColors = (data || []) as BrandColor[];
            return [
                ...localColors,
                ...remoteColors.filter((color) => !localColors.some((local) => local.id === color.id)),
            ];
        },
        enabled: !!activeGuideId,
    });

    const fontsQuery = useQuery({
        queryKey: keys.brandFonts(activeGuideId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_fonts')
                .select('*')
                .eq('guide_id', activeGuideId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).fonts.filter((font) => font.guide_id === activeGuideId);
                }
                throw error;
            }
            const localFonts = readBrandGuideStore(orgId).fonts.filter((font) => font.guide_id === activeGuideId);
            const remoteFonts = (data || []) as BrandFont[];
            return [
                ...localFonts,
                ...remoteFonts.filter((font) => !localFonts.some((local) => local.id === font.id)),
            ];
        },
        enabled: !!activeGuideId,
    });

    const logosQuery = useQuery({
        queryKey: keys.brandLogos(activeGuideId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_logos')
                .select('*')
                .eq('guide_id', activeGuideId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).logos.filter((logo) => logo.guide_id === activeGuideId);
                }
                throw error;
            }
            const localLogos = readBrandGuideStore(orgId).logos.filter((logo) => logo.guide_id === activeGuideId);
            const remoteLogos = (data || []) as BrandLogo[];
            return [
                ...localLogos,
                ...remoteLogos.filter((logo) => !localLogos.some((local) => local.id === logo.id)),
            ];
        },
        enabled: !!activeGuideId,
    });

    const logoRulesQuery = useQuery({
        queryKey: keys.brandLogoRules(activeGuideId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_logo_rules')
                .select('*')
                .eq('guide_id', activeGuideId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).logoRules.filter((rule) => rule.guide_id === activeGuideId);
                }
                throw error;
            }
            const localRules = readBrandGuideStore(orgId).logoRules.filter((rule) => rule.guide_id === activeGuideId);
            const remoteRules = (data || []) as BrandLogoRule[];
            return [
                ...localRules,
                ...remoteRules.filter((rule) => !localRules.some((local) => local.id === rule.id)),
            ];
        },
        enabled: !!activeGuideId,
    });

    const moodImagesQuery = useQuery({
        queryKey: keys.brandMoodImages(activeGuideId),
        queryFn: async () => {
            const { data, error } = await db
                .from('brand_mood_images')
                .select('*')
                .eq('guide_id', activeGuideId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });
            if (error) {
                if (isMissingBrandTableError(error)) {
                    return readBrandGuideStore(orgId).moodImages.filter((image) => image.guide_id === activeGuideId);
                }
                throw error;
            }
            const localImages = readBrandGuideStore(orgId).moodImages.filter((image) => image.guide_id === activeGuideId);
            const remoteImages = (data || []) as BrandMoodImage[];
            return [
                ...localImages,
                ...remoteImages.filter((image) => !localImages.some((local) => local.id === image.id)),
            ];
        },
        enabled: !!activeGuideId,
    });

    const createGuide = useMutation({
        mutationFn: async ({ project_id, brand_name }: { project_id?: string | null; brand_name?: string }) => {
            try {
                return await createBrandGuideAction({ orgId, projectId: project_id, brandName: brand_name });
            } catch (error) {
                const code = (error as { code?: string })?.code;
                if (isMissingBrandTableError(error) || !project_id || code === '23502' || code === '23505') {
                    return createLocalBrandGuide(orgId, project_id || null, brand_name);
                }
                throw error;
            }
        },
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: keys.brandGuides(orgId) });
            if (data?.id) qc.invalidateQueries({ queryKey: keys.brandGuide(orgId, data.id) });
        },
    });

    const updateGuide = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<BrandGuide> }) => {
            if (hasLocalBrandGuide(orgId, id)) {
                updateLocalBrandGuide(orgId, id, updates);
                return;
            }
            try {
                await updateBrandGuideAction({ id, updates });
            } catch (error) {
                if (isMissingBrandTableError(error)) {
                    updateLocalBrandGuide(orgId, id, updates);
                    return;
                }
                throw error;
            }
        },
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: keys.brandGuides(orgId) });
            qc.invalidateQueries({ queryKey: keys.brandGuide(orgId, variables.id) });
        },
    });

    const deleteGuide = useMutation({
        mutationFn: async (id: string) => {
            if (hasLocalBrandGuide(orgId, id)) {
                deleteLocalBrandGuide(orgId, id);
                return;
            }

            const childTables = [
                'brand_colors',
                'brand_fonts',
                'brand_logos',
                'brand_logo_rules',
                'brand_mood_images',
                'brand_knowledge_documents',
            ];

            for (const table of childTables) {
                const { error } = await db.from(table).delete().eq('guide_id', id);
                if (error && !isMissingBrandTableError(error)) throw error;
            }

            const { error } = await db.from('brand_guides').delete().eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    deleteLocalBrandGuide(orgId, id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: (_data, id) => {
            qc.invalidateQueries({ queryKey: keys.brandGuides(orgId) });
            qc.invalidateQueries({ queryKey: keys.brandGuide(orgId, id) });
            qc.invalidateQueries({ queryKey: keys.brandColors(id) });
            qc.invalidateQueries({ queryKey: keys.brandFonts(id) });
            qc.invalidateQueries({ queryKey: keys.brandLogos(id) });
            qc.invalidateQueries({ queryKey: keys.brandLogoRules(id) });
            qc.invalidateQueries({ queryKey: keys.brandMoodImages(id) });
            qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, id] });
        },
    });

    const resetGuide = useMutation({
        mutationFn: async (id: string) => {
            const targetGuide = (guidesQuery.data || []).find((item) => item.id === id) || guideQuery.data;
            if (!targetGuide) throw new Error('Brand Guide was not found.');

            if (hasLocalBrandGuide(orgId, id)) {
                resetLocalBrandGuide(orgId, id);
                return;
            }

            const childTables = [
                'brand_colors',
                'brand_fonts',
                'brand_logos',
                'brand_logo_rules',
                'brand_mood_images',
                'brand_knowledge_documents',
            ];

            for (const table of childTables) {
                const { error } = await db.from(table).delete().eq('guide_id', id);
                if (error && !isMissingBrandTableError(error)) throw error;
            }

            const { error } = await db
                .from('brand_guides')
                .update(resetBrandGuideFields())
                .eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    resetLocalBrandGuide(orgId, id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: (_data, id) => {
            qc.invalidateQueries({ queryKey: keys.brandGuides(orgId) });
            qc.invalidateQueries({ queryKey: keys.brandGuide(orgId, id) });
            qc.invalidateQueries({ queryKey: keys.brandColors(id) });
            qc.invalidateQueries({ queryKey: keys.brandFonts(id) });
            qc.invalidateQueries({ queryKey: keys.brandLogos(id) });
            qc.invalidateQueries({ queryKey: keys.brandLogoRules(id) });
            qc.invalidateQueries({ queryKey: keys.brandMoodImages(id) });
            qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, id] });
        },
    });

    const addColor = useMutation({
        mutationFn: async (color: Omit<BrandColor, 'id' | 'created_at'>) => {
            const { error } = await db.from('brand_colors').insert(color);
            if (error) {
                if (isMissingBrandTableError(error) || (error as { code?: string })?.code === '23503') {
                    addLocalBrandItem<BrandColor>(orgId, 'colors', color);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandColors(activeGuideId) }),
    });

    const updateColor = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<BrandColor> }) => {
            if (hasLocalBrandItem(orgId, 'colors', id)) {
                updateLocalBrandItem<BrandColor>(orgId, 'colors', id, updates);
                return;
            }
            const { error } = await db.from('brand_colors').update(updates).eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    updateLocalBrandItem<BrandColor>(orgId, 'colors', id, updates);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandColors(activeGuideId) }),
    });

    const deleteColor = useMutation({
        mutationFn: async (id: string) => {
            if (hasLocalBrandItem(orgId, 'colors', id)) {
                deleteLocalBrandItem<BrandColor>(orgId, 'colors', id);
                return;
            }
            const { error } = await db.from('brand_colors').delete().eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    deleteLocalBrandItem<BrandColor>(orgId, 'colors', id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandColors(activeGuideId) }),
    });

    const addFont = useMutation({
        mutationFn: async (font: Omit<BrandFont, 'id' | 'created_at'>) => {
            const { error } = await db.from('brand_fonts').insert(font);
            if (error) {
                if (isMissingBrandTableError(error) || (error as { code?: string })?.code === '23503') {
                    addLocalBrandItem<BrandFont>(orgId, 'fonts', font);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandFonts(activeGuideId) }),
    });

    const updateFont = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<BrandFont> }) => {
            if (hasLocalBrandItem(orgId, 'fonts', id)) {
                updateLocalBrandItem<BrandFont>(orgId, 'fonts', id, updates);
                return;
            }
            const { error } = await db.from('brand_fonts').update(updates).eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    updateLocalBrandItem<BrandFont>(orgId, 'fonts', id, updates);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandFonts(activeGuideId) }),
    });

    const deleteFont = useMutation({
        mutationFn: async (id: string) => {
            if (hasLocalBrandItem(orgId, 'fonts', id)) {
                deleteLocalBrandItem<BrandFont>(orgId, 'fonts', id);
                return;
            }
            const { error } = await db.from('brand_fonts').delete().eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    deleteLocalBrandItem<BrandFont>(orgId, 'fonts', id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandFonts(activeGuideId) }),
    });

    const addLogo = useMutation({
        mutationFn: async (logo: Omit<BrandLogo, 'id' | 'created_at'>) => {
            const { error } = await db.from('brand_logos').insert(logo);
            if (error) {
                if (isMissingBrandTableError(error) || (error as { code?: string })?.code === '23503') {
                    addLocalBrandItem<BrandLogo>(orgId, 'logos', logo);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandLogos(activeGuideId) }),
    });

    const updateLogo = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<BrandLogo> }) => {
            if (hasLocalBrandItem(orgId, 'logos', id)) {
                updateLocalBrandItem<BrandLogo>(orgId, 'logos', id, updates);
                return;
            }
            const { error } = await db.from('brand_logos').update(updates).eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    updateLocalBrandItem<BrandLogo>(orgId, 'logos', id, updates);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandLogos(activeGuideId) }),
    });

    const deleteLogo = useMutation({
        mutationFn: async (id: string) => {
            if (hasLocalBrandItem(orgId, 'logos', id)) {
                deleteLocalBrandItem<BrandLogo>(orgId, 'logos', id);
                return;
            }
            const { error } = await db.from('brand_logos').delete().eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    deleteLocalBrandItem<BrandLogo>(orgId, 'logos', id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandLogos(activeGuideId) }),
    });

    const addLogoRule = useMutation({
        mutationFn: async (rule: Omit<BrandLogoRule, 'id' | 'created_at'>) => {
            const { error } = await db.from('brand_logo_rules').insert(rule);
            if (error) {
                if (isMissingBrandTableError(error) || (error as { code?: string })?.code === '23503') {
                    addLocalBrandItem<BrandLogoRule>(orgId, 'logoRules', rule);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandLogoRules(activeGuideId) }),
    });

    const updateLogoRule = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<BrandLogoRule> }) => {
            if (hasLocalBrandItem(orgId, 'logoRules', id)) {
                updateLocalBrandItem<BrandLogoRule>(orgId, 'logoRules', id, updates);
                return;
            }
            const { error } = await db.from('brand_logo_rules').update(updates).eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    updateLocalBrandItem<BrandLogoRule>(orgId, 'logoRules', id, updates);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandLogoRules(activeGuideId) }),
    });

    const deleteLogoRule = useMutation({
        mutationFn: async (id: string) => {
            if (hasLocalBrandItem(orgId, 'logoRules', id)) {
                deleteLocalBrandItem<BrandLogoRule>(orgId, 'logoRules', id);
                return;
            }
            const { error } = await db.from('brand_logo_rules').delete().eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    deleteLocalBrandItem<BrandLogoRule>(orgId, 'logoRules', id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandLogoRules(activeGuideId) }),
    });

    const addMoodImage = useMutation({
        mutationFn: async (image: Omit<BrandMoodImage, 'id' | 'created_at'>) => {
            const { error } = await db.from('brand_mood_images').insert(image);
            if (error) {
                if (isMissingBrandTableError(error) || (error as { code?: string })?.code === '23503') {
                    addLocalBrandItem<BrandMoodImage>(orgId, 'moodImages', image);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandMoodImages(activeGuideId) }),
    });

    const updateMoodImage = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<BrandMoodImage> }) => {
            if (hasLocalBrandItem(orgId, 'moodImages', id)) {
                updateLocalBrandItem<BrandMoodImage>(orgId, 'moodImages', id, updates);
                return;
            }
            const { error } = await db.from('brand_mood_images').update(updates).eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    updateLocalBrandItem<BrandMoodImage>(orgId, 'moodImages', id, updates);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandMoodImages(activeGuideId) }),
    });

    const deleteMoodImage = useMutation({
        mutationFn: async (id: string) => {
            if (hasLocalBrandItem(orgId, 'moodImages', id)) {
                deleteLocalBrandItem<BrandMoodImage>(orgId, 'moodImages', id);
                return;
            }
            const { error } = await db.from('brand_mood_images').delete().eq('id', id);
            if (error) {
                if (isMissingBrandTableError(error)) {
                    deleteLocalBrandItem<BrandMoodImage>(orgId, 'moodImages', id);
                    return;
                }
                throw error;
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.brandMoodImages(activeGuideId) }),
    });

    return {
        guides: guidesQuery.data ?? [],
        guide: guideQuery.data ?? null,
        colors: colorsQuery.data ?? [],
        fonts: fontsQuery.data ?? [],
        logos: logosQuery.data ?? [],
        logoRules: logoRulesQuery.data ?? [],
        moodImages: moodImagesQuery.data ?? [],
        isLoading: guidesQuery.isLoading || guideQuery.isLoading || colorsQuery.isLoading || fontsQuery.isLoading || logosQuery.isLoading || logoRulesQuery.isLoading || moodImagesQuery.isLoading,
        error: guidesQuery.error || guideQuery.error || colorsQuery.error || fontsQuery.error || logosQuery.error || logoRulesQuery.error || moodImagesQuery.error,
        createGuide,
        updateGuide,
        addColor,
        updateColor,
        deleteColor,
        addFont,
        updateFont,
        deleteFont,
        addLogo,
        updateLogo,
        deleteLogo,
        addLogoRule,
        updateLogoRule,
        deleteLogoRule,
        addMoodImage,
        updateMoodImage,
        deleteMoodImage,
        resetGuide,
        deleteGuide,
    };
}
