/**
 * React Query hooks for all Supabase database operations.
 * These replace the in-memory state + idb-keyval persistence in AppContext.
 *
 * Each hook provides: query data, and CRUD mutation functions.
 * All mutations automatically invalidate related queries.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Database, Json } from '@/types/supabase';
import type { Campaign, CampaignType, Folder, Note, Project, Task } from '@/types';

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type FolderRow = Database['public']['Tables']['folders']['Row'];
type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type ContentItemRow = Database['public']['Tables']['content_items']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type PortalClientUpdate = Database['public']['Tables']['portal_clients']['Update'];
type JsonRecord = Record<string, unknown>;

export type BrandGuide = {
    id: string;
    org_id: string;
    project_id: string | null;
    brand_name: string | null;
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
    campaignId: task.campaign_id || undefined,
    assigneeId: task.assignee_id || undefined,
});

// ── Key Factories ──────────────────────────────────────────────────────

const keys = {
    projects: (orgId: string) => ['projects', orgId] as const,
    folders: (projectId: string) => ['folders', projectId] as const,
    campaigns: (folderId: string) => ['campaigns', folderId] as const,
    contentItems: (campaignId: string) => ['content_items', campaignId] as const,
    tasks: (orgId: string) => ['tasks', orgId] as const,
    calendarEvents: (campaignId?: string) => ['calendar_events', campaignId] as const,
    // Micro tools
    vaultCredentials: (orgId: string) => ['vault_credentials', orgId] as const,
    feedFolders: (orgId: string) => ['feed_folders', orgId] as const,
    feedPosts: (orgId: string) => ['feed_posts', orgId] as const,
    portalClients: (orgId: string) => ['portal_clients', orgId] as const,
    portalFeeds: (clientId: string) => ['portal_feeds', clientId] as const,
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
        mutationFn: async (name: string) => {
            const { error } = await supabase
                .from('projects')
                .insert({ name, org_id: orgId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects(orgId) }),
    });

    const updateProject = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: { name?: string } }) => {
            const { error } = await supabase.from('projects').update(updates).eq('id', id);
            if (error) throw error;
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
        mutationFn: async (name: string) => {
            const { error } = await supabase
                .from('folders')
                .insert({ name, project_id: projectId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.folders(projectId) }),
    });

    const updateFolder = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: { name?: string } }) => {
            const { error } = await supabase.from('folders').update(updates).eq('id', id);
            if (error) throw error;
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
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns(folderId) }),
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
            const { error } = await supabase
                .from('content_items')
                .insert({ ...item, payload: item.payload as Json, campaign_id: campaignId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.contentItems(campaignId) }),
    });

    const updateContentItem = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<{ name: string; status: string; payload: Record<string, unknown> }> }) => {
            const { error } = await supabase.from('content_items').update(updates as { name?: string; status?: string; payload?: Json }).eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.contentItems(campaignId) }),
    });

    const deleteContentItem = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('content_items').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.contentItems(campaignId) }),
    });

    return { ...query, addContentItem, updateContentItem, deleteContentItem };
}

// ── TASKS ──────────────────────────────────────────────────────────────

export function useTasks() {
    const { organization } = useAuth();
    const qc = useQueryClient();
    const orgId = organization?.id ?? '';

    const query = useQuery({
        queryKey: keys.tasks(orgId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('org_id', orgId)
                .order('sort_order', { ascending: true });
            if (error) throw error;
            return data.map((item) => mapContentItem(item as ContentItemWithCampaign));
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
            campaign_id?: string;
            assignee_id?: string;
        }) => {
            const { error } = await supabase
                .from('tasks')
                .insert({ ...task, org_id: orgId });
            if (error) throw error;
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
        mutationFn: async (orderedIds: string[]) => {
            const updates = orderedIds.map((id, idx) =>
                supabase.from('tasks').update({ sort_order: idx }).eq('id', id)
            );
            await Promise.all(updates);
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks(orgId) }),
    });

    return { ...query, addTask, updateTask, deleteTask, reorderTasks };
}

// ── CALENDAR EVENTS ────────────────────────────────────────────────────

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
            const { error } = await supabase
                .from('portal_clients')
                .insert({ ...client, org_id: orgId });
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
            const { error } = await supabase.from('portal_clients').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalClients(orgId) }),
    });

    return { ...query, addClient, updateClient, deleteClient };
}

export function usePortalFeeds(clientId: string) {
    const qc = useQueryClient();

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
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalFeeds(clientId) }),
    });

    const deleteFeed = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('portal_feeds').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalFeeds(clientId) }),
    });

    return { ...query, addFeed, deleteFeed };
}

export function usePortalReviewPosts(feedId: string) {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: keys.portalReviewPosts(feedId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('portal_review_posts')
                .select('*, portal_comments(*)')
                .eq('feed_id', feedId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!feedId,
    });

    const addReviewPost = useMutation({
        mutationFn: async (post: {
            content_item_id?: string;
            content_type: string;
            snapshot: Record<string, unknown>;
        }) => {
            const { error } = await supabase
                .from('portal_review_posts')
                .insert({ ...post, snapshot: post.snapshot as Json, feed_id: feedId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalReviewPosts(feedId) }),
    });

    const updateReviewStatus = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const { error } = await supabase
                .from('portal_review_posts')
                .update({ status })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalReviewPosts(feedId) }),
    });

    const addComment = useMutation({
        mutationFn: async ({ postId, comment }: {
            postId: string;
            comment: { author: string; text: string; avatar?: string; is_client?: boolean };
        }) => {
            const { error } = await supabase
                .from('portal_comments')
                .insert({ ...comment, post_id: postId });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: keys.portalReviewPosts(feedId) }),
    });

    return { ...query, addReviewPost, updateReviewStatus, addComment };
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
            const { data, error } = await db
                .from('brand_guides')
                .insert({ org_id: orgId, project_id: project_id || null, brand_name: brand_name || 'Untitled Brand' })
                .select()
                .single();
            if (error) {
                const code = (error as { code?: string })?.code;
                if (isMissingBrandTableError(error) || !project_id || code === '23502' || code === '23505') {
                    return createLocalBrandGuide(orgId, project_id || null, brand_name);
                }
                throw error;
            }
            return data as BrandGuide;
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
            const { error } = await db.from('brand_guides').update(updates).eq('id', id);
            if (error) {
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
    };
}
