import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { AiAgent, AiArtifact, AiDraftSelection, AiRun, AiRunEvent, AiRunStep, AiWorkflowStep, BrandKnowledgeDocument } from '@/types/ai';

const db = supabase as unknown as SupabaseClient;
export const defaultAiAgentFlow = ['planner', 'brand-guide', 'research', 'copywriter', 'platform-specialist', 'qa', 'output-mapper'];

const isMissingTableError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message || '');
  return code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
};

const invokeOrThrow = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  const payload = data as T & { error?: string };
  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(payload.error);
  }
  return payload;
};

export function useBrandKnowledge(guideId: string) {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  const documentQuery = useQuery({
    queryKey: ['brand_knowledge_document', orgId, guideId],
    queryFn: async () => {
      const { data, error } = await db
        .from('brand_knowledge_documents')
        .select('*')
        .eq('guide_id', guideId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
      return data as BrandKnowledgeDocument | null;
    },
    enabled: !!orgId && !!guideId,
  });

  const compileKnowledge = useMutation({
    mutationFn: async () => invokeOrThrow<{ document: BrandKnowledgeDocument }>('brand-compile-knowledge', { guideId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, guideId] }),
  });

  const updateMarkdown = useMutation({
    mutationFn: async ({ documentId, markdown }: { documentId: string; markdown: string }) => {
      const { data, error } = await db
        .from('brand_knowledge_documents')
        .update({ markdown, manual_edit: true, status: 'ready' })
        .eq('id', documentId)
        .select()
        .single();
      if (error) throw error;
      return data as BrandKnowledgeDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, guideId] }),
  });

  return {
    ...documentQuery,
    document: documentQuery.data ?? null,
    compileKnowledge,
    updateMarkdown,
  };
}

export function useAIMission() {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  const startRun = useMutation({
    mutationFn: async (body: {
      prompt: string;
      projectId?: string | null;
      folderId?: string | null;
      campaignId?: string | null;
      brandGuideId?: string | null;
      brandKnowledgeDocumentId?: string | null;
      context?: Record<string, unknown>;
    }) => invokeOrThrow<{ run: AiRun; artifact?: AiArtifact | null }>('ai-start-run', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_runs', orgId] });
    },
  });

  const commitRun = useMutation({
    mutationFn: async ({ runId, artifactId, selection }: { runId: string; artifactId?: string; selection?: AiDraftSelection }) =>
      invokeOrThrow<{ inserted: { contentCount: number; calendarCount: number; campaignIds: Record<string, string> } }>('ai-commit-run', { runId, artifactId, selection }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_runs', orgId] });
    },
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string) => invokeOrThrow<{ run: AiRun }>('ai-cancel-run', { runId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_runs', orgId] });
    },
  });

  return { startRun, commitRun, cancelRun };
}

export function useAiRuns(limit = 5) {
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  return useQuery({
    queryKey: ['ai_runs', orgId, limit],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_runs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return data as AiRun[];
    },
    enabled: !!orgId,
  });
}

export function useAiAgents() {
  const qc = useQueryClient();
  const { organization, user } = useAuth();
  const orgId = organization?.id || '';

  const query = useQuery({
    queryKey: ['ai_agents', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .or(`org_id.is.null,org_id.eq.${orgId}`)
        .eq('is_enabled', true)
        .order('name');
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }

      const agents = new Map<string, AiAgent>();
      for (const agent of data as AiAgent[]) {
        if (!agent.org_id && agents.has(agent.slug)) continue;
        agents.set(agent.slug, agent);
      }
      return Array.from(agents.values()).sort((left, right) => left.name.localeCompare(right.name));
    },
    enabled: !!orgId,
  });

  const saveSkill = useMutation({
    mutationFn: async ({ agent, skillMd }: { agent: AiAgent; skillMd: string }) => {
      const cleanSkill = skillMd.trim();
      if (!cleanSkill) throw new Error('Skill markdown cannot be empty.');

      let savedAgent: AiAgent;
      if (agent.org_id === orgId) {
        const { data, error } = await db
          .from('ai_agents')
          .update({ skill_md: cleanSkill })
          .eq('id', agent.id)
          .select()
          .single();
        if (error) throw error;
        savedAgent = data as AiAgent;
      } else {
        const { data: existing, error: lookupError } = await db
          .from('ai_agents')
          .select('*')
          .eq('org_id', orgId)
          .eq('slug', agent.slug)
          .maybeSingle();
        if (lookupError) throw lookupError;

        if (existing) {
          const { data, error } = await db
            .from('ai_agents')
            .update({ skill_md: cleanSkill })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          savedAgent = data as AiAgent;
        } else {
          const { data, error } = await db
            .from('ai_agents')
            .insert({
              org_id: orgId,
              slug: agent.slug,
              name: agent.name,
              description: agent.description,
              skill_md: cleanSkill,
              tools: agent.tools,
              output_schema: agent.output_schema,
              permissions: agent.permissions,
              is_default: false,
              is_enabled: true,
              created_by: user?.id || null,
            })
            .select()
            .single();
          if (error) throw error;
          savedAgent = data as AiAgent;
        }
      }

      await db.from('ai_agent_versions').insert({
        agent_id: savedAgent.id,
        skill_md: cleanSkill,
        change_note: 'Updated from Social Suite Customize Agent.',
        created_by: user?.id || null,
      });

      return savedAgent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_agents', orgId] }),
  });

  const createAgent = useMutation({
    mutationFn: async ({ name, description, skillMd }: { name: string; description: string; skillMd: string }) => {
      const cleanName = name.trim();
      const cleanSkill = skillMd.trim();
      if (!cleanName) throw new Error('Agent name is required.');
      if (!cleanSkill) throw new Error('Skill markdown cannot be empty.');

      const slug = `${slugifyAgentName(cleanName)}-${crypto.randomUUID().slice(0, 6)}`;
      const { data, error } = await db
        .from('ai_agents')
        .insert({
          org_id: orgId,
          slug,
          name: cleanName,
          description: description.trim() || 'Workspace agent with a custom Social Suite skill.',
          skill_md: cleanSkill,
          tools: [],
          output_schema: 'workspace_skill',
          permissions: { can_write: false },
          is_default: false,
          is_enabled: true,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      const savedAgent = data as AiAgent;
      const { error: versionError } = await db.from('ai_agent_versions').insert({
        agent_id: savedAgent.id,
        skill_md: cleanSkill,
        change_note: 'Created from Social Suite Customize Agent.',
        created_by: user?.id || null,
      });
      if (versionError) throw versionError;
      return savedAgent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_agents', orgId] }),
  });

  const deleteAgent = useMutation({
    mutationFn: async (agent: AiAgent) => {
      if (agent.org_id !== orgId || agent.is_default) throw new Error('Built-in agents cannot be deleted.');
      const { error: workflowError } = await db
        .from('ai_agent_workflow_steps')
        .delete()
        .eq('org_id', orgId)
        .eq('agent_slug', agent.slug);
      if (workflowError && !isMissingTableError(workflowError)) throw workflowError;

      const { error } = await db.from('ai_agents').delete().eq('id', agent.id).eq('org_id', orgId);
      if (error) throw error;
      return agent.slug;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_agents', orgId] });
      void qc.invalidateQueries({ queryKey: ['ai_agent_workflow', orgId] });
    },
  });

  return { ...query, saveSkill, createAgent, deleteAgent };
}

export function useAiWorkflow() {
  const qc = useQueryClient();
  const { organization, user } = useAuth();
  const orgId = organization?.id || '';

  const query = useQuery({
    queryKey: ['ai_agent_workflow', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_workflow_steps')
        .select('*')
        .eq('org_id', orgId)
        .order('sort_order');
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return data as AiWorkflowStep[];
    },
    enabled: !!orgId,
  });

  const saveWorkflow = useMutation({
    mutationFn: async (agentSlugs: string[]) => {
      const uniqueSlugs = Array.from(new Set(agentSlugs.filter(Boolean)));
      if (!uniqueSlugs.length) throw new Error('The workflow needs at least one agent.');

      const { error: deleteError } = await db
        .from('ai_agent_workflow_steps')
        .delete()
        .eq('org_id', orgId);
      if (deleteError) throw deleteError;

      const { data, error } = await db
        .from('ai_agent_workflow_steps')
        .insert(uniqueSlugs.map((agentSlug, index) => ({
          org_id: orgId,
          agent_slug: agentSlug,
          sort_order: index,
          created_by: user?.id || null,
        })))
        .select()
        .order('sort_order');
      if (error) throw error;
      return data as AiWorkflowStep[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_agent_workflow', orgId] }),
  });

  return { ...query, saveWorkflow };
}

function slugifyAgentName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'custom-agent';
}

export function useAiRunDetails(runId: string | null) {
  const runQuery = useQuery({
    queryKey: ['ai_run', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_runs').select('*').eq('id', runId).single();
      if (error) throw error;
      return data as AiRun;
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = (query.state.data as AiRun | undefined)?.status;
      return status === 'running' || status === 'queued' ? 1200 : false;
    },
  });

  const isLiveRun = runQuery.data?.status === 'running' || runQuery.data?.status === 'queued';

  const stepsQuery = useQuery({
    queryKey: ['ai_run_steps', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_run_steps').select('*').eq('run_id', runId).order('sort_order');
      if (error) throw error;
      return data as AiRunStep[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? 1200 : false,
  });

  const eventsQuery = useQuery({
    queryKey: ['ai_run_events', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_run_events').select('*').eq('run_id', runId).order('created_at');
      if (error) throw error;
      return data as AiRunEvent[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? 1200 : false,
  });

  const artifactsQuery = useQuery({
    queryKey: ['ai_artifacts', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_artifacts').select('*').eq('run_id', runId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as AiArtifact[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? 1200 : false,
  });

  return {
    run: runQuery.data ?? null,
    steps: stepsQuery.data ?? [],
    events: eventsQuery.data ?? [],
    artifacts: artifactsQuery.data ?? [],
    isLoading: runQuery.isLoading || stepsQuery.isLoading || eventsQuery.isLoading || artifactsQuery.isLoading,
    error: runQuery.error || stepsQuery.error || eventsQuery.error || artifactsQuery.error,
  };
}
